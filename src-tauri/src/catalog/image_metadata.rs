use std::io::{Read, Seek, SeekFrom};

use crate::api::{MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS};
use crate::domain::{AppError, ErrorCode, ImageFormat};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ImageMetadata {
    pub format: ImageFormat,
    pub width: u32,
    pub height: u32,
    pub has_alpha: bool,
}

pub fn inspect_image<R: Read + Seek>(
    reader: &mut R,
    compressed_size: u64,
) -> Result<ImageMetadata, AppError> {
    if compressed_size > MAX_IMAGE_BYTES {
        return Err(error(
            ErrorCode::ResourceLimit,
            "Image byte limit exceeded.",
        ));
    }
    let mut signature = [0_u8; 24];
    reader
        .read_exact(&mut signature)
        .map_err(|_| error(ErrorCode::CorruptImage, "Image header is truncated."))?;
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|_| error(ErrorCode::CorruptImage, "Image stream is not seekable."))?;

    let metadata = if signature.starts_with(b"\x89PNG\r\n\x1a\n") && &signature[12..16] == b"IHDR" {
        let has_alpha = png_has_alpha(reader)?;
        ImageMetadata {
            format: ImageFormat::Png,
            width: u32::from_be_bytes(signature[16..20].try_into().unwrap()),
            height: u32::from_be_bytes(signature[20..24].try_into().unwrap()),
            has_alpha,
        }
    } else if signature.starts_with(&[0xff, 0xd8]) {
        inspect_jpeg(reader)?
    } else if signature.starts_with(b"RIFF") && &signature[8..12] == b"WEBP" {
        inspect_webp(reader, compressed_size)?
    } else {
        return Err(error(
            ErrorCode::CorruptImage,
            "File signature is not a supported image.",
        ));
    };
    validate_dimensions(metadata)?;
    Ok(metadata)
}

fn png_has_alpha<R: Read + Seek>(reader: &mut R) -> Result<bool, AppError> {
    reader
        .seek(SeekFrom::Start(8))
        .map_err(|_| error(ErrorCode::CorruptImage, "PNG stream is not seekable."))?;
    let (ihdr_length, ihdr_kind) = read_png_chunk_header(reader)?;
    if ihdr_length != 13 || ihdr_kind != *b"IHDR" {
        return Err(error(ErrorCode::CorruptImage, "PNG IHDR is invalid."));
    }
    let mut ihdr = [0_u8; 13];
    reader
        .read_exact(&mut ihdr)
        .map_err(|_| error(ErrorCode::CorruptImage, "PNG IHDR is truncated."))?;
    consume_png_crc(reader)?;
    match ihdr[9] {
        4 | 6 => Ok(true),
        0 | 2 | 3 => loop {
            let (length, kind) = read_png_chunk_header(reader)?;
            let transparency = kind == *b"tRNS";
            let image_data = kind == *b"IDAT";
            consume_png_chunk(reader, length)?;
            if transparency {
                return Ok(true);
            }
            if image_data {
                return Ok(false);
            }
            if kind == *b"IEND" {
                return Err(error(ErrorCode::CorruptImage, "PNG has no image data."));
            }
        },
        _ => Err(error(ErrorCode::CorruptImage, "PNG color type is invalid.")),
    }
}

fn read_png_chunk_header<R: Read>(reader: &mut R) -> Result<(u64, [u8; 4]), AppError> {
    let mut header = [0_u8; 8];
    reader
        .read_exact(&mut header)
        .map_err(|_| error(ErrorCode::CorruptImage, "PNG chunk header is truncated."))?;
    Ok((
        u64::from(u32::from_be_bytes(header[..4].try_into().unwrap())),
        header[4..8].try_into().unwrap(),
    ))
}

fn consume_png_chunk<R: Read>(reader: &mut R, length: u64) -> Result<(), AppError> {
    let copied = std::io::copy(&mut reader.take(length), &mut std::io::sink())
        .map_err(|_| error(ErrorCode::CorruptImage, "PNG chunk is truncated."))?;
    if copied != length {
        return Err(error(ErrorCode::CorruptImage, "PNG chunk is truncated."));
    }
    consume_png_crc(reader)
}

fn consume_png_crc<R: Read>(reader: &mut R) -> Result<(), AppError> {
    let mut crc = [0_u8; 4];
    reader
        .read_exact(&mut crc)
        .map_err(|_| error(ErrorCode::CorruptImage, "PNG chunk is truncated."))
}

fn inspect_jpeg<R: Read>(reader: &mut R) -> Result<ImageMetadata, AppError> {
    let mut marker = [0_u8; 2];
    reader
        .read_exact(&mut marker)
        .map_err(|_| error(ErrorCode::CorruptImage, "JPEG header is truncated."))?;
    loop {
        reader
            .read_exact(&mut marker[..1])
            .map_err(|_| error(ErrorCode::CorruptImage, "JPEG has no frame header."))?;
        if marker[0] != 0xff {
            continue;
        }
        while marker[0] == 0xff {
            reader
                .read_exact(&mut marker[..1])
                .map_err(|_| error(ErrorCode::CorruptImage, "JPEG marker is truncated."))?;
        }
        let marker_code = marker[0];
        if marker_code == 0xd9 || marker_code == 0xda {
            return Err(error(ErrorCode::CorruptImage, "JPEG has no frame header."));
        }
        if matches!(marker_code, 0xd8 | 0x01 | 0xd0..=0xd7) {
            continue;
        }
        let mut length = [0_u8; 2];
        reader
            .read_exact(&mut length)
            .map_err(|_| error(ErrorCode::CorruptImage, "JPEG segment is truncated."))?;
        let length = u16::from_be_bytes(length);
        if length < 2 {
            return Err(error(
                ErrorCode::CorruptImage,
                "JPEG segment length is invalid.",
            ));
        }
        if matches!(
            marker_code,
            0xc0 | 0xc1
                | 0xc2
                | 0xc3
                | 0xc5
                | 0xc6
                | 0xc7
                | 0xc9
                | 0xca
                | 0xcb
                | 0xcd
                | 0xce
                | 0xcf
        ) {
            let mut frame = [0_u8; 5];
            reader
                .read_exact(&mut frame)
                .map_err(|_| error(ErrorCode::CorruptImage, "JPEG frame is truncated."))?;
            return Ok(ImageMetadata {
                format: ImageFormat::Jpeg,
                height: u16::from_be_bytes([frame[1], frame[2]]) as u32,
                width: u16::from_be_bytes([frame[3], frame[4]]) as u32,
                has_alpha: false,
            });
        }
        std::io::copy(
            &mut reader.take(u64::from(length - 2)),
            &mut std::io::sink(),
        )
        .map_err(|_| error(ErrorCode::CorruptImage, "JPEG segment is truncated."))?;
    }
}

#[derive(Debug, Clone, Copy)]
struct WebpCore {
    width: u32,
    height: u32,
    lossless_alpha: bool,
    kind: WebpCoreKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WebpCoreKind {
    Lossy,
    Lossless,
}

#[derive(Debug, Clone, Copy)]
struct WebpExtended {
    width: u32,
    height: u32,
    alpha_flag: bool,
}

fn inspect_webp<R: Read + Seek>(
    reader: &mut R,
    compressed_size: u64,
) -> Result<ImageMetadata, AppError> {
    if compressed_size < 12 {
        return Err(corrupt_webp("WebP RIFF header is truncated."));
    }
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|_| corrupt_webp("WebP stream is not seekable."))?;
    let mut riff = [0_u8; 12];
    reader
        .read_exact(&mut riff)
        .map_err(|_| corrupt_webp("WebP RIFF header is truncated."))?;
    if &riff[..4] != b"RIFF" || &riff[8..12] != b"WEBP" {
        return Err(corrupt_webp("WebP RIFF signature is invalid."));
    }
    let declared_size = u64::from(u32::from_le_bytes(riff[4..8].try_into().unwrap()));
    if declared_size.checked_add(8) != Some(compressed_size) {
        return Err(corrupt_webp(
            "WebP RIFF size does not match the image length.",
        ));
    }

    let mut position = 12_u64;
    let mut extended = None;
    let mut core = None;
    let mut core_starts_container = false;
    let mut saw_alpha = false;
    let mut saw_unknown = false;
    while position < compressed_size {
        let payload_start = position
            .checked_add(8)
            .ok_or_else(|| corrupt_webp("WebP chunk offset overflow."))?;
        if payload_start > compressed_size {
            return Err(corrupt_webp("WebP chunk header is truncated."));
        }
        let mut header = [0_u8; 8];
        reader
            .read_exact(&mut header)
            .map_err(|_| corrupt_webp("WebP chunk header is truncated."))?;
        let chunk_size = u64::from(u32::from_le_bytes(header[4..8].try_into().unwrap()));
        let payload_end = payload_start
            .checked_add(chunk_size)
            .ok_or_else(|| corrupt_webp("WebP chunk length overflow."))?;
        let padded_end = payload_end
            .checked_add(chunk_size & 1)
            .ok_or_else(|| corrupt_webp("WebP chunk padding overflow."))?;
        if padded_end > compressed_size {
            return Err(corrupt_webp("WebP chunk is truncated."));
        }

        match &header[..4] {
            b"VP8X" => {
                if position != 12 || extended.is_some() || core.is_some() || chunk_size != 10 {
                    return Err(corrupt_webp("WebP VP8X chunk layout is invalid."));
                }
                let payload = read_webp_prefix(reader, 10)?;
                let flags = payload[0];
                if flags & !0x3e != 0 || payload[1..4] != [0, 0, 0] {
                    return Err(corrupt_webp("WebP VP8X flags are invalid."));
                }
                if flags & 0x02 != 0 {
                    return Err(unsupported_animation());
                }
                extended = Some(WebpExtended {
                    width: read_u24(&payload[4..7]) + 1,
                    height: read_u24(&payload[7..10]) + 1,
                    alpha_flag: flags & 0x10 != 0,
                });
            }
            b"VP8 " => {
                if core.is_some() || chunk_size < 10 {
                    return Err(corrupt_webp("WebP VP8 chunk layout is invalid."));
                }
                let payload = read_webp_prefix(reader, 10)?;
                if payload[0] & 1 != 0 || payload[3..6] != [0x9d, 0x01, 0x2a] {
                    return Err(corrupt_webp("WebP VP8 frame header is invalid."));
                }
                core = Some(WebpCore {
                    width: u32::from(
                        u16::from_le_bytes(payload[6..8].try_into().unwrap()) & 0x3fff,
                    ),
                    height: u32::from(
                        u16::from_le_bytes(payload[8..10].try_into().unwrap()) & 0x3fff,
                    ),
                    lossless_alpha: false,
                    kind: WebpCoreKind::Lossy,
                });
                core_starts_container = position == 12;
            }
            b"VP8L" => {
                if core.is_some() || chunk_size < 5 {
                    return Err(corrupt_webp("WebP VP8L chunk layout is invalid."));
                }
                let payload = read_webp_prefix(reader, 5)?;
                if payload[0] != 0x2f {
                    return Err(corrupt_webp("WebP VP8L signature is invalid."));
                }
                let bits = u32::from_le_bytes(payload[1..5].try_into().unwrap());
                if bits >> 29 != 0 {
                    return Err(corrupt_webp("WebP VP8L version is invalid."));
                }
                core = Some(WebpCore {
                    width: (bits & 0x3fff) + 1,
                    height: ((bits >> 14) & 0x3fff) + 1,
                    lossless_alpha: bits & (1 << 28) != 0,
                    kind: WebpCoreKind::Lossless,
                });
                core_starts_container = position == 12;
            }
            b"ALPH" => {
                if extended.is_none() || saw_alpha || core.is_some() || chunk_size < 1 {
                    return Err(corrupt_webp("WebP alpha chunk layout is invalid."));
                }
                let alpha_header = read_webp_prefix(reader, 1)?[0];
                let reserved = alpha_header >> 6;
                let preprocessing = (alpha_header >> 4) & 0x03;
                let compression = alpha_header & 0x03;
                if reserved != 0 || preprocessing > 1 || compression > 1 {
                    return Err(corrupt_webp("WebP alpha chunk header is invalid."));
                }
                saw_alpha = true;
            }
            b"ANIM" | b"ANMF" => return Err(unsupported_animation()),
            _ => saw_unknown = true,
        }

        if chunk_size & 1 != 0 {
            reader
                .seek(SeekFrom::Start(payload_end))
                .map_err(|_| corrupt_webp("WebP stream is not seekable."))?;
            let mut padding = [0_u8; 1];
            reader
                .read_exact(&mut padding)
                .map_err(|_| corrupt_webp("WebP chunk padding is truncated."))?;
            if padding[0] != 0 {
                return Err(corrupt_webp("WebP chunk padding is invalid."));
            }
        }
        reader
            .seek(SeekFrom::Start(padded_end))
            .map_err(|_| corrupt_webp("WebP stream is not seekable."))?;
        position = padded_end;
    }
    if position != compressed_size {
        return Err(corrupt_webp("WebP chunk layout is invalid."));
    }
    let core = core.ok_or_else(|| corrupt_webp("WebP has no image bitstream."))?;
    let has_alpha = match (extended, core.kind) {
        (None, WebpCoreKind::Lossy) if saw_alpha => {
            return Err(corrupt_webp("WebP alpha chunk requires VP8X."));
        }
        (None, _) if !core_starts_container => {
            return Err(corrupt_webp(
                "Simple WebP must start with an image bitstream.",
            ));
        }
        (None, _) if saw_unknown => {
            return Err(corrupt_webp("Simple WebP must not contain unknown chunks."));
        }
        (None, WebpCoreKind::Lossy) => false,
        (None, WebpCoreKind::Lossless) => core.lossless_alpha,
        (Some(extended), kind) => {
            if (extended.width, extended.height) != (core.width, core.height) {
                return Err(corrupt_webp(
                    "WebP VP8X canvas does not match the image bitstream.",
                ));
            }
            let core_alpha = match kind {
                WebpCoreKind::Lossy => saw_alpha,
                WebpCoreKind::Lossless => {
                    if saw_alpha {
                        return Err(corrupt_webp("WebP VP8L must not contain an ALPH chunk."));
                    }
                    core.lossless_alpha
                }
            };
            if extended.alpha_flag != core_alpha {
                return Err(corrupt_webp(
                    "WebP alpha flag does not match the image bitstream.",
                ));
            }
            core_alpha
        }
    };
    let metadata = ImageMetadata {
        format: ImageFormat::Webp,
        width: core.width,
        height: core.height,
        has_alpha,
    };
    validate_dimensions(metadata)?;
    Ok(metadata)
}

fn read_webp_prefix<R: Read>(reader: &mut R, length: usize) -> Result<Vec<u8>, AppError> {
    let mut bytes = vec![0_u8; length];
    reader
        .read_exact(&mut bytes)
        .map_err(|_| corrupt_webp("WebP chunk is truncated."))?;
    Ok(bytes)
}

fn read_u24(bytes: &[u8]) -> u32 {
    u32::from(bytes[0]) | (u32::from(bytes[1]) << 8) | (u32::from(bytes[2]) << 16)
}

fn corrupt_webp(message: &str) -> AppError {
    error(ErrorCode::CorruptImage, message)
}

fn unsupported_animation() -> AppError {
    error(
        ErrorCode::UnsupportedFormat,
        "Animated WebP is not supported.",
    )
}

fn validate_dimensions(metadata: ImageMetadata) -> Result<(), AppError> {
    let pixels = u64::from(metadata.width) * u64::from(metadata.height);
    if metadata.width == 0 || metadata.height == 0 {
        return Err(error(ErrorCode::CorruptImage, "Image dimensions are zero."));
    }
    if metadata.width > 16_384 || metadata.height > 16_384 || pixels > MAX_IMAGE_PIXELS {
        return Err(error(
            ErrorCode::ResourceLimit,
            "Image dimension or pixel limit exceeded.",
        ));
    }
    Ok(())
}

fn error(code: ErrorCode, message: &str) -> AppError {
    AppError {
        code,
        message: message.into(),
        target: None,
        retryable: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn webp(chunks: &[([u8; 4], Vec<u8>)]) -> Vec<u8> {
        let mut bytes = b"RIFF\0\0\0\0WEBP".to_vec();
        for (kind, payload) in chunks {
            bytes.extend_from_slice(kind);
            bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
            bytes.extend_from_slice(payload);
            if payload.len() % 2 == 1 {
                bytes.push(0);
            }
        }
        let size = u32::try_from(bytes.len() - 8).unwrap();
        bytes[4..8].copy_from_slice(&size.to_le_bytes());
        bytes
    }

    fn vp8(width: u16, height: u16) -> Vec<u8> {
        let mut payload = vec![0, 0, 0, 0x9d, 0x01, 0x2a];
        payload.extend_from_slice(&width.to_le_bytes());
        payload.extend_from_slice(&height.to_le_bytes());
        payload
    }

    fn vp8l(width: u32, height: u32, alpha: bool) -> Vec<u8> {
        let bits = (width - 1) | ((height - 1) << 14) | if alpha { 1 << 28 } else { 0 };
        let mut payload = vec![0x2f];
        payload.extend_from_slice(&bits.to_le_bytes());
        payload
    }

    fn vp8x(width: u32, height: u32, flags: u8) -> Vec<u8> {
        let mut payload = vec![flags, 0, 0, 0];
        for value in [width - 1, height - 1] {
            payload.extend_from_slice(&value.to_le_bytes()[..3]);
        }
        payload
    }

    fn png_chunk(bytes: &mut Vec<u8>, kind: [u8; 4], payload: &[u8]) {
        bytes.extend_from_slice(&(payload.len() as u32).to_be_bytes());
        bytes.extend_from_slice(&kind);
        bytes.extend_from_slice(payload);
        // inspect_image only needs structural bounds, not PNG checksum validation.
        bytes.extend_from_slice(&[0; 4]);
    }

    fn png(color_type: u8, chunks_before_idat: &[([u8; 4], Vec<u8>)]) -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
        let mut ihdr = Vec::new();
        ihdr.extend_from_slice(&320_u32.to_be_bytes());
        ihdr.extend_from_slice(&480_u32.to_be_bytes());
        ihdr.extend_from_slice(&[8, color_type, 0, 0, 0]);
        png_chunk(&mut bytes, *b"IHDR", &ihdr);
        for (kind, payload) in chunks_before_idat {
            png_chunk(&mut bytes, *kind, payload);
        }
        png_chunk(&mut bytes, *b"IDAT", &[0]);
        png_chunk(&mut bytes, *b"IEND", &[]);
        bytes
    }

    #[test]
    fn reads_png_dimensions_without_decoding_pixels() {
        let png = png(2, &[]);
        assert_eq!(
            inspect_image(&mut Cursor::new(&png), png.len() as u64).unwrap(),
            ImageMetadata {
                format: ImageFormat::Png,
                width: 320,
                height: 480,
                has_alpha: false,
            }
        );
    }

    #[test]
    fn png_transparency_chunk_sets_alpha_before_image_data() {
        for color_type in [0, 2, 3] {
            let png = png(color_type, &[(*b"tRNS", vec![0])]);
            assert!(
                inspect_image(&mut Cursor::new(&png), png.len() as u64)
                    .unwrap()
                    .has_alpha
            );
        }
        for color_type in [0, 2, 3] {
            let png = png(color_type, &[]);
            assert!(
                !inspect_image(&mut Cursor::new(&png), png.len() as u64)
                    .unwrap()
                    .has_alpha
            );
        }
        for color_type in [4, 6] {
            let png = png(color_type, &[]);
            assert!(
                inspect_image(&mut Cursor::new(&png), png.len() as u64)
                    .unwrap()
                    .has_alpha
            );
        }
    }

    #[test]
    fn png_transparency_scan_rejects_truncated_chunks_safely() {
        let mut png = png(2, &[(*b"tRNS", vec![0])]);
        png.truncate(41);
        assert_eq!(
            inspect_image(&mut Cursor::new(&png), png.len() as u64)
                .unwrap_err()
                .code,
            ErrorCode::CorruptImage
        );
    }

    #[test]
    fn rejects_dimension_bombs_before_decode() {
        let mut png = png(2, &[]);
        png[16..20].copy_from_slice(&20_000_u32.to_be_bytes());
        png[20..24].copy_from_slice(&20_000_u32.to_be_bytes());
        assert_eq!(
            inspect_image(&mut Cursor::new(&png), png.len() as u64)
                .unwrap_err()
                .code,
            ErrorCode::ResourceLimit
        );
    }

    #[test]
    fn fr_b08_webp_accepts_static_lossy_lossless_and_alpha_containers() {
        let lossy = webp(&[(*b"VP8 ", vp8(320, 480))]);
        assert_eq!(
            inspect_image(&mut Cursor::new(&lossy), lossy.len() as u64).unwrap(),
            ImageMetadata {
                format: ImageFormat::Webp,
                width: 320,
                height: 480,
                has_alpha: false,
            }
        );

        let lossless = webp(&[(*b"VP8L", vp8l(320, 480, true))]);
        assert_eq!(
            inspect_image(&mut Cursor::new(&lossless), lossless.len() as u64).unwrap(),
            ImageMetadata {
                format: ImageFormat::Webp,
                width: 320,
                height: 480,
                has_alpha: true,
            }
        );

        let alpha_lossy = webp(&[
            (*b"VP8X", vp8x(320, 480, 0x10)),
            (*b"ALPH", vec![1]),
            (*b"VP8 ", vp8(320, 480)),
        ]);
        assert_eq!(
            inspect_image(&mut Cursor::new(&alpha_lossy), alpha_lossy.len() as u64)
                .unwrap()
                .has_alpha,
            true
        );
    }

    #[test]
    fn fr_b08_webp_rejects_invalid_extended_layout_and_dimension_bombs() {
        let mismatched_canvas = webp(&[(*b"VP8X", vp8x(321, 480, 0)), (*b"VP8 ", vp8(320, 480))]);
        assert_eq!(
            inspect_image(
                &mut Cursor::new(&mismatched_canvas),
                mismatched_canvas.len() as u64,
            )
            .unwrap_err()
            .code,
            ErrorCode::CorruptImage
        );

        let oversized = webp(&[(*b"VP8L", vp8l(16_384, 16_384, false))]);
        assert_eq!(
            inspect_image(&mut Cursor::new(&oversized), oversized.len() as u64)
                .unwrap_err()
                .code,
            ErrorCode::ResourceLimit
        );
    }

    #[test]
    fn fr_b08_webp_rejects_malformed_riff_chunks_and_alpha_contracts() {
        let valid = webp(&[(*b"VP8 ", vp8(320, 480))]);
        let mut declared_size_mismatch = valid.clone();
        declared_size_mismatch[4..8].copy_from_slice(&0_u32.to_le_bytes());

        let mut truncated_chunk = valid.clone();
        truncated_chunk.truncate(truncated_chunk.len() - 2);
        let truncated_size = u32::try_from(truncated_chunk.len() - 8).unwrap();
        truncated_chunk[4..8].copy_from_slice(&truncated_size.to_le_bytes());

        let mut invalid_padding = webp(&[(*b"VP8 ", vp8(320, 480)), (*b"JUNK", vec![0])]);
        *invalid_padding.last_mut().unwrap() = 0xff;

        let cases = [
            ("declared RIFF size", declared_size_mismatch),
            ("truncated chunk", truncated_chunk),
            ("non-zero odd padding", invalid_padding),
            (
                "duplicate lossy core",
                webp(&[(*b"VP8 ", vp8(320, 480)), (*b"VP8 ", vp8(320, 480))]),
            ),
            (
                "mixed duplicate core",
                webp(&[(*b"VP8 ", vp8(320, 480)), (*b"VP8L", vp8l(320, 480, false))]),
            ),
            (
                "duplicate lossless core",
                webp(&[
                    (*b"VP8L", vp8l(320, 480, false)),
                    (*b"VP8L", vp8l(320, 480, false)),
                ]),
            ),
            (
                "ALPH without VP8X alpha flag",
                webp(&[
                    (*b"VP8X", vp8x(320, 480, 0)),
                    (*b"ALPH", vec![0]),
                    (*b"VP8 ", vp8(320, 480)),
                ]),
            ),
            (
                "VP8X alpha flag without ALPH",
                webp(&[(*b"VP8X", vp8x(320, 480, 0x10)), (*b"VP8 ", vp8(320, 480))]),
            ),
        ];

        for (case, bytes) in cases {
            assert_eq!(
                inspect_image(&mut Cursor::new(&bytes), bytes.len() as u64)
                    .unwrap_err()
                    .code,
                ErrorCode::CorruptImage,
                "{case}"
            );
        }
    }

    #[test]
    fn fr_b08_webp_rejects_animated_containers_without_falling_back_to_a_frame() {
        let cases = [
            (
                "VP8X animation flag",
                webp(&[(*b"VP8X", vp8x(320, 480, 0x02))]),
            ),
            (
                "ANIM chunk",
                webp(&[(*b"VP8 ", vp8(320, 480)), (*b"ANIM", Vec::new())]),
            ),
            (
                "ANMF chunk",
                webp(&[(*b"VP8 ", vp8(320, 480)), (*b"ANMF", Vec::new())]),
            ),
        ];

        for (case, bytes) in cases {
            assert_eq!(
                inspect_image(&mut Cursor::new(&bytes), bytes.len() as u64)
                    .unwrap_err()
                    .code,
                ErrorCode::UnsupportedFormat,
                "{case}"
            );
        }
    }
}
