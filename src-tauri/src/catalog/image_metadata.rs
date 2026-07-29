use std::io::{Read, Seek, SeekFrom};

use crate::api::{MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS};
use crate::domain::{AppError, ErrorCode, ImageFormat};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ImageMetadata {
    pub format: ImageFormat,
    pub width: u32,
    pub height: u32,
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
        ImageMetadata {
            format: ImageFormat::Png,
            width: u32::from_be_bytes(signature[16..20].try_into().unwrap()),
            height: u32::from_be_bytes(signature[20..24].try_into().unwrap()),
        }
    } else if signature.starts_with(&[0xff, 0xd8]) {
        inspect_jpeg(reader)?
    } else {
        return Err(error(
            ErrorCode::CorruptImage,
            "File signature is not a supported image.",
        ));
    };
    validate_dimensions(metadata)?;
    Ok(metadata)
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
            });
        }
        std::io::copy(
            &mut reader.take(u64::from(length - 2)),
            &mut std::io::sink(),
        )
        .map_err(|_| error(ErrorCode::CorruptImage, "JPEG segment is truncated."))?;
    }
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

    #[test]
    fn reads_png_dimensions_without_decoding_pixels() {
        let mut png = vec![0; 24];
        png[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        png[12..16].copy_from_slice(b"IHDR");
        png[16..20].copy_from_slice(&320_u32.to_be_bytes());
        png[20..24].copy_from_slice(&480_u32.to_be_bytes());
        assert_eq!(
            inspect_image(&mut Cursor::new(png), 24).unwrap(),
            ImageMetadata {
                format: ImageFormat::Png,
                width: 320,
                height: 480
            }
        );
    }

    #[test]
    fn rejects_dimension_bombs_before_decode() {
        let mut png = vec![0; 24];
        png[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        png[12..16].copy_from_slice(b"IHDR");
        png[16..20].copy_from_slice(&20_000_u32.to_be_bytes());
        png[20..24].copy_from_slice(&20_000_u32.to_be_bytes());
        assert_eq!(
            inspect_image(&mut Cursor::new(png), 24).unwrap_err().code,
            ErrorCode::ResourceLimit
        );
    }
}
