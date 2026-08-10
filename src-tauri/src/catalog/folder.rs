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
    Rar,
    Cbr,
    SevenZip,
}

impl ArchiveKind {
    fn reader_available(self) -> bool {
        matches!(self, Self::Zip | Self::Cbz)
    }
}

fn archive_kind_for_name(name: &str) -> Option<ArchiveKind> {
    match name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("zip") => Some(ArchiveKind::Zip),
        Some("cbz") => Some(ArchiveKind::Cbz),
        Some("rar") => Some(ArchiveKind::Rar),
        Some("cbr") => Some(ArchiveKind::Cbr),
        Some("7z") => Some(ArchiveKind::SevenZip),
        _ => None,
    }
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
        let archive_kind = metadata
            .is_file()
            .then(|| archive_kind_for_name(&name))
            .flatten();
        let kind = if metadata.is_dir() {
            directory_kind(contains_supported_image(&root, &path))
        } else {
            match classify_file_name(&name) {
                FileKind::Archive if archive_kind.is_some_and(ArchiveKind::reader_available) => {
                    ItemKind::Archive
                }
                FileKind::Archive => ItemKind::Unsupported,
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
            archive_kind,
        });
    }
    entries.sort_by(|left, right| {
        natural_cmp(left.relative_path.as_str(), right.relative_path.as_str())
    });
    Ok(entries)
}

fn directory_kind(scan: Result<bool, AppError>) -> ItemKind {
    if matches!(scan, Ok(true)) {
        ItemKind::ComicFolder
    } else {
        ItemKind::Folder
    }
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
    fn unreadable_child_is_kept_as_a_folder_without_poisoning_its_parent() {
        let error = io_error(
            Path::new("denied"),
            std::io::Error::from(std::io::ErrorKind::PermissionDenied),
        );

        assert_eq!(directory_kind(Err(error)), ItemKind::Folder);
        assert_eq!(directory_kind(Ok(false)), ItemKind::Folder);
        assert_eq!(directory_kind(Ok(true)), ItemKind::ComicFolder);
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
    fn fr_b12_catalog_separates_available_and_unavailable_archive_kinds() {
        let root = temporary_root("catalog-metadata");
        fs::create_dir_all(root.join("folder")).unwrap();
        fs::write(root.join("book.zip"), b"zip").unwrap();
        fs::write(root.join("book.cbz"), b"cbz").unwrap();
        fs::write(root.join("book.rar"), b"rar").unwrap();
        fs::write(root.join("book.cbr"), b"cbr").unwrap();
        fs::write(root.join("book.7z"), b"7z").unwrap();

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
        let rar = entries
            .iter()
            .find(|entry| entry.relative_path.as_str() == "book.rar")
            .unwrap();
        let cbr = entries
            .iter()
            .find(|entry| entry.relative_path.as_str() == "book.cbr")
            .unwrap();
        let seven_zip = entries
            .iter()
            .find(|entry| entry.relative_path.as_str() == "book.7z")
            .unwrap();

        assert_eq!(folder.byte_size, None);
        assert!(folder.modified_ms.is_some());
        assert_eq!(zip.kind, ItemKind::Archive);
        assert_eq!(cbz.kind, ItemKind::Archive);
        assert_eq!(zip.archive_kind, Some(ArchiveKind::Zip));
        assert_eq!(cbz.archive_kind, Some(ArchiveKind::Cbz));
        for (entry, archive_kind) in [
            (rar, ArchiveKind::Rar),
            (cbr, ArchiveKind::Cbr),
            (seven_zip, ArchiveKind::SevenZip),
        ] {
            assert_eq!(entry.kind, ItemKind::Unsupported);
            assert_eq!(entry.archive_kind, Some(archive_kind));
        }
        fs::remove_dir_all(root).unwrap();
    }
}
