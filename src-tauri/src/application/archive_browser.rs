use std::fs;

use serde::Serialize;

use crate::api::{RequestContext, Response};
use crate::catalog::{ArchiveVirtualEntry, enumerate_archive_virtual_tree};
use crate::domain::{AppError, ErrorCode, RelativePath};

use super::{
    AppState, OpenItemKind, contained_library_path, error_response, open_item_kind, request_error,
    validate_request,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveVirtualTreeSnapshot {
    pub archive_relative_path: RelativePath,
    pub entries: Vec<ArchiveVirtualEntry>,
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

fn validate_archive_target(
    root: &std::path::Path,
    archive_relative_path: &RelativePath,
) -> Result<std::path::PathBuf, AppError> {
    let source = root.join(archive_relative_path.as_str());
    let metadata = fs::symlink_metadata(&source).map_err(|error| AppError {
        code: if error.kind() == std::io::ErrorKind::NotFound {
            ErrorCode::NotFound
        } else if error.kind() == std::io::ErrorKind::PermissionDenied {
            ErrorCode::AccessDenied
        } else {
            ErrorCode::InvalidPath
        },
        message: "The archive is unavailable.".into(),
        target: Some(archive_relative_path.clone()),
        retryable: true,
    })?;
    if !metadata.is_file() || metadata_is_reparse_point(&metadata) {
        return Err(AppError {
            code: ErrorCode::InvalidPath,
            message: "The archive must be a regular non-reparse file.".into(),
            target: Some(archive_relative_path.clone()),
            retryable: false,
        });
    }
    let canonical = contained_library_path(root, archive_relative_path)?;
    if open_item_kind(&canonical, archive_relative_path)? != OpenItemKind::Archive {
        return Err(AppError {
            code: ErrorCode::UnsupportedFormat,
            message: "The selected item is not a supported archive.".into(),
            target: Some(archive_relative_path.clone()),
            retryable: false,
        });
    }
    Ok(canonical)
}

#[tauri::command]
pub async fn list_archive_virtual_tree(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    archive_relative_path: String,
) -> Result<Response<ArchiveVirtualTreeSnapshot>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let relative = match RelativePath::parse(archive_relative_path) {
        Ok(value) if !value.as_str().is_empty() => value,
        _ => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::InvalidPath, "Archive path is invalid."),
            ));
        }
    };
    let root = match state
        .library_root
        .lock()
        .map_err(|_| "state poisoned")?
        .clone()
    {
        Some(value) => value,
        None => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::InvalidRequest, "Library root is not configured."),
            ));
        }
    };
    let archive = match validate_archive_target(&root, &relative) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let result = tauri::async_runtime::spawn_blocking(move || {
        enumerate_archive_virtual_tree(&archive).map(|entries| ArchiveVirtualTreeSnapshot {
            archive_relative_path: relative,
            entries,
        })
    })
    .await
    .map_err(|error| format!("archive tree worker failed: {error}"))?;
    Ok(match result {
        Ok(data) => Response::Ok {
            request_id: context.request_id,
            generation: context.generation,
            data,
        },
        Err(error) => error_response(&context, error),
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};

    use zip::ZipWriter;
    use zip::write::SimpleFileOptions;

    use super::*;

    #[test]
    fn req_ley_p4_002_validates_only_contained_regular_archives() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let temporary = std::env::temp_dir().join(format!(
            "comic-explorer-archive-browser-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&temporary).unwrap();
        let archive = temporary.join("book.cbz");
        let mut writer = ZipWriter::new(fs::File::create(&archive).unwrap());
        writer
            .start_file("1.png", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"image").unwrap();
        writer.finish().unwrap();

        let relative = RelativePath::parse("book.cbz").unwrap();
        assert_eq!(
            validate_archive_target(&temporary, &relative).unwrap(),
            archive.canonicalize().unwrap()
        );
        assert!(
            validate_archive_target(&temporary, &RelativePath::parse("missing.cbz").unwrap())
                .is_err()
        );
        fs::write(temporary.join("note.txt"), b"text").unwrap();
        assert!(
            validate_archive_target(&temporary, &RelativePath::parse("note.txt").unwrap()).is_err()
        );
        fs::remove_dir_all(temporary).unwrap();
    }
}
