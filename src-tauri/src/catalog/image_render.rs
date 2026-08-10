use std::io::Cursor;
use std::sync::{Arc, OnceLock};

use image::{DynamicImage, ImageError, ImageFormat as DecoderFormat, ImageReader};
use resvg::tiny_skia::{Pixmap, Transform};
use resvg::usvg::{ImageHrefResolver, Options, Tree};

use crate::api::{MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS};
use crate::domain::{AppError, ErrorCode, ImageFormat};

const MAX_IMAGE_EDGE: u32 = 16_384;

pub(crate) fn decode_raster_metadata(
    bytes: &[u8],
    format: ImageFormat,
) -> Result<(u32, u32, bool), AppError> {
    let decoded = decode_raster(bytes, format)?;
    let width = decoded.width();
    let height = decoded.height();
    validate_render_dimensions(width, height, u64::from(width) * u64::from(height) * 4)?;
    Ok((width, height, decoded.color().has_alpha()))
}

pub(crate) fn raster_delivery_png(bytes: &[u8], format: ImageFormat) -> Result<Vec<u8>, AppError> {
    let decoded = decode_raster(bytes, format)?;
    let width = decoded.width();
    let height = decoded.height();
    validate_render_dimensions(width, height, u64::from(width) * u64::from(height) * 4)?;
    let mut output = Cursor::new(Vec::new());
    decoded
        .write_to(&mut output, DecoderFormat::Png)
        .map_err(raster_error)?;
    bounded_output(output.into_inner())
}

pub(crate) fn inspect_svg(bytes: &[u8]) -> Result<(u32, u32), AppError> {
    let tree = parse_svg(bytes)?;
    svg_dimensions(&tree)
}

pub(crate) fn render_svg_png(
    bytes: &[u8],
    max_long_edge: Option<u32>,
) -> Result<(u32, u32, Vec<u8>), AppError> {
    let tree = parse_svg(bytes)?;
    let (source_width, source_height) = svg_dimensions(&tree)?;
    let (width, height) = match max_long_edge {
        Some(limit) if source_width.max(source_height) > limit => {
            let longest = u64::from(source_width.max(source_height));
            let scale =
                |value: u32| ((u64::from(value) * u64::from(limit) + longest / 2) / longest) as u32;
            (scale(source_width).max(1), scale(source_height).max(1))
        }
        _ => (source_width, source_height),
    };
    validate_render_dimensions(width, height, u64::from(width) * u64::from(height) * 4)?;
    let mut pixmap = Pixmap::new(width, height).ok_or_else(|| {
        image_error(
            ErrorCode::ResourceLimit,
            "SVG pixel buffer exceeds the resource limit.",
        )
    })?;
    let scale_x = width as f32 / tree.size().width();
    let scale_y = height as f32 / tree.size().height();
    resvg::render(
        &tree,
        Transform::from_scale(scale_x, scale_y),
        &mut pixmap.as_mut(),
    );
    let png = pixmap.encode_png().map_err(|error| {
        image_error(
            ErrorCode::CorruptImage,
            &format!("Cannot encode rendered SVG: {error}"),
        )
    })?;
    Ok((width, height, bounded_output(png)?))
}

fn decode_raster(bytes: &[u8], format: ImageFormat) -> Result<DynamicImage, AppError> {
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err(image_error(
            ErrorCode::ResourceLimit,
            "Image byte limit exceeded.",
        ));
    }
    let decoder_format = match format {
        ImageFormat::Bmp => DecoderFormat::Bmp,
        ImageFormat::Gif => DecoderFormat::Gif,
        ImageFormat::Tiff => DecoderFormat::Tiff,
        ImageFormat::Ico => DecoderFormat::Ico,
        _ => {
            return Err(image_error(
                ErrorCode::UnsupportedFormat,
                "No dedicated raster decoder is configured for this image format.",
            ));
        }
    };
    let mut reader = ImageReader::with_format(Cursor::new(bytes), decoder_format);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_EDGE);
    limits.max_image_height = Some(MAX_IMAGE_EDGE);
    limits.max_alloc = Some(MAX_IMAGE_BYTES);
    reader.limits(limits);
    reader.decode().map_err(raster_error)
}

fn parse_svg(bytes: &[u8]) -> Result<Tree, AppError> {
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err(image_error(
            ErrorCode::ResourceLimit,
            "SVG byte limit exceeded.",
        ));
    }
    let text = std::str::from_utf8(bytes)
        .map_err(|_| image_error(ErrorCode::CorruptImage, "SVG must be UTF-8 text."))?;
    let mut options = Options::default();
    options.resources_dir = None;
    options.image_href_resolver = ImageHrefResolver {
        // Embedded and external image references are deliberately omitted. This
        // keeps an SVG page self-contained and prevents filesystem/network reads.
        resolve_data: Box::new(|_, _, _| None),
        resolve_string: Box::new(|_, _| None),
    };
    options.fontdb = svg_font_database();
    Tree::from_str(text, &options).map_err(|error| {
        image_error(
            ErrorCode::CorruptImage,
            &format!("Cannot parse static SVG: {error}"),
        )
    })
}

fn svg_font_database() -> Arc<resvg::usvg::fontdb::Database> {
    static FONT_DATABASE: OnceLock<Arc<resvg::usvg::fontdb::Database>> = OnceLock::new();
    FONT_DATABASE
        .get_or_init(|| {
            let mut database = resvg::usvg::fontdb::Database::new();
            database.load_system_fonts();
            Arc::new(database)
        })
        .clone()
}

fn svg_dimensions(tree: &Tree) -> Result<(u32, u32), AppError> {
    let width = tree.size().width().ceil() as u32;
    let height = tree.size().height().ceil() as u32;
    validate_render_dimensions(width, height, u64::from(width) * u64::from(height) * 4)?;
    Ok((width, height))
}

fn validate_render_dimensions(width: u32, height: u32, allocation: u64) -> Result<(), AppError> {
    let pixels = u64::from(width) * u64::from(height);
    if width == 0
        || height == 0
        || width > MAX_IMAGE_EDGE
        || height > MAX_IMAGE_EDGE
        || pixels > MAX_IMAGE_PIXELS
        || allocation > MAX_IMAGE_BYTES
    {
        return Err(image_error(
            ErrorCode::ResourceLimit,
            "Decoded image dimensions exceed the resource limit.",
        ));
    }
    Ok(())
}

fn bounded_output(bytes: Vec<u8>) -> Result<Vec<u8>, AppError> {
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        Err(image_error(
            ErrorCode::ResourceLimit,
            "Rendered image exceeds the byte limit.",
        ))
    } else {
        Ok(bytes)
    }
}

fn raster_error(error: ImageError) -> AppError {
    let code = if matches!(error, ImageError::Limits(_)) {
        ErrorCode::ResourceLimit
    } else {
        ErrorCode::CorruptImage
    };
    image_error(code, &format!("Cannot decode image pixels: {error}"))
}

fn image_error(code: ErrorCode, message: &str) -> AppError {
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
    use image::{ImageBuffer, Rgba};

    fn encoded_raster(format: DecoderFormat) -> Vec<u8> {
        let image = DynamicImage::ImageRgba8(ImageBuffer::from_pixel(3, 2, Rgba([1, 2, 3, 4])));
        let mut output = Cursor::new(Vec::new());
        image.write_to(&mut output, format).unwrap();
        output.into_inner()
    }

    #[test]
    fn dedicated_raster_decoders_read_bmp_tiff_and_ico_pixels() {
        for (decoder, domain) in [
            (DecoderFormat::Bmp, ImageFormat::Bmp),
            (DecoderFormat::Tiff, ImageFormat::Tiff),
            (DecoderFormat::Ico, ImageFormat::Ico),
        ] {
            let bytes = encoded_raster(decoder);
            assert_eq!(
                decode_raster_metadata(&bytes, domain).unwrap(),
                (3, 2, true)
            );
            assert!(
                raster_delivery_png(&bytes, domain)
                    .unwrap()
                    .starts_with(b"\x89PNG\r\n\x1a\n")
            );
        }
    }

    #[test]
    fn static_svg_renders_without_loading_referenced_files_or_running_script() {
        let svg = br#"<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10">
          <script>throw new Error('must not run')</script>
          <image href="C:/secret.png" width="20" height="10"/>
          <rect width="20" height="10" fill="red"/>
        </svg>"#;
        assert_eq!(inspect_svg(svg).unwrap(), (20, 10));
        let (width, height, png) = render_svg_png(svg, Some(8)).unwrap();
        assert_eq!((width, height), (8, 4));
        assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
    }
}
