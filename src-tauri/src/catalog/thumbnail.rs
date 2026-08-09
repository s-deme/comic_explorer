use crate::api::{MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS};
use crate::domain::{AppError, ErrorCode, FileKind, ImageFormat, RelativePath, classify_file_name};
use std::io::{BufReader, Cursor, Read};
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
        validate_cover_format(cover, &bytes)?;
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
        validate_cover_format(cover, &bytes)?;
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

fn validate_cover_format(cover: &RelativePath, bytes: &[u8]) -> Result<(), AppError> {
    let expected = match cover
        .as_str()
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg" | "jpeg") => ImageFormat::Jpeg,
        Some("png") => ImageFormat::Png,
        Some("webp") => ImageFormat::Webp,
        Some("gif") => ImageFormat::Gif,
        Some("avif") => ImageFormat::Avif,
        _ => {
            return Err(thumbnail_error(
                ErrorCode::CorruptImage,
                "Cover has an unsupported image extension.",
            ));
        }
    };
    let actual = super::inspect_image(&mut Cursor::new(bytes), bytes.len() as u64)?.format;
    if actual != expected {
        return Err(thumbnail_error(
            ErrorCode::CorruptImage,
            "Cover extension does not match its image data.",
        ));
    }
    Ok(())
}

pub fn output_dimensions(
    width: u32,
    height: u32,
    orientation: u16,
) -> Result<(u32, u32), AppError> {
    let pixels = u64::from(width) * u64::from(height);
    if width == 0 || height == 0 || width > 16_384 || height > 16_384 || pixels > MAX_IMAGE_PIXELS {
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

fn is_webp(bytes: &[u8]) -> bool {
    bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP"
}

/// Decodes a static WebP without depending on the operating system's image codecs.
///
/// WIC expects an opaque 24bpp BGR bitmap for the JPEG encoder. WebP's decoded
/// pixels are unpremultiplied sRGB, so alpha is composited over white before the
/// channel order is converted.
fn decode_static_webp_bgr(bytes: &[u8]) -> Result<(u32, u32, Vec<u8>), AppError> {
    // Keep the strict RIFF/container, animation, and dimension validation shared
    // with media loading ahead of any decoder allocation.
    let metadata = super::inspect_image(&mut Cursor::new(bytes), bytes.len() as u64)?;
    let mut decoder =
        image_webp::WebPDecoder::new(BufReader::new(Cursor::new(bytes))).map_err(|error| {
            thumbnail_error(
                ErrorCode::CorruptImage,
                &format!("Cannot decode WebP cover: {error}"),
            )
        })?;
    if decoder.is_animated() {
        return Err(thumbnail_error(
            ErrorCode::UnsupportedFormat,
            "Animated WebP covers are not supported.",
        ));
    }

    let (width, height) = decoder.dimensions();
    if (width, height) != (metadata.width, metadata.height)
        || decoder.has_alpha() != metadata.has_alpha
    {
        return Err(thumbnail_error(
            ErrorCode::CorruptImage,
            "WebP decoder metadata does not match the validated container.",
        ));
    }
    // Keep the pure-Rust path within the same source dimension limit as WIC.
    output_dimensions(width, height, 1)?;
    let pixel_count = usize::try_from(u64::from(width) * u64::from(height)).map_err(|_| {
        thumbnail_error(
            ErrorCode::ResourceLimit,
            "WebP cover dimensions cannot fit in memory.",
        )
    })?;
    let channels = if decoder.has_alpha() { 4usize } else { 3usize };
    let decoded_len = pixel_count.checked_mul(channels).ok_or_else(|| {
        thumbnail_error(
            ErrorCode::ResourceLimit,
            "WebP cover decode buffer exceeds the resource limit.",
        )
    })?;
    let bgr_len = pixel_count.checked_mul(3).ok_or_else(|| {
        thumbnail_error(
            ErrorCode::ResourceLimit,
            "WebP thumbnail buffer exceeds the resource limit.",
        )
    })?;
    let working_len = decoded_len.checked_add(bgr_len).ok_or_else(|| {
        thumbnail_error(
            ErrorCode::ResourceLimit,
            "WebP thumbnail working buffers exceed the resource limit.",
        )
    })?;
    if u64::try_from(working_len).unwrap_or(u64::MAX) > MAX_IMAGE_BYTES {
        return Err(thumbnail_error(
            ErrorCode::ResourceLimit,
            "WebP thumbnail working buffers exceed the resource limit.",
        ));
    }
    let reported_len = decoder.output_buffer_size().ok_or_else(|| {
        thumbnail_error(
            ErrorCode::ResourceLimit,
            "WebP cover decode buffer exceeds the resource limit.",
        )
    })?;
    if reported_len != decoded_len {
        return Err(thumbnail_error(
            ErrorCode::CorruptImage,
            "WebP cover has an unexpected decoded pixel layout.",
        ));
    }
    decoder.set_memory_limit(decoded_len);
    let mut decoded = vec![0; decoded_len];
    decoder.read_image(&mut decoded).map_err(|error| {
        thumbnail_error(
            ErrorCode::CorruptImage,
            &format!("Cannot decode WebP cover: {error}"),
        )
    })?;

    let mut bgr = Vec::with_capacity(bgr_len);
    for pixel in decoded.chunks_exact(channels) {
        let (red, green, blue) = if channels == 4 {
            let alpha = u32::from(pixel[3]);
            let composite = |channel: u8| {
                ((u32::from(channel) * alpha + 255 * (255 - alpha) + 127) / 255) as u8
            };
            (
                composite(pixel[0]),
                composite(pixel[1]),
                composite(pixel[2]),
            )
        } else {
            (pixel[0], pixel[1], pixel[2])
        };
        bgr.extend_from_slice(&[blue, green, red]);
    }
    Ok((width, height, bgr))
}

#[cfg(target_os = "windows")]
pub fn encode_wic_jpeg(bytes: &[u8], output: &std::path::Path) -> Result<(u32, u32), AppError> {
    use windows::Win32::Graphics::Imaging::*;
    use windows::Win32::System::Com::{
        CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
        CoUninitialize,
    };
    use windows::core::Interface;

    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err(thumbnail_error(
            ErrorCode::ResourceLimit,
            "Thumbnail source byte limit exceeded.",
        ));
    }
    if is_webp(bytes) {
        return encode_webp_wic_jpeg(bytes, output);
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

            write_wic_jpeg(&factory, &scaled, output_width, output_height, output)?;
            Ok((output_width, output_height))
        })();
        CoUninitialize();
        result
    }
}

#[cfg(target_os = "windows")]
fn encode_webp_wic_jpeg(bytes: &[u8], output: &std::path::Path) -> Result<(u32, u32), AppError> {
    use windows::Win32::Graphics::Imaging::*;
    use windows::Win32::System::Com::{
        CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
        CoUninitialize,
    };
    use windows::core::Interface;

    let (source_width, source_height, bgr) = decode_static_webp_bgr(bytes)?;
    let (output_width, output_height) = output_dimensions(source_width, source_height, 1)?;
    let stride = source_width.checked_mul(3).ok_or_else(|| {
        thumbnail_error(
            ErrorCode::ResourceLimit,
            "WebP thumbnail row stride exceeds the resource limit.",
        )
    })?;
    // WIC objects remain inside this worker and are released before COM is uninitialized.
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)
            .ok()
            .map_err(wic_error)?;
        let result = (|| {
            let factory: IWICImagingFactory =
                CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)
                    .map_err(wic_error)?;
            let bitmap = factory
                .CreateBitmapFromMemory(
                    source_width,
                    source_height,
                    &GUID_WICPixelFormat24bppBGR,
                    stride,
                    &bgr,
                )
                .map_err(wic_error)?;
            let source: IWICBitmapSource = bitmap.cast().map_err(wic_error)?;
            let scaled: IWICBitmapSource =
                if (source_width, source_height) == (output_width, output_height) {
                    source
                } else {
                    let scaler = factory.CreateBitmapScaler().map_err(wic_error)?;
                    scaler
                        .Initialize(
                            &source,
                            output_width,
                            output_height,
                            WICBitmapInterpolationModeFant,
                        )
                        .map_err(wic_error)?;
                    scaler.cast().map_err(wic_error)?
                };
            write_wic_jpeg(&factory, &scaled, output_width, output_height, output)?;
            Ok((output_width, output_height))
        })();
        CoUninitialize();
        result
    }
}

#[cfg(target_os = "windows")]
fn write_wic_jpeg(
    factory: &windows::Win32::Graphics::Imaging::IWICImagingFactory,
    source: &windows::Win32::Graphics::Imaging::IWICBitmapSource,
    output_width: u32,
    output_height: u32,
    output: &std::path::Path,
) -> Result<(), AppError> {
    use std::mem::ManuallyDrop;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Graphics::Imaging::*;
    use windows::Win32::System::Com::StructuredStorage::PROPBAG2;
    use windows::Win32::System::Variant::{VARIANT, VARIANT_0, VARIANT_0_0, VARIANT_0_0_0, VT_R4};
    use windows::core::{GUID, PWSTR};

    unsafe {
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
        let options = options.ok_or_else(|| wic_message("WIC did not create encoder options."))?;
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
                source,
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
        Ok(())
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

    fn lossless_webp(width: u32, height: u32, pixels: &[u8], alpha: bool) -> Vec<u8> {
        let mut encoded = Vec::new();
        image_webp::WebPEncoder::new(&mut encoded)
            .encode(
                pixels,
                width,
                height,
                if alpha {
                    image_webp::ColorType::Rgba8
                } else {
                    image_webp::ColorType::Rgb8
                },
            )
            .unwrap();
        encoded
    }

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

    #[test]
    fn fr_b08_webp_lossless_decoder_converts_rgb_to_bgr() {
        let webp = lossless_webp(1, 1, &[17, 34, 51], false);
        assert!(is_webp(&webp));
        assert_eq!(
            decode_static_webp_bgr(&webp).unwrap(),
            (1, 1, vec![51, 34, 17])
        );
    }

    #[test]
    fn fr_b08_webp_alpha_decoder_composites_unpremultiplied_srgb_over_white() {
        let webp = lossless_webp(1, 1, &[10, 20, 30, 128], true);
        let (_, _, bgr) = decode_static_webp_bgr(&webp).unwrap();
        assert_eq!(bgr, vec![142, 137, 132]);
    }

    #[test]
    fn fr_b08_webp_cover_rejects_png_bytes_in_folder_and_archive() {
        use std::io::Write;
        use std::time::{SystemTime, UNIX_EPOCH};
        use zip::write::SimpleFileOptions;

        const VALID_PNG: &[u8] = &[
            137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1,
            8, 4, 0, 0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 252, 255, 31,
            0, 2, 235, 1, 245, 105, 72, 35, 170, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
        ];
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-webp-cover-format-{}-{nonce}",
            std::process::id()
        ));
        std::fs::create_dir(&root).unwrap();
        struct Cleanup(std::path::PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(root.clone());

        let folder = root.join("folder");
        std::fs::create_dir(&folder).unwrap();
        std::fs::write(folder.join("1.webp"), VALID_PNG).unwrap();
        assert_eq!(
            read_cover(&root, &RelativePath::parse("folder").unwrap())
                .unwrap_err()
                .code,
            ErrorCode::CorruptImage
        );

        let archive_path = root.join("book.cbz");
        let file = std::fs::File::create(&archive_path).unwrap();
        let mut archive = zip::ZipWriter::new(file);
        archive
            .start_file("1.webp", SimpleFileOptions::default())
            .unwrap();
        archive.write_all(VALID_PNG).unwrap();
        archive.finish().unwrap();
        assert_eq!(
            read_cover(&root, &RelativePath::parse("book.cbz").unwrap())
                .unwrap_err()
                .code,
            ErrorCode::CorruptImage
        );
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

    #[cfg(target_os = "windows")]
    struct TestTempDirectory(std::path::PathBuf);

    #[cfg(target_os = "windows")]
    impl Drop for TestTempDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[cfg(target_os = "windows")]
    fn webp_test_directory(label: &str) -> TestTempDirectory {
        use std::time::{SystemTime, UNIX_EPOCH};

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!(
            "comic-explorer-webp-{label}-{}-{nonce}",
            std::process::id()
        ));
        std::fs::create_dir(&base).unwrap();
        TestTempDirectory(base)
    }

    #[cfg(target_os = "windows")]
    fn assert_webp_thumbnail_jpeg_preserves_source(
        source: &std::path::Path,
        webp: &[u8],
        output: &std::path::Path,
    ) {
        let before = std::fs::read(source).unwrap();
        assert_eq!(before.as_slice(), webp);

        let dimensions = encode_wic_jpeg(webp, output).unwrap();
        let encoded = std::fs::read(output).unwrap();
        assert!(encoded.starts_with(&[0xff, 0xd8]));
        assert_eq!(std::fs::read(source).unwrap(), before);
        let mut reader = std::io::Cursor::new(encoded);
        let metadata =
            super::super::inspect_image(&mut reader, std::fs::metadata(output).unwrap().len())
                .unwrap();
        assert_eq!((metadata.width, metadata.height), dimensions);
    }

    #[cfg(target_os = "windows")]
    fn assert_generated_webp_thumbnail_jpeg_preserves_source(name: &str) {
        let source = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/generated/FIX-WEBP-001/folder")
            .join(name);
        let output_directory = webp_test_directory("generated");
        let output = output_directory.0.join("thumbnail.jpg");
        let webp = std::fs::read(&source).unwrap();
        assert_webp_thumbnail_jpeg_preserves_source(&source, &webp, &output);
    }

    #[cfg(target_os = "windows")]
    fn assert_synthetic_webp_thumbnail_jpeg_preserves_source(label: &str, webp: Vec<u8>) {
        let directory = webp_test_directory(label);
        let source = directory.0.join("source.webp");
        let output = directory.0.join("thumbnail.jpg");
        std::fs::write(&source, &webp).unwrap();
        assert_webp_thumbnail_jpeg_preserves_source(&source, &webp, &output);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn fr_b08_webp_lossless_thumbnail_jpeg_generation_preserves_source() {
        assert_synthetic_webp_thumbnail_jpeg_preserves_source(
            "lossless",
            lossless_webp(2, 1, &[17, 34, 51, 68, 85, 102], false),
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn fr_b08_webp_alpha_thumbnail_jpeg_generation_preserves_source() {
        assert_synthetic_webp_thumbnail_jpeg_preserves_source(
            "alpha",
            lossless_webp(2, 1, &[10, 20, 30, 128, 40, 50, 60, 0], true),
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn fr_b08_webp_generated_lossy_and_alpha_fixture_thumbnail_jpeg_preserve_source() {
        assert_generated_webp_thumbnail_jpeg_preserves_source("1-lossy.webp");
        assert_generated_webp_thumbnail_jpeg_preserves_source("3-alpha.webp");
    }
}
