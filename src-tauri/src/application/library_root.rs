use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::domain::{AppError, ErrorCode};

pub fn validate_library_root(requested: &Path) -> Result<PathBuf, AppError> {
    let canonical = requested
        .canonicalize()
        .map_err(|error| path_error(requested, error))?;
    if !canonical.is_dir() {
        return Err(AppError {
            code: ErrorCode::InvalidPath,
            message: "選択したパスはフォルダではありません。".into(),
            target: None,
            retryable: false,
        });
    }

    // Opening the directory verifies more than metadata alone on Windows: an
    // ACL may permit resolving the path while denying directory enumeration.
    let mut entries = fs::read_dir(&canonical).map_err(|error| path_error(&canonical, error))?;
    if let Some(entry) = entries.next() {
        entry.map_err(|error| path_error(&canonical, error))?;
    }
    Ok(canonical)
}

fn path_error(path: &Path, error: io::Error) -> AppError {
    let (code, message, retryable) = match error.kind() {
        io::ErrorKind::NotFound => (
            ErrorCode::NotFound,
            "選択したフォルダが見つかりません。移動または削除された可能性があります。",
            true,
        ),
        io::ErrorKind::PermissionDenied => (
            ErrorCode::AccessDenied,
            "選択したフォルダへアクセスできません。権限を確認してください。",
            true,
        ),
        _ => (
            ErrorCode::InvalidPath,
            "選択したフォルダを読み取れません。",
            true,
        ),
    };
    AppError {
        code,
        message: format!("{message} ({})", path.display()),
        target: None,
        retryable,
    }
}

#[cfg(target_os = "windows")]
pub fn pick_folder() -> Result<Option<PathBuf>, AppError> {
    use windows::Win32::System::Com::{
        CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
        CoTaskMemFree, CoUninitialize,
    };
    use windows::Win32::UI::Shell::{
        FOS_FORCEFILESYSTEM, FOS_PATHMUSTEXIST, FOS_PICKFOLDERS, FileOpenDialog, IFileOpenDialog,
        SIGDN_FILESYSPATH,
    };
    use windows::core::HRESULT;

    const CANCELLED: HRESULT = HRESULT(0x800704C7_u32 as i32);
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .ok()
            .map_err(picker_error)?;
        let result = (|| {
            let dialog: IFileOpenDialog =
                CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
                    .map_err(picker_error)?;
            let options = dialog.GetOptions().map_err(picker_error)?;
            dialog
                .SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST)
                .map_err(picker_error)?;
            if let Err(error) = dialog.Show(None) {
                return if error.code() == CANCELLED {
                    Ok(None)
                } else {
                    Err(picker_error(error))
                };
            }
            let item = dialog.GetResult().map_err(picker_error)?;
            let display_name = item
                .GetDisplayName(SIGDN_FILESYSPATH)
                .map_err(picker_error)?;
            let path = display_name
                .to_string()
                .map(PathBuf::from)
                .map_err(picker_error);
            CoTaskMemFree(Some(display_name.0.cast()));
            path.map(Some)
        })();
        CoUninitialize();
        result
    }
}

#[cfg(target_os = "windows")]
fn picker_error(error: impl std::fmt::Display) -> AppError {
    AppError {
        code: ErrorCode::Internal,
        message: format!("Windowsのフォルダ選択画面を開けませんでした: {error}"),
        target: None,
        retryable: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonicalizes_and_accepts_a_readable_directory() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-root-validation-{}",
            std::process::id()
        ));
        fs::create_dir_all(root.join("child")).unwrap();
        assert_eq!(
            validate_library_root(&root.join("child").join("..")).unwrap(),
            root.canonicalize().unwrap()
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_missing_paths_and_regular_files() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-root-invalid-{}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("page.jpg");
        fs::write(&file, b"not an image").unwrap();
        assert_eq!(
            validate_library_root(&file).unwrap_err().code,
            ErrorCode::InvalidPath
        );
        assert_eq!(
            validate_library_root(&root.join("missing"))
                .unwrap_err()
                .code,
            ErrorCode::NotFound
        );
        fs::remove_dir_all(root).unwrap();
    }
}
