//! Versioned transport contract shared with the React client.

use serde::{Deserialize, Serialize};

use crate::domain::{AppError, RequestId};

pub const API_VERSION: u16 = 1;
pub const MAX_CHANNEL_ITEMS: usize = 512;
pub const MAX_IMAGE_BYTES: u64 = 256 * 1024 * 1024;
pub const MAX_IMAGE_PIXELS: u64 = 120_000_000;
pub const MAX_ARCHIVE_ENTRIES: usize = 100_000;
pub const MAX_ARCHIVE_ENTRY_BYTES: u64 = 512 * 1024 * 1024;
pub const MAX_ARCHIVE_TOTAL_BYTES: u64 = 8 * 1024 * 1024 * 1024;
pub const MAX_NESTED_ARCHIVE_DEPTH: usize = 3;
pub const MAX_NESTED_ARCHIVES: usize = 64;
pub const MAX_NESTED_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Generation(pub u64);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestContext {
    pub api_version: u16,
    pub request_id: RequestId,
    pub generation: Generation,
}

impl RequestContext {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.api_version != API_VERSION {
            return Err(AppError {
                code: crate::domain::ErrorCode::InvalidRequest,
                message: format!(
                    "Unsupported API version {}; expected {API_VERSION}.",
                    self.api_version
                ),
                target: None,
                retryable: false,
            });
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "status"
)]
pub enum Response<T> {
    Ok {
        request_id: RequestId,
        generation: Generation,
        data: T,
    },
    Error {
        request_id: RequestId,
        generation: Generation,
        error: AppError,
    },
    Cancelled {
        request_id: RequestId,
        generation: Generation,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{ErrorCode, ItemId, ItemKind, LibraryItem, RelativePath};
    use serde_json::json;

    #[test]
    fn successful_response_matches_the_camel_case_tagged_contract() {
        let response = Response::Ok {
            request_id: RequestId::parse("request-1").unwrap(),
            generation: Generation(7),
            data: LibraryItem {
                id: ItemId::parse("item-1").unwrap(),
                name: "Volume 1".into(),
                relative_path: RelativePath::parse("Series/Volume 1").unwrap(),
                kind: ItemKind::ComicFolder,
            },
        };

        assert_eq!(
            serde_json::to_value(response).unwrap(),
            json!({
                "status": "ok",
                "requestId": "request-1",
                "generation": 7,
                "data": {
                    "id": "item-1",
                    "name": "Volume 1",
                    "relativePath": "Series/Volume 1",
                    "kind": "comicFolder"
                }
            })
        );
    }

    #[test]
    fn errors_and_cancellation_are_structurally_distinct() {
        let error: Response<()> = Response::Error {
            request_id: RequestId::parse("request-2").unwrap(),
            generation: Generation(8),
            error: AppError {
                code: ErrorCode::CorruptArchive,
                message: "Archive central directory is corrupt.".into(),
                target: Some(RelativePath::parse("broken.cbz").unwrap()),
                retryable: false,
            },
        };
        let cancelled: Response<()> = Response::Cancelled {
            request_id: RequestId::parse("request-2").unwrap(),
            generation: Generation(8),
        };

        assert_eq!(serde_json::to_value(error).unwrap()["status"], "error");
        assert_eq!(
            serde_json::to_value(cancelled).unwrap()["status"],
            "cancelled"
        );
    }
}
