use std::fs;

use serde::Serialize;

use crate::api::{MAX_IMAGE_BYTES, RequestContext, Response};
use crate::catalog::{
    ArchiveVirtualEntry, enumerate_archive_virtual_tree, read_archive_page_cover,
};
use crate::domain::{AppError, ErrorCode, PageId, RelativePath};
use crate::media::{MediaGrant, PageSource, media_uri};

use super::{
    AppState, ClipboardImageResult, OpenItemKind, ThumbnailPriority, contained_library_path,
    decode_clipboard_bgra, error_response, file_operations, open_item_kind, read_page_bytes,
    request_error, resolve_thumbnail_cover, unix_millis, validate_request, viewer_page_grant,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveVirtualTreeSnapshot {
    pub archive_relative_path: RelativePath,
    pub entries: Vec<ArchiveVirtualEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveThumbnailResponse {
    pub archive_relative_path: RelativePath,
    pub page_key: RelativePath,
    pub content_hash: String,
    pub media_uri: String,
    pub cache_hit: bool,
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

fn decode_archive_page_clipboard(
    root: &std::path::Path,
    archive_relative: &RelativePath,
    page: &RelativePath,
) -> Result<(u32, u32, Vec<u8>), AppError> {
    validate_archive_target(root, archive_relative)?;
    let grant = viewer_page_grant(root, archive_relative, page)?;
    let (_, bytes) = read_page_bytes(&grant, page)?;
    decode_clipboard_bgra(&bytes)
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

#[tauri::command]
pub async fn get_archive_thumbnail(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    archive_relative_path: String,
    page_key: String,
    priority: ThumbnailPriority,
) -> Result<Response<ArchiveThumbnailResponse>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let archive_relative = match RelativePath::parse(archive_relative_path) {
        Ok(value) if !value.as_str().is_empty() => value,
        _ => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::InvalidPath, "Archive path is invalid."),
            ));
        }
    };
    let page = match RelativePath::parse(page_key) {
        Ok(value) if !value.as_str().is_empty() => value,
        _ => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::InvalidPath, "Archive page key is invalid."),
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
    if let Err(error) = validate_archive_target(&root, &archive_relative) {
        return Ok(error_response(&context, error));
    }

    let cancellation = state
        .navigation
        .lock()
        .map_err(|_| "state poisoned")?
        .cancellation_for(context.generation);
    let pipelines = state.thumbnails.clone();
    let stores = state.store.clone();
    let thumbnail_pins = state.thumbnail_pins.clone();
    let worker_root = root.clone();
    let worker_archive = archive_relative.clone();
    let worker_page = page.clone();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    if state
        .thumbnail_workers
        .submit(priority.into(), cancellation.clone(), move || {
            let result = read_archive_page_cover(&worker_root, &worker_archive, &worker_page)
                .and_then(|cover| {
                    resolve_thumbnail_cover(&pipelines, &stores, cover, unix_millis())
                });
            if cancellation.is_cancelled() {
                if let Ok(thumbnail) = &result {
                    thumbnail_pins.unpin(&thumbnail.content_hash);
                }
            } else {
                let _ = sender.send(result);
            }
        })
        .is_err()
    {
        return Ok(Response::Cancelled {
            request_id: context.request_id,
            generation: context.generation,
        });
    }
    let result = match receiver.await {
        Ok(result) => result,
        Err(_) => {
            return Ok(Response::Cancelled {
                request_id: context.request_id,
                generation: context.generation,
            });
        }
    };
    if !state
        .navigation
        .lock()
        .map_err(|_| "state poisoned")?
        .is_current(context.generation)
    {
        if let Ok(thumbnail) = &result {
            state.thumbnail_pins.unpin(&thumbnail.content_hash);
        }
        return Ok(Response::Cancelled {
            request_id: context.request_id,
            generation: context.generation,
        });
    }
    let thumbnail = match result {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let page_id = PageId::parse(format!("archive-thumbnail-{}", thumbnail.content_hash))
        .map_err(str::to_string)?;
    let token = state
        .media
        .lock()
        .map_err(|_| "state poisoned")?
        .issue(MediaGrant {
            page_id,
            mime_type: "image/jpeg",
            max_bytes: MAX_IMAGE_BYTES,
            source: PageSource::File(thumbnail.path),
        });
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: ArchiveThumbnailResponse {
            archive_relative_path: archive_relative,
            page_key: page,
            content_hash: thumbnail.content_hash,
            media_uri: media_uri(&token),
            cache_hit: thumbnail.cache_hit,
        },
    })
}

#[tauri::command]
pub async fn copy_archive_page_to_clipboard(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    archive_relative_path: String,
    page_key: String,
) -> Result<Response<ClipboardImageResult>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let archive_relative = match RelativePath::parse(archive_relative_path) {
        Ok(value) if !value.as_str().is_empty() => value,
        _ => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::InvalidPath, "Archive path is invalid."),
            ));
        }
    };
    let page = match RelativePath::parse(page_key) {
        Ok(value) if !value.as_str().is_empty() => value,
        _ => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::InvalidPath, "Archive page key is invalid."),
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
    let worker_archive = archive_relative.clone();
    let worker_page = page.clone();
    let decoded = tauri::async_runtime::spawn_blocking(move || {
        decode_archive_page_clipboard(&root, &worker_archive, &worker_page)
    })
    .await
    .map_err(|error| format!("archive image clipboard decode worker failed: {error}"))?;
    let (width, height, bgra) = match decoded {
        Ok(decoded) => decoded,
        Err(error) => return Ok(error_response(&context, error)),
    };
    if !state
        .navigation
        .lock()
        .map_err(|_| "state poisoned")?
        .is_current(context.generation)
    {
        return Ok(Response::Cancelled {
            request_id: context.request_id,
            generation: context.generation,
        });
    }
    let payload_bytes = match tauri::async_runtime::spawn_blocking(move || {
        file_operations::write_image_clipboard(width, height, &bgra)
    })
    .await
    .map_err(|error| format!("archive image clipboard worker failed: {error}"))?
    {
        Ok(bytes) => bytes,
        Err(error) => return Ok(error_response(&context, error)),
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: ClipboardImageResult {
            page_relative_path: page,
            width,
            height,
            payload_bytes,
        },
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::{Cursor, Write};
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

    #[cfg(target_os = "windows")]
    #[test]
    fn req_ley_p4_002_decodes_one_archive_page_for_the_image_clipboard() {
        use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let temporary = std::env::temp_dir().join(format!(
            "comic-explorer-archive-clipboard-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&temporary).unwrap();
        let archive = temporary.join("book.cbz");
        let image =
            DynamicImage::ImageRgba8(ImageBuffer::from_pixel(3, 2, Rgba([10, 20, 30, 200])));
        let mut png = Cursor::new(Vec::new());
        image.write_to(&mut png, ImageFormat::Png).unwrap();
        let mut writer = ZipWriter::new(fs::File::create(&archive).unwrap());
        writer
            .start_file("chapter/1.png", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(&png.into_inner()).unwrap();
        writer.finish().unwrap();
        let original = fs::read(&archive).unwrap();

        let (width, height, bgra) = decode_archive_page_clipboard(
            &temporary,
            &RelativePath::parse("book.cbz").unwrap(),
            &RelativePath::parse("chapter/1.png").unwrap(),
        )
        .unwrap();

        assert_eq!((width, height), (3, 2));
        assert_eq!(bgra.len(), 3 * 2 * 4);
        assert_eq!(fs::read(&archive).unwrap(), original);
        assert!(
            decode_archive_page_clipboard(
                &temporary,
                &RelativePath::parse("book.cbz").unwrap(),
                &RelativePath::parse("chapter/missing.png").unwrap(),
            )
            .is_err()
        );
        fs::remove_dir_all(temporary).unwrap();
    }
}
