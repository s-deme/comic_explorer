use crate::api::{MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS};
use crate::domain::{AppError, ErrorCode, FileKind, RelativePath, classify_file_name};
use std::io::Read;
use std::path::Path;

pub const THUMBNAIL_LONG_EDGE: u32 = 384;
pub const THUMBNAIL_JPEG_QUALITY: f32 = 0.82;

#[derive(Debug)]
pub struct CoverBytes {
    pub bytes: Vec<u8>,
    pub source_key: String,
    pub fingerprint_detail: String,
}

pub fn read_cover(root: &Path, item: &RelativePath) -> Result<CoverBytes, AppError> {
    let item_path = root.join(item.as_str());
    if classify_file_name(item.as_str()) == FileKind::Archive {
        let pages = super::enumerate_archive_pages(&item_path)?;
        let cover = pages.first().ok_or_else(|| {
            thumbnail_error(ErrorCode::NotFound, "Archive has no supported cover.")
        })?;
        let file = std::fs::File::open(&item_path).map_err(thumbnail_io_error)?;
        let mut archive = zip::ZipArchive::new(file).map_err(|error| {
            thumbnail_error(
                ErrorCode::CorruptArchive,
                &format!("Cannot read cover archive: {error}"),
            )
        })?;
        let entry = archive.by_name(cover.as_str()).map_err(|error| {
            thumbnail_error(
                ErrorCode::CorruptArchive,
                &format!("Cannot read cover entry: {error}"),
            )
        })?;
        if entry.size() > MAX_IMAGE_BYTES {
            return Err(thumbnail_error(
                ErrorCode::ResourceLimit,
                "Archive cover exceeds the image byte limit.",
            ));
        }
        let detail = format!("crc:{:08x}:size:{}", entry.crc32(), entry.size());
        let mut bytes = Vec::with_capacity(usize::try_from(entry.size()).unwrap_or_default());
        entry
            .take(MAX_IMAGE_BYTES.saturating_add(1))
            .read_to_end(&mut bytes)
            .map_err(thumbnail_io_error)?;
        Ok(CoverBytes {
            bytes,
            source_key: format!("archive:{}#{}", item.as_str(), cover.as_str()),
            fingerprint_detail: detail,
        })
    } else {
        let pages = super::enumerate_folder_pages(root, &item_path)?;
        let cover = pages.first().ok_or_else(|| {
            thumbnail_error(ErrorCode::NotFound, "Folder has no supported cover.")
        })?;
        let path = root.join(cover.as_str());
        let bytes = std::fs::read(&path).map_err(thumbnail_io_error)?;
        if bytes.len() as u64 > MAX_IMAGE_BYTES {
            return Err(thumbnail_error(
                ErrorCode::ResourceLimit,
                "Folder cover exceeds the image byte limit.",
            ));
        }
        let metadata = path.metadata().map_err(thumbnail_io_error)?;
        Ok(CoverBytes {
            bytes,
            source_key: format!("folder:{}#{}", item.as_str(), cover.as_str()),
            fingerprint_detail: format!(
                "size:{}:modified:{:?}",
                metadata.len(),
                metadata.modified().ok()
            ),
        })
    }
}

pub fn output_dimensions(
    width: u32,
    height: u32,
    orientation: u16,
) -> Result<(u32, u32), AppError> {
    let pixels = u64::from(width) * u64::from(height);
    if width == 0 || height == 0 || pixels > MAX_IMAGE_PIXELS {
        return Err(thumbnail_error(
            ErrorCode::ResourceLimit,
            "Thumbnail source dimensions exceed the decode limit.",
        ));
    }
    let (width, height) = if matches!(orientation, 5..=8) {
        (height, width)
    } else {
        (width, height)
    };
    let longest = width.max(height);
    if longest <= THUMBNAIL_LONG_EDGE {
        return Ok((width, height));
    }
    let scaled = |value: u32| {
        ((u64::from(value) * u64::from(THUMBNAIL_LONG_EDGE) + u64::from(longest) / 2)
            / u64::from(longest)) as u32
    };
    Ok((scaled(width).max(1), scaled(height).max(1)))
}

/// Reads TIFF IFD0 orientation from JPEG APP1 without trusting offsets outside the segment.
pub fn exif_orientation(bytes: &[u8]) -> u16 {
    if !bytes.starts_with(&[0xff, 0xd8]) {
        return 1;
    }
    let mut cursor = 2;
    while cursor + 4 <= bytes.len() {
        if bytes[cursor] != 0xff {
            cursor += 1;
            continue;
        }
        let marker = bytes[cursor + 1];
        cursor += 2;
        if marker == 0xda || marker == 0xd9 {
            break;
        }
        if matches!(marker, 0x00 | 0x01 | 0xd0..=0xd8) {
            continue;
        }
        let Some(length_bytes) = bytes.get(cursor..cursor + 2) else {
            break;
        };
        let length = usize::from(u16::from_be_bytes([length_bytes[0], length_bytes[1]]));
        if length < 2 || cursor + length > bytes.len() {
            break;
        }
        if marker == 0xe1 {
            let payload = &bytes[cursor + 2..cursor + length];
            if let Some(value) = parse_tiff_orientation(payload) {
                return value;
            }
        }
        cursor += length;
    }
    1
}

fn parse_tiff_orientation(payload: &[u8]) -> Option<u16> {
    let tiff = payload.strip_prefix(b"Exif\0\0")?;
    let little = match tiff.get(..2)? {
        b"II" => true,
        b"MM" => false,
        _ => return None,
    };
    let read_u16 = |offset: usize| -> Option<u16> {
        let value: [u8; 2] = tiff.get(offset..offset + 2)?.try_into().ok()?;
        Some(if little {
            u16::from_le_bytes(value)
        } else {
            u16::from_be_bytes(value)
        })
    };
    let read_u32 = |offset: usize| -> Option<u32> {
        let value: [u8; 4] = tiff.get(offset..offset + 4)?.try_into().ok()?;
        Some(if little {
            u32::from_le_bytes(value)
        } else {
            u32::from_be_bytes(value)
        })
    };
    if read_u16(2)? != 42 {
        return None;
    }
    let ifd = usize::try_from(read_u32(4)?).ok()?;
    let count = usize::from(read_u16(ifd)?);
    for index in 0..count.min(512) {
        let entry = ifd.checked_add(2 + index * 12)?;
        if read_u16(entry)? == 0x0112 && read_u16(entry + 2)? == 3 && read_u32(entry + 4)? == 1 {
            let value = read_u16(entry + 8)?;
            return (1..=8).contains(&value).then_some(value);
        }
    }
    None
}

#[cfg(target_os = "windows")]
pub fn encode_wic_jpeg(bytes: &[u8], output: &std::path::Path) -> Result<(u32, u32), AppError> {
    use std::mem::ManuallyDrop;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Graphics::Imaging::*;
    use windows::Win32::System::Com::StructuredStorage::PROPBAG2;
    use windows::Win32::System::Com::{
        CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
        CoUninitialize,
    };
    use windows::Win32::System::Variant::{VARIANT, VARIANT_0, VARIANT_0_0, VARIANT_0_0_0, VT_R4};
    use windows::core::{GUID, Interface, PWSTR};

    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err(thumbnail_error(
            ErrorCode::ResourceLimit,
            "Thumbnail source byte limit exceeded.",
        ));
    }
    let orientation = exif_orientation(bytes);
    // WIC objects remain inside this worker and are released before COM is uninitialized.
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)
            .ok()
            .map_err(wic_error)?;
        let result = (|| {
            let factory: IWICImagingFactory =
                CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)
                    .map_err(wic_error)?;
            let input = factory.CreateStream().map_err(wic_error)?;
            input.InitializeFromMemory(bytes).map_err(wic_error)?;
            let decoder = factory
                .CreateDecoderFromStream(&input, std::ptr::null(), WICDecodeMetadataCacheOnLoad)
                .map_err(wic_error)?;
            let frame = decoder.GetFrame(0).map_err(wic_error)?;
            let mut source_width = 0;
            let mut source_height = 0;
            frame
                .GetSize(&mut source_width, &mut source_height)
                .map_err(wic_error)?;
            let (output_width, output_height) =
                output_dimensions(source_width, source_height, orientation)?;

            let rotated: IWICBitmapSource = if orientation == 1 {
                frame.cast().map_err(wic_error)?
            } else {
                let rotator = factory.CreateBitmapFlipRotator().map_err(wic_error)?;
                rotator
                    .Initialize(&frame, orientation_transform(orientation))
                    .map_err(wic_error)?;
                rotator.cast().map_err(wic_error)?
            };
            let mut oriented_width = 0;
            let mut oriented_height = 0;
            rotated
                .GetSize(&mut oriented_width, &mut oriented_height)
                .map_err(wic_error)?;
            let scaled: IWICBitmapSource =
                if (oriented_width, oriented_height) == (output_width, output_height) {
                    rotated
                } else {
                    let scaler = factory.CreateBitmapScaler().map_err(wic_error)?;
                    scaler
                        .Initialize(
                            &rotated,
                            output_width,
                            output_height,
                            WICBitmapInterpolationModeFant,
                        )
                        .map_err(wic_error)?;
                    scaler.cast().map_err(wic_error)?
                };

            let output_stream = factory.CreateStream().map_err(wic_error)?;
            let output_wide: Vec<u16> = output.as_os_str().encode_wide().chain(Some(0)).collect();
            output_stream
                .InitializeFromFilename(windows::core::PCWSTR(output_wide.as_ptr()), 0x4000_0000)
                .map_err(wic_error)?;
            let encoder = factory
                .CreateEncoder(&GUID_ContainerFormatJpeg, std::ptr::null())
                .map_err(wic_error)?;
            encoder
                .Initialize(&output_stream, WICBitmapEncoderNoCache)
                .map_err(wic_error)?;
            let mut encoded_frame = None;
            let mut options = None;
            encoder
                .CreateNewFrame(&mut encoded_frame, &mut options)
                .map_err(wic_error)?;
            let encoded_frame =
                encoded_frame.ok_or_else(|| wic_message("WIC did not create an encoder frame."))?;
            let options =
                options.ok_or_else(|| wic_message("WIC did not create encoder options."))?;
            let mut name: Vec<u16> = "ImageQuality\0".encode_utf16().collect();
            let property = PROPBAG2 {
                vt: VT_R4,
                pstrName: PWSTR(name.as_mut_ptr()),
                ..Default::default()
            };
            let quality = VARIANT {
                Anonymous: VARIANT_0 {
                    Anonymous: ManuallyDrop::new(VARIANT_0_0 {
                        vt: VT_R4,
                        Anonymous: VARIANT_0_0_0 {
                            fltVal: THUMBNAIL_JPEG_QUALITY,
                        },
                        ..Default::default()
                    }),
                },
            };
            options.Write(1, &property, &quality).map_err(wic_error)?;
            encoded_frame.Initialize(&options).map_err(wic_error)?;
            encoded_frame
                .SetSize(output_width, output_height)
                .map_err(wic_error)?;
            let mut format: GUID = GUID_WICPixelFormat24bppBGR;
            encoded_frame
                .SetPixelFormat(&mut format)
                .map_err(wic_error)?;
            if format != GUID_WICPixelFormat24bppBGR {
                return Err(wic_message("WIC JPEG encoder rejected 24bpp BGR."));
            }
            let converter = factory.CreateFormatConverter().map_err(wic_error)?;
            converter
                .Initialize(
                    &scaled,
                    &GUID_WICPixelFormat24bppBGR,
                    WICBitmapDitherTypeNone,
                    None,
                    0.0,
                    WICBitmapPaletteTypeCustom,
                )
                .map_err(wic_error)?;
            encoded_frame
                .WriteSource(&converter, std::ptr::null())
                .map_err(wic_error)?;
            encoded_frame.Commit().map_err(wic_error)?;
            encoder.Commit().map_err(wic_error)?;
            drop(output_stream);
            Ok((output_width, output_height))
        })();
        CoUninitialize();
        result
    }
}

#[cfg(target_os = "windows")]
fn orientation_transform(
    orientation: u16,
) -> windows::Win32::Graphics::Imaging::WICBitmapTransformOptions {
    use windows::Win32::Graphics::Imaging::*;
    match orientation {
        2 => WICBitmapTransformFlipHorizontal,
        3 => WICBitmapTransformRotate180,
        4 => WICBitmapTransformFlipVertical,
        5 => WICBitmapTransformOptions(
            WICBitmapTransformRotate90.0 | WICBitmapTransformFlipHorizontal.0,
        ),
        6 => WICBitmapTransformRotate90,
        7 => WICBitmapTransformOptions(
            WICBitmapTransformRotate270.0 | WICBitmapTransformFlipHorizontal.0,
        ),
        8 => WICBitmapTransformRotate270,
        _ => WICBitmapTransformRotate0,
    }
}

#[cfg(target_os = "windows")]
fn wic_error(error: windows::core::Error) -> AppError {
    thumbnail_error(
        ErrorCode::CorruptImage,
        &format!("WIC thumbnail pipeline failed: {error}"),
    )
}

#[cfg(target_os = "windows")]
fn wic_message(message: &str) -> AppError {
    thumbnail_error(ErrorCode::Internal, message)
}

fn thumbnail_error(code: ErrorCode, message: &str) -> AppError {
    AppError {
        code,
        message: message.into(),
        target: None,
        retryable: false,
    }
}

fn thumbnail_io_error(error: impl std::fmt::Display) -> AppError {
    thumbnail_error(
        ErrorCode::NotFound,
        &format!("Cannot read thumbnail cover: {error}"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dimensions_preserve_aspect_ratio_without_upscaling_and_follow_orientation() {
        assert_eq!(output_dimensions(100, 200, 1).unwrap(), (100, 200));
        assert_eq!(output_dimensions(1200, 1800, 1).unwrap(), (256, 384));
        assert_eq!(output_dimensions(1200, 1800, 6).unwrap(), (384, 256));
    }

    #[test]
    fn parses_little_endian_exif_orientation_and_defaults_safely() {
        let tiff = [
            b'I', b'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0,
            0,
        ];
        let mut jpeg = vec![0xff, 0xd8, 0xff, 0xe1];
        jpeg.extend_from_slice(&u16::try_from(2 + 6 + tiff.len()).unwrap().to_be_bytes());
        jpeg.extend_from_slice(b"Exif\0\0");
        jpeg.extend_from_slice(&tiff);
        jpeg.extend_from_slice(&[0xff, 0xd9]);
        assert_eq!(exif_orientation(&jpeg), 6);
        assert_eq!(exif_orientation(b"not a jpeg"), 1);
    }

    #[test]
    fn folder_and_archive_cover_readers_use_the_same_natural_first_page_without_extraction() {
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/generated/FIX-LIBRARY-001");
        let before = std::fs::read_dir(&root)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect::<Vec<_>>();
        let folder = read_cover(&root, &RelativePath::parse("comic-folder").unwrap()).unwrap();
        let archive = read_cover(&root, &RelativePath::parse("same-a.cbz").unwrap()).unwrap();
        let folder_pages =
            super::super::enumerate_folder_pages(&root, &root.join("comic-folder")).unwrap();
        let archive_pages =
            super::super::enumerate_archive_pages(&root.join("same-a.cbz")).unwrap();
        assert!(folder.source_key.ends_with(folder_pages[0].as_str()));
        assert!(archive.source_key.ends_with(archive_pages[0].as_str()));
        assert!(!folder.bytes.is_empty());
        assert!(!archive.bytes.is_empty());
        let after = std::fs::read_dir(&root)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect::<Vec<_>>();
        assert_eq!(before, after);
        assert!(!root.join("1.png").exists());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn wic_decodes_resizes_and_encodes_a_real_png_as_jpeg() {
        use std::time::{SystemTime, UNIX_EPOCH};

        let input = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/generated/FIX-IMAGE-001/portrait.png");
        let output = std::env::temp_dir().join(format!(
            "comic-explorer-wic-{}-{}.jpg",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let bytes = std::fs::read(input).unwrap();
        let dimensions = encode_wic_jpeg(&bytes, &output).unwrap();
        let encoded = std::fs::read(&output).unwrap();
        assert!(encoded.starts_with(&[0xff, 0xd8]));
        assert!(dimensions.0.max(dimensions.1) <= THUMBNAIL_LONG_EDGE);
        let mut reader = std::io::Cursor::new(encoded);
        let metadata =
            super::super::inspect_image(&mut reader, std::fs::metadata(&output).unwrap().len())
                .unwrap();
        assert_eq!((metadata.width, metadata.height), dimensions);
        std::fs::remove_file(output).unwrap();
    }
}
