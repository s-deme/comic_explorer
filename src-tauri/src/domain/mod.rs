//! Core types that do not depend on Tauri, storage, or filesystem adapters.

mod error;
mod id;
mod path;

pub use error::{AppError, ErrorCode};
pub use id::{ItemId, PageId, RequestId};
pub use path::RelativePath;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ItemKind {
    Folder,
    ComicFolder,
    Archive,
    Page,
    Unsupported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImageFormat {
    Jpeg,
    Png,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub id: PageId,
    pub item_id: ItemId,
    pub relative_path: RelativePath,
    pub format: ImageFormat,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub id: ItemId,
    pub name: String,
    pub relative_path: RelativePath,
    pub kind: ItemKind,
}
