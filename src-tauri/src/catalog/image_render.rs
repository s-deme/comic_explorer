use std::io::Cursor;
use std::sync::{Arc, OnceLock};

use image::{DynamicImage, ImageDecoder, ImageError, ImageFormat as DecoderFormat, ImageReader};
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
    if let Some(png) = color_managed_png(bytes)? {
        return Ok(png);
    }
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
    if format == ImageFormat::Avif {
        return decode_avif(bytes);
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

fn decode_avif(bytes: &[u8]) -> Result<DynamicImage, AppError> {
    let metadata = super::inspect_image(&mut Cursor::new(bytes), bytes.len() as u64)?;
    if metadata.format != ImageFormat::Avif {
        return Err(image_error(ErrorCode::CorruptImage, "Expected AVIF data."));
    }
    let fail = |error: &dyn std::fmt::Display| {
        image_error(
            ErrorCode::CorruptImage,
            &format!("Cannot decode AVIF: {error}"),
        )
    };
    let parsed = aom_decode::avif::Avif::parse_avif(bytes).map_err(|e| fail(&e))?;
    // Validate the compressed AV1 dimensions too, before libaom allocates buffers.
    for bitstream in std::iter::once(&parsed.primary_item).chain(parsed.alpha_item.iter()) {
        let header =
            aom_decode::avif::AV1Metadata::parse_av1_bitstream(bitstream).map_err(|e| fail(&e))?;
        let width = header.max_frame_width.get();
        let height = header.max_frame_height.get();
        validate_render_dimensions(width, height, u64::from(width) * u64::from(height) * 16)?;
    }
    let decoded =
        aom_decode::avif::Avif::from_parsed_avif_data(parsed, &aom_decode::Config { threads: 2 })
            .and_then(|mut decoder| decoder.convert())
            .map_err(|e| fail(&e))?;
    use aom_decode::avif::Image;
    let (width, height, pixels): (usize, usize, Vec<u8>) = match decoded {
        Image::RGB8(img) => (
            img.width(),
            img.height(),
            img.pixels().flat_map(|p| [p.r, p.g, p.b, 255]).collect(),
        ),
        Image::RGBA8(img) => (
            img.width(),
            img.height(),
            img.pixels().flat_map(|p| [p.r, p.g, p.b, p.a]).collect(),
        ),
        Image::RGB16(img) => (
            img.width(),
            img.height(),
            img.pixels()
                .flat_map(|p| [(p.r >> 8) as u8, (p.g >> 8) as u8, (p.b >> 8) as u8, 255])
                .collect(),
        ),
        Image::RGBA16(img) => (
            img.width(),
            img.height(),
            img.pixels()
                .flat_map(|p| {
                    [
                        (p.r >> 8) as u8,
                        (p.g >> 8) as u8,
                        (p.b >> 8) as u8,
                        (p.a >> 8) as u8,
                    ]
                })
                .collect(),
        ),
        Image::Gray8(img) => (
            img.width(),
            img.height(),
            img.pixels().flat_map(|p| [p, p, p, 255]).collect(),
        ),
        Image::Gray16(img) => (
            img.width(),
            img.height(),
            img.pixels()
                .flat_map(|p| [(p >> 8) as u8, (p >> 8) as u8, (p >> 8) as u8, 255])
                .collect(),
        ),
    };
    if (width as u32, height as u32) != (metadata.width, metadata.height) {
        return Err(image_error(
            ErrorCode::CorruptImage,
            "AVIF decoded dimensions differ from its container.",
        ));
    }
    let mut rgba = image::RgbaImage::from_raw(width as u32, height as u32, pixels)
        .ok_or_else(|| image_error(ErrorCode::CorruptImage, "Invalid AVIF pixel layout."))?;
    if let Some(color) = super::image_metadata::avif_color(bytes)? {
        if color.starts_with(b"prof") || color.starts_with(b"rICC") {
            transform_icc(&color[4..], &mut rgba)?;
        } else if color.starts_with(b"nclx") {
            if color.len() != 11 {
                return Err(image_error(
                    ErrorCode::CorruptImage,
                    "Invalid AVIF nclx profile.",
                ));
            }
            let primaries = u16::from_be_bytes([color[4], color[5]]);
            let transfer = u16::from_be_bytes([color[6], color[7]]);
            if !matches!(primaries, 1 | 2 | 9 | 12) || !matches!(transfer, 1 | 2 | 6 | 13 | 14 | 15)
            {
                return Err(image_error(
                    ErrorCode::UnsupportedFormat,
                    "AVIF HDR or this color space is not supported.",
                ));
            }
            let profile = moxcms::ColorProfile::new_from_cicp(moxcms::CicpProfile {
                color_primaries: moxcms::CicpColorPrimaries::try_from(if primaries == 2 {
                    1
                } else {
                    primaries as u8
                })
                .map_err(|e| fail(&e))?,
                transfer_characteristics: moxcms::TransferCharacteristics::try_from(
                    if transfer == 2 { 13 } else { transfer as u8 },
                )
                .map_err(|e| fail(&e))?,
                matrix_coefficients: moxcms::MatrixCoefficients::Identity,
                full_range: true,
            });
            transform_icc(&profile.encode().map_err(|e| fail(&e))?, &mut rgba)?;
        }
    }
    Ok(DynamicImage::ImageRgba8(rgba))
}

/// Normalize embedded ICC to sRGB before producing untagged derived pixels.
/// Original animated images stay intact in WebView2, which manages their profiles.
pub(crate) fn color_managed_png(bytes: &[u8]) -> Result<Option<Vec<u8>>, AppError> {
    let Ok(format) = image::guess_format(bytes) else {
        return Ok(None);
    };
    if !matches!(
        format,
        DecoderFormat::Jpeg | DecoderFormat::Png | DecoderFormat::Tiff | DecoderFormat::WebP
    ) {
        return Ok(None);
    }
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_EDGE);
    limits.max_image_height = Some(MAX_IMAGE_EDGE);
    limits.max_alloc = Some(MAX_IMAGE_BYTES);
    reader.limits(limits);
    let mut decoder = reader.into_decoder().map_err(raster_error)?;
    let Some(icc) = decoder.icc_profile().map_err(raster_error)? else {
        return Ok(None);
    };
    if icc.len() > 4 * 1024 * 1024 {
        return Err(image_error(
            ErrorCode::ResourceLimit,
            "ICC profile exceeds 4 MiB.",
        ));
    }
    let (width, height) = decoder.dimensions();
    validate_render_dimensions(width, height, u64::from(width) * u64::from(height) * 16)?;
    let orientation = decoder.orientation().map_err(raster_error)?;
    let mut decoded = DynamicImage::from_decoder(decoder).map_err(raster_error)?;
    decoded.apply_orientation(orientation);
    let mut rgba = decoded.into_rgba8();
    transform_icc(&icc, &mut rgba)?;
    let mut output = Cursor::new(Vec::new());
    DynamicImage::ImageRgba8(rgba)
        .write_to(&mut output, DecoderFormat::Png)
        .map_err(raster_error)?;
    bounded_output(output.into_inner()).map(Some)
}

fn transform_icc(icc: &[u8], rgba: &mut image::RgbaImage) -> Result<(), AppError> {
    use moxcms::{ColorProfile, Layout, TransformOptions};
    let fail = |error: moxcms::CmsError| {
        image_error(
            ErrorCode::CorruptImage,
            &format!("Invalid or unsupported ICC profile: {error}"),
        )
    };
    let source = ColorProfile::new_from_slice(icc).map_err(fail)?;
    if source.color_space != moxcms::DataColorSpace::Rgb {
        return Err(image_error(
            ErrorCode::UnsupportedFormat,
            "ICC conversion currently requires an RGB source profile.",
        ));
    }
    let transform = source
        .create_transform_8bit(
            Layout::Rgba,
            &ColorProfile::new_srgb(),
            Layout::Rgba,
            TransformOptions::default(),
        )
        .map_err(fail)?;
    let mut row = vec![0u8; rgba.width() as usize * 4];
    for pixels in rgba.as_mut().chunks_exact_mut(row.len()) {
        transform.transform(pixels, &mut row).map_err(fail)?;
        // Preserve transparency independently of profile channel processing.
        for (src, dst) in row.chunks_exact(4).zip(pixels.chunks_exact_mut(4)) {
            dst[..3].copy_from_slice(&src[..3]);
        }
    }
    Ok(())
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

    #[test]
    fn bundled_avif_decoder_reads_pixels_and_rejects_truncation() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/generated/FIX-AVIF-001/rgb.avif");
        let bytes = std::fs::read(path).expect("generate fixtures first");
        let metadata =
            crate::catalog::inspect_image(&mut Cursor::new(&bytes), bytes.len() as u64).unwrap();
        assert_eq!((metadata.width, metadata.height), (3, 2));
        let png = raster_delivery_png(&bytes, ImageFormat::Avif).unwrap();
        let image = image::load_from_memory(&png).unwrap().into_rgba8();
        assert_eq!(image.dimensions(), (3, 2));
        let pixel = image.get_pixel(0, 0).0;
        assert!(
            (i16::from(pixel[0]) - 180).abs() < 8,
            "decoded pixel: {pixel:?}"
        );
        assert_eq!(pixel[3], 255);
        assert!(decode_avif(&bytes[..bytes.len() - 4]).is_err());
        #[cfg(target_os = "windows")]
        {
            let (width, height, bgra) = crate::catalog::decode_wic_bgra(&bytes).unwrap();
            assert_eq!((width, height), (3, 2));
            assert_eq!(bgra.len(), 24);
        }
    }

    #[test]
    fn embedded_icc_is_converted_to_srgb_and_alpha_is_preserved() {
        use image::ImageEncoder;
        let profile = moxcms::ColorProfile::new_display_p3().encode().unwrap();
        let mut encoded = Vec::new();
        let mut encoder = image::codecs::png::PngEncoder::new(&mut encoded);
        encoder.set_icc_profile(profile).unwrap();
        encoder
            .write_image(&[180, 80, 60, 123], 1, 1, image::ExtendedColorType::Rgba8)
            .unwrap();
        let normalized = color_managed_png(&encoded).unwrap().unwrap();
        let pixel = image::load_from_memory(&normalized)
            .unwrap()
            .into_rgba8()
            .get_pixel(0, 0)
            .0;
        assert_ne!(&pixel[..3], &[180, 80, 60]);
        assert_eq!(pixel[3], 123);
        assert!(color_managed_png(&normalized).unwrap().is_none());
        assert!(transform_icc(b"invalid", &mut image::RgbaImage::new(1, 1)).is_err());
    }

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
