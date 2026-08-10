use std::fs::File;
use std::io::Read;
use std::path::Path;

use unrar::error::{Code as UnrarCode, UnrarError, When as UnrarWhen};
use unrar::{Archive, VolumeInfo};
use zip::{CompressionMethod, ZipArchive};

use crate::api::{MAX_ARCHIVE_ENTRIES, MAX_ARCHIVE_ENTRY_BYTES, MAX_ARCHIVE_TOTAL_BYTES};
use crate::domain::{AppError, ErrorCode, FileKind, RelativePath, classify_file_name, natural_cmp};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveAdapterKind {
    Zip,
    Cbz,
    Epub,
    Rar,
    Cbr,
    SevenZip,
}

#[derive(Debug)]
pub(crate) struct ArchiveEntryBytes {
    pub bytes: Vec<u8>,
    pub fingerprint_detail: String,
}

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
        _ => ArchiveAdapterKind::Zip,
    }
}

pub fn enumerate_archive_pages(path: &Path) -> Result<Vec<RelativePath>, AppError> {
    match archive_adapter_kind(path) {
        ArchiveAdapterKind::Zip | ArchiveAdapterKind::Cbz | ArchiveAdapterKind::Epub => {
            enumerate_zip_pages(path)
        }
        ArchiveAdapterKind::Rar => enumerate_rar_pages(path),
        adapter => Err(unsupported_adapter_error(path, adapter)),
    }
}

pub(crate) fn read_archive_entry(
    path: &Path,
    entry_name: &str,
    max_bytes: u64,
) -> Result<ArchiveEntryBytes, AppError> {
    match archive_adapter_kind(path) {
        ArchiveAdapterKind::Zip | ArchiveAdapterKind::Cbz | ArchiveAdapterKind::Epub => {
            read_zip_entry(path, entry_name, max_bytes)
        }
        ArchiveAdapterKind::Rar => read_rar_entry(path, entry_name, max_bytes),
        adapter => Err(unsupported_adapter_error(path, adapter)),
    }
}

fn enumerate_zip_pages(path: &Path) -> Result<Vec<RelativePath>, AppError> {
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
    let mut pages = Vec::new();
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
        if entry.is_dir() || classify_file_name(entry.name()) != FileKind::Image {
            continue;
        }
        let relative = RelativePath::parse(entry.name()).map_err(|_| AppError {
            code: ErrorCode::InvalidPath,
            message: format!("Unsafe archive entry path: {}", entry.name()),
            target: None,
            retryable: false,
        })?;
        if relative
            .as_str()
            .split('/')
            .any(|part| part.starts_with('.'))
        {
            continue;
        }
        pages.push(relative);
    }
    pages.sort_by(|left, right| natural_cmp(left.as_str(), right.as_str()));
    Ok(pages)
}

fn enumerate_rar_pages(path: &Path) -> Result<Vec<RelativePath>, AppError> {
    File::open(path).map_err(|source| archive_io_error(path, source))?;
    let archive = Archive::new(path).open_for_listing().map_err(unrar_error)?;
    ensure_single_volume(archive.volume_info())?;
    let mut total_size = 0_u64;
    let mut pages = Vec::new();
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
        if classify_file_name(relative.as_str()) != FileKind::Image
            || relative
                .as_str()
                .split('/')
                .any(|part| part.starts_with('.'))
        {
            continue;
        }
        pages.push(relative);
    }
    pages.sort_by(|left, right| natural_cmp(left.as_str(), right.as_str()));
    Ok(pages)
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

fn unsupported_adapter_error(_path: &Path, adapter: ArchiveAdapterKind) -> AppError {
    let name = match adapter {
        ArchiveAdapterKind::Cbr => "CBR",
        ArchiveAdapterKind::SevenZip => "7z",
        ArchiveAdapterKind::Zip
        | ArchiveAdapterKind::Cbz
        | ArchiveAdapterKind::Epub
        | ArchiveAdapterKind::Rar => "ZIP/CBZ/EPUB/RAR",
    };
    AppError {
        code: ErrorCode::UnsupportedFormat,
        message: format!("{name} archive adapter is unavailable."),
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
    use std::io::Write;
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
    fn fr_b12_classifies_cbr_and_7z_without_extracting_or_faking_support() {
        assert_eq!(
            archive_adapter_kind(Path::new("volume.cbr")),
            ArchiveAdapterKind::Cbr
        );
        assert_eq!(
            archive_adapter_kind(Path::new("volume.7z")),
            ArchiveAdapterKind::SevenZip
        );
        for (extension, signature) in [
            ("cbr", b"Rar!\x1a\x07\x00".as_slice()),
            ("7z", b"7z\xbc\xaf\x27\x1c".as_slice()),
        ] {
            let mut path = temporary_archive(&format!("unsupported-{extension}"));
            path.set_extension(extension);
            let mut file = File::create(&path).unwrap();
            file.write_all(signature).unwrap();
            let error = enumerate_archive_pages(&path).unwrap_err();
            assert_eq!(error.code, ErrorCode::UnsupportedFormat);
            assert!(error.message.contains("adapter is unavailable"));
            assert!(!error.message.contains(path.to_string_lossy().as_ref()));
            assert!(!error.message.contains("comic-explorer-unsupported"));
            fs::remove_file(path).unwrap();
        }
    }
}
