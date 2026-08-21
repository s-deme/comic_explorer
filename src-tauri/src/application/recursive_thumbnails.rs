use std::fs;
use std::path::{Path, PathBuf};

use tokio_util::sync::CancellationToken;

use crate::catalog::enumerate_folder_with_hidden;
use crate::domain::{AppError, ErrorCode, ItemKind, RelativePath, natural_cmp};

pub const MAX_RECURSIVE_THUMBNAIL_DEPTH: usize = 64;
pub const MAX_RECURSIVE_THUMBNAIL_VISITED: usize = 50_000;
pub const MAX_RECURSIVE_THUMBNAIL_CANDIDATES: usize = 10_000;

pub fn collect_recursive_thumbnail_candidates(
    root: &Path,
    start: &RelativePath,
    show_hidden: bool,
    cancellation: &CancellationToken,
) -> Result<Vec<RelativePath>, AppError> {
    if cancellation.is_cancelled() {
        return Err(AppError::cancelled());
    }
    let canonical_root = canonical_directory(root, "Library root cannot be read.")?;
    let requested_start = canonical_root.join(start.as_str());
    let start_metadata = fs::symlink_metadata(&requested_start).map_err(|source| {
        let code = match source.kind() {
            std::io::ErrorKind::NotFound => ErrorCode::NotFound,
            std::io::ErrorKind::PermissionDenied => ErrorCode::AccessDenied,
            _ => ErrorCode::InvalidPath,
        };
        batch_error(code, "Thumbnail batch folder cannot be read.")
    })?;
    if metadata_is_reparse_point(&start_metadata) {
        return Err(batch_error(
            ErrorCode::InvalidPath,
            "Thumbnail batch cannot start from a symbolic link or reparse point.",
        ));
    }
    let canonical_start =
        canonical_directory(&requested_start, "Thumbnail batch folder cannot be read.")?;
    if !canonical_start.starts_with(&canonical_root) {
        return Err(batch_error(
            ErrorCode::OutsideLibraryRoot,
            "Thumbnail batch folder is outside the library root.",
        ));
    }

    let mut state = CollectionState::default();
    collect_directory(
        &canonical_root,
        &canonical_start,
        start,
        show_hidden,
        0,
        cancellation,
        &mut state,
    )?;
    state
        .candidates
        .sort_by(|left, right| natural_cmp(left.as_str(), right.as_str()));
    Ok(state.candidates)
}

#[derive(Default)]
struct CollectionState {
    visited: usize,
    candidates: Vec<RelativePath>,
}

fn collect_directory(
    root: &Path,
    directory: &Path,
    relative: &RelativePath,
    show_hidden: bool,
    depth: usize,
    cancellation: &CancellationToken,
    state: &mut CollectionState,
) -> Result<(), AppError> {
    if cancellation.is_cancelled() {
        return Err(AppError::cancelled());
    }
    if depth > MAX_RECURSIVE_THUMBNAIL_DEPTH {
        return Err(batch_error(
            ErrorCode::ResourceLimit,
            "Thumbnail batch exceeds the 64-folder depth limit.",
        ));
    }
    let entries = enumerate_folder_with_hidden(root, directory, show_hidden)?;
    if !relative.as_str().is_empty() && entries.iter().any(|entry| entry.kind == ItemKind::Page) {
        push_candidate(relative.clone(), state)?;
    }
    for entry in entries {
        if cancellation.is_cancelled() {
            return Err(AppError::cancelled());
        }
        state.visited = state.visited.saturating_add(1);
        if state.visited > MAX_RECURSIVE_THUMBNAIL_VISITED {
            return Err(batch_error(
                ErrorCode::ResourceLimit,
                "Thumbnail batch exceeds the 50000-item scan limit.",
            ));
        }
        let path = root.join(entry.relative_path.as_str());
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata_is_reparse_point(&metadata) {
            continue;
        }
        match entry.kind {
            ItemKind::Page | ItemKind::Archive | ItemKind::Pdf => {
                push_candidate(entry.relative_path, state)?;
            }
            ItemKind::Folder | ItemKind::ComicFolder => {
                collect_directory(
                    root,
                    &path,
                    &entry.relative_path,
                    show_hidden,
                    depth.saturating_add(1),
                    cancellation,
                    state,
                )?;
            }
            ItemKind::Unsupported => {}
        }
    }
    Ok(())
}

fn push_candidate(candidate: RelativePath, state: &mut CollectionState) -> Result<(), AppError> {
    if state.candidates.len() >= MAX_RECURSIVE_THUMBNAIL_CANDIDATES {
        return Err(batch_error(
            ErrorCode::ResourceLimit,
            "Thumbnail batch exceeds the 10000-candidate generation limit.",
        ));
    }
    state.candidates.push(candidate);
    Ok(())
}

fn canonical_directory(path: &Path, message: &str) -> Result<PathBuf, AppError> {
    let canonical = path.canonicalize().map_err(|source| {
        let code = match source.kind() {
            std::io::ErrorKind::NotFound => ErrorCode::NotFound,
            std::io::ErrorKind::PermissionDenied => ErrorCode::AccessDenied,
            _ => ErrorCode::InvalidPath,
        };
        batch_error(code, message)
    })?;
    if canonical.is_dir() {
        Ok(canonical)
    } else {
        Err(batch_error(ErrorCode::InvalidPath, message))
    }
}

fn metadata_is_reparse_point(metadata: &fs::Metadata) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt;

        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(target_os = "windows"))]
    {
        metadata.file_type().is_symlink()
    }
}

fn batch_error(code: ErrorCode, message: &str) -> AppError {
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
    use std::time::{Instant, SystemTime, UNIX_EPOCH};

    fn temporary_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "comic-explorer-recursive-thumbnails-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn req_ley_p3_009_collects_natural_supported_candidates_and_honors_hidden() {
        let root = temporary_root("collect");
        fs::create_dir_all(root.join("series/volume10")).unwrap();
        fs::create_dir_all(root.join("series/volume2")).unwrap();
        fs::create_dir_all(root.join("series/empty")).unwrap();
        fs::create_dir_all(root.join("series/.hidden")).unwrap();
        fs::write(root.join("series/volume10/1.png"), b"image").unwrap();
        fs::write(root.join("series/volume2/1.jpg"), b"image").unwrap();
        fs::write(root.join("series/volume2/book.cbz"), b"archive").unwrap();
        fs::write(root.join("series/volume2/book.pdf"), b"pdf").unwrap();
        fs::write(root.join("series/volume2/notes.txt"), b"text").unwrap();
        fs::write(root.join("series/.hidden/cover.png"), b"image").unwrap();
        let start = RelativePath::parse("series").unwrap();
        let visible =
            collect_recursive_thumbnail_candidates(&root, &start, false, &CancellationToken::new())
                .unwrap();
        assert_eq!(
            visible.iter().map(RelativePath::as_str).collect::<Vec<_>>(),
            [
                "series/volume2",
                "series/volume2/1.jpg",
                "series/volume2/book.cbz",
                "series/volume2/book.pdf",
                "series/volume10",
                "series/volume10/1.png",
            ]
        );
        let with_hidden =
            collect_recursive_thumbnail_candidates(&root, &start, true, &CancellationToken::new())
                .unwrap();
        assert!(
            with_hidden
                .iter()
                .any(|item| item.as_str() == "series/.hidden")
        );
        assert!(
            with_hidden
                .iter()
                .any(|item| item.as_str() == "series/.hidden/cover.png")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn req_ley_p3_009_rejects_outside_missing_and_cancelled_scopes() {
        let root = temporary_root("boundaries");
        fs::create_dir_all(root.join("inside")).unwrap();
        assert_eq!(
            collect_recursive_thumbnail_candidates(
                &root,
                &RelativePath::parse("missing").unwrap(),
                false,
                &CancellationToken::new(),
            )
            .unwrap_err()
            .code,
            ErrorCode::NotFound
        );
        let mut deep = root.join("inside");
        for index in 0..66 {
            deep = deep.join(format!("level-{index}"));
            fs::create_dir(&deep).unwrap();
        }
        assert_eq!(
            collect_recursive_thumbnail_candidates(
                &root,
                &RelativePath::parse("inside").unwrap(),
                false,
                &CancellationToken::new(),
            )
            .unwrap_err()
            .code,
            ErrorCode::ResourceLimit
        );
        let cancelled = CancellationToken::new();
        cancelled.cancel();
        assert_eq!(
            collect_recursive_thumbnail_candidates(
                &root,
                &RelativePath::parse("inside").unwrap(),
                false,
                &cancelled,
            )
            .unwrap_err()
            .code,
            ErrorCode::Cancelled
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn req_ley_p3_009_measures_ten_thousand_candidates_within_runaway_limit() {
        let root = temporary_root("measure");
        let books = root.join("books");
        fs::create_dir_all(&books).unwrap();
        for index in 0..5_000 {
            let folder = books.join(format!("book-{index:05}"));
            fs::create_dir(&folder).unwrap();
            fs::write(folder.join("cover.jpg"), b"image").unwrap();
        }
        let started = Instant::now();
        let candidates = collect_recursive_thumbnail_candidates(
            &root,
            &RelativePath::parse("books").unwrap(),
            false,
            &CancellationToken::new(),
        )
        .unwrap();
        let elapsed = started.elapsed();
        assert_eq!(candidates.len(), 10_000);
        assert!(elapsed < std::time::Duration::from_secs(60));
        eprintln!("REQ-LEY-P3-009 10000 candidate enumeration: {elapsed:?}");
        fs::write(books.join("extra.png"), b"image").unwrap();
        assert_eq!(
            collect_recursive_thumbnail_candidates(
                &root,
                &RelativePath::parse("books").unwrap(),
                false,
                &CancellationToken::new(),
            )
            .unwrap_err()
            .code,
            ErrorCode::ResourceLimit
        );
        fs::remove_dir_all(root).unwrap();
    }
}
