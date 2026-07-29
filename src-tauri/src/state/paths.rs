use std::path::{Path, PathBuf};

use crate::domain::{AppError, ErrorCode};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppPaths {
    pub root: PathBuf,
    pub database: PathBuf,
    pub cache: PathBuf,
    pub temp: PathBuf,
    pub recovery: PathBuf,
}

impl AppPaths {
    pub fn discover() -> Result<Self, AppError> {
        let local_app_data = std::env::var_os("LOCALAPPDATA").ok_or_else(|| AppError {
            code: ErrorCode::InvalidPath,
            message: "LOCALAPPDATA is unavailable.".into(),
            target: None,
            retryable: false,
        })?;
        Ok(Self::under(
            PathBuf::from(local_app_data).join("ComicExplorer"),
        ))
    }

    pub fn under(root: PathBuf) -> Self {
        Self {
            database: root.join("state.sqlite3"),
            cache: root.join("cache/v1"),
            temp: root.join("temp"),
            recovery: root.join("recovery"),
            root,
        }
    }

    pub fn create(&self, library_root: Option<&Path>) -> Result<(), AppError> {
        if let Some(library_root) = library_root {
            let library_root = library_root.canonicalize().map_err(|source| AppError {
                code: ErrorCode::InvalidPath,
                message: format!("Cannot resolve library root: {source}"),
                target: None,
                retryable: true,
            })?;
            let app_root = absolute_without_requiring_existence(&self.root)?;
            if app_root.starts_with(&library_root) || library_root.starts_with(&app_root) {
                return Err(AppError {
                    code: ErrorCode::InvalidPath,
                    message: "Application data and library roots must be separate.".into(),
                    target: None,
                    retryable: false,
                });
            }
        }
        for directory in [&self.root, &self.cache, &self.temp, &self.recovery] {
            std::fs::create_dir_all(directory).map_err(|source| AppError {
                code: ErrorCode::AccessDenied,
                message: format!("Cannot create {}: {source}", directory.display()),
                target: None,
                retryable: true,
            })?;
        }
        Ok(())
    }
}

fn absolute_without_requiring_existence(path: &Path) -> Result<PathBuf, AppError> {
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        std::env::current_dir()
            .map(|current| current.join(path))
            .map_err(|source| AppError {
                code: ErrorCode::InvalidPath,
                message: format!("Cannot resolve application data root: {source}"),
                target: None,
                retryable: false,
            })
    }
}
