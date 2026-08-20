use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::domain::{AppError, ErrorCode};
use crate::domain::{FileKind, classify_file_name};

pub fn display_path(path: &Path) -> String {
    let raw = path.to_string_lossy();
    if let Some(path) = raw.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{path}");
    }
    raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_owned()
}

#[cfg(target_os = "windows")]
pub fn logical_drive_roots() -> Result<Vec<PathBuf>, AppError> {
    use windows::Win32::Storage::FileSystem::GetLogicalDrives;

    let mask = unsafe { GetLogicalDrives() };
    if mask == 0 {
        return Err(AppError {
            code: ErrorCode::Internal,
            message: "Windowsのドライブ一覧を取得できませんでした。".into(),
            target: None,
            retryable: true,
        });
    }
    Ok(drive_roots_from_mask(mask))
}

#[cfg(target_os = "windows")]
pub fn drive_display_name(root: &Path) -> String {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Storage::FileSystem::{GetDriveTypeW, GetVolumeInformationW};
    use windows::core::PCWSTR;

    let wide: Vec<u16> = root.as_os_str().encode_wide().chain(Some(0)).collect();
    let root_path = PCWSTR::from_raw(wide.as_ptr());
    let mut volume_name = [0u16; 261];
    let volume =
        unsafe { GetVolumeInformationW(root_path, Some(&mut volume_name), None, None, None, None) }
            .ok()
            .and_then(|_| {
                let length = volume_name.iter().position(|character| *character == 0)?;
                (length > 0).then(|| String::from_utf16_lossy(&volume_name[..length]))
            });
    let kind = volume.unwrap_or_else(|| match unsafe { GetDriveTypeW(root_path) } {
        2 => "リムーバブル ディスク".into(),
        3 => "ローカル ディスク".into(),
        4 => "ネットワーク ドライブ".into(),
        5 => "DVD ドライブ".into(),
        6 => "RAM ディスク".into(),
        _ => "ドライブ".into(),
    });
    let drive = display_path(root).trim_end_matches('\\').to_owned();
    format!("{kind} ({drive})")
}

fn drive_roots_from_mask(mask: u32) -> Vec<PathBuf> {
    (0..26)
        .filter(|index| mask & (1 << index) != 0)
        .map(|index| PathBuf::from(format!("{}:\\", (b'A' + index as u8) as char)))
        .collect()
}

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

pub fn validate_library_file(requested: &Path) -> Result<PathBuf, AppError> {
    let canonical = requested
        .canonicalize()
        .map_err(|error| path_error(requested, error))?;
    if !canonical.is_file() {
        return Err(AppError {
            code: ErrorCode::InvalidPath,
            message: "選択したパスはファイルではありません。".into(),
            target: None,
            retryable: false,
        });
    }
    let name = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if classify_file_name(name) == FileKind::Unsupported {
        return Err(AppError {
            code: ErrorCode::UnsupportedFormat,
            message: "選択したファイル形式には対応していません。".into(),
            target: None,
            retryable: false,
        });
    }
    fs::File::open(&canonical).map_err(|error| path_error(&canonical, error))?;
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
pub fn pick_supported_file() -> Result<Option<PathBuf>, AppError> {
    use windows::Win32::System::Com::{
        CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
        CoTaskMemFree, CoUninitialize,
    };
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{
        FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, FOS_PATHMUSTEXIST, FileOpenDialog, IFileOpenDialog,
        SIGDN_FILESYSPATH,
    };
    use windows::core::{HRESULT, PCWSTR};

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
                .SetOptions(options | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST | FOS_FILEMUSTEXIST)
                .map_err(picker_error)?;
            let label: Vec<u16> = "対応する漫画・画像\0".encode_utf16().collect();
            let pattern: Vec<u16> = "*.bmp;*.jpg;*.jpeg;*.png;*.webp;*.gif;*.tif;*.tiff;*.ico;*.svg;*.avif;*.zip;*.cbz;*.epub;*.rar;*.cbr;*.7z;*.cb7;*.lzh;*.lha;*.pdf\0"
                .encode_utf16().collect();
            let filters = [COMDLG_FILTERSPEC {
                pszName: PCWSTR(label.as_ptr()),
                pszSpec: PCWSTR(pattern.as_ptr()),
            }];
            dialog.SetFileTypes(&filters).map_err(picker_error)?;
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
pub fn windows_known_folders() -> Vec<(&'static str, &'static str, PathBuf)> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{
        FOLDERID_Desktop, FOLDERID_Documents, FOLDERID_Downloads, FOLDERID_Pictures,
        KF_FLAG_DEFAULT, SHGetKnownFolderPath,
    };

    [
        ("desktop", "デスクトップ", FOLDERID_Desktop),
        ("downloads", "ダウンロード", FOLDERID_Downloads),
        ("documents", "ドキュメント", FOLDERID_Documents),
        ("pictures", "ピクチャ", FOLDERID_Pictures),
    ]
    .into_iter()
    .filter_map(|(id, name, folder_id)| unsafe {
        let value = SHGetKnownFolderPath(&folder_id, KF_FLAG_DEFAULT, None).ok()?;
        let path = value.to_string().ok().map(PathBuf::from);
        CoTaskMemFree(Some(value.0.cast()));
        let canonical = path?.canonicalize().ok()?;
        canonical.is_dir().then_some((id, name, canonical))
    })
    .collect()
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
    fn hides_windows_extended_length_prefixes_from_display_paths() {
        assert_eq!(
            display_path(Path::new(r"\\?\D:\bit\dl_comp")),
            r"D:\bit\dl_comp"
        );
        assert_eq!(
            display_path(Path::new(r"\\?\UNC\server\share\comic")),
            r"\\server\share\comic"
        );
        assert_eq!(display_path(Path::new(r"C:\Comics")), r"C:\Comics");
    }

    #[test]
    fn expands_the_windows_logical_drive_bitmask_in_letter_order() {
        assert_eq!(
            drive_roots_from_mask((1 << 2) | (1 << 4)),
            vec![PathBuf::from(r"C:\"), PathBuf::from(r"E:\")]
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn resolves_only_supported_existing_windows_known_folders() {
        let folders = windows_known_folders();
        let allowed = ["desktop", "downloads", "documents", "pictures"];
        for (id, name, path) in folders {
            assert!(allowed.contains(&id));
            assert!(!name.is_empty());
            assert!(path.is_absolute());
            assert!(path.is_dir());
            assert_eq!(path, path.canonicalize().unwrap());
        }
    }

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

    #[test]
    fn validates_supported_regular_files_and_rejects_unsupported_files() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-file-picker-validation-{}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        let supported = root.join("book.CBZ");
        let unsupported = root.join("notes.txt");
        fs::write(&supported, b"fixture").unwrap();
        fs::write(&unsupported, b"fixture").unwrap();
        assert_eq!(
            validate_library_file(&supported).unwrap(),
            supported.canonicalize().unwrap()
        );
        assert_eq!(
            validate_library_file(&unsupported).unwrap_err().code,
            ErrorCode::UnsupportedFormat
        );
        assert_eq!(
            validate_library_file(&root).unwrap_err().code,
            ErrorCode::InvalidPath
        );
        fs::remove_dir_all(root).unwrap();
    }
}
