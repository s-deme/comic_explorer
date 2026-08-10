use std::io::{Read, Seek, SeekFrom};

use crate::api::{MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS};
use crate::domain::{AppError, ErrorCode, ImageFormat};

use super::image_render::{decode_raster_metadata, inspect_svg};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ImageMetadata {
    pub format: ImageFormat,
    pub width: u32,
    pub height: u32,
    pub has_alpha: bool,
    pub animated: bool,
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
    let mut signature = Vec::with_capacity(24);
    reader
        .take(24)
        .read_to_end(&mut signature)
        .map_err(|_| error(ErrorCode::CorruptImage, "Image header cannot be read."))?;
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|_| error(ErrorCode::CorruptImage, "Image stream is not seekable."))?;

    let metadata = if signature.starts_with(b"\x89PNG\r\n\x1a\n")
        && signature.get(12..16).is_some_and(|kind| kind == b"IHDR")
        && signature.len() >= 24
    {
        let has_alpha = png_has_alpha(reader)?;
        ImageMetadata {
            format: ImageFormat::Png,
            width: u32::from_be_bytes(signature[16..20].try_into().unwrap()),
            height: u32::from_be_bytes(signature[20..24].try_into().unwrap()),
            has_alpha,
            animated: false,
        }
    } else if signature.starts_with(&[0xff, 0xd8]) {
        inspect_jpeg(reader)?
    } else if signature.starts_with(b"RIFF") && &signature[8..12] == b"WEBP" {
        inspect_webp(reader, compressed_size)?
    } else if signature.starts_with(b"GIF87a") || signature.starts_with(b"GIF89a") {
        inspect_gif(reader, compressed_size)?
    } else if signature.starts_with(b"BM") {
        inspect_decoded_raster(reader, compressed_size, ImageFormat::Bmp)?
    } else if signature.starts_with(b"II*\0") || signature.starts_with(b"MM\0*") {
        inspect_decoded_raster(reader, compressed_size, ImageFormat::Tiff)?
    } else if signature.starts_with(&[0, 0, 1, 0]) {
        inspect_decoded_raster(reader, compressed_size, ImageFormat::Ico)?
    } else if signature.get(4..8).is_some_and(|kind| kind == b"ftyp") {
        inspect_avif(reader, compressed_size)?
    } else {
        inspect_svg_stream(reader, compressed_size)?
    };
    validate_dimensions(metadata)?;
    Ok(metadata)
}

fn inspect_decoded_raster<R: Read + Seek>(
    reader: &mut R,
    compressed_size: u64,
    format: ImageFormat,
) -> Result<ImageMetadata, AppError> {
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|_| error(ErrorCode::CorruptImage, "Image stream is not seekable."))?;
    let bytes = read_exact_image_bytes(reader, compressed_size, "Image stream is truncated.")?;
    let (width, height, has_alpha) = decode_raster_metadata(&bytes, format)?;
    Ok(ImageMetadata {
        format,
        width,
        height,
        has_alpha,
        animated: false,
    })
}

fn inspect_svg_stream<R: Read + Seek>(
    reader: &mut R,
    compressed_size: u64,
) -> Result<ImageMetadata, AppError> {
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|_| error(ErrorCode::CorruptImage, "SVG stream is not seekable."))?;
    let bytes = read_exact_image_bytes(reader, compressed_size, "SVG stream is truncated.")?;
    let (width, height) = inspect_svg(&bytes)?;
    Ok(ImageMetadata {
        format: ImageFormat::Svg,
        width,
        height,
        has_alpha: true,
        animated: false,
    })
}

fn inspect_gif<R: Read + Seek>(
    reader: &mut R,
    compressed_size: u64,
) -> Result<ImageMetadata, AppError> {
    if compressed_size < 13 {
        return Err(error(ErrorCode::CorruptImage, "GIF header is truncated."));
    }
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|_| error(ErrorCode::CorruptImage, "GIF stream is not seekable."))?;
    let bytes = read_exact_image_bytes(reader, compressed_size, "GIF stream is truncated.")?;
    if bytes.len() < 13 || !(bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a")) {
        return Err(error(ErrorCode::CorruptImage, "GIF signature is invalid."));
    }
    let width = u16::from_le_bytes([bytes[6], bytes[7]]) as u32;
    let height = u16::from_le_bytes([bytes[8], bytes[9]]) as u32;
    let mut cursor = 13;
    let has_global_color_table = bytes[10] & 0x80 != 0;
    if has_global_color_table {
        skip_gif_color_table(&bytes, &mut cursor, bytes[10])?;
    }

    let mut frame_count = 0_u32;
    let mut has_alpha = false;
    loop {
        let block = take_gif_byte(&bytes, &mut cursor, "GIF trailer is missing.")?;
        match block {
            0x2c => {
                let descriptor =
                    take_gif_bytes(&bytes, &mut cursor, 9, "GIF image descriptor is truncated.")?;
                let left = u32::from(u16::from_le_bytes([descriptor[0], descriptor[1]]));
                let top = u32::from(u16::from_le_bytes([descriptor[2], descriptor[3]]));
                let frame_width = u32::from(u16::from_le_bytes([descriptor[4], descriptor[5]]));
                let frame_height = u32::from(u16::from_le_bytes([descriptor[6], descriptor[7]]));
                if frame_width == 0
                    || frame_height == 0
                    || left
                        .checked_add(frame_width)
                        .is_none_or(|right| right > width)
                    || top
                        .checked_add(frame_height)
                        .is_none_or(|bottom| bottom > height)
                {
                    return Err(corrupt_gif("GIF image descriptor is outside its canvas."));
                }
                let has_local_color_table = descriptor[8] & 0x80 != 0;
                if has_local_color_table {
                    skip_gif_color_table(&bytes, &mut cursor, descriptor[8])?;
                } else if !has_global_color_table {
                    return Err(corrupt_gif("GIF image has no color table."));
                }
                let minimum_code_size =
                    take_gif_byte(&bytes, &mut cursor, "GIF image data is truncated.")?;
                if !(2..=8).contains(&minimum_code_size) {
                    return Err(corrupt_gif("GIF LZW minimum code size is invalid."));
                }
                if !skip_gif_sub_blocks(&bytes, &mut cursor, "GIF image data is truncated.")? {
                    return Err(corrupt_gif("GIF image data is empty."));
                }
                frame_count = frame_count
                    .checked_add(1)
                    .ok_or_else(|| corrupt_gif("GIF frame count overflow."))?;
            }
            0x21 => {
                let label =
                    take_gif_byte(&bytes, &mut cursor, "GIF extension label is truncated.")?;
                match label {
                    0xf9 => {
                        let block_size = take_gif_byte(
                            &bytes,
                            &mut cursor,
                            "GIF graphic control extension is truncated.",
                        )?;
                        if block_size != 4 {
                            return Err(corrupt_gif(
                                "GIF graphic control extension size is invalid.",
                            ));
                        }
                        let control = take_gif_bytes(
                            &bytes,
                            &mut cursor,
                            4,
                            "GIF graphic control extension is truncated.",
                        )?;
                        if take_gif_byte(
                            &bytes,
                            &mut cursor,
                            "GIF graphic control extension terminator is missing.",
                        )? != 0
                        {
                            return Err(corrupt_gif(
                                "GIF graphic control extension terminator is invalid.",
                            ));
                        }
                        has_alpha |= control[0] & 0x01 != 0;
                    }
                    0xff => {
                        let header_size = take_gif_byte(
                            &bytes,
                            &mut cursor,
                            "GIF application extension is truncated.",
                        )?;
                        if header_size != 11 {
                            return Err(corrupt_gif("GIF application extension size is invalid."));
                        }
                        take_gif_bytes(
                            &bytes,
                            &mut cursor,
                            11,
                            "GIF application extension is truncated.",
                        )?;
                        skip_gif_sub_blocks(
                            &bytes,
                            &mut cursor,
                            "GIF application extension is truncated.",
                        )?;
                    }
                    0x01 => {
                        let header_size = take_gif_byte(
                            &bytes,
                            &mut cursor,
                            "GIF plain-text extension is truncated.",
                        )?;
                        if header_size != 12 {
                            return Err(corrupt_gif("GIF plain-text extension size is invalid."));
                        }
                        take_gif_bytes(
                            &bytes,
                            &mut cursor,
                            12,
                            "GIF plain-text extension is truncated.",
                        )?;
                        skip_gif_sub_blocks(
                            &bytes,
                            &mut cursor,
                            "GIF plain-text extension is truncated.",
                        )?;
                    }
                    _ => {
                        skip_gif_sub_blocks(
                            &bytes,
                            &mut cursor,
                            "GIF extension data is truncated.",
                        )?;
                    }
                }
            }
            0x3b => {
                if frame_count == 0 {
                    return Err(corrupt_gif("GIF has no image frame."));
                }
                if cursor != bytes.len() {
                    return Err(corrupt_gif("GIF has data after its trailer."));
                }
                break;
            }
            _ => return Err(corrupt_gif("GIF contains an invalid block marker.")),
        }
    }
    let (decoded_width, decoded_height, _) = decode_raster_metadata(&bytes, ImageFormat::Gif)?;
    if (decoded_width, decoded_height) != (width, height) {
        return Err(corrupt_gif(
            "GIF decoder dimensions do not match its logical screen.",
        ));
    }
    Ok(ImageMetadata {
        format: ImageFormat::Gif,
        width,
        height,
        has_alpha,
        animated: frame_count > 1,
    })
}

fn take_gif_byte(bytes: &[u8], cursor: &mut usize, message: &str) -> Result<u8, AppError> {
    let value = *bytes.get(*cursor).ok_or_else(|| corrupt_gif(message))?;
    *cursor += 1;
    Ok(value)
}

fn take_gif_bytes<'a>(
    bytes: &'a [u8],
    cursor: &mut usize,
    length: usize,
    message: &str,
) -> Result<&'a [u8], AppError> {
    let end = cursor
        .checked_add(length)
        .ok_or_else(|| corrupt_gif(message))?;
    let value = bytes
        .get(*cursor..end)
        .ok_or_else(|| corrupt_gif(message))?;
    *cursor = end;
    Ok(value)
}

fn skip_gif_color_table(bytes: &[u8], cursor: &mut usize, packed: u8) -> Result<(), AppError> {
    let entries = 1_usize << (usize::from(packed & 0x07) + 1);
    let length = entries
        .checked_mul(3)
        .ok_or_else(|| corrupt_gif("GIF color table size overflow."))?;
    take_gif_bytes(bytes, cursor, length, "GIF color table is truncated.")?;
    Ok(())
}

fn skip_gif_sub_blocks(bytes: &[u8], cursor: &mut usize, message: &str) -> Result<bool, AppError> {
    let mut has_data = false;
    loop {
        let length = usize::from(take_gif_byte(bytes, cursor, message)?);
        if length == 0 {
            return Ok(has_data);
        }
        has_data = true;
        take_gif_bytes(bytes, cursor, length, message)?;
    }
}

fn corrupt_gif(message: &str) -> AppError {
    error(ErrorCode::CorruptImage, message)
}

fn inspect_avif<R: Read + Seek>(
    reader: &mut R,
    compressed_size: u64,
) -> Result<ImageMetadata, AppError> {
    if compressed_size < 16 {
        return Err(error(
            ErrorCode::CorruptImage,
            "AVIF ftyp box is truncated.",
        ));
    }
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|_| error(ErrorCode::CorruptImage, "AVIF stream is not seekable."))?;
    let bytes = read_exact_image_bytes(reader, compressed_size, "AVIF stream is truncated.")?;
    let mut first_box = true;
    let mut saw_ftyp = false;
    let mut saw_avif_brand = false;
    let mut saw_meta = false;
    let mut metadata = None;
    let mut mdat_ranges = Vec::new();
    for_each_bmff_box_with_offset(
        &bytes,
        "AVIF top-level box layout is invalid.",
        |kind, payload, payload_offset| {
            if first_box && kind != *b"ftyp" {
                return Err(corrupt_avif("AVIF ftyp must be the first box."));
            }
            first_box = false;
            match &kind {
                b"ftyp" => {
                    if saw_ftyp || payload.len() < 8 || (payload.len() - 8) % 4 != 0 {
                        return Err(corrupt_avif("AVIF ftyp box is invalid."));
                    }
                    saw_ftyp = true;
                    saw_avif_brand = is_avif_brand(&payload[..4])
                        || payload[8..].chunks_exact(4).any(is_avif_brand);
                }
                b"meta" => {
                    if saw_meta {
                        return Err(corrupt_avif("AVIF contains duplicate meta boxes."));
                    }
                    saw_meta = true;
                    metadata = Some(parse_avif_meta(payload)?);
                }
                b"mdat" => {
                    if !payload.is_empty() {
                        let start = u64::try_from(payload_offset)
                            .map_err(|_| corrupt_avif("AVIF image data offset is out of range."))?;
                        let end = start
                            .checked_add(u64::try_from(payload.len()).map_err(|_| {
                                corrupt_avif("AVIF image data size is out of range.")
                            })?)
                            .ok_or_else(|| corrupt_avif("AVIF image data range overflows."))?;
                        mdat_ranges.push((start, end));
                    }
                }
                _ => {}
            }
            Ok(())
        },
    )?;
    if !saw_ftyp || !saw_avif_brand {
        return Err(error(
            ErrorCode::CorruptImage,
            "AVIF ftyp has no AVIF compatible brand.",
        ));
    }
    if !saw_meta {
        return Err(corrupt_avif("AVIF meta box is missing."));
    }
    let metadata = metadata.ok_or_else(|| corrupt_avif("AVIF meta box is missing."))?;
    let extent_is_available = match metadata.data_source {
        AvifDataSource::File => metadata.extents.iter().all(|(start, length)| {
            start.checked_add(*length).is_some_and(|end| {
                mdat_ranges
                    .iter()
                    .any(|(mdat_start, mdat_end)| *start >= *mdat_start && end <= *mdat_end)
            })
        }),
        AvifDataSource::Idat => metadata.idat_length.is_some_and(|idat_length| {
            metadata.extents.iter().all(|(start, length)| {
                start
                    .checked_add(*length)
                    .is_some_and(|end| end <= idat_length)
            })
        }),
    };
    if !extent_is_available {
        return Err(corrupt_avif(
            "AVIF primary item extent is outside its image data.",
        ));
    }
    Ok(ImageMetadata {
        format: ImageFormat::Avif,
        width: metadata.width,
        height: metadata.height,
        has_alpha: false,
        animated: false,
    })
}

fn read_exact_image_bytes<R: Read>(
    reader: &mut R,
    compressed_size: u64,
    message: &str,
) -> Result<Vec<u8>, AppError> {
    let length = usize::try_from(compressed_size)
        .map_err(|_| error(ErrorCode::ResourceLimit, "Image byte limit exceeded."))?;
    let mut bytes = vec![0_u8; length];
    reader
        .read_exact(&mut bytes)
        .map_err(|_| error(ErrorCode::CorruptImage, message))?;
    Ok(bytes)
}

fn is_avif_brand(brand: &[u8]) -> bool {
    brand == b"avif" || brand == b"avis"
}

#[derive(Debug, Clone, Copy)]
enum AvifProperty {
    Ispe { width: u32, height: u32 },
    Av1Config,
    Other,
}

#[derive(Debug)]
struct AvifItemInfo {
    item_id: u32,
    item_type: [u8; 4],
}

#[derive(Debug)]
struct AvifItemLocation {
    item_id: u32,
    construction_method: u16,
    extents: Vec<(u64, u64)>,
}

#[derive(Debug)]
struct AvifPropertyAssociation {
    item_id: u32,
    property_indexes: Vec<usize>,
}

#[derive(Debug, Clone, Copy)]
enum AvifDataSource {
    File,
    Idat,
}

#[derive(Debug)]
struct AvifPrimaryMetadata {
    width: u32,
    height: u32,
    data_source: AvifDataSource,
    extents: Vec<(u64, u64)>,
    idat_length: Option<u64>,
}

fn parse_avif_meta(payload: &[u8]) -> Result<AvifPrimaryMetadata, AppError> {
    if payload.len() < 4 || payload[..4] != [0, 0, 0, 0] {
        return Err(corrupt_avif("AVIF meta full-box header is invalid."));
    }
    let mut primary_item_id = None;
    let mut item_infos = None;
    let mut item_locations = None;
    let mut properties = None;
    let mut associations = None;
    let mut idat_length = None;
    for_each_bmff_box(
        &payload[4..],
        "AVIF meta box layout is invalid.",
        |kind, payload| {
            match &kind {
                b"pitm" => {
                    if primary_item_id.is_some() {
                        return Err(corrupt_avif("AVIF contains duplicate pitm boxes."));
                    }
                    primary_item_id = Some(parse_avif_pitm(payload)?);
                }
                b"iinf" => {
                    if item_infos.is_some() {
                        return Err(corrupt_avif("AVIF contains duplicate iinf boxes."));
                    }
                    item_infos = Some(parse_avif_iinf(payload)?);
                }
                b"iloc" => {
                    if item_locations.is_some() {
                        return Err(corrupt_avif("AVIF contains duplicate iloc boxes."));
                    }
                    item_locations = Some(parse_avif_iloc(payload)?);
                }
                b"iprp" => {
                    if properties.is_some() || associations.is_some() {
                        return Err(corrupt_avif("AVIF contains duplicate iprp boxes."));
                    }
                    let (parsed_properties, parsed_associations) = parse_avif_iprp(payload)?;
                    properties = Some(parsed_properties);
                    associations = Some(parsed_associations);
                }
                b"idat" => {
                    if idat_length.is_some() {
                        return Err(corrupt_avif("AVIF contains duplicate idat boxes."));
                    }
                    idat_length = Some(
                        u64::try_from(payload.len())
                            .map_err(|_| corrupt_avif("AVIF idat size is out of range."))?,
                    );
                }
                _ => {}
            }
            Ok(())
        },
    )?;

    let primary_item_id =
        primary_item_id.ok_or_else(|| corrupt_avif("AVIF primary item is missing."))?;
    let item_infos = item_infos.ok_or_else(|| corrupt_avif("AVIF iinf box is missing."))?;
    if !item_infos
        .iter()
        .any(|item| item.item_id == primary_item_id && item.item_type == *b"av01")
    {
        return Err(corrupt_avif(
            "AVIF primary item is not declared as an AV01 item.",
        ));
    }
    let item_locations = item_locations.ok_or_else(|| corrupt_avif("AVIF iloc box is missing."))?;
    let location = item_locations
        .into_iter()
        .find(|location| location.item_id == primary_item_id)
        .ok_or_else(|| corrupt_avif("AVIF primary item location is missing."))?;
    if location.extents.is_empty() || location.extents.iter().any(|(_, length)| *length == 0) {
        return Err(corrupt_avif("AVIF primary item extent is missing."));
    }
    let data_source = match location.construction_method {
        0 => AvifDataSource::File,
        1 => AvifDataSource::Idat,
        _ => {
            return Err(corrupt_avif(
                "AVIF primary item construction method is unsupported.",
            ));
        }
    };

    let properties =
        properties.ok_or_else(|| corrupt_avif("AVIF ipco box is missing from iprp."))?;
    let associations =
        associations.ok_or_else(|| corrupt_avif("AVIF ipma box is missing from iprp."))?;
    for association in &associations {
        if association
            .property_indexes
            .iter()
            .any(|index| *index > properties.len())
        {
            return Err(corrupt_avif(
                "AVIF ipma association references a missing property.",
            ));
        }
    }
    let primary_association = associations
        .iter()
        .find(|association| association.item_id == primary_item_id)
        .ok_or_else(|| corrupt_avif("AVIF primary item properties are missing."))?;
    let mut dimensions = None;
    let mut has_av1_config = false;
    for index in &primary_association.property_indexes {
        if *index == 0 {
            continue;
        }
        match properties[*index - 1] {
            AvifProperty::Ispe { width, height } => {
                if dimensions.replace((width, height)).is_some() {
                    return Err(corrupt_avif(
                        "AVIF primary item has multiple ispe properties.",
                    ));
                }
            }
            AvifProperty::Av1Config => has_av1_config = true,
            AvifProperty::Other => {}
        }
    }
    let (width, height) = dimensions
        .ok_or_else(|| corrupt_avif("AVIF primary item has no associated ispe property."))?;
    if !has_av1_config {
        return Err(corrupt_avif(
            "AVIF primary item has no associated av1C property.",
        ));
    }

    Ok(AvifPrimaryMetadata {
        width,
        height,
        data_source,
        extents: location.extents,
        idat_length,
    })
}

fn parse_avif_pitm(payload: &[u8]) -> Result<u32, AppError> {
    let (version, flags, body) = parse_avif_full_box(payload, "AVIF pitm box is invalid.")?;
    if flags != 0 {
        return Err(corrupt_avif("AVIF pitm flags are invalid."));
    }
    match version {
        0 if body.len() == 2 => Ok(u32::from(u16::from_be_bytes(body.try_into().unwrap()))),
        1 if body.len() == 4 => Ok(u32::from_be_bytes(body.try_into().unwrap())),
        _ => Err(corrupt_avif("AVIF pitm box is invalid.")),
    }
}

fn parse_avif_iinf(payload: &[u8]) -> Result<Vec<AvifItemInfo>, AppError> {
    let (version, flags, body) = parse_avif_full_box(payload, "AVIF iinf box is invalid.")?;
    if flags != 0 {
        return Err(corrupt_avif("AVIF iinf flags are invalid."));
    }
    let mut cursor = 0;
    let declared_count = match version {
        0 => u32::from(take_avif_u16(
            body,
            &mut cursor,
            "AVIF iinf count is truncated.",
        )?),
        1 => take_avif_u32(body, &mut cursor, "AVIF iinf count is truncated.")?,
        _ => return Err(corrupt_avif("AVIF iinf version is unsupported.")),
    };
    let mut item_infos = Vec::new();
    let mut actual_count = 0_u32;
    for_each_bmff_box(
        &body[cursor..],
        "AVIF iinf entry layout is invalid.",
        |kind, payload| {
            if kind != *b"infe" {
                return Err(corrupt_avif("AVIF iinf contains a non-infe entry."));
            }
            actual_count = actual_count
                .checked_add(1)
                .ok_or_else(|| corrupt_avif("AVIF iinf entry count overflows."))?;
            let item_info = parse_avif_infe(payload)?;
            if item_infos
                .iter()
                .any(|existing: &AvifItemInfo| existing.item_id == item_info.item_id)
            {
                return Err(corrupt_avif("AVIF contains duplicate infe item IDs."));
            }
            item_infos.push(item_info);
            Ok(())
        },
    )?;
    if actual_count != declared_count {
        return Err(corrupt_avif("AVIF iinf entry count does not match."));
    }
    Ok(item_infos)
}

fn parse_avif_infe(payload: &[u8]) -> Result<AvifItemInfo, AppError> {
    let (version, flags, body) = parse_avif_full_box(payload, "AVIF infe box is invalid.")?;
    if flags != 0 {
        return Err(corrupt_avif("AVIF infe flags are invalid."));
    }
    let mut cursor = 0;
    let item_id = match version {
        2 => u32::from(take_avif_u16(
            body,
            &mut cursor,
            "AVIF infe item ID is truncated.",
        )?),
        3 => take_avif_u32(body, &mut cursor, "AVIF infe item ID is truncated.")?,
        _ => return Err(corrupt_avif("AVIF infe version is unsupported.")),
    };
    take_avif_u16(
        body,
        &mut cursor,
        "AVIF infe protection index is truncated.",
    )?;
    let item_type: [u8; 4] =
        take_avif_bytes(body, &mut cursor, 4, "AVIF infe item type is truncated.")?
            .try_into()
            .unwrap();
    if !body[cursor..].contains(&0) {
        return Err(corrupt_avif("AVIF infe item name is not terminated."));
    }
    Ok(AvifItemInfo { item_id, item_type })
}

fn parse_avif_iloc(payload: &[u8]) -> Result<Vec<AvifItemLocation>, AppError> {
    let (version, flags, body) = parse_avif_full_box(payload, "AVIF iloc box is invalid.")?;
    if !matches!(version, 0..=2) || flags != 0 {
        return Err(corrupt_avif("AVIF iloc full-box header is invalid."));
    }
    let mut cursor = 0;
    let first_sizes = take_avif_byte(body, &mut cursor, "AVIF iloc sizes are truncated.")?;
    let second_sizes = take_avif_byte(body, &mut cursor, "AVIF iloc sizes are truncated.")?;
    let offset_size = usize::from(first_sizes >> 4);
    let length_size = usize::from(first_sizes & 0x0f);
    let base_offset_size = usize::from(second_sizes >> 4);
    let index_size = usize::from(second_sizes & 0x0f);
    if [offset_size, length_size, base_offset_size, index_size]
        .iter()
        .any(|size| *size > 8)
        || (version == 0 && index_size != 0)
    {
        return Err(corrupt_avif("AVIF iloc field sizes are invalid."));
    }
    let item_count = if version < 2 {
        u32::from(take_avif_u16(
            body,
            &mut cursor,
            "AVIF iloc item count is truncated.",
        )?)
    } else {
        take_avif_u32(body, &mut cursor, "AVIF iloc item count is truncated.")?
    };
    let mut locations = Vec::new();
    for _ in 0..item_count {
        let item_id = if version < 2 {
            u32::from(take_avif_u16(
                body,
                &mut cursor,
                "AVIF iloc item ID is truncated.",
            )?)
        } else {
            take_avif_u32(body, &mut cursor, "AVIF iloc item ID is truncated.")?
        };
        let construction_method = if version == 1 || version == 2 {
            let raw = take_avif_u16(
                body,
                &mut cursor,
                "AVIF iloc construction method is truncated.",
            )?;
            if raw & 0xfff0 != 0 {
                return Err(corrupt_avif(
                    "AVIF iloc construction method has reserved bits.",
                ));
            }
            raw & 0x000f
        } else {
            0
        };
        let data_reference_index =
            take_avif_u16(body, &mut cursor, "AVIF iloc data reference is truncated.")?;
        if data_reference_index != 0 {
            return Err(corrupt_avif(
                "AVIF iloc external data references are unsupported.",
            ));
        }
        let base_offset = take_avif_uint(
            body,
            &mut cursor,
            base_offset_size,
            "AVIF iloc base offset is truncated.",
        )?;
        let extent_count =
            take_avif_u16(body, &mut cursor, "AVIF iloc extent count is truncated.")?;
        let mut extents = Vec::new();
        for _ in 0..extent_count {
            if (version == 1 || version == 2) && index_size != 0 {
                take_avif_uint(
                    body,
                    &mut cursor,
                    index_size,
                    "AVIF iloc extent index is truncated.",
                )?;
            }
            let extent_offset = take_avif_uint(
                body,
                &mut cursor,
                offset_size,
                "AVIF iloc extent offset is truncated.",
            )?;
            let extent_length = take_avif_uint(
                body,
                &mut cursor,
                length_size,
                "AVIF iloc extent length is truncated.",
            )?;
            let extent_start = base_offset
                .checked_add(extent_offset)
                .ok_or_else(|| corrupt_avif("AVIF iloc extent offset overflows."))?;
            extents.push((extent_start, extent_length));
        }
        if locations
            .iter()
            .any(|existing: &AvifItemLocation| existing.item_id == item_id)
        {
            return Err(corrupt_avif("AVIF contains duplicate iloc item IDs."));
        }
        locations.push(AvifItemLocation {
            item_id,
            construction_method,
            extents,
        });
    }
    if cursor != body.len() {
        return Err(corrupt_avif("AVIF iloc has trailing data."));
    }
    Ok(locations)
}

fn parse_avif_iprp(
    payload: &[u8],
) -> Result<(Vec<AvifProperty>, Vec<AvifPropertyAssociation>), AppError> {
    let mut properties = None;
    let mut associations = Vec::new();
    let mut saw_ipma = false;
    for_each_bmff_box(
        payload,
        "AVIF iprp box layout is invalid.",
        |kind, payload| {
            match &kind {
                b"ipco" => {
                    if properties.is_some() {
                        return Err(corrupt_avif("AVIF contains duplicate ipco boxes."));
                    }
                    properties = Some(parse_avif_ipco(payload)?);
                }
                b"ipma" => {
                    saw_ipma = true;
                    parse_avif_ipma(payload, &mut associations)?;
                }
                _ => {}
            }
            Ok(())
        },
    )?;
    let properties =
        properties.ok_or_else(|| corrupt_avif("AVIF ipco box is missing from iprp."))?;
    if !saw_ipma {
        return Err(corrupt_avif("AVIF ipma box is missing from iprp."));
    }
    Ok((properties, associations))
}

fn parse_avif_ipco(payload: &[u8]) -> Result<Vec<AvifProperty>, AppError> {
    let mut properties = Vec::new();
    for_each_bmff_box(
        payload,
        "AVIF ipco box layout is invalid.",
        |kind, payload| {
            let property = match &kind {
                b"ispe" => {
                    if payload.len() != 12 || payload[..4] != [0, 0, 0, 0] {
                        return Err(corrupt_avif("AVIF ispe box is invalid."));
                    }
                    let width = u32::from_be_bytes(payload[4..8].try_into().unwrap());
                    let height = u32::from_be_bytes(payload[8..12].try_into().unwrap());
                    // Apply resource limits even when this property is not associated with primary.
                    validate_dimension_pair(width, height)?;
                    AvifProperty::Ispe { width, height }
                }
                b"av1C" => {
                    if payload.len() < 4 || payload[0] != 0x81 {
                        return Err(corrupt_avif("AVIF av1C box is invalid."));
                    }
                    AvifProperty::Av1Config
                }
                _ => AvifProperty::Other,
            };
            properties.push(property);
            Ok(())
        },
    )?;
    Ok(properties)
}

fn parse_avif_ipma(
    payload: &[u8],
    associations: &mut Vec<AvifPropertyAssociation>,
) -> Result<(), AppError> {
    let (version, flags, body) = parse_avif_full_box(payload, "AVIF ipma box is invalid.")?;
    if !matches!(version, 0 | 1) || flags & !1 != 0 {
        return Err(corrupt_avif("AVIF ipma full-box header is invalid."));
    }
    let wide_indexes = flags & 1 != 0;
    let mut cursor = 0;
    let entry_count = take_avif_u32(body, &mut cursor, "AVIF ipma entry count is truncated.")?;
    for _ in 0..entry_count {
        let item_id = if version == 0 {
            u32::from(take_avif_u16(
                body,
                &mut cursor,
                "AVIF ipma item ID is truncated.",
            )?)
        } else {
            take_avif_u32(body, &mut cursor, "AVIF ipma item ID is truncated.")?
        };
        if associations
            .iter()
            .any(|existing| existing.item_id == item_id)
        {
            return Err(corrupt_avif("AVIF contains duplicate ipma item IDs."));
        }
        let association_count = usize::from(take_avif_byte(
            body,
            &mut cursor,
            "AVIF ipma association count is truncated.",
        )?);
        let mut property_indexes = Vec::new();
        for _ in 0..association_count {
            let property_index = if wide_indexes {
                usize::from(
                    take_avif_u16(body, &mut cursor, "AVIF ipma association is truncated.")?
                        & 0x7fff,
                )
            } else {
                usize::from(
                    take_avif_byte(body, &mut cursor, "AVIF ipma association is truncated.")?
                        & 0x7f,
                )
            };
            property_indexes.push(property_index);
        }
        associations.push(AvifPropertyAssociation {
            item_id,
            property_indexes,
        });
    }
    if cursor != body.len() {
        return Err(corrupt_avif("AVIF ipma has trailing data."));
    }
    Ok(())
}

fn parse_avif_full_box<'a>(
    payload: &'a [u8],
    message: &str,
) -> Result<(u8, u32, &'a [u8]), AppError> {
    let header = payload.get(..4).ok_or_else(|| corrupt_avif(message))?;
    let flags = u32::from_be_bytes([0, header[1], header[2], header[3]]);
    Ok((header[0], flags, &payload[4..]))
}

fn take_avif_byte(bytes: &[u8], cursor: &mut usize, message: &str) -> Result<u8, AppError> {
    let value = *bytes.get(*cursor).ok_or_else(|| corrupt_avif(message))?;
    *cursor += 1;
    Ok(value)
}

fn take_avif_bytes<'a>(
    bytes: &'a [u8],
    cursor: &mut usize,
    length: usize,
    message: &str,
) -> Result<&'a [u8], AppError> {
    let end = cursor
        .checked_add(length)
        .ok_or_else(|| corrupt_avif(message))?;
    let value = bytes
        .get(*cursor..end)
        .ok_or_else(|| corrupt_avif(message))?;
    *cursor = end;
    Ok(value)
}

fn take_avif_u16(bytes: &[u8], cursor: &mut usize, message: &str) -> Result<u16, AppError> {
    Ok(u16::from_be_bytes(
        take_avif_bytes(bytes, cursor, 2, message)?
            .try_into()
            .unwrap(),
    ))
}

fn take_avif_u32(bytes: &[u8], cursor: &mut usize, message: &str) -> Result<u32, AppError> {
    Ok(u32::from_be_bytes(
        take_avif_bytes(bytes, cursor, 4, message)?
            .try_into()
            .unwrap(),
    ))
}

fn take_avif_uint(
    bytes: &[u8],
    cursor: &mut usize,
    length: usize,
    message: &str,
) -> Result<u64, AppError> {
    let mut value = 0_u64;
    for byte in take_avif_bytes(bytes, cursor, length, message)? {
        value = (value << 8) | u64::from(*byte);
    }
    Ok(value)
}

fn for_each_bmff_box<F>(bytes: &[u8], message: &str, mut visitor: F) -> Result<(), AppError>
where
    F: FnMut([u8; 4], &[u8]) -> Result<(), AppError>,
{
    for_each_bmff_box_with_offset(bytes, message, |kind, payload, _| visitor(kind, payload))
}

fn for_each_bmff_box_with_offset<F>(
    bytes: &[u8],
    message: &str,
    mut visitor: F,
) -> Result<(), AppError>
where
    F: FnMut([u8; 4], &[u8], usize) -> Result<(), AppError>,
{
    let mut cursor = 0_usize;
    while cursor < bytes.len() {
        let header = bytes
            .get(cursor..cursor.saturating_add(8))
            .ok_or_else(|| corrupt_avif(message))?;
        let size32 = u32::from_be_bytes(header[..4].try_into().unwrap());
        let kind: [u8; 4] = header[4..8].try_into().unwrap();
        let mut header_size = 8_usize;
        let box_size = match size32 {
            0 => bytes.len() - cursor,
            1 => {
                let large = bytes
                    .get(cursor + 8..cursor + 16)
                    .ok_or_else(|| corrupt_avif(message))?;
                header_size = 16;
                usize::try_from(u64::from_be_bytes(large.try_into().unwrap()))
                    .map_err(|_| corrupt_avif(message))?
            }
            value => usize::try_from(value).map_err(|_| corrupt_avif(message))?,
        };
        if box_size < header_size {
            return Err(corrupt_avif(message));
        }
        let end = cursor
            .checked_add(box_size)
            .filter(|end| *end <= bytes.len())
            .ok_or_else(|| corrupt_avif(message))?;
        let payload_offset = cursor
            .checked_add(header_size)
            .ok_or_else(|| corrupt_avif(message))?;
        visitor(kind, &bytes[payload_offset..end], payload_offset)?;
        cursor = end;
    }
    Ok(())
}

fn corrupt_avif(message: &str) -> AppError {
    error(ErrorCode::CorruptImage, message)
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
                animated: false,
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
        animated: false,
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
    validate_dimension_pair(metadata.width, metadata.height)
}

fn validate_dimension_pair(width: u32, height: u32) -> Result<(), AppError> {
    let pixels = u64::from(width) * u64::from(height);
    if width == 0 || height == 0 {
        return Err(error(ErrorCode::CorruptImage, "Image dimensions are zero."));
    }
    if width > 16_384 || height > 16_384 || pixels > MAX_IMAGE_PIXELS {
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

    fn gif(frame_count: usize, transparency: bool) -> Vec<u8> {
        let mut bytes = b"GIF89a".to_vec();
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&[0x80, 0, 0]);
        bytes.extend_from_slice(&[0, 0, 0, 0xff, 0xff, 0xff]);
        if frame_count > 1 {
            bytes.extend_from_slice(&[
                0x21, 0xff, 0x0b, b'N', b'E', b'T', b'S', b'C', b'A', b'P', b'E', b'2', b'.', b'0',
                0x03, 0x01, 0x00, 0x00, 0x00,
            ]);
        }
        for _ in 0..frame_count {
            bytes.extend_from_slice(&[0x21, 0xf9, 0x04, u8::from(transparency), 0, 0, 0, 0]);
            bytes.extend_from_slice(&[0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0]);
        }
        bytes.push(0x3b);
        bytes
    }

    fn bmff_box(kind: [u8; 4], payload: &[u8]) -> Vec<u8> {
        let mut bytes = u32::try_from(payload.len() + 8)
            .unwrap()
            .to_be_bytes()
            .to_vec();
        bytes.extend_from_slice(&kind);
        bytes.extend_from_slice(payload);
        bytes
    }

    fn ispe(width: u32, height: u32) -> Vec<u8> {
        let mut payload = vec![0, 0, 0, 0];
        payload.extend_from_slice(&width.to_be_bytes());
        payload.extend_from_slice(&height.to_be_bytes());
        bmff_box(*b"ispe", &payload)
    }

    fn avif_meta(sizes: &[(u32, u32)], primary_ispe: usize, mdat_offset: u32) -> Vec<u8> {
        let item_id = 1_u16;

        let mut pitm = vec![0, 0, 0, 0];
        pitm.extend_from_slice(&item_id.to_be_bytes());

        let mut infe = vec![2, 0, 0, 0];
        infe.extend_from_slice(&item_id.to_be_bytes());
        infe.extend_from_slice(&0_u16.to_be_bytes());
        infe.extend_from_slice(b"av01");
        infe.push(0);
        let mut iinf = vec![0, 0, 0, 0];
        iinf.extend_from_slice(&1_u16.to_be_bytes());
        iinf.extend_from_slice(&bmff_box(*b"infe", &infe));

        // Version 0: no extent offset, four-byte extent length and base offset.
        let mut iloc = vec![0, 0, 0, 0, 0x04, 0x40];
        iloc.extend_from_slice(&1_u16.to_be_bytes());
        iloc.extend_from_slice(&item_id.to_be_bytes());
        iloc.extend_from_slice(&0_u16.to_be_bytes());
        iloc.extend_from_slice(&mdat_offset.to_be_bytes());
        iloc.extend_from_slice(&1_u16.to_be_bytes());
        iloc.extend_from_slice(&2_u32.to_be_bytes());

        let mut ipco = Vec::new();
        for (width, height) in sizes {
            ipco.extend_from_slice(&ispe(*width, *height));
        }
        ipco.extend_from_slice(&bmff_box(*b"av1C", &[0x81, 0, 0, 0]));
        let ispe_index = u8::try_from(primary_ispe + 1).unwrap();
        let av1c_index = u8::try_from(sizes.len() + 1).unwrap();
        assert!(ispe_index <= 0x7f && av1c_index <= 0x7f);
        let mut ipma = vec![0, 0, 0, 0];
        ipma.extend_from_slice(&1_u32.to_be_bytes());
        ipma.extend_from_slice(&item_id.to_be_bytes());
        ipma.push(2);
        ipma.extend_from_slice(&[ispe_index, av1c_index]);
        let mut iprp = bmff_box(*b"ipco", &ipco);
        iprp.extend_from_slice(&bmff_box(*b"ipma", &ipma));

        let mut meta = vec![0, 0, 0, 0];
        meta.extend_from_slice(&bmff_box(*b"pitm", &pitm));
        meta.extend_from_slice(&bmff_box(*b"iinf", &iinf));
        meta.extend_from_slice(&bmff_box(*b"iloc", &iloc));
        meta.extend_from_slice(&bmff_box(*b"iprp", &iprp));
        meta
    }

    fn avif(
        major_brand: [u8; 4],
        compatible_brands: &[[u8; 4]],
        sizes: &[(u32, u32)],
        primary_ispe: usize,
    ) -> Vec<u8> {
        let mut ftyp = major_brand.to_vec();
        ftyp.extend_from_slice(&[0, 0, 0, 0]);
        for brand in compatible_brands {
            ftyp.extend_from_slice(brand);
        }
        let ftyp = bmff_box(*b"ftyp", &ftyp);
        let placeholder_meta = bmff_box(*b"meta", &avif_meta(sizes, primary_ispe, 0));
        let mdat_offset = u32::try_from(ftyp.len() + placeholder_meta.len() + 8).unwrap();
        let meta = bmff_box(*b"meta", &avif_meta(sizes, primary_ispe, mdat_offset));

        let mut bytes = ftyp;
        bytes.extend_from_slice(&meta);
        bytes.extend_from_slice(&bmff_box(*b"mdat", &[0x12, 0x00]));
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
                animated: false,
            }
        );
    }

    #[test]
    fn reads_bmp_tiff_ico_and_static_svg_dimensions_from_decodable_content() {
        use image::{DynamicImage, ImageBuffer, ImageFormat as DecoderFormat, Rgba};

        for (decoder_format, domain_format) in [
            (DecoderFormat::Bmp, ImageFormat::Bmp),
            (DecoderFormat::Tiff, ImageFormat::Tiff),
            (DecoderFormat::Ico, ImageFormat::Ico),
        ] {
            let image =
                DynamicImage::ImageRgba8(ImageBuffer::from_pixel(7, 11, Rgba([20, 40, 60, 128])));
            let mut output = Cursor::new(Vec::new());
            image.write_to(&mut output, decoder_format).unwrap();
            let bytes = output.into_inner();
            let metadata = inspect_image(&mut Cursor::new(&bytes), bytes.len() as u64).unwrap();
            assert_eq!(metadata.format, domain_format);
            assert_eq!((metadata.width, metadata.height), (7, 11));
            assert!(metadata.has_alpha);
        }

        let svg = br#"<svg xmlns="http://www.w3.org/2000/svg" width="13" height="17"><rect width="13" height="17"/></svg>"#;
        assert_eq!(
            inspect_image(&mut Cursor::new(svg), svg.len() as u64).unwrap(),
            ImageMetadata {
                format: ImageFormat::Svg,
                width: 13,
                height: 17,
                has_alpha: true,
                animated: false,
            }
        );
    }

    #[test]
    fn fr_b08_gif_reads_static_transparency_and_frame_count_from_complete_blocks() {
        let opaque = gif(1, false);
        assert_eq!(
            inspect_image(&mut Cursor::new(&opaque), opaque.len() as u64).unwrap(),
            ImageMetadata {
                format: ImageFormat::Gif,
                width: 1,
                height: 1,
                has_alpha: false,
                animated: false,
            }
        );
        let transparent = gif(1, true);
        let transparent_metadata =
            inspect_image(&mut Cursor::new(&transparent), transparent.len() as u64).unwrap();
        assert!(transparent_metadata.has_alpha);
        assert!(!transparent_metadata.animated);

        let animated = gif(2, false);
        let animated_metadata =
            inspect_image(&mut Cursor::new(&animated), animated.len() as u64).unwrap();
        assert!(animated_metadata.animated);
        assert!(!animated_metadata.has_alpha);
    }

    #[test]
    fn fr_b08_gif_rejects_missing_or_truncated_image_data_and_trailer() {
        let complete = gif(1, false);
        let image_separator = complete.iter().position(|byte| *byte == 0x2c).unwrap();
        let cases = [
            (
                "no frame",
                complete[..image_separator]
                    .iter()
                    .copied()
                    .chain([0x3b])
                    .collect(),
            ),
            ("missing trailer", complete[..complete.len() - 1].to_vec()),
            (
                "truncated sub-block",
                complete[..complete.len() - 3].to_vec(),
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
    fn fr_b08_gif_rejects_frames_outside_the_logical_canvas() {
        let mut bytes = gif(1, false);
        let descriptor = bytes.iter().position(|byte| *byte == 0x2c).unwrap();
        bytes[descriptor + 5..descriptor + 7].copy_from_slice(&2_u16.to_le_bytes());
        assert_eq!(
            inspect_image(&mut Cursor::new(&bytes), bytes.len() as u64)
                .unwrap_err()
                .code,
            ErrorCode::CorruptImage
        );
    }

    #[test]
    fn fr_b08_avif_accepts_compatible_brand_and_reads_box_scoped_ispe() {
        let bytes = avif(
            *b"mif1",
            &[*b"miaf", *b"avif"],
            &[(900, 700), (320, 480)],
            1,
        );
        assert_eq!(
            inspect_image(&mut Cursor::new(&bytes), bytes.len() as u64).unwrap(),
            ImageMetadata {
                format: ImageFormat::Avif,
                width: 320,
                height: 480,
                has_alpha: false,
                animated: false,
            }
        );
    }

    #[test]
    fn fr_b08_avif_rejects_invalid_box_sizes_and_accidental_ispe_payloads() {
        let mut invalid_size = avif(*b"avif", &[*b"mif1"], &[(320, 480)], 0);
        let ispe_kind = invalid_size
            .windows(4)
            .position(|window| window == b"ispe")
            .unwrap();
        invalid_size[ispe_kind - 4..ispe_kind].copy_from_slice(&7_u32.to_be_bytes());

        let mut accidental_ispe = avif(*b"avif", &[*b"mif1"], &[(320, 480)], 0);
        let property_kind = accidental_ispe
            .windows(4)
            .position(|window| window == b"ispe")
            .unwrap();
        accidental_ispe[property_kind..property_kind + 4].copy_from_slice(b"free");
        accidental_ispe.extend_from_slice(&bmff_box(*b"free", &ispe(320, 480)));

        for (case, bytes) in [
            ("invalid nested size", invalid_size),
            ("ispe bytes outside ipco", accidental_ispe),
        ] {
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
    fn fr_b08_avif_requires_primary_item_links_and_bounded_extent() {
        let valid = avif(*b"avif", &[*b"mif1"], &[(320, 480)], 0);

        let mut missing_pitm = valid.clone();
        let pitm_kind = missing_pitm
            .windows(4)
            .position(|window| window == b"pitm")
            .unwrap();
        missing_pitm[pitm_kind..pitm_kind + 4].copy_from_slice(b"free");

        let mut non_av1_primary = valid.clone();
        let av1_item_type = non_av1_primary
            .windows(4)
            .position(|window| window == b"av01")
            .unwrap();
        non_av1_primary[av1_item_type..av1_item_type + 4].copy_from_slice(b"mime");

        let mut empty_extent = valid.clone();
        let iloc_kind = empty_extent
            .windows(4)
            .position(|window| window == b"iloc")
            .unwrap();
        let iloc_payload = iloc_kind + 4;
        empty_extent[iloc_payload + 18..iloc_payload + 22].fill(0);

        let mut extent_outside_mdat = valid.clone();
        extent_outside_mdat[iloc_payload + 12..iloc_payload + 16].fill(0);

        let ipma_kind = valid
            .windows(4)
            .position(|window| window == b"ipma")
            .unwrap();
        let ipma_payload = ipma_kind + 4;
        let mut ispe_not_associated = valid.clone();
        ispe_not_associated[ipma_payload + 11] = 0;
        let mut av1c_not_associated = valid.clone();
        av1c_not_associated[ipma_payload + 12] = 0;

        for (case, bytes) in [
            ("missing pitm", missing_pitm),
            ("primary item is not AV01", non_av1_primary),
            ("empty primary extent", empty_extent),
            ("primary extent is outside mdat", extent_outside_mdat),
            ("primary ispe is not associated", ispe_not_associated),
            ("primary av1C is not associated", av1c_not_associated),
        ] {
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
    fn fr_b08_avif_applies_resource_limits_to_every_ispe() {
        let bytes = avif(*b"avif", &[*b"mif1"], &[(320, 480), (16_384, 10_000)], 0);
        assert_eq!(
            inspect_image(&mut Cursor::new(&bytes), bytes.len() as u64)
                .unwrap_err()
                .code,
            ErrorCode::ResourceLimit
        );
    }

    #[test]
    fn fr_b08_avif_rejects_files_without_an_avif_compatible_brand() {
        let bytes = avif(*b"mif1", &[*b"miaf"], &[(320, 480)], 0);
        assert_eq!(
            inspect_image(&mut Cursor::new(&bytes), bytes.len() as u64)
                .unwrap_err()
                .code,
            ErrorCode::CorruptImage
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
                animated: false,
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
                animated: false,
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
