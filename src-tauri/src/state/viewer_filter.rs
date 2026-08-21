use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::domain::{AppError, ErrorCode};

use super::StateStore;

const MAX_FILTER_SETS: i64 = 32;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerFilterSetRecord {
    pub id: i64,
    pub name: String,
    pub chain_json: String,
    pub active: bool,
    pub updated_at_ms: u64,
}

fn database_error(source: rusqlite::Error) -> AppError {
    AppError {
        code: ErrorCode::Internal,
        message: format!("Local viewer filter database operation failed: {source}"),
        target: None,
        retryable: true,
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

fn not_found() -> AppError {
    AppError {
        code: ErrorCode::NotFound,
        message: "Viewer filter set was not found.".into(),
        target: None,
        retryable: false,
    }
}

fn row_to_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<ViewerFilterSetRecord> {
    Ok(ViewerFilterSetRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        chain_json: row.get(2)?,
        active: row.get::<_, i64>(3)? != 0,
        updated_at_ms: row.get::<_, i64>(4)?.max(0) as u64,
    })
}

impl StateStore {
    pub fn list_viewer_filter_sets(&self) -> Result<Vec<ViewerFilterSetRecord>, AppError> {
        let mut statement = self.connection().prepare("SELECT id,name,chain_json,active,updated_at_ms FROM viewer_filter_sets ORDER BY updated_at_ms DESC,id DESC").map_err(database_error)?;
        statement
            .query_map([], row_to_record)
            .map_err(database_error)?
            .map(|row| row.map_err(database_error))
            .collect()
    }

    pub fn active_viewer_filter_set(&self) -> Result<Option<ViewerFilterSetRecord>, AppError> {
        self.connection().query_row("SELECT id,name,chain_json,active,updated_at_ms FROM viewer_filter_sets WHERE active=1", [], row_to_record).optional().map_err(database_error)
    }

    pub fn save_viewer_filter_set(
        &self,
        name: &str,
        chain_json: &str,
        overwrite: bool,
        now_ms: u64,
    ) -> Result<i64, AppError> {
        let existing = self
            .connection()
            .query_row(
                "SELECT id FROM viewer_filter_sets WHERE name=?1 COLLATE NOCASE",
                [name],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(database_error)?;
        if let Some(id) = existing {
            if !overwrite {
                return Err(conflict(
                    "A viewer filter set with that name already exists.",
                ));
            }
            self.connection().execute("UPDATE viewer_filter_sets SET name=?1,chain_json=?2,updated_at_ms=?3 WHERE id=?4", params![name,chain_json,now_ms,id]).map_err(database_error)?;
            return Ok(id);
        }
        let count = self
            .connection()
            .query_row("SELECT COUNT(*) FROM viewer_filter_sets", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(database_error)?;
        if count >= MAX_FILTER_SETS {
            return Err(AppError {
                code: ErrorCode::ResourceLimit,
                message: "Viewer filter sets are limited to 32.".into(),
                target: None,
                retryable: false,
            });
        }
        self.connection().execute("INSERT INTO viewer_filter_sets(name,chain_json,active,updated_at_ms) VALUES(?1,?2,0,?3)", params![name,chain_json,now_ms]).map_err(database_error)?;
        Ok(self.connection().last_insert_rowid())
    }

    pub fn activate_viewer_filter_set(&self, id: Option<i64>) -> Result<(), AppError> {
        let transaction = self
            .connection()
            .unchecked_transaction()
            .map_err(database_error)?;
        if let Some(id) = id {
            let exists = transaction
                .query_row(
                    "SELECT 1 FROM viewer_filter_sets WHERE id=?1",
                    [id],
                    |_row| Ok(()),
                )
                .optional()
                .map_err(database_error)?
                .is_some();
            if !exists {
                return Err(not_found());
            }
        }
        transaction
            .execute("UPDATE viewer_filter_sets SET active=0 WHERE active=1", [])
            .map_err(database_error)?;
        if let Some(id) = id {
            transaction
                .execute("UPDATE viewer_filter_sets SET active=1 WHERE id=?1", [id])
                .map_err(database_error)?;
        }
        transaction.commit().map_err(database_error)
    }

    pub fn delete_viewer_filter_set(&self, id: i64) -> Result<(), AppError> {
        if self
            .connection()
            .execute("DELETE FROM viewer_filter_sets WHERE id=?1", [id])
            .map_err(database_error)?
            == 0
        {
            return Err(not_found());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppPaths;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn req_ley_p5_002_filter_sets_are_bounded_durable_and_have_one_active() {
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let paths =
            AppPaths::under(std::env::temp_dir().join(format!("comic-explorer-filter-set-{id}")));
        let state = StateStore::open(&paths).unwrap().0;
        let first = state
            .save_viewer_filter_set("Scan", "[]", false, 1)
            .unwrap();
        let second = state
            .save_viewer_filter_set("Night", "[]", false, 2)
            .unwrap();
        assert_eq!(
            state
                .save_viewer_filter_set("scan", "[]", false, 3)
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        state.activate_viewer_filter_set(Some(first)).unwrap();
        state.activate_viewer_filter_set(Some(second)).unwrap();
        assert_eq!(
            state.active_viewer_filter_set().unwrap().unwrap().id,
            second
        );
        state
            .save_viewer_filter_set("night", "[1]", true, 4)
            .unwrap();
        drop(state);
        let state = StateStore::open(&paths).unwrap().0;
        assert_eq!(
            state
                .active_viewer_filter_set()
                .unwrap()
                .unwrap()
                .chain_json,
            "[1]"
        );
        state.delete_viewer_filter_set(second).unwrap();
        assert!(state.active_viewer_filter_set().unwrap().is_none());
        drop(state);
        fs::remove_dir_all(paths.root).unwrap();
    }
}
