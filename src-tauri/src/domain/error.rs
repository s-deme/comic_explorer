use serde::{Deserialize, Serialize};
use thiserror::Error;

use super::RelativePath;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    InvalidRequest,
    InvalidPath,
    OutsideLibraryRoot,
    NotFound,
    AccessDenied,
    UnsupportedFormat,
    CorruptImage,
    CorruptArchive,
    EncryptedArchive,
    ResourceLimit,
    Cancelled,
    Internal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Error)]
#[error("{code:?}: {message}")]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<RelativePath>,
    pub retryable: bool,
}

impl AppError {
    pub fn cancelled() -> Self {
        Self {
            code: ErrorCode::Cancelled,
            message: "The operation was cancelled.".into(),
            target: None,
            retryable: true,
        }
    }
}
