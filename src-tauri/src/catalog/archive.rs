use std::cmp::Ordering;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};

use delharc::LhaHeader;
use sevenz_rust::{
    Archive as SevenZipArchive, Error as SevenZipError, Password, SevenZMethod, SevenZReader,
};
use unrar::error::{Code as UnrarCode, UnrarError, When as UnrarWhen};
use unrar::{Archive, VolumeInfo};
use zip::{CompressionMethod, ZipArchive};

use crate::api::{
    MAX_ARCHIVE_ENTRIES, MAX_ARCHIVE_ENTRY_BYTES, MAX_ARCHIVE_TOTAL_BYTES,
    MAX_NESTED_ARCHIVE_BYTES, MAX_NESTED_ARCHIVE_DEPTH, MAX_NESTED_ARCHIVES,
};
use crate::domain::{AppError, ErrorCode, FileKind, RelativePath, classify_file_name, natural_cmp};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveAdapterKind {
    Zip,
    Cbz,
    Epub,
    Rar,
    Cbr,
    SevenZip,
    Cb7,
    Lzh,
}

#[derive(Debug)]
pub(crate) struct ArchiveEntryBytes {
    pub bytes: Vec<u8>,
    pub fingerprint_detail: String,
}

#[derive(Debug, Default)]
struct ArchiveListing {
    pages: Vec<RelativePath>,
    archives: Vec<RelativePath>,
}

#[derive(Debug, Default)]
struct NestedArchiveBudget {
    archives: usize,
    bytes: u64,
}

const NESTED_PAGE_KEY_PREFIX: &str = "@comic-explorer-nested-v1/";
static TEMP_ARCHIVE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

pub fn archive_adapter_kind(path: &Path) -> ArchiveAdapterKind {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("cbz") => ArchiveAdapterKind::Cbz,
        Some("epub") => ArchiveAdapterKind::Epub,
        Some("rar") => ArchiveAdapterKind::Rar,
        Some("cbr") => ArchiveAdapterKind::Cbr,
        Some("7z") => ArchiveAdapterKind::SevenZip,
        Some("cb7") => ArchiveAdapterKind::Cb7,
        Some("lzh") | Some("lha") => ArchiveAdapterKind::Lzh,
        _ => ArchiveAdapterKind::Zip,
    }
}

pub fn enumerate_archive_pages(path: &Path) -> Result<Vec<RelativePath>, AppError> {
    let mut chains = Vec::new();
    let mut budget = NestedArchiveBudget::default();
    enumerate_archive_tree(path, &[], 0, &mut budget, &mut chains)?;
    chains.sort_by(|left, right| compare_archive_chains(left, right));
    chains
        .iter()
        .map(|chain| encode_archive_page_key(chain))
        .collect()
}

fn list_archive(path: &Path) -> Result<ArchiveListing, AppError> {
    match archive_adapter_kind(path) {
        ArchiveAdapterKind::Zip | ArchiveAdapterKind::Cbz | ArchiveAdapterKind::Epub => {
            list_zip_archive(path)
        }
        ArchiveAdapterKind::Rar | ArchiveAdapterKind::Cbr => list_rar_archive(path),
        ArchiveAdapterKind::SevenZip | ArchiveAdapterKind::Cb7 => list_seven_zip_archive(path),
        ArchiveAdapterKind::Lzh => list_lzh_archive(path),
    }
}

pub(crate) fn read_archive_entry(
    path: &Path,
    entry_name: &str,
    max_bytes: u64,
) -> Result<ArchiveEntryBytes, AppError> {
    let chain = decode_archive_page_key(entry_name)?;
    if chain.len() == 1 {
        return read_direct_archive_entry(path, &chain[0], max_bytes);
    }
    if chain.len().saturating_sub(1) > MAX_NESTED_ARCHIVE_DEPTH {
        return Err(limit_error("Nested archive depth limit exceeded."));
    }

    let mut current_path = path.to_path_buf();
    let mut current_temp = None;
    let mut nested_bytes = 0_u64;
    let mut fingerprint_parts = Vec::new();
    for (index, entry_name) in chain.iter().enumerate() {
        let is_page = index + 1 == chain.len();
        let remaining = if is_page {
            max_bytes
        } else {
            MAX_NESTED_ARCHIVE_BYTES.saturating_sub(nested_bytes)
        };
        if remaining == 0 {
            return Err(limit_error("Nested archive byte limit exceeded."));
        }
        let entry = read_direct_archive_entry(&current_path, entry_name, remaining)?;
        fingerprint_parts.push(entry.fingerprint_detail.clone());
        if is_page {
            return Ok(ArchiveEntryBytes {
                bytes: entry.bytes,
                fingerprint_detail: format!("nested:{}", fingerprint_parts.join("|")),
            });
        }
        nested_bytes = nested_bytes
            .checked_add(entry.bytes.len() as u64)
            .ok_or_else(|| limit_error("Nested archive byte limit exceeded."))?;
        if nested_bytes > MAX_NESTED_ARCHIVE_BYTES {
            return Err(limit_error("Nested archive byte limit exceeded."));
        }
        let temporary = TemporaryArchive::create(entry_name, &entry.bytes)?;
        current_path = temporary.path.clone();
        current_temp = Some(temporary);
    }
    drop(current_temp);
    Err(archive_entry_not_found())
}

fn read_direct_archive_entry(
    path: &Path,
    entry_name: &str,
    max_bytes: u64,
) -> Result<ArchiveEntryBytes, AppError> {
    match archive_adapter_kind(path) {
        ArchiveAdapterKind::Zip | ArchiveAdapterKind::Cbz | ArchiveAdapterKind::Epub => {
            read_zip_entry(path, entry_name, max_bytes)
        }
        ArchiveAdapterKind::Rar | ArchiveAdapterKind::Cbr => {
            read_rar_entry(path, entry_name, max_bytes)
        }
        ArchiveAdapterKind::SevenZip | ArchiveAdapterKind::Cb7 => {
            read_seven_zip_entry(path, entry_name, max_bytes)
        }
        ArchiveAdapterKind::Lzh => read_lzh_entry(path, entry_name, max_bytes),
    }
}

fn enumerate_archive_tree(
    path: &Path,
    prefix: &[String],
    depth: usize,
    budget: &mut NestedArchiveBudget,
    pages: &mut Vec<Vec<String>>,
) -> Result<(), AppError> {
    let listing = list_archive(path)?;
    for page in listing.pages {
        let mut chain = prefix.to_vec();
        chain.push(page.as_str().to_string());
        pages.push(chain);
    }
    if listing.archives.is_empty() {
        return Ok(());
    }
    if depth >= MAX_NESTED_ARCHIVE_DEPTH {
        return Err(limit_error("Nested archive depth limit exceeded."));
    }
    for nested in listing.archives {
        budget.archives = budget.archives.saturating_add(1);
        if budget.archives > MAX_NESTED_ARCHIVES {
            return Err(limit_error("Nested archive count limit exceeded."));
        }
        let remaining = MAX_NESTED_ARCHIVE_BYTES.saturating_sub(budget.bytes);
        if remaining == 0 {
            return Err(limit_error("Nested archive byte limit exceeded."));
        }
        let entry = read_direct_archive_entry(path, nested.as_str(), remaining)?;
        budget.bytes = budget
            .bytes
            .checked_add(entry.bytes.len() as u64)
            .ok_or_else(|| limit_error("Nested archive byte limit exceeded."))?;
        if budget.bytes > MAX_NESTED_ARCHIVE_BYTES {
            return Err(limit_error("Nested archive byte limit exceeded."));
        }
        let temporary = TemporaryArchive::create(nested.as_str(), &entry.bytes)?;
        let mut nested_prefix = prefix.to_vec();
        nested_prefix.push(nested.as_str().to_string());
        enumerate_archive_tree(&temporary.path, &nested_prefix, depth + 1, budget, pages)?;
    }
    Ok(())
}

fn list_zip_archive(path: &Path) -> Result<ArchiveListing, AppError> {
    let file = File::open(path).map_err(|source| archive_io_error(path, source))?;
    let mut archive = ZipArchive::new(file).map_err(|source| AppError {
        code: ErrorCode::CorruptArchive,
        message: format!("Cannot parse archive: {source}"),
        target: None,
        retryable: false,
    })?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(limit_error("Archive entry-count limit exceeded."));
    }

    let mut total_size = 0_u64;
    let mut listing = ArchiveListing::default();
    for index in 0..archive.len() {
        let entry = archive.by_index_raw(index).map_err(|source| AppError {
            code: ErrorCode::CorruptArchive,
            message: format!("Cannot read archive entry {index}: {source}"),
            target: None,
            retryable: false,
        })?;
        if entry.encrypted() {
            return Err(AppError {
                code: ErrorCode::EncryptedArchive,
                message: format!("Encrypted archive entry is unsupported: {}", entry.name()),
                target: None,
                retryable: false,
            });
        }
        if !matches!(
            entry.compression(),
            CompressionMethod::Stored | CompressionMethod::Deflated
        ) {
            return Err(AppError {
                code: ErrorCode::UnsupportedFormat,
                message: format!(
                    "Unsupported compression method for archive entry: {}",
                    entry.name()
                ),
                target: None,
                retryable: false,
            });
        }
        if entry.size() > MAX_ARCHIVE_ENTRY_BYTES {
            return Err(limit_error("Archive entry byte limit exceeded."));
        }
        total_size = total_size
            .checked_add(entry.size())
            .ok_or_else(|| limit_error("Archive total byte limit exceeded."))?;
        if total_size > MAX_ARCHIVE_TOTAL_BYTES {
            return Err(limit_error("Archive total byte limit exceeded."));
        }
        if entry.is_dir() {
            continue;
        }
        let relative = RelativePath::parse(entry.name()).map_err(|_| AppError {
            code: ErrorCode::InvalidPath,
            message: format!("Unsafe archive entry path: {}", entry.name()),
            target: None,
            retryable: false,
        })?;
        add_supported_entry(&mut listing, relative);
    }
    sort_archive_listing(&mut listing);
    Ok(listing)
}

fn list_rar_archive(path: &Path) -> Result<ArchiveListing, AppError> {
    File::open(path).map_err(|source| archive_io_error(path, source))?;
    let archive = Archive::new(path).open_for_listing().map_err(unrar_error)?;
    ensure_single_volume(archive.volume_info())?;
    let mut total_size = 0_u64;
    let mut listing = ArchiveListing::default();
    for (index, result) in archive.enumerate() {
        if index >= MAX_ARCHIVE_ENTRIES {
            return Err(limit_error("Archive entry-count limit exceeded."));
        }
        let entry = result.map_err(unrar_error)?;
        validate_rar_entry(&entry)?;
        total_size = total_size
            .checked_add(entry.unpacked_size)
            .ok_or_else(|| limit_error("Archive total byte limit exceeded."))?;
        if total_size > MAX_ARCHIVE_TOTAL_BYTES {
            return Err(limit_error("Archive total byte limit exceeded."));
        }
        if !entry.is_file() {
            continue;
        }
        let relative = rar_relative_path(&entry)?;
        add_supported_entry(&mut listing, relative);
    }
    sort_archive_listing(&mut listing);
    Ok(listing)
}

fn list_seven_zip_archive(path: &Path) -> Result<ArchiveListing, AppError> {
    let archive = SevenZipArchive::open(path).map_err(seven_zip_error)?;
    validate_seven_zip_archive(&archive)
}

fn validate_seven_zip_archive(archive: &SevenZipArchive) -> Result<ArchiveListing, AppError> {
    if archive.files.len() > MAX_ARCHIVE_ENTRIES {
        return Err(limit_error("Archive entry-count limit exceeded."));
    }
    for folder in &archive.folders {
        for coder in &folder.coders {
            let method = coder.decompression_method_id();
            if method == SevenZMethod::ID_AES256SHA256 {
                return Err(encrypted_archive_error(
                    "Encrypted 7z archives are not supported.",
                ));
            }
            let supported = [
                SevenZMethod::ID_COPY,
                SevenZMethod::ID_LZMA,
                SevenZMethod::ID_LZMA2,
                SevenZMethod::ID_BCJ_X86,
                SevenZMethod::ID_BCJ_PPC,
                SevenZMethod::ID_BCJ_ARM,
                SevenZMethod::ID_BCJ_ARM_THUMB,
                SevenZMethod::ID_BCJ_SPARC,
                SevenZMethod::ID_DELTA,
            ];
            if !supported.contains(&method) {
                return Err(unsupported_archive_error(
                    "Unsupported 7z compression method.",
                ));
            }

            let dictionary_size = if method == SevenZMethod::ID_LZMA {
                let bytes: [u8; 4] = coder
                    .properties
                    .get(1..5)
                    .and_then(|value| value.try_into().ok())
                    .ok_or_else(|| corrupt_archive_error("Invalid LZMA properties."))?;
                u32::from_le_bytes(bytes) as u64
            } else if method == SevenZMethod::ID_LZMA2 {
                let bits = *coder
                    .properties
                    .first()
                    .ok_or_else(|| corrupt_archive_error("Invalid LZMA2 properties."))?
                    as u32;
                if bits > 40 {
                    return Err(corrupt_archive_error("Invalid LZMA2 dictionary size."));
                }
                if bits == 40 {
                    u32::MAX as u64
                } else {
                    (2_u64 | u64::from(bits & 1)) << (bits / 2 + 11)
                }
            } else {
                0
            };
            if dictionary_size > MAX_ARCHIVE_ENTRY_BYTES {
                return Err(limit_error("7z dictionary memory limit exceeded."));
            }
        }
    }

    let mut total_size = 0_u64;
    let mut listing = ArchiveListing::default();
    for entry in &archive.files {
        if entry.is_directory() {
            continue;
        }
        if entry.size() > MAX_ARCHIVE_ENTRY_BYTES {
            return Err(limit_error("Archive entry byte limit exceeded."));
        }
        total_size = total_size
            .checked_add(entry.size())
            .ok_or_else(|| limit_error("Archive total byte limit exceeded."))?;
        if total_size > MAX_ARCHIVE_TOTAL_BYTES {
            return Err(limit_error("Archive total byte limit exceeded."));
        }
        let relative = safe_archive_relative_path(entry.name(), "7z")?;
        add_supported_entry(&mut listing, relative);
    }
    sort_archive_listing(&mut listing);
    Ok(listing)
}

fn list_lzh_archive(path: &Path) -> Result<ArchiveListing, AppError> {
    let mut archive = open_lzh(path)?;
    let mut count = 0_usize;
    let mut total_size = 0_u64;
    let mut listing = ArchiveListing::default();
    loop {
        count = count.saturating_add(1);
        if count > MAX_ARCHIVE_ENTRIES {
            return Err(limit_error("Archive entry-count limit exceeded."));
        }
        let header = archive.header();
        if header.original_size > MAX_ARCHIVE_ENTRY_BYTES {
            return Err(limit_error("Archive entry byte limit exceeded."));
        }
        total_size = total_size
            .checked_add(header.original_size)
            .ok_or_else(|| limit_error("Archive total byte limit exceeded."))?;
        if total_size > MAX_ARCHIVE_TOTAL_BYTES {
            return Err(limit_error("Archive total byte limit exceeded."));
        }
        if !header.is_directory() && !archive.is_decoder_supported() {
            return Err(unsupported_archive_error(
                "Unsupported LZH compression method.",
            ));
        }
        if !header.is_directory() {
            let relative = lzh_relative_path(header)?;
            add_supported_entry(&mut listing, relative);
        }
        if !archive
            .next_file()
            .map_err(|error| lzh_io_error(error.into()))?
        {
            break;
        }
    }
    sort_archive_listing(&mut listing);
    Ok(listing)
}

fn validate_rar_entry(entry: &unrar::FileHeader) -> Result<(), AppError> {
    if entry.is_split() {
        return Err(AppError {
            code: ErrorCode::UnsupportedFormat,
            message: "Multi-volume RAR archives are not supported.".into(),
            target: None,
            retryable: false,
        });
    }
    if entry.is_encrypted() {
        return Err(AppError {
            code: ErrorCode::EncryptedArchive,
            message: "Encrypted RAR archives are not supported.".into(),
            target: None,
            retryable: false,
        });
    }
    if entry.unpacked_size > MAX_ARCHIVE_ENTRY_BYTES {
        return Err(limit_error("Archive entry byte limit exceeded."));
    }
    Ok(())
}

fn rar_relative_path(entry: &unrar::FileHeader) -> Result<RelativePath, AppError> {
    let name = entry.filename.to_str().ok_or_else(|| AppError {
        code: ErrorCode::InvalidPath,
        message: "RAR entry name is not valid Unicode.".into(),
        target: None,
        retryable: false,
    })?;
    RelativePath::parse(name).map_err(|_| AppError {
        code: ErrorCode::InvalidPath,
        message: "Unsafe RAR entry path.".into(),
        target: None,
        retryable: false,
    })
}

fn read_zip_entry(
    path: &Path,
    entry_name: &str,
    max_bytes: u64,
) -> Result<ArchiveEntryBytes, AppError> {
    let file = File::open(path).map_err(|source| archive_io_error(path, source))?;
    let mut archive = ZipArchive::new(file).map_err(|source| AppError {
        code: ErrorCode::CorruptArchive,
        message: format!("Cannot parse archive: {source}"),
        target: None,
        retryable: false,
    })?;
    let entry = archive.by_name(entry_name).map_err(|source| AppError {
        code: ErrorCode::CorruptArchive,
        message: format!("Cannot read archive entry: {source}"),
        target: None,
        retryable: false,
    })?;
    if entry.encrypted() {
        return Err(AppError {
            code: ErrorCode::EncryptedArchive,
            message: "Encrypted archive entries are not supported.".into(),
            target: None,
            retryable: false,
        });
    }
    if !matches!(
        entry.compression(),
        CompressionMethod::Stored | CompressionMethod::Deflated
    ) {
        return Err(AppError {
            code: ErrorCode::UnsupportedFormat,
            message: "Unsupported archive compression method.".into(),
            target: None,
            retryable: false,
        });
    }
    if entry.size() > max_bytes {
        return Err(limit_error("Archive entry byte limit exceeded."));
    }
    let detail = format!("crc:{:08x}:size:{}", entry.crc32(), entry.size());
    let mut bytes = Vec::with_capacity(usize::try_from(entry.size()).unwrap_or_default());
    entry
        .take(max_bytes.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|source| archive_io_error(path, source))?;
    if bytes.len() as u64 > max_bytes {
        return Err(limit_error("Archive entry byte limit exceeded."));
    }
    Ok(ArchiveEntryBytes {
        bytes,
        fingerprint_detail: detail,
    })
}

fn read_rar_entry(
    path: &Path,
    entry_name: &str,
    max_bytes: u64,
) -> Result<ArchiveEntryBytes, AppError> {
    File::open(path).map_err(|source| archive_io_error(path, source))?;
    let mut archive = Archive::new(path)
        .open_for_processing()
        .map_err(unrar_error)?;
    ensure_single_volume(archive.volume_info())?;
    while let Some(header) = archive.read_header().map_err(unrar_error)? {
        validate_rar_entry(header.entry())?;
        let relative = rar_relative_path(header.entry())?;
        if relative.as_str() == entry_name {
            if header.entry().unpacked_size > max_bytes {
                return Err(limit_error("Archive entry byte limit exceeded."));
            }
            let crc = header.entry().file_crc;
            let size = header.entry().unpacked_size;
            let (bytes, _rest) = header.read().map_err(unrar_error)?;
            if bytes.len() as u64 > max_bytes {
                return Err(limit_error("Archive entry byte limit exceeded."));
            }
            return Ok(ArchiveEntryBytes {
                bytes,
                fingerprint_detail: format!("crc:{crc:08x}:size:{size}"),
            });
        }
        archive = header.skip().map_err(unrar_error)?;
    }
    Err(AppError {
        code: ErrorCode::NotFound,
        message: "Archive entry was not found.".into(),
        target: None,
        retryable: false,
    })
}

fn read_seven_zip_entry(
    path: &Path,
    entry_name: &str,
    max_bytes: u64,
) -> Result<ArchiveEntryBytes, AppError> {
    let mut archive = SevenZReader::open(path, Password::empty()).map_err(seven_zip_error)?;
    validate_seven_zip_archive(archive.archive())?;
    let expected = archive
        .archive()
        .files
        .iter()
        .find(|entry| entry.name() == entry_name && !entry.is_directory())
        .ok_or_else(archive_entry_not_found)?;
    if expected.size() > max_bytes {
        return Err(limit_error("Archive entry byte limit exceeded."));
    }
    let expected_crc = expected.crc;
    let expected_size = expected.size();
    let mut found = None;
    archive
        .for_each_entries(|entry, reader| {
            if entry.name() == entry_name && !entry.is_directory() {
                let mut bytes =
                    Vec::with_capacity(usize::try_from(entry.size()).unwrap_or_default());
                reader
                    .take(max_bytes.saturating_add(1))
                    .read_to_end(&mut bytes)
                    .map_err(SevenZipError::io)?;
                if bytes.len() as u64 > max_bytes {
                    return Err(SevenZipError::MaxMemLimited {
                        max_kb: usize::try_from(max_bytes / 1024).unwrap_or(usize::MAX),
                        actaul_kb: bytes.len() / 1024,
                    });
                }
                found = Some(bytes);
                return Ok(false);
            }
            std::io::copy(reader, &mut std::io::sink()).map_err(SevenZipError::io)?;
            Ok(true)
        })
        .map_err(seven_zip_error)?;
    let bytes = found.ok_or_else(archive_entry_not_found)?;
    Ok(ArchiveEntryBytes {
        bytes,
        fingerprint_detail: format!("crc:{expected_crc:08x}:size:{expected_size}"),
    })
}

fn read_lzh_entry(
    path: &Path,
    entry_name: &str,
    max_bytes: u64,
) -> Result<ArchiveEntryBytes, AppError> {
    list_lzh_archive(path)?;
    let mut archive = open_lzh(path)?;
    let mut count = 0_usize;
    loop {
        count = count.saturating_add(1);
        if count > MAX_ARCHIVE_ENTRIES {
            return Err(limit_error("Archive entry-count limit exceeded."));
        }
        let header = archive.header();
        if header.original_size > MAX_ARCHIVE_ENTRY_BYTES {
            return Err(limit_error("Archive entry byte limit exceeded."));
        }
        if !header.is_directory() && !archive.is_decoder_supported() {
            return Err(unsupported_archive_error(
                "Unsupported LZH compression method.",
            ));
        }
        let matches_entry =
            !header.is_directory() && lzh_relative_path(header)?.as_str() == entry_name;
        if matches_entry {
            if header.original_size > max_bytes {
                return Err(limit_error("Archive entry byte limit exceeded."));
            }
            let size = header.original_size;
            let mut bytes = Vec::with_capacity(usize::try_from(size).unwrap_or_default());
            archive
                .by_ref()
                .take(max_bytes.saturating_add(1))
                .read_to_end(&mut bytes)
                .map_err(lzh_io_error)?;
            if bytes.len() as u64 > max_bytes {
                return Err(limit_error("Archive entry byte limit exceeded."));
            }
            let crc = archive
                .crc_check()
                .map_err(|_| corrupt_archive_error("LZH entry checksum verification failed."))?;
            return Ok(ArchiveEntryBytes {
                bytes,
                fingerprint_detail: format!("crc:{crc:04x}:size:{size}"),
            });
        }
        if !archive
            .next_file()
            .map_err(|error| lzh_io_error(error.into()))?
        {
            break;
        }
    }
    Err(archive_entry_not_found())
}

fn open_lzh(path: &Path) -> Result<delharc::LhaDecodeReader<File>, AppError> {
    delharc::parse_file(path).map_err(lzh_io_error)
}

fn lzh_relative_path(header: &LhaHeader) -> Result<RelativePath, AppError> {
    if raw_lzh_path_is_unsafe(&header.filename)
        || header.iter_extra().any(|extra| {
            matches!(extra.first().copied(), Some(0x01 | 0x02))
                && raw_lzh_path_is_unsafe(&extra[1..])
        })
    {
        return Err(invalid_archive_path_error("Unsafe LZH entry path."));
    }
    let name = header.parse_pathname_to_str();
    if name.is_empty() {
        return Err(invalid_archive_path_error("Empty LZH entry path."));
    }
    safe_archive_relative_path(&name, "LZH")
}

fn raw_lzh_path_is_unsafe(path: &[u8]) -> bool {
    if matches!(path.first(), Some(b'/' | b'\\')) || path.get(1) == Some(&b':') || path.contains(&0)
    {
        return true;
    }
    path.split(|byte| matches!(byte, b'/' | b'\\' | 0xff))
        .any(|part| part == b"..")
}

fn safe_archive_relative_path(name: &str, kind: &str) -> Result<RelativePath, AppError> {
    RelativePath::parse(name)
        .map_err(|_| invalid_archive_path_error(&format!("Unsafe {kind} entry path.")))
}

fn is_hidden_archive_path(path: &RelativePath) -> bool {
    path.as_str().split('/').any(|part| part.starts_with('.'))
}

fn add_supported_entry(listing: &mut ArchiveListing, path: RelativePath) {
    if is_hidden_archive_path(&path) {
        return;
    }
    match classify_file_name(path.as_str()) {
        FileKind::Image => listing.pages.push(path),
        FileKind::Archive => listing.archives.push(path),
        FileKind::Pdf => {}
        _ => {}
    }
}

fn sort_archive_listing(listing: &mut ArchiveListing) {
    listing
        .pages
        .sort_by(|left, right| natural_cmp(left.as_str(), right.as_str()));
    listing
        .archives
        .sort_by(|left, right| natural_cmp(left.as_str(), right.as_str()));
}

fn compare_archive_chains(left: &[String], right: &[String]) -> Ordering {
    for (left_part, right_part) in left.iter().zip(right) {
        let ordering = natural_cmp(left_part, right_part);
        if ordering != Ordering::Equal {
            return ordering;
        }
    }
    left.len().cmp(&right.len())
}

fn encode_archive_page_key(chain: &[String]) -> Result<RelativePath, AppError> {
    if chain.len() == 1 && !chain[0].starts_with(NESTED_PAGE_KEY_PREFIX) {
        return safe_archive_relative_path(&chain[0], "archive");
    }
    let encoded = chain
        .iter()
        .map(|part| hex_encode(part.as_bytes()))
        .collect::<Vec<_>>()
        .join("/");
    safe_archive_relative_path(&format!("{NESTED_PAGE_KEY_PREFIX}{encoded}"), "archive")
}

fn decode_archive_page_key(page_key: &str) -> Result<Vec<String>, AppError> {
    if !page_key.starts_with(NESTED_PAGE_KEY_PREFIX) {
        return Ok(vec![
            safe_archive_relative_path(page_key, "archive")?
                .as_str()
                .to_string(),
        ]);
    }
    let encoded = &page_key[NESTED_PAGE_KEY_PREFIX.len()..];
    let mut chain = Vec::new();
    for part in encoded.split('/') {
        let bytes = hex_decode(part)?;
        let decoded = String::from_utf8(bytes)
            .map_err(|_| invalid_archive_path_error("Invalid nested archive page key."))?;
        let relative = safe_archive_relative_path(&decoded, "nested archive")?;
        if relative.as_str() != decoded {
            return Err(invalid_archive_path_error(
                "Non-canonical nested archive page key.",
            ));
        }
        chain.push(decoded);
    }
    if chain.is_empty() || chain.len() > MAX_NESTED_ARCHIVE_DEPTH + 1 {
        return Err(limit_error("Nested archive depth limit exceeded."));
    }
    if chain.len() > 1 {
        if chain[..chain.len() - 1]
            .iter()
            .any(|entry| classify_file_name(entry) != FileKind::Archive)
            || classify_file_name(chain.last().expect("chain is non-empty")) != FileKind::Image
        {
            return Err(invalid_archive_path_error(
                "Invalid nested archive page key.",
            ));
        }
    }
    Ok(chain)
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        encoded.push(HEX[usize::from(byte >> 4)] as char);
        encoded.push(HEX[usize::from(byte & 0x0f)] as char);
    }
    encoded
}

fn hex_decode(encoded: &str) -> Result<Vec<u8>, AppError> {
    if encoded.is_empty() || !encoded.len().is_multiple_of(2) {
        return Err(invalid_archive_path_error(
            "Invalid nested archive page key.",
        ));
    }
    encoded
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let high = hex_value(pair[0])?;
            let low = hex_value(pair[1])?;
            Ok((high << 4) | low)
        })
        .collect()
}

fn hex_value(byte: u8) -> Result<u8, AppError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        _ => Err(invalid_archive_path_error(
            "Invalid nested archive page key.",
        )),
    }
}

struct TemporaryArchive {
    path: PathBuf,
}

impl TemporaryArchive {
    fn create(entry_name: &str, bytes: &[u8]) -> Result<Self, AppError> {
        let extension = Path::new(entry_name)
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .filter(|value| {
                matches!(
                    value.as_str(),
                    "zip" | "cbz" | "epub" | "rar" | "cbr" | "7z" | "cb7" | "lzh" | "lha"
                )
            })
            .ok_or_else(|| unsupported_archive_error("Unsupported nested archive format."))?;
        for _ in 0..16 {
            let sequence = TEMP_ARCHIVE_SEQUENCE.fetch_add(1, AtomicOrdering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "comic-explorer-nested-{}-{sequence}.{extension}",
                std::process::id()
            ));
            match OpenOptions::new().write(true).create_new(true).open(&path) {
                Ok(mut file) => {
                    if let Err(source) = file.write_all(bytes) {
                        drop(file);
                        let _ = std::fs::remove_file(&path);
                        return Err(archive_io_error(&path, source));
                    }
                    drop(file);
                    return Ok(Self { path });
                }
                Err(source) if source.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(source) => return Err(archive_io_error(&path, source)),
            }
        }
        Err(limit_error(
            "Could not allocate a temporary nested archive.",
        ))
    }
}

impl Drop for TemporaryArchive {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

fn archive_entry_not_found() -> AppError {
    AppError {
        code: ErrorCode::NotFound,
        message: "Archive entry was not found.".into(),
        target: None,
        retryable: false,
    }
}

fn ensure_single_volume(volume: VolumeInfo) -> Result<(), AppError> {
    if volume == VolumeInfo::None {
        Ok(())
    } else {
        Err(AppError {
            code: ErrorCode::UnsupportedFormat,
            message: "Multi-volume RAR archives are not supported.".into(),
            target: None,
            retryable: false,
        })
    }
}

fn unrar_error(error: UnrarError) -> AppError {
    let code = match (error.code, error.when) {
        (UnrarCode::MissingPassword | UnrarCode::BadPassword, _) => ErrorCode::EncryptedArchive,
        (UnrarCode::NoMemory, _) => ErrorCode::ResourceLimit,
        (UnrarCode::EOpen, UnrarWhen::Process) => ErrorCode::UnsupportedFormat,
        _ => ErrorCode::CorruptArchive,
    };
    AppError {
        code,
        message: match code {
            ErrorCode::EncryptedArchive => "Encrypted RAR archives are not supported.",
            ErrorCode::ResourceLimit => "RAR archive exceeded the memory limit.",
            ErrorCode::UnsupportedFormat => "Multi-volume RAR archives are not supported.",
            _ => "Cannot read RAR archive.",
        }
        .into(),
        target: None,
        retryable: false,
    }
}

fn seven_zip_error(error: SevenZipError) -> AppError {
    let code = match &error {
        SevenZipError::PasswordRequired | SevenZipError::MaybeBadPassword(_) => {
            ErrorCode::EncryptedArchive
        }
        SevenZipError::UnsupportedCompressionMethod(method) if method.contains("AES256SHA256") => {
            ErrorCode::EncryptedArchive
        }
        SevenZipError::UnsupportedCompressionMethod(_)
        | SevenZipError::ExternalUnsupported
        | SevenZipError::Unsupported(_)
        | SevenZipError::UnsupportedVersion { .. } => ErrorCode::UnsupportedFormat,
        SevenZipError::MaxMemLimited { .. } => ErrorCode::ResourceLimit,
        SevenZipError::Io(source, _) | SevenZipError::FileOpen(source, _) => match source.kind() {
            std::io::ErrorKind::NotFound => ErrorCode::NotFound,
            std::io::ErrorKind::PermissionDenied => ErrorCode::AccessDenied,
            _ => ErrorCode::CorruptArchive,
        },
        _ => ErrorCode::CorruptArchive,
    };
    AppError {
        code,
        message: match code {
            ErrorCode::EncryptedArchive => "Encrypted 7z archives are not supported.",
            ErrorCode::UnsupportedFormat => "Unsupported 7z archive format.",
            ErrorCode::ResourceLimit => "7z archive exceeded the safe memory limit.",
            ErrorCode::NotFound => "7z archive was not found.",
            ErrorCode::AccessDenied => "7z archive could not be accessed.",
            _ => "Cannot read 7z archive.",
        }
        .into(),
        target: None,
        retryable: matches!(code, ErrorCode::NotFound | ErrorCode::AccessDenied),
    }
}

fn lzh_io_error(source: std::io::Error) -> AppError {
    AppError {
        code: match source.kind() {
            std::io::ErrorKind::NotFound => ErrorCode::NotFound,
            std::io::ErrorKind::PermissionDenied => ErrorCode::AccessDenied,
            _ => ErrorCode::CorruptArchive,
        },
        message: "Cannot read LZH archive.".into(),
        target: None,
        retryable: matches!(
            source.kind(),
            std::io::ErrorKind::NotFound | std::io::ErrorKind::PermissionDenied
        ),
    }
}

fn encrypted_archive_error(message: &str) -> AppError {
    AppError {
        code: ErrorCode::EncryptedArchive,
        message: message.into(),
        target: None,
        retryable: false,
    }
}

fn unsupported_archive_error(message: &str) -> AppError {
    AppError {
        code: ErrorCode::UnsupportedFormat,
        message: message.into(),
        target: None,
        retryable: false,
    }
}

fn corrupt_archive_error(message: &str) -> AppError {
    AppError {
        code: ErrorCode::CorruptArchive,
        message: message.into(),
        target: None,
        retryable: false,
    }
}

fn invalid_archive_path_error(message: &str) -> AppError {
    AppError {
        code: ErrorCode::InvalidPath,
        message: message.into(),
        target: None,
        retryable: false,
    }
}

fn archive_io_error(_path: &Path, source: std::io::Error) -> AppError {
    AppError {
        code: match source.kind() {
            std::io::ErrorKind::NotFound => ErrorCode::NotFound,
            std::io::ErrorKind::PermissionDenied => ErrorCode::AccessDenied,
            _ => ErrorCode::CorruptArchive,
        },
        message: format!("Cannot open archive: {source}"),
        target: None,
        retryable: true,
    }
}

fn limit_error(message: &str) -> AppError {
    AppError {
        code: ErrorCode::ResourceLimit,
        message: message.into(),
        target: None,
        retryable: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::{Cursor, Write};
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};
    use zip::write::SimpleFileOptions;

    fn temporary_archive(test_name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "comic-explorer-{test_name}-{}-{nonce}.cbz",
            std::process::id()
        ))
    }

    fn crc16(bytes: &[u8]) -> u16 {
        let mut crc = 0_u16;
        for byte in bytes {
            crc ^= u16::from(*byte);
            for _ in 0..8 {
                crc = if crc & 1 == 1 {
                    (crc >> 1) ^ 0xa001
                } else {
                    crc >> 1
                };
            }
        }
        crc
    }

    fn write_stored_lzh(path: &Path, entries: &[(&str, &[u8])]) {
        let mut archive = File::create(path).unwrap();
        for (name, bytes) in entries {
            let name = name.as_bytes();
            let header_len = u8::try_from(22 + name.len()).unwrap();
            let mut header = Vec::with_capacity(usize::from(header_len));
            header.extend_from_slice(b"-lh0-");
            header.extend_from_slice(&u32::try_from(bytes.len()).unwrap().to_le_bytes());
            header.extend_from_slice(&u32::try_from(bytes.len()).unwrap().to_le_bytes());
            header.extend_from_slice(&0_u32.to_le_bytes());
            header.push(0x20);
            header.push(0);
            header.push(u8::try_from(name.len()).unwrap());
            header.extend_from_slice(name);
            header.extend_from_slice(&crc16(bytes).to_le_bytes());
            assert_eq!(header.len(), usize::from(header_len));
            archive.write_all(&[header_len]).unwrap();
            archive
                .write_all(&[header
                    .iter()
                    .fold(0_u8, |sum, byte| sum.wrapping_add(*byte))])
                .unwrap();
            archive.write_all(&header).unwrap();
            archive.write_all(bytes).unwrap();
        }
        archive.write_all(&[0]).unwrap();
    }

    fn write_seven_zip(path: &Path, entries: &[(&str, &[u8])]) {
        use sevenz_rust::{SevenZArchiveEntry, SevenZWriter};

        let mut archive = SevenZWriter::create(path).unwrap();
        for (name, bytes) in entries {
            let mut entry = SevenZArchiveEntry::new();
            entry.name = (*name).to_string();
            archive.push_archive_entry(entry, Some(*bytes)).unwrap();
        }
        archive.finish().unwrap();
    }

    fn zip_bytes(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, bytes) in entries {
            writer
                .start_file(
                    *name,
                    SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
                )
                .unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn lists_stored_and_deflated_images_without_extracting() {
        let path = temporary_archive("archive-pages");
        let file = File::create(&path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        writer
            .start_file(
                "chapter/10.JPG",
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
            )
            .unwrap();
        writer.write_all(b"ten").unwrap();
        writer
            .start_file(
                "chapter/2.PNG",
                SimpleFileOptions::default().compression_method(CompressionMethod::Stored),
            )
            .unwrap();
        writer.write_all(b"two").unwrap();
        for name in [
            "chapter/3.bmp",
            "chapter/4.gif",
            "chapter/5.tiff",
            "chapter/6.ico",
            "chapter/7.svg",
        ] {
            writer
                .start_file(name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(b"supported by extension").unwrap();
        }
        writer
            .start_file("notes.txt", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"ignored").unwrap();
        writer.finish().unwrap();

        let pages = enumerate_archive_pages(&path)
            .unwrap()
            .into_iter()
            .map(|page| page.to_string())
            .collect::<Vec<_>>();
        assert_eq!(
            pages,
            [
                "chapter/2.PNG",
                "chapter/3.bmp",
                "chapter/4.gif",
                "chapter/5.tiff",
                "chapter/6.ico",
                "chapter/7.svg",
                "chapter/10.JPG"
            ]
        );
        assert!(!path.parent().unwrap().join("chapter").exists());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn epub_uses_the_zip_adapter_and_lists_only_images_in_natural_order() {
        let mut path = temporary_archive("epub-pages");
        path.set_extension("EPUB");
        let file = File::create(&path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        writer
            .start_file(
                "mimetype",
                SimpleFileOptions::default().compression_method(CompressionMethod::Stored),
            )
            .unwrap();
        writer.write_all(b"application/epub+zip").unwrap();
        writer
            .start_file("OEBPS/Text/chapter.xhtml", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"<html></html>").unwrap();
        for name in ["OEBPS/Images/10.jpg", "OEBPS/Images/2.jpg"] {
            writer
                .start_file(
                    name,
                    SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
                )
                .unwrap();
            writer.write_all(b"image").unwrap();
        }
        writer.finish().unwrap();

        assert_eq!(archive_adapter_kind(&path), ArchiveAdapterKind::Epub);
        assert_eq!(
            enumerate_archive_pages(&path)
                .unwrap()
                .into_iter()
                .map(|page| page.to_string())
                .collect::<Vec<_>>(),
            ["OEBPS/Images/2.jpg", "OEBPS/Images/10.jpg"]
        );
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejects_unsafe_entry_names() {
        let path = temporary_archive("unsafe-archive");
        let file = File::create(&path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        writer
            .start_file("../escape.png", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"unsafe").unwrap();
        writer.finish().unwrap();

        assert_eq!(
            enumerate_archive_pages(&path).unwrap_err().code,
            ErrorCode::InvalidPath
        );
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn fr_b12_classifies_seven_zip_lzh_and_comic_aliases() {
        assert_eq!(
            archive_adapter_kind(Path::new("volume.cbr")),
            ArchiveAdapterKind::Cbr
        );
        assert_eq!(
            archive_adapter_kind(Path::new("volume.7z")),
            ArchiveAdapterKind::SevenZip
        );
        assert_eq!(
            archive_adapter_kind(Path::new("volume.cb7")),
            ArchiveAdapterKind::Cb7
        );
        assert_eq!(
            archive_adapter_kind(Path::new("volume.lzh")),
            ArchiveAdapterKind::Lzh
        );
    }

    #[test]
    fn seven_zip_and_cb7_list_and_read_images_without_extracting() {
        for extension in ["7z", "cb7"] {
            let mut path = temporary_archive("seven-zip-pages");
            path.set_extension(extension);
            write_seven_zip(
                &path,
                &[
                    ("chapter/10.jpg", b"ten"),
                    ("chapter/2.png", b"two"),
                    ("notes.txt", b"ignored"),
                ],
            );
            let pages = enumerate_archive_pages(&path)
                .unwrap()
                .into_iter()
                .map(|page| page.to_string())
                .collect::<Vec<_>>();
            assert_eq!(pages, ["chapter/2.png", "chapter/10.jpg"]);
            let entry = read_archive_entry(&path, "chapter/2.png", 32).unwrap();
            assert_eq!(entry.bytes, b"two");
            assert!(!path.parent().unwrap().join("chapter").exists());
            fs::remove_file(path).unwrap();
        }
    }

    #[test]
    fn cbr_uses_the_rar_reader_without_extracting() {
        let source = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/generated/FIX-RAR-001/standard.rar");
        let mut path = temporary_archive("cbr-pages");
        path.set_extension("cbr");
        fs::copy(source, &path).unwrap();
        let pages = enumerate_archive_pages(&path).unwrap();
        assert!(!pages.is_empty());
        let first = pages[0].as_str().to_string();
        let entry = read_archive_entry(&path, &first, MAX_ARCHIVE_ENTRY_BYTES).unwrap();
        assert!(!entry.bytes.is_empty());
        assert!(!path.parent().unwrap().join("pages").exists());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn lzh_lists_and_reads_stored_images_without_extracting() {
        let mut path = temporary_archive("lzh-pages");
        path.set_extension("LZH");
        write_stored_lzh(
            &path,
            &[
                ("chapter/10.jpg", b"ten"),
                ("chapter/2.png", b"two"),
                ("notes.txt", b"ignored"),
            ],
        );
        let pages = enumerate_archive_pages(&path)
            .unwrap()
            .into_iter()
            .map(|page| page.to_string())
            .collect::<Vec<_>>();
        assert_eq!(pages, ["chapter/2.png", "chapter/10.jpg"]);
        let entry = read_archive_entry(&path, "chapter/10.jpg", 32).unwrap();
        assert_eq!(entry.bytes, b"ten");
        assert!(!path.parent().unwrap().join("chapter").exists());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn lzh_rejects_parent_traversal_before_reading_entry_data() {
        let mut path = temporary_archive("unsafe-lzh");
        path.set_extension("lzh");
        write_stored_lzh(&path, &[("../escape.png", b"unsafe")]);
        assert_eq!(
            enumerate_archive_pages(&path).unwrap_err().code,
            ErrorCode::InvalidPath
        );
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn nested_archives_are_flattened_in_natural_order_and_read_by_opaque_page_key() {
        let inner = zip_bytes(&[("pages/10.jpg", b"ten"), ("pages/2.png", b"two")]);
        let path = temporary_archive("nested-zip");
        let file = File::create(&path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        writer
            .start_file("1-cover.jpg", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"cover").unwrap();
        writer
            .start_file("2-volume.cbz", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(&inner).unwrap();
        writer.finish().unwrap();

        let pages = enumerate_archive_pages(&path).unwrap();
        assert_eq!(pages[0].as_str(), "1-cover.jpg");
        assert_eq!(pages.len(), 3);
        let nested_chains = pages[1..]
            .iter()
            .map(|page| decode_archive_page_key(page.as_str()).unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            nested_chains,
            [
                vec!["2-volume.cbz".to_string(), "pages/2.png".to_string()],
                vec!["2-volume.cbz".to_string(), "pages/10.jpg".to_string()],
            ]
        );
        let entry = read_archive_entry(&path, pages[1].as_str(), 32).unwrap();
        assert_eq!(entry.bytes, b"two");
        assert!(entry.fingerprint_detail.starts_with("nested:"));
        assert!(!path.parent().unwrap().join("2-volume.cbz").exists());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn nested_archives_can_mix_all_supported_adapter_families() {
        let zip = zip_bytes(&[("zip/page.png", b"zip")]);

        let mut seven_zip_path = temporary_archive("nested-source-seven-zip");
        seven_zip_path.set_extension("cb7");
        write_seven_zip(&seven_zip_path, &[("seven/page.png", b"seven")]);
        let seven_zip = fs::read(&seven_zip_path).unwrap();

        let mut lzh_path = temporary_archive("nested-source-lzh");
        lzh_path.set_extension("lzh");
        write_stored_lzh(&lzh_path, &[("lzh/page.png", b"lzh")]);
        let lzh = fs::read(&lzh_path).unwrap();

        let rar_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/generated/FIX-RAR-001/standard.rar");
        let rar = fs::read(rar_path).unwrap();

        let path = temporary_archive("nested-mixed");
        let file = File::create(&path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        for (name, bytes) in [
            ("1.cbz", zip.as_slice()),
            ("2.cb7", seven_zip.as_slice()),
            ("3.lzh", lzh.as_slice()),
            ("4.cbr", rar.as_slice()),
        ] {
            writer
                .start_file(name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap();

        let pages = enumerate_archive_pages(&path).unwrap();
        let chains = pages
            .iter()
            .map(|page| decode_archive_page_key(page.as_str()).unwrap())
            .collect::<Vec<_>>();
        for inner in ["1.cbz", "2.cb7", "3.lzh", "4.cbr"] {
            assert!(chains.iter().any(|chain| chain[0] == inner), "{inner}");
        }
        for page in &pages {
            assert!(
                !read_archive_entry(&path, page.as_str(), 1024 * 1024)
                    .unwrap()
                    .bytes
                    .is_empty()
            );
        }

        fs::remove_file(path).unwrap();
        fs::remove_file(seven_zip_path).unwrap();
        fs::remove_file(lzh_path).unwrap();
    }

    #[test]
    fn nested_archive_depth_limit_is_enforced() {
        let mut bytes = zip_bytes(&[("page.png", b"page")]);
        for depth in (1..=4).rev() {
            let name = format!("level-{depth}.cbz");
            bytes = zip_bytes(&[(&name, &bytes)]);
        }
        let path = temporary_archive("nested-depth-limit");
        fs::write(&path, bytes).unwrap();

        assert_eq!(
            enumerate_archive_pages(&path).unwrap_err().code,
            ErrorCode::ResourceLimit
        );
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn nested_archive_count_limit_is_enforced() {
        let empty_archive = zip_bytes(&[]);
        let path = temporary_archive("nested-count-limit");
        let file = File::create(&path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        for index in 0..=MAX_NESTED_ARCHIVES {
            writer
                .start_file(format!("nested-{index}.cbz"), SimpleFileOptions::default())
                .unwrap();
            writer.write_all(&empty_archive).unwrap();
        }
        writer.finish().unwrap();

        assert_eq!(
            enumerate_archive_pages(&path).unwrap_err().code,
            ErrorCode::ResourceLimit
        );
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn malformed_nested_page_keys_are_rejected() {
        let path = temporary_archive("nested-malformed-key");
        fs::write(&path, zip_bytes(&[("page.png", b"page")])).unwrap();
        assert_eq!(
            read_archive_entry(&path, "@comic-explorer-nested-v1/not-hex/still-not-hex", 32,)
                .unwrap_err()
                .code,
            ErrorCode::InvalidPath
        );
        fs::remove_file(path).unwrap();
    }
}
