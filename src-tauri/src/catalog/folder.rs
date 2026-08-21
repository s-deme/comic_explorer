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
    #[serde(default)]
    pub has_folder_archive_cover: bool,
    pub byte_size: Option<u64>,
    pub modified_ms: Option<u64>,
    pub archive_kind: Option<ArchiveKind>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ArchiveKind {
    Zip,
    Cbz,
    Epub,
    Rar,
    Cbr,
    SevenZip,
    Cb7,
    Lzh,
}

impl ArchiveKind {
    fn reader_available(self) -> bool {
        matches!(
            self,
            Self::Zip
                | Self::Cbz
                | Self::Epub
                | Self::Rar
                | Self::Cbr
                | Self::SevenZip
                | Self::Cb7
                | Self::Lzh
        )
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
        Some("epub") => Some(ArchiveKind::Epub),
        Some("rar") => Some(ArchiveKind::Rar),
        Some("cbr") => Some(ArchiveKind::Cbr),
        Some("7z") => Some(ArchiveKind::SevenZip),
        Some("cb7") => Some(ArchiveKind::Cb7),
        Some("lzh") | Some("lha") => Some(ArchiveKind::Lzh),
        _ => None,
    }
}

pub fn enumerate_folder(root: &Path, directory: &Path) -> Result<Vec<CatalogEntry>, AppError> {
    enumerate_folder_with_hidden(root, directory, false)
}

pub fn enumerate_folder_with_hidden(
    root: &Path,
    directory: &Path,
    show_hidden: bool,
) -> Result<Vec<CatalogEntry>, AppError> {
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
        let path = entry.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if !show_hidden && is_hidden(&entry.file_name().to_string_lossy(), &metadata) {
            continue;
        }
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
            ItemKind::Folder
        } else {
            match classify_file_name(&name) {
                FileKind::Archive if archive_kind.is_some_and(ArchiveKind::reader_available) => {
                    ItemKind::Archive
                }
                FileKind::Archive => ItemKind::Unsupported,
                FileKind::Image => ItemKind::Page,
                FileKind::Pdf => ItemKind::Pdf,
                FileKind::Unsupported => ItemKind::Unsupported,
            }
        };
        entries.push(CatalogEntry {
            relative_path,
            kind,
            has_folder_archive_cover: false,
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

pub fn has_child_folder_with_hidden(
    root: &Path,
    directory: &Path,
    show_hidden: bool,
) -> Result<bool, AppError> {
    let root = canonical_directory(root)?;
    let directory = canonical_directory(directory)?;
    ensure_contained(&root, &directory)?;
    let iterator = fs::read_dir(&directory).map_err(|source| io_error(&directory, source))?;
    for result in iterator {
        let entry = match result {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let metadata = match fs::symlink_metadata(entry.path()) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if !show_hidden && is_hidden(&entry.file_name().to_string_lossy(), &metadata) {
            continue;
        }
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn enumerate_folder_pages(root: &Path, comic: &Path) -> Result<Vec<RelativePath>, AppError> {
    enumerate_folder_pages_with_hidden(root, comic, false)
}

pub fn enumerate_folder_pages_with_hidden(
    root: &Path,
    comic: &Path,
    show_hidden: bool,
) -> Result<Vec<RelativePath>, AppError> {
    let root = canonical_directory(root)?;
    let comic = canonical_directory(comic)?;
    ensure_contained(&root, &comic)?;
    let mut pages = Vec::new();
    walk_pages(&root, &comic, show_hidden, &mut pages)?;
    pages.sort_by(|left, right| natural_cmp(left.as_str(), right.as_str()));
    Ok(pages)
}

fn walk_pages(
    root: &Path,
    directory: &Path,
    show_hidden: bool,
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
        let path = entry.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if !show_hidden && is_hidden(&entry.file_name().to_string_lossy(), &metadata) {
            continue;
        }
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            walk_pages(root, &path, show_hidden, pages)?;
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

fn is_hidden(name: &str, metadata: &fs::Metadata) -> bool {
    if name.starts_with('.') {
        return true;
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = metadata;
        false
    }
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
    fn lists_folders_without_classifying_or_selecting_covers_from_their_contents() {
        let root = temporary_root("folder-metadata-only");
        let shelf = root.join("shelf");
        let comic = root.join("comic");
        fs::create_dir_all(&shelf).unwrap();
        fs::create_dir_all(comic.join("chapter")).unwrap();
        fs::write(shelf.join("10.cbz"), b"ten").unwrap();
        fs::write(shelf.join("2.cbz"), b"two").unwrap();
        fs::write(comic.join("chapter/1.png"), b"page").unwrap();

        let entries = enumerate_folder(&root, &root).unwrap();

        assert_eq!(entries.len(), 2);
        assert!(entries.iter().all(|entry| entry.kind == ItemKind::Folder));
        assert!(entries.iter().all(|entry| !entry.has_folder_archive_cover));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn recursively_lists_supported_pages_in_natural_order() {
        let root = temporary_root("folder-pages");
        let comic = root.join("book");
        fs::create_dir_all(comic.join("chapter")).unwrap();
        fs::write(comic.join("10.jpg"), b"test").unwrap();
        fs::write(comic.join("2.PNG"), b"test").unwrap();
        fs::write(comic.join("3.bmp"), b"test").unwrap();
        fs::write(comic.join("4.GIF"), b"test").unwrap();
        fs::write(comic.join("5.tif"), b"test").unwrap();
        fs::write(comic.join("6.TIFF"), b"test").unwrap();
        fs::write(comic.join("7.ico"), b"test").unwrap();
        fs::write(comic.join("8.SVG"), b"test").unwrap();
        fs::write(comic.join("9.pdf"), b"%PDF-1.7").unwrap();
        fs::write(comic.join("chapter/3.jpeg"), b"test").unwrap();
        fs::write(comic.join("chapter/notes.txt"), b"test").unwrap();
        fs::write(comic.join(".hidden.png"), b"test").unwrap();

        let pages = enumerate_folder_pages(&root, &comic)
            .unwrap()
            .into_iter()
            .map(|path| path.to_string())
            .collect::<Vec<_>>();

        assert_eq!(
            pages,
            [
                "book/2.PNG",
                "book/3.bmp",
                "book/4.GIF",
                "book/5.tif",
                "book/6.TIFF",
                "book/7.ico",
                "book/8.SVG",
                "book/10.jpg",
                "book/chapter/3.jpeg"
            ]
        );
        let visible_hidden = enumerate_folder_pages_with_hidden(&root, &comic, true)
            .unwrap()
            .into_iter()
            .map(|path| path.to_string())
            .collect::<Vec<_>>();
        assert!(visible_hidden.contains(&"book/.hidden.png".to_owned()));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn hides_dot_entries_by_default_and_can_include_them_explicitly() {
        let root = temporary_root("dot-hidden");
        fs::create_dir_all(root.join(".private")).unwrap();
        fs::write(root.join(".cover.jpg"), b"hidden").unwrap();
        fs::write(root.join("visible.jpg"), b"visible").unwrap();

        let default_entries = enumerate_folder(&root, &root).unwrap();
        assert_eq!(default_entries.len(), 1);
        assert_eq!(default_entries[0].relative_path.as_str(), "visible.jpg");
        let all_entries = enumerate_folder_with_hidden(&root, &root, true).unwrap();
        assert_eq!(all_entries.len(), 3);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn req_ley_p3_006_checks_only_direct_visible_child_folders() {
        let root = temporary_root("tree-child-presence");
        let leaf = root.join("leaf");
        let branch = root.join("branch");
        let hidden_branch = root.join("hidden-branch");
        fs::create_dir_all(&leaf).unwrap();
        fs::create_dir_all(branch.join("child/grandchild")).unwrap();
        fs::create_dir_all(hidden_branch.join(".child")).unwrap();
        fs::write(leaf.join("page.jpg"), b"page").unwrap();

        assert!(!has_child_folder_with_hidden(&root, &leaf, false).unwrap());
        assert!(has_child_folder_with_hidden(&root, &branch, false).unwrap());
        assert!(!has_child_folder_with_hidden(&root, &hidden_branch, false).unwrap());
        assert!(has_child_folder_with_hidden(&root, &hidden_branch, true).unwrap());
        assert_eq!(
            has_child_folder_with_hidden(&root, &root.join("missing"), false)
                .unwrap_err()
                .code,
            ErrorCode::NotFound
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn honors_the_windows_hidden_attribute() {
        use std::os::windows::ffi::OsStrExt;
        use windows::Win32::Storage::FileSystem::{FILE_ATTRIBUTE_HIDDEN, SetFileAttributesW};
        use windows::core::PCWSTR;

        let root = temporary_root("windows-hidden");
        fs::create_dir_all(&root).unwrap();
        let hidden = root.join("hidden.jpg");
        fs::write(&hidden, b"hidden").unwrap();
        let wide = hidden
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect::<Vec<_>>();
        unsafe { SetFileAttributesW(PCWSTR(wide.as_ptr()), FILE_ATTRIBUTE_HIDDEN) }.unwrap();

        assert!(enumerate_folder(&root, &root).unwrap().is_empty());
        assert_eq!(
            enumerate_folder_with_hidden(&root, &root, true)
                .unwrap()
                .len(),
            1
        );
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
    fn fr_b12_catalog_exposes_all_supported_archive_kinds() {
        let root = temporary_root("catalog-metadata");
        fs::create_dir_all(root.join("folder")).unwrap();
        fs::write(root.join("book.zip"), b"zip").unwrap();
        fs::write(root.join("book.cbz"), b"cbz").unwrap();
        fs::write(root.join("book.epub"), b"epub").unwrap();
        fs::write(root.join("book.rar"), b"rar").unwrap();
        fs::write(root.join("book.cbr"), b"cbr").unwrap();
        fs::write(root.join("book.7z"), b"7z").unwrap();
        fs::write(root.join("book.cb7"), b"cb7").unwrap();
        fs::write(root.join("book.lzh"), b"lzh").unwrap();
        fs::write(root.join("book.PDF"), b"pdf").unwrap();

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
        let epub = entries
            .iter()
            .find(|entry| entry.relative_path.as_str() == "book.epub")
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
        let cb7 = entries
            .iter()
            .find(|entry| entry.relative_path.as_str() == "book.cb7")
            .unwrap();
        let lzh = entries
            .iter()
            .find(|entry| entry.relative_path.as_str() == "book.lzh")
            .unwrap();
        let pdf = entries
            .iter()
            .find(|entry| entry.relative_path.as_str() == "book.PDF")
            .unwrap();

        assert_eq!(folder.byte_size, None);
        assert!(folder.modified_ms.is_some());
        assert_eq!(zip.kind, ItemKind::Archive);
        assert_eq!(cbz.kind, ItemKind::Archive);
        assert_eq!(epub.kind, ItemKind::Archive);
        assert_eq!(rar.kind, ItemKind::Archive);
        assert_eq!(cbr.kind, ItemKind::Archive);
        assert_eq!(seven_zip.kind, ItemKind::Archive);
        assert_eq!(cb7.kind, ItemKind::Archive);
        assert_eq!(lzh.kind, ItemKind::Archive);
        assert_eq!(pdf.kind, ItemKind::Pdf);
        assert_eq!(zip.archive_kind, Some(ArchiveKind::Zip));
        assert_eq!(cbz.archive_kind, Some(ArchiveKind::Cbz));
        assert_eq!(epub.archive_kind, Some(ArchiveKind::Epub));
        assert_eq!(rar.archive_kind, Some(ArchiveKind::Rar));
        assert_eq!(cbr.archive_kind, Some(ArchiveKind::Cbr));
        assert_eq!(seven_zip.archive_kind, Some(ArchiveKind::SevenZip));
        assert_eq!(cb7.archive_kind, Some(ArchiveKind::Cb7));
        assert_eq!(lzh.archive_kind, Some(ArchiveKind::Lzh));
        assert_eq!(pdf.archive_kind, None);
        fs::remove_dir_all(root).unwrap();
    }
}
