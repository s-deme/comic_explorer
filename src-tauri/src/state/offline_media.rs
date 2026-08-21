use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::domain::{AppError, ErrorCode};

use super::StateStore;

pub const MAX_OFFLINE_MEDIA: i64 = 64;
pub const MAX_OFFLINE_MEDIA_ENTRIES: usize = 50_000;
pub const MAX_OFFLINE_MEDIA_THUMBNAILS: usize = 256;
pub const MAX_OFFLINE_MEDIA_THUMBNAIL_BYTES: usize = 1024 * 1024;
pub const MAX_OFFLINE_MEDIA_TOTAL_THUMBNAIL_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineMediaRecord {
    pub id: i64,
    pub identity: String,
    pub name: String,
    pub source_subpath: String,
    pub volume_label: String,
    pub icon: String,
    pub filesystem: String,
    pub volume_serial: u32,
    pub scanned_at_ms: u64,
    pub entry_count: u32,
    pub thumbnail_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewOfflineMediaEntry {
    pub relative_path: String,
    pub parent_path: String,
    pub name: String,
    pub kind: String,
    pub size_bytes: u64,
    pub modified_ms: u64,
    pub sort_order: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OfflineMediaThumbnail {
    pub relative_path: String,
    pub jpeg: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineMediaSnapshot {
    pub media: Vec<OfflineMediaRecord>,
    pub entries: Vec<NewOfflineMediaEntry>,
}

fn database_error(source: rusqlite::Error) -> AppError {
    AppError {
        code: ErrorCode::Internal,
        message: format!("Local offline media database operation failed: {source}"),
        target: None,
        retryable: true,
    }
}

fn invalid(message: &str) -> AppError {
    AppError {
        code: ErrorCode::InvalidRequest,
        message: message.into(),
        target: None,
        retryable: false,
    }
}

fn conflict(message: &str) -> AppError {
    AppError {
        code: ErrorCode::Conflict,
        message: message.into(),
        target: None,
        retryable: false,
    }
}

fn validate_icon(icon: &str) -> Result<(), AppError> {
    if matches!(icon, "disc" | "removable" | "archive" | "star") {
        Ok(())
    } else {
        Err(invalid("Offline media icon preset is invalid."))
    }
}

fn row_to_media(row: &rusqlite::Row<'_>) -> rusqlite::Result<OfflineMediaRecord> {
    Ok(OfflineMediaRecord {
        id: row.get(0)?,
        identity: row.get(1)?,
        name: row.get(2)?,
        source_subpath: row.get(3)?,
        volume_label: row.get(4)?,
        icon: row.get(5)?,
        filesystem: row.get(6)?,
        volume_serial: row.get::<_, i64>(7)?.max(0) as u32,
        scanned_at_ms: row.get::<_, i64>(8)?.max(0) as u64,
        entry_count: row.get::<_, i64>(9)?.max(0) as u32,
        thumbnail_count: row.get::<_, i64>(10)?.max(0) as u32,
    })
}

impl StateStore {
    pub fn list_offline_media(&self) -> Result<Vec<OfflineMediaRecord>, AppError> {
        let mut statement = self
            .connection()
            .prepare(
                "SELECT id, identity, name, source_subpath, volume_label, icon, filesystem,
                    volume_serial, scanned_at_ms, entry_count, thumbnail_count
             FROM offline_media ORDER BY scanned_at_ms DESC, id DESC",
            )
            .map_err(database_error)?;
        statement
            .query_map([], row_to_media)
            .map_err(database_error)?
            .map(|row| row.map_err(database_error))
            .collect()
    }

    pub fn offline_media_snapshot(&self, media_id: i64) -> Result<OfflineMediaSnapshot, AppError> {
        let media = self
            .connection()
            .query_row(
                "SELECT id, identity, name, source_subpath, volume_label, icon, filesystem,
                    volume_serial, scanned_at_ms, entry_count, thumbnail_count
             FROM offline_media WHERE id=?1",
                [media_id],
                row_to_media,
            )
            .optional()
            .map_err(database_error)?
            .ok_or_else(|| AppError {
                code: ErrorCode::NotFound,
                message: "Offline media was not found.".into(),
                target: None,
                retryable: false,
            })?;
        let mut statement = self
            .connection()
            .prepare(
                "SELECT relative_path, parent_path, name, kind, size_bytes, modified_ms, sort_order
             FROM offline_media_entries WHERE media_id=?1
             ORDER BY parent_path, sort_order, relative_path COLLATE NOCASE",
            )
            .map_err(database_error)?;
        let entries = statement
            .query_map([media_id], |row| {
                Ok(NewOfflineMediaEntry {
                    relative_path: row.get(0)?,
                    parent_path: row.get(1)?,
                    name: row.get(2)?,
                    kind: row.get(3)?,
                    size_bytes: row.get::<_, i64>(4)?.max(0) as u64,
                    modified_ms: row.get::<_, i64>(5)?.max(0) as u64,
                    sort_order: row.get::<_, i64>(6)?.max(0) as u32,
                })
            })
            .map_err(database_error)?
            .map(|row| row.map_err(database_error))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(OfflineMediaSnapshot {
            media: vec![media],
            entries,
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub fn insert_offline_media(
        &self,
        identity: &str,
        name: &str,
        source_subpath: &str,
        volume_label: &str,
        icon: &str,
        filesystem: &str,
        volume_serial: u32,
        scanned_at_ms: u64,
        entries: &[NewOfflineMediaEntry],
        thumbnails: &[OfflineMediaThumbnail],
    ) -> Result<i64, AppError> {
        validate_icon(icon)?;
        if entries.len() > MAX_OFFLINE_MEDIA_ENTRIES
            || thumbnails.len() > MAX_OFFLINE_MEDIA_THUMBNAILS
        {
            return Err(invalid(
                "Offline media snapshot exceeds its bounded capacity.",
            ));
        }
        let thumbnail_bytes = thumbnails.iter().try_fold(0usize, |total, thumbnail| {
            if thumbnail.jpeg.is_empty() || thumbnail.jpeg.len() > MAX_OFFLINE_MEDIA_THUMBNAIL_BYTES
            {
                return Err(invalid("Offline media thumbnail exceeds 1 MiB."));
            }
            total
                .checked_add(thumbnail.jpeg.len())
                .ok_or_else(|| invalid("Offline media thumbnail total overflowed."))
        })?;
        if thumbnail_bytes > MAX_OFFLINE_MEDIA_TOTAL_THUMBNAIL_BYTES {
            return Err(invalid("Offline media thumbnails exceed 64 MiB."));
        }
        let transaction = self
            .connection()
            .unchecked_transaction()
            .map_err(database_error)?;
        let count = transaction
            .query_row("SELECT COUNT(*) FROM offline_media", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(database_error)?;
        if count >= MAX_OFFLINE_MEDIA {
            return Err(invalid("Offline media registrations are limited to 64."));
        }
        transaction.execute(
            "INSERT INTO offline_media(identity,name,source_subpath,volume_label,icon,filesystem,volume_serial,scanned_at_ms,entry_count,thumbnail_count)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![identity,name,source_subpath,volume_label,icon,filesystem,volume_serial,scanned_at_ms,entries.len() as i64,thumbnails.len() as i64],
        ).map_err(|error| match error { rusqlite::Error::SqliteFailure(_, _) => conflict("This volume snapshot is already registered; implicit update is disabled."), other => database_error(other) })?;
        let media_id = transaction.last_insert_rowid();
        for entry in entries {
            let has_thumbnail = thumbnails
                .iter()
                .any(|thumbnail| thumbnail.relative_path == entry.relative_path);
            transaction.execute(
                "INSERT INTO offline_media_entries(media_id,relative_path,parent_path,name,kind,size_bytes,modified_ms,has_thumbnail,sort_order)
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![media_id,entry.relative_path,entry.parent_path,entry.name,entry.kind,entry.size_bytes,entry.modified_ms,has_thumbnail as i64,entry.sort_order],
            ).map_err(database_error)?;
        }
        for thumbnail in thumbnails {
            transaction.execute(
                "INSERT INTO offline_media_thumbnails(media_id,relative_path,jpeg,width,height) VALUES(?1,?2,?3,?4,?5)",
                params![media_id,thumbnail.relative_path,thumbnail.jpeg,thumbnail.width,thumbnail.height],
            ).map_err(database_error)?;
        }
        transaction.commit().map_err(database_error)?;
        Ok(media_id)
    }

    pub fn delete_offline_media(&self, media_id: i64) -> Result<(), AppError> {
        if self
            .connection()
            .execute("DELETE FROM offline_media WHERE id=?1", [media_id])
            .map_err(database_error)?
            == 0
        {
            return Err(AppError {
                code: ErrorCode::NotFound,
                message: "Offline media was not found.".into(),
                target: None,
                retryable: false,
            });
        }
        Ok(())
    }

    pub fn set_offline_media_icon(&self, media_id: i64, icon: &str) -> Result<(), AppError> {
        validate_icon(icon)?;
        if self
            .connection()
            .execute(
                "UPDATE offline_media SET icon=?1 WHERE id=?2",
                params![icon, media_id],
            )
            .map_err(database_error)?
            == 0
        {
            return Err(AppError {
                code: ErrorCode::NotFound,
                message: "Offline media was not found.".into(),
                target: None,
                retryable: false,
            });
        }
        Ok(())
    }

    pub fn offline_media_thumbnail(
        &self,
        media_id: i64,
        relative_path: &str,
    ) -> Result<Option<OfflineMediaThumbnail>, AppError> {
        self.connection().query_row(
            "SELECT relative_path,jpeg,width,height FROM offline_media_thumbnails WHERE media_id=?1 AND relative_path=?2",
            params![media_id, relative_path], |row| Ok(OfflineMediaThumbnail { relative_path: row.get(0)?, jpeg: row.get(1)?, width: row.get::<_, i64>(2)?.max(0) as u32, height: row.get::<_, i64>(3)?.max(0) as u32 }),
        ).optional().map_err(database_error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppPaths;
    use std::fs;
    use std::time::{Instant, SystemTime, UNIX_EPOCH};

    fn store(label: &str) -> (StateStore, AppPaths) {
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let paths = AppPaths::under(
            std::env::temp_dir().join(format!("comic-explorer-offline-media-{label}-{id}")),
        );
        (StateStore::open(&paths).unwrap().0, paths)
    }

    fn entry(path: &str) -> NewOfflineMediaEntry {
        NewOfflineMediaEntry {
            relative_path: path.into(),
            parent_path: "".into(),
            name: path.into(),
            kind: "image".into(),
            size_bytes: 10,
            modified_ms: 20,
            sort_order: 0,
        }
    }

    #[test]
    fn req_ley_p5_001_snapshot_is_atomic_persistent_and_duplicate_safe() {
        let (state, paths) = store("round-trip");
        let thumbnail = OfflineMediaThumbnail {
            relative_path: "a.jpg".into(),
            jpeg: vec![1, 2, 3],
            width: 1,
            height: 1,
        };
        let id = state
            .insert_offline_media(
                "NTFS:42",
                "Disc",
                "Books",
                "LABEL",
                "disc",
                "NTFS",
                42,
                30,
                &[entry("a.jpg")],
                &[thumbnail.clone()],
            )
            .unwrap();
        assert_eq!(state.offline_media_snapshot(id).unwrap().entries.len(), 1);
        assert_eq!(
            state.offline_media_thumbnail(id, "a.jpg").unwrap(),
            Some(thumbnail)
        );
        assert_eq!(
            state
                .insert_offline_media(
                    "NTFS:42",
                    "Again",
                    "Books",
                    "LABEL",
                    "disc",
                    "NTFS",
                    42,
                    31,
                    &[],
                    &[]
                )
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        drop(state);
        assert_eq!(
            StateStore::open(&paths)
                .unwrap()
                .0
                .list_offline_media()
                .unwrap()
                .len(),
            1
        );
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn req_ley_p5_001_invalid_thumbnail_rolls_back_and_icons_are_bounded() {
        let (state, paths) = store("limits");
        let too_large = OfflineMediaThumbnail {
            relative_path: "a.jpg".into(),
            jpeg: vec![0; MAX_OFFLINE_MEDIA_THUMBNAIL_BYTES + 1],
            width: 1,
            height: 1,
        };
        assert!(
            state
                .insert_offline_media(
                    "NTFS:43",
                    "Disc",
                    "",
                    "",
                    "disc",
                    "NTFS",
                    43,
                    30,
                    &[entry("a.jpg")],
                    &[too_large]
                )
                .is_err()
        );
        assert!(state.list_offline_media().unwrap().is_empty());
        assert!(
            state
                .insert_offline_media(
                    "NTFS:44",
                    "Disc",
                    "",
                    "",
                    "custom",
                    "NTFS",
                    44,
                    30,
                    &[],
                    &[]
                )
                .is_err()
        );
        assert!(state.list_offline_media().unwrap().is_empty());
        let mut invalid = entry("broken.bin");
        invalid.kind = "invalid".into();
        assert!(
            state
                .insert_offline_media(
                    "NTFS:45",
                    "Disc",
                    "",
                    "",
                    "disc",
                    "NTFS",
                    45,
                    30,
                    &[entry("valid.jpg"), invalid],
                    &[],
                )
                .is_err()
        );
        assert!(state.list_offline_media().unwrap().is_empty());
        drop(state);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn req_ley_p5_001_fifty_thousand_entry_transaction_is_bounded() {
        let (state, paths) = store("performance");
        let entries = (0..MAX_OFFLINE_MEDIA_ENTRIES)
            .map(|index| NewOfflineMediaEntry {
                relative_path: format!("folder/{index:05}.jpg"),
                parent_path: "folder".into(),
                name: format!("{index:05}.jpg"),
                kind: "image".into(),
                size_bytes: index as u64,
                modified_ms: 20,
                sort_order: index as u32,
            })
            .collect::<Vec<_>>();
        let started = Instant::now();
        let id = state
            .insert_offline_media(
                "NTFS:46",
                "Large",
                "",
                "",
                "archive",
                "NTFS",
                46,
                30,
                &entries,
                &[],
            )
            .unwrap();
        let elapsed = started.elapsed();
        eprintln!(
            "offline-media-50000-entry-transaction-ms={}",
            elapsed.as_millis()
        );
        assert_eq!(
            state.offline_media_snapshot(id).unwrap().entries.len(),
            50_000
        );
        drop(state);
        fs::remove_dir_all(paths.root).unwrap();
    }
}
