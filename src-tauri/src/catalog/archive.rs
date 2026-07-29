use std::fs::File;
use std::path::Path;

use zip::{CompressionMethod, ZipArchive};

use crate::api::{MAX_ARCHIVE_ENTRIES, MAX_ARCHIVE_ENTRY_BYTES, MAX_ARCHIVE_TOTAL_BYTES};
use crate::domain::{AppError, ErrorCode, FileKind, RelativePath, classify_file_name, natural_cmp};

pub fn enumerate_archive_pages(path: &Path) -> Result<Vec<RelativePath>, AppError> {
    let file = File::open(path).map_err(|source| archive_io_error(path, source))?;
    let mut archive = ZipArchive::new(file).map_err(|source| AppError {
        code: ErrorCode::CorruptArchive,
        message: format!("Cannot parse {}: {source}", path.display()),
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
            message: format!("Cannot read {} entry {index}: {source}", path.display()),
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

fn archive_io_error(path: &Path, source: std::io::Error) -> AppError {
    AppError {
        code: match source.kind() {
            std::io::ErrorKind::NotFound => ErrorCode::NotFound,
            std::io::ErrorKind::PermissionDenied => ErrorCode::AccessDenied,
            _ => ErrorCode::CorruptArchive,
        },
        message: format!("Cannot open {}: {source}", path.display()),
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
        assert_eq!(pages, ["chapter/2.PNG", "chapter/10.JPG"]);
        assert!(!path.parent().unwrap().join("chapter").exists());
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
}
