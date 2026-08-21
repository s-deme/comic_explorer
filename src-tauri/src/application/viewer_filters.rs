use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{ExtendedColorType, ImageEncoder, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};

use crate::api::{MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, RequestContext, Response};
use crate::domain::{AppError, ErrorCode};
use crate::state::{StateStore, ViewerFilterSetRecord};

use super::{AppState, error_response, request_error, unix_millis, validate_request};

const MAX_FILTER_SETS: usize = 32;
const MAX_FILTER_STEPS: usize = 16;
const MAX_PIXEL_STEPS: u64 = 512_000_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ViewerFilterStep {
    pub enabled: bool,
    #[serde(flatten)]
    pub filter: ViewerFilter,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum ViewerFilter {
    Grayscale,
    Levels {
        black: u8,
        white: u8,
        gamma: f32,
    },
    Gamma {
        value: f32,
    },
    Contrast {
        value: i16,
    },
    Brightness {
        value: i16,
    },
    HistogramEqualize,
    Posterize {
        levels: u8,
    },
    Invert,
    ToneCurve {
        points: Vec<TonePoint>,
    },
    Sharpen {
        amount: f32,
    },
    UnsharpMask {
        radius: u8,
        amount: f32,
        threshold: u8,
    },
    Blur {
        radius: u8,
    },
    Crop {
        top: f32,
        right: f32,
        bottom: f32,
        left: f32,
    },
    Margin {
        top: u16,
        right: u16,
        bottom: u16,
        left: u16,
        color: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TonePoint {
    pub input: u8,
    pub output: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerFilterSet {
    pub id: i64,
    pub name: String,
    pub chain: Vec<ViewerFilterStep>,
    pub active: bool,
    pub updated_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerFilterCatalog {
    pub sets: Vec<ViewerFilterSet>,
    pub maximum_sets: usize,
    pub maximum_steps: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveViewerFilterSetRequest {
    pub name: String,
    pub chain: Vec<ViewerFilterStep>,
    pub overwrite: bool,
}

fn invalid(message: &str) -> AppError {
    request_error(ErrorCode::InvalidRequest, message)
}
fn resource(message: &str) -> AppError {
    request_error(ErrorCode::ResourceLimit, message)
}
fn ok<T>(context: &RequestContext, data: T) -> Response<T> {
    Response::Ok {
        request_id: context.request_id.clone(),
        generation: context.generation,
        data,
    }
}

fn validate_name(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if !(1..=64).contains(&name.encode_utf16().count()) || name.chars().any(char::is_control) {
        return Err(invalid(
            "Filter set names must contain 1 to 64 characters without control characters.",
        ));
    }
    Ok(name.into())
}

fn finite_range(value: f32, minimum: f32, maximum: f32, label: &str) -> Result<(), AppError> {
    if value.is_finite() && (minimum..=maximum).contains(&value) {
        Ok(())
    } else {
        Err(invalid(&format!("{label} is outside its supported range.")))
    }
}

pub(crate) fn validate_filter_chain(chain: &[ViewerFilterStep]) -> Result<(), AppError> {
    if chain.is_empty() || chain.len() > MAX_FILTER_STEPS {
        return Err(resource(
            "A filter chain must contain between 1 and 16 steps.",
        ));
    }
    for step in chain {
        match &step.filter {
            ViewerFilter::Grayscale | ViewerFilter::HistogramEqualize | ViewerFilter::Invert => {}
            ViewerFilter::Levels {
                black,
                white,
                gamma,
            } => {
                if black >= white {
                    return Err(invalid("Levels black must be below white."));
                }
                finite_range(*gamma, 0.1, 5.0, "Levels gamma")?;
            }
            ViewerFilter::Gamma { value } => finite_range(*value, 0.1, 5.0, "Gamma")?,
            ViewerFilter::Contrast { value } | ViewerFilter::Brightness { value }
                if !(-100..=100).contains(value) =>
            {
                return Err(invalid(
                    "Brightness and contrast must be between -100 and 100.",
                ));
            }
            ViewerFilter::Contrast { .. } | ViewerFilter::Brightness { .. } => {}
            ViewerFilter::Posterize { levels } if !(2..=32).contains(levels) => {
                return Err(invalid("Posterize levels must be between 2 and 32."));
            }
            ViewerFilter::Posterize { .. } => {}
            ViewerFilter::ToneCurve { points } => {
                if !(2..=16).contains(&points.len())
                    || points.first().map(|point| point.input) != Some(0)
                    || points.last().map(|point| point.input) != Some(255)
                    || points.windows(2).any(|pair| pair[0].input >= pair[1].input)
                {
                    return Err(invalid(
                        "Tone curve requires 2 to 16 strictly ordered points from input 0 through 255.",
                    ));
                }
            }
            ViewerFilter::Sharpen { amount } => finite_range(*amount, 0.1, 3.0, "Sharpen amount")?,
            ViewerFilter::UnsharpMask { radius, amount, .. } => {
                if !(1..=8).contains(radius) {
                    return Err(invalid("Unsharp radius must be between 1 and 8."));
                }
                finite_range(*amount, 0.1, 3.0, "Unsharp amount")?;
            }
            ViewerFilter::Blur { radius } if !(1..=8).contains(radius) => {
                return Err(invalid("Blur radius must be between 1 and 8."));
            }
            ViewerFilter::Blur { .. } => {}
            ViewerFilter::Crop {
                top,
                right,
                bottom,
                left,
            } => {
                for (value, label) in [
                    (*top, "Crop top"),
                    (*right, "Crop right"),
                    (*bottom, "Crop bottom"),
                    (*left, "Crop left"),
                ] {
                    finite_range(value, 0.0, 45.0, label)?;
                }
                if top + bottom >= 90.0 || left + right >= 90.0 {
                    return Err(invalid(
                        "Opposing crop edges must total less than 90 percent.",
                    ));
                }
            }
            ViewerFilter::Margin {
                top,
                right,
                bottom,
                left,
                color,
            } => {
                if [top, right, bottom, left]
                    .into_iter()
                    .any(|value| *value > 512)
                    || parse_color(color).is_none()
                {
                    return Err(invalid(
                        "Margins must be 0 to 512 pixels with a #RRGGBB color.",
                    ));
                }
            }
        }
    }
    Ok(())
}

fn parse_record(record: ViewerFilterSetRecord) -> Result<ViewerFilterSet, AppError> {
    let chain: Vec<ViewerFilterStep> = serde_json::from_str(&record.chain_json)
        .map_err(|_| invalid("Stored viewer filter chain is invalid."))?;
    validate_filter_chain(&chain)?;
    Ok(ViewerFilterSet {
        id: record.id,
        name: record.name,
        chain,
        active: record.active,
        updated_at_ms: record.updated_at_ms,
    })
}

fn catalog(store: &StateStore) -> Result<ViewerFilterCatalog, AppError> {
    Ok(ViewerFilterCatalog {
        sets: store
            .list_viewer_filter_sets()?
            .into_iter()
            .map(parse_record)
            .collect::<Result<_, _>>()?,
        maximum_sets: MAX_FILTER_SETS,
        maximum_steps: MAX_FILTER_STEPS,
    })
}

pub(crate) fn active_filter_chain(store: &StateStore) -> Result<Vec<ViewerFilterStep>, AppError> {
    store
        .active_viewer_filter_set()?
        .map(parse_record)
        .transpose()
        .map(|record| record.map(|set| set.chain).unwrap_or_default())
}

fn mutate(
    state: &AppState,
    context: &RequestContext,
    action: impl FnOnce(&StateStore) -> Result<(), AppError>,
) -> Result<Response<ViewerFilterCatalog>, String> {
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(
            context,
            invalid("State store is unavailable."),
        ));
    };
    if let Err(error) = action(store) {
        return Ok(error_response(context, error));
    }
    let result = catalog(store);
    drop(guard);
    if let Ok(mut media) = state.media.lock() {
        media.revoke_all();
    }
    if let Ok(mut viewer) = state.viewer.lock() {
        viewer.begin(context.generation);
    }
    Ok(match result {
        Ok(value) => ok(context, value),
        Err(error) => error_response(context, error),
    })
}

#[tauri::command]
pub fn list_viewer_filter_sets(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<ViewerFilterCatalog>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(
            &context,
            invalid("State store is unavailable."),
        ));
    };
    Ok(match catalog(store) {
        Ok(value) => ok(&context, value),
        Err(error) => error_response(&context, error),
    })
}

#[tauri::command]
pub fn save_viewer_filter_set(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    request: SaveViewerFilterSetRequest,
) -> Result<Response<ViewerFilterCatalog>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let name = match validate_name(&request.name) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    if let Err(error) = validate_filter_chain(&request.chain) {
        return Ok(error_response(&context, error));
    }
    let json = serde_json::to_string(&request.chain)
        .map_err(|error| format!("filter serialization failed: {error}"))?;
    mutate(&state, &context, |store| {
        store
            .save_viewer_filter_set(&name, &json, request.overwrite, unix_millis().max(0) as u64)
            .map(|_| ())
    })
}

#[tauri::command]
pub fn activate_viewer_filter_set(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    filter_set_id: Option<i64>,
) -> Result<Response<ViewerFilterCatalog>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if filter_set_id.is_some_and(|id| id <= 0) {
        return Ok(error_response(
            &context,
            invalid("Filter set id is invalid."),
        ));
    }
    mutate(&state, &context, |store| {
        store.activate_viewer_filter_set(filter_set_id)
    })
}

#[tauri::command]
pub fn delete_viewer_filter_set(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    filter_set_id: i64,
    confirmed: bool,
) -> Result<Response<ViewerFilterCatalog>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !confirmed {
        return Ok(error_response(
            &context,
            invalid("Filter set deletion requires confirmation."),
        ));
    }
    mutate(&state, &context, |store| {
        store.delete_viewer_filter_set(filter_set_id)
    })
}

pub(crate) fn filter_page_bytes(
    bytes: Vec<u8>,
    mime_type: &'static str,
    chain: &[ViewerFilterStep],
) -> Result<(&'static str, Vec<u8>), AppError> {
    if chain.iter().all(|step| !step.enabled) || chain.is_empty() {
        return Ok((mime_type, bytes));
    }
    validate_filter_chain(chain)?;
    #[cfg(target_os = "windows")]
    {
        let (width, height, bgra) = crate::catalog::decode_wic_bgra(&bytes)?;
        let mut rgba = Vec::with_capacity(bgra.len());
        for pixel in bgra.chunks_exact(4) {
            rgba.extend_from_slice(&[pixel[2], pixel[1], pixel[0], pixel[3]]);
        }
        let image = RgbaImage::from_raw(width, height, rgba)
            .ok_or_else(|| invalid("Decoded filter image buffer is invalid."))?;
        let image = apply_chain_rgba(image, chain)?;
        let mut output = Vec::new();
        PngEncoder::new_with_quality(&mut output, CompressionType::Fast, FilterType::Adaptive)
            .write_image(
                image.as_raw(),
                image.width(),
                image.height(),
                ExtendedColorType::Rgba8,
            )
            .map_err(image_error)?;
        if output.len() as u64 > MAX_IMAGE_BYTES {
            return Err(resource("Filtered PNG exceeds 256 MiB."));
        }
        Ok(("image/png", output))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = bytes;
        Err(request_error(
            ErrorCode::UnsupportedFormat,
            "Viewer filters require Windows WIC.",
        ))
    }
}

fn image_error(error: image::ImageError) -> AppError {
    AppError {
        code: ErrorCode::CorruptImage,
        message: format!("Filtered PNG encoding failed: {error}"),
        target: None,
        retryable: false,
    }
}
fn clamp(value: f32) -> u8 {
    value.round().clamp(0.0, 255.0) as u8
}
fn map_rgb(image: &mut RgbaImage, mut transform: impl FnMut(u8) -> u8) {
    for pixel in image.pixels_mut() {
        pixel.0[0] = transform(pixel.0[0]);
        pixel.0[1] = transform(pixel.0[1]);
        pixel.0[2] = transform(pixel.0[2]);
    }
}
fn parse_color(value: &str) -> Option<[u8; 3]> {
    if value.len() != 7 || !value.starts_with('#') {
        return None;
    }
    Some([
        u8::from_str_radix(&value[1..3], 16).ok()?,
        u8::from_str_radix(&value[3..5], 16).ok()?,
        u8::from_str_radix(&value[5..7], 16).ok()?,
    ])
}

fn tone_lut(points: &[TonePoint]) -> [u8; 256] {
    let mut lut = [0u8; 256];
    for pair in points.windows(2) {
        let x0 = pair[0].input as usize;
        let x1 = pair[1].input as usize;
        for (x, slot) in lut.iter_mut().enumerate().take(x1 + 1).skip(x0) {
            let t = (x - x0) as f32 / (x1 - x0) as f32;
            *slot =
                clamp(pair[0].output as f32 + (pair[1].output as f32 - pair[0].output as f32) * t);
        }
    }
    lut
}

fn equalize(image: &mut RgbaImage) {
    let total = image.width() as u64 * image.height() as u64;
    if total <= 1 {
        return;
    }
    for channel in 0..3 {
        let mut histogram = [0u64; 256];
        for pixel in image.pixels() {
            histogram[pixel.0[channel] as usize] += 1;
        }
        let first = histogram
            .iter()
            .copied()
            .find(|count| *count > 0)
            .unwrap_or(0);
        let denominator = total.saturating_sub(first);
        if denominator == 0 {
            continue;
        }
        let mut cumulative = 0u64;
        let mut lut = [0u8; 256];
        for (index, count) in histogram.into_iter().enumerate() {
            cumulative += count;
            lut[index] =
                (((cumulative.saturating_sub(first)) * 255 + denominator / 2) / denominator) as u8;
        }
        for pixel in image.pixels_mut() {
            pixel.0[channel] = lut[pixel.0[channel] as usize];
        }
    }
}

fn blend_high_pass(
    original: &RgbaImage,
    blurred: &RgbaImage,
    amount: f32,
    threshold: u8,
) -> RgbaImage {
    let mut result = original.clone();
    for ((output, source), soft) in result
        .pixels_mut()
        .zip(original.pixels())
        .zip(blurred.pixels())
    {
        for channel in 0..3 {
            let difference = source.0[channel] as f32 - soft.0[channel] as f32;
            if difference.abs() >= threshold as f32 {
                output.0[channel] = clamp(source.0[channel] as f32 + amount * difference);
            }
        }
        output.0[3] = source.0[3];
    }
    result
}

pub(crate) fn apply_chain_rgba(
    mut image: RgbaImage,
    chain: &[ViewerFilterStep],
) -> Result<RgbaImage, AppError> {
    validate_filter_chain(chain)?;
    let mut pixel_steps = 0u64;
    for step in chain.iter().filter(|step| step.enabled) {
        let pixels = u64::from(image.width()) * u64::from(image.height());
        pixel_steps = pixel_steps
            .checked_add(pixels)
            .ok_or_else(|| resource("Filter pixel-step count overflowed."))?;
        if pixel_steps > MAX_PIXEL_STEPS {
            return Err(resource("Filter chain exceeds 512,000,000 pixel-steps."));
        }
        match &step.filter {
            ViewerFilter::Grayscale => {
                for pixel in image.pixels_mut() {
                    let gray = ((54u32 * pixel.0[0] as u32
                        + 183u32 * pixel.0[1] as u32
                        + 19u32 * pixel.0[2] as u32
                        + 128)
                        >> 8) as u8;
                    pixel.0[0] = gray;
                    pixel.0[1] = gray;
                    pixel.0[2] = gray;
                }
            }
            ViewerFilter::Levels {
                black,
                white,
                gamma,
            } => {
                let range = (*white - *black) as f32;
                map_rgb(&mut image, |value| {
                    clamp(
                        (((value.saturating_sub(*black)) as f32 / range)
                            .clamp(0.0, 1.0)
                            .powf(1.0 / gamma))
                            * 255.0,
                    )
                });
            }
            ViewerFilter::Gamma { value } => map_rgb(&mut image, |channel| {
                clamp((channel as f32 / 255.0).powf(1.0 / value) * 255.0)
            }),
            ViewerFilter::Contrast { value } => {
                let contrast = *value as f32 * 2.55;
                let factor = (259.0 * (contrast + 255.0)) / (255.0 * (259.0 - contrast));
                map_rgb(&mut image, |channel| {
                    clamp(factor * (channel as f32 - 128.0) + 128.0)
                });
            }
            ViewerFilter::Brightness { value } => {
                let offset = *value as f32 * 2.55;
                map_rgb(&mut image, |channel| clamp(channel as f32 + offset));
            }
            ViewerFilter::HistogramEqualize => equalize(&mut image),
            ViewerFilter::Posterize { levels } => {
                let steps = (*levels - 1) as f32;
                map_rgb(&mut image, |channel| {
                    clamp(((channel as f32 / 255.0 * steps).round() / steps) * 255.0)
                });
            }
            ViewerFilter::Invert => map_rgb(&mut image, |channel| 255 - channel),
            ViewerFilter::ToneCurve { points } => {
                let lut = tone_lut(points);
                map_rgb(&mut image, |channel| lut[channel as usize]);
            }
            ViewerFilter::Sharpen { amount } => {
                let blurred = image::imageops::blur(&image, 1.0);
                image = blend_high_pass(&image, &blurred, *amount, 0);
            }
            ViewerFilter::UnsharpMask {
                radius,
                amount,
                threshold,
            } => {
                let blurred = image::imageops::blur(&image, *radius as f32 / 2.0);
                image = blend_high_pass(&image, &blurred, *amount, *threshold);
            }
            ViewerFilter::Blur { radius } => {
                let alpha = image.pixels().map(|pixel| pixel.0[3]).collect::<Vec<_>>();
                image = image::imageops::blur(&image, *radius as f32 / 2.0);
                for (pixel, alpha) in image.pixels_mut().zip(alpha) {
                    pixel.0[3] = alpha;
                }
            }
            ViewerFilter::Crop {
                top,
                right,
                bottom,
                left,
            } => {
                let x = (image.width() as f32 * left / 100.0).round() as u32;
                let y = (image.height() as f32 * top / 100.0).round() as u32;
                let remove_right = (image.width() as f32 * right / 100.0).round() as u32;
                let remove_bottom = (image.height() as f32 * bottom / 100.0).round() as u32;
                let width = image
                    .width()
                    .checked_sub(x + remove_right)
                    .filter(|value| *value > 0)
                    .ok_or_else(|| invalid("Crop produces zero width."))?;
                let height = image
                    .height()
                    .checked_sub(y + remove_bottom)
                    .filter(|value| *value > 0)
                    .ok_or_else(|| invalid("Crop produces zero height."))?;
                image = image::imageops::crop_imm(&image, x, y, width, height).to_image();
            }
            ViewerFilter::Margin {
                top,
                right,
                bottom,
                left,
                color,
            } => {
                let width = image
                    .width()
                    .checked_add(u32::from(*left) + u32::from(*right))
                    .ok_or_else(|| resource("Margin width overflowed."))?;
                let height = image
                    .height()
                    .checked_add(u32::from(*top) + u32::from(*bottom))
                    .ok_or_else(|| resource("Margin height overflowed."))?;
                let pixels = u64::from(width) * u64::from(height);
                if width > 16_384 || height > 16_384 || pixels > MAX_IMAGE_PIXELS {
                    return Err(resource("Margin output exceeds image dimensions."));
                }
                let rgb = parse_color(color).ok_or_else(|| invalid("Margin color is invalid."))?;
                let mut expanded =
                    RgbaImage::from_pixel(width, height, Rgba([rgb[0], rgb[1], rgb[2], 255]));
                image::imageops::replace(&mut expanded, &image, i64::from(*left), i64::from(*top));
                image = expanded;
            }
        }
    }
    Ok(image)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;
    fn step(filter: ViewerFilter) -> ViewerFilterStep {
        ViewerFilterStep {
            enabled: true,
            filter,
        }
    }
    fn base(width: u32, height: u32) -> RgbaImage {
        RgbaImage::from_fn(width, height, |x, y| {
            Rgba([(x * 17) as u8, (y * 19) as u8, ((x + y) * 11) as u8, 77])
        })
    }

    #[test]
    fn req_ley_p5_002_all_filters_validate_apply_in_order_and_preserve_color_alpha() {
        let chain = vec![
            step(ViewerFilter::Grayscale),
            step(ViewerFilter::Levels {
                black: 0,
                white: 255,
                gamma: 1.0,
            }),
            step(ViewerFilter::Gamma { value: 1.1 }),
            step(ViewerFilter::Contrast { value: 10 }),
            step(ViewerFilter::Brightness { value: 5 }),
            step(ViewerFilter::HistogramEqualize),
            step(ViewerFilter::Posterize { levels: 8 }),
            step(ViewerFilter::Invert),
            step(ViewerFilter::ToneCurve {
                points: vec![
                    TonePoint {
                        input: 0,
                        output: 0,
                    },
                    TonePoint {
                        input: 128,
                        output: 160,
                    },
                    TonePoint {
                        input: 255,
                        output: 255,
                    },
                ],
            }),
            step(ViewerFilter::Sharpen { amount: 0.5 }),
            step(ViewerFilter::UnsharpMask {
                radius: 2,
                amount: 0.5,
                threshold: 2,
            }),
            step(ViewerFilter::Blur { radius: 2 }),
            step(ViewerFilter::Crop {
                top: 10.0,
                right: 10.0,
                bottom: 10.0,
                left: 10.0,
            }),
            step(ViewerFilter::Margin {
                top: 2,
                right: 3,
                bottom: 2,
                left: 3,
                color: "#112233".into(),
            }),
        ];
        let output = apply_chain_rgba(base(20, 20), &chain).unwrap();
        assert_eq!((output.width(), output.height()), (22, 20));
        assert_eq!(output.get_pixel(0, 0), &Rgba([0x11, 0x22, 0x33, 255]));
        assert!(output.pixels().any(|pixel| pixel.0[3] == 77));
    }

    #[test]
    fn req_ley_p5_002_chain_order_changes_pixels_and_invert_keeps_alpha() {
        let source = RgbaImage::from_pixel(1, 1, Rgba([30, 60, 90, 42]));
        let first = apply_chain_rgba(
            source.clone(),
            &[
                step(ViewerFilter::Brightness { value: 20 }),
                step(ViewerFilter::Invert),
            ],
        )
        .unwrap();
        let second = apply_chain_rgba(
            source,
            &[
                step(ViewerFilter::Invert),
                step(ViewerFilter::Brightness { value: 20 }),
            ],
        )
        .unwrap();
        assert_ne!(first, second);
        assert_eq!(first.get_pixel(0, 0).0[3], 42);
    }

    #[test]
    fn req_ley_p5_002_validation_rejects_unbounded_parameters() {
        assert!(validate_filter_chain(&[]).is_err());
        assert!(validate_filter_chain(&[step(ViewerFilter::Gamma { value: f32::NAN })]).is_err());
        assert!(
            validate_filter_chain(&[step(ViewerFilter::Crop {
                top: 45.0,
                right: 0.0,
                bottom: 45.0,
                left: 0.0
            })])
            .is_err()
        );
        assert!(
            validate_filter_chain(&[step(ViewerFilter::Margin {
                top: 513,
                right: 0,
                bottom: 0,
                left: 0,
                color: "#ffffff".into()
            })])
            .is_err()
        );
    }

    #[test]
    fn req_ley_p5_002_wic_page_pipeline_returns_bounded_filtered_png() {
        let source = RgbaImage::from_pixel(2, 1, Rgba([10, 20, 30, 99]));
        let mut png = Vec::new();
        PngEncoder::new(&mut png)
            .write_image(source.as_raw(), 2, 1, ExtendedColorType::Rgba8)
            .unwrap();
        let (mime, output) =
            filter_page_bytes(png, "image/png", &[step(ViewerFilter::Invert)]).unwrap();
        assert_eq!(mime, "image/png");
        assert!(output.len() as u64 <= MAX_IMAGE_BYTES);
        let decoded = image::load_from_memory(&output).unwrap().into_rgba8();
        assert_eq!(decoded.get_pixel(0, 0), &Rgba([245, 235, 225, 99]));
    }

    #[test]
    fn req_ley_p5_002_four_k_representative_chain_is_measured() {
        let chain = vec![
            step(ViewerFilter::Grayscale),
            step(ViewerFilter::Gamma { value: 1.2 }),
            step(ViewerFilter::Contrast { value: 15 }),
            step(ViewerFilter::Blur { radius: 2 }),
        ];
        let started = Instant::now();
        let output = apply_chain_rgba(base(3840, 2160), &chain).unwrap();
        eprintln!(
            "viewer-filter-4k-four-step-ms={}",
            started.elapsed().as_millis()
        );
        assert_eq!((output.width(), output.height()), (3840, 2160));
    }
}
