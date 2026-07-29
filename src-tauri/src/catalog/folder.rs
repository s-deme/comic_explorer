use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::domain::{
    AppError, ErrorCode, FileKind, ItemKind, RelativePath, classify_file_name, natural_cmp,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub relative_path: RelativePath,
    pub kind: ItemKind,
    pub byte_size: Option<u64>,
    pub modified_ms: Option<u64>,
    pub archive_kind: Option<ArchiveKind>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ArchiveKind {
    Zip,
    Cbz,
}

pub fn enumerate_folder(root: &Path, directory: &Path) -> Result<Vec<CatalogEntry>, AppError> {
    let root = canonical_directory(root)?;
    let directory = canonical_directory(directory)?;
    ensure_contained(&root, &directory)?;
    let mut entries = Vec::new();
    let iterator = fs::read_dir(&directory).map_err(|source| io_error(&directory, source))?;
    for result in iterator {
        let entry = match result {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if is_hidden_name(&entry.file_name().to_string_lossy()) {
            continue;
        }
        let path = entry.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.file_type().is_symlink() {
            let canonical = match path.canonicalize() {
                Ok(canonical) => canonical,
                Err(_) => continue,
            };
            if !canonical.starts_with(&root) {
                continue;
            }
        }
        let relative = path
            .strip_prefix(&root)
            .map_err(|_| outside_error(&path))?
            .to_string_lossy();
        let relative_path =
            RelativePath::parse(relative.as_ref()).map_err(|_| outside_error(&path))?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let kind = if metadata.is_dir() {
            if contains_supported_image(&root, &path)? {
                ItemKind::ComicFolder
            } else {
                ItemKind::Folder
            }
        } else {
            match classify_file_name(&name) {
                FileKind::Archive => ItemKind::Archive,
                FileKind::Image => ItemKind::Page,
                FileKind::Unsupported => ItemKind::Unsupported,
            }
        };
        entries.push(CatalogEntry {
            relative_path,
            kind,
            byte_size: metadata.is_file().then_some(metadata.len()),
            modified_ms: metadata
                .modified()
                .ok()
                .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                .and_then(|value| u64::try_from(value.as_millis()).ok()),
            archive_kind: (kind == ItemKind::Archive).then(|| {
                if name.to_ascii_lowercase().ends_with(".cbz") {
                    ArchiveKind::Cbz
                } else {
                    ArchiveKind::Zip
                }
            }),
        });
    }
    entries.sort_by(|left, right| {
        natural_cmp(left.relative_path.as_str(), right.relative_path.as_str())
    });
    Ok(entries)
}

pub fn enumerate_folder_pages(root: &Path, comic: &Path) -> Result<Vec<RelativePath>, AppError> {
    let root = canonical_directory(root)?;
    let comic = canonical_directory(comic)?;
    ensure_contained(&root, &comic)?;
    let mut pages = Vec::new();
    walk_pages(&root, &comic, &mut pages)?;
    pages.sort_by(|left, right| natural_cmp(left.as_str(), right.as_str()));
    Ok(pages)
}

fn walk_pages(
    root: &Path,
    directory: &Path,
    pages: &mut Vec<RelativePath>,
) -> Result<(), AppError> {
    let iterator = match fs::read_dir(directory) {
        Ok(iterator) => iterator,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(io_error(directory, error)),
    };
    for result in iterator {
        let entry = match result {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if is_hidden_name(&entry.file_name().to_string_lossy()) {
            continue;
        }
        let path = entry.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            walk_pages(root, &path, pages)?;
        } else if classify_file_name(&entry.file_name().to_string_lossy()) == FileKind::Image {
            let relative = path
                .strip_prefix(root)
                .map_err(|_| outside_error(&path))?
                .to_string_lossy();
            pages.push(RelativePath::parse(relative.as_ref()).map_err(|_| outside_error(&path))?);
        }
    }
    Ok(())
}

fn contains_supported_image(root: &Path, directory: &Path) -> Result<bool, AppError> {
    let mut pages = Vec::new();
    walk_pages(root, directory, &mut pages)?;
    Ok(!pages.is_empty())
}

fn canonical_directory(path: &Path) -> Result<PathBuf, AppError> {
    let canonical = path
        .canonicalize()
        .map_err(|source| io_error(path, source))?;
    if !canonical.is_dir() {
        return Err(AppError {
            code: ErrorCode::InvalidPath,
            message: "Path is not a directory.".into(),
            target: None,
            retryable: false,
        });
    }
    Ok(canonical)
}

fn ensure_contained(root: &Path, path: &Path) -> Result<(), AppError> {
    if path.starts_with(root) {
        Ok(())
    } else {
        Err(outside_error(path))
    }
}

fn is_hidden_name(name: &str) -> bool {
    name.starts_with('.')
}

fn outside_error(path: &Path) -> AppError {
    AppError {
        code: ErrorCode::OutsideLibraryRoot,
        message: format!("Path is outside the library root: {}", path.display()),
        target: None,
        retryable: false,
    }
}

fn io_error(path: &Path, source: std::io::Error) -> AppError {
    let code = match source.kind() {
        std::io::ErrorKind::NotFound => ErrorCode::NotFound,
        std::io::ErrorKind::PermissionDenied => ErrorCode::AccessDenied,
        _ => ErrorCode::InvalidPath,
    };
    AppError {
        code,
        message: format!("Cannot read {}: {source}", path.display()),
        target: None,
        retryable: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_root(test_name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "comic-explorer-{test_name}-{}-{nonce}",
            std::process::id()
        ))
    }

    #[test]
    fn recursively_lists_supported_pages_in_natural_order() {
        let root = temporary_root("folder-pages");
        let comic = root.join("book");
        fs::create_dir_all(comic.join("chapter")).unwrap();
        fs::write(comic.join("10.jpg"), b"test").unwrap();
        fs::write(comic.join("2.PNG"), b"test").unwrap();
        fs::write(comic.join("chapter/3.jpeg"), b"test").unwrap();
        fs::write(comic.join("chapter/notes.txt"), b"test").unwrap();
        fs::write(comic.join(".hidden.png"), b"test").unwrap();

        let pages = enumerate_folder_pages(&root, &comic)
            .unwrap()
            .into_iter()
            .map(|path| path.to_string())
            .collect::<Vec<_>>();

        assert_eq!(pages, ["book/2.PNG", "book/10.jpg", "book/chapter/3.jpeg"]);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn refuses_a_directory_outside_the_canonical_root() {
        let root = temporary_root("root");
        let outside = temporary_root("outside");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();

        assert_eq!(
            enumerate_folder(&root, &outside).unwrap_err().code,
            ErrorCode::OutsideLibraryRoot
        );
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }

    #[test]
    fn catalog_metadata_distinguishes_zip_and_cbz_and_omits_folder_size() {
        let root = temporary_root("catalog-metadata");
        fs::create_dir_all(root.join("folder")).unwrap();
        fs::write(root.join("book.zip"), b"zip").unwrap();
        fs::write(root.join("book.cbz"), b"cbz").unwrap();

        let entries = enumerate_folder(&root, &root).unwrap();
        let folder = entries
            .iter()
            .find(|entry| entry.relative_path.as_str() == "folder")
            .unwrap();
        let zip = entries
            .iter()
            .find(|entry| entry.relative_path.as_str() == "book.zip")
            .unwrap();
        let cbz = entries
            .iter()
            .find(|entry| entry.relative_path.as_str() == "book.cbz")
            .unwrap();

        assert_eq!(folder.byte_size, None);
        assert!(folder.modified_ms.is_some());
        assert_eq!(zip.archive_kind, Some(ArchiveKind::Zip));
        assert_eq!(cbz.archive_kind, Some(ArchiveKind::Cbz));
        fs::remove_dir_all(root).unwrap();
    }
}
