//! Domain-specific SQLite operations behind the StateStore connection boundary.

use super::*;

impl StateStore {
    pub fn list_external_apps(&self) -> Result<Vec<ExternalAppRecord>, AppError> {
        let mut statement = self.connection.prepare(
            "SELECT id, display_name, executable_path, fixed_args_json, target_mode, updated_at_ms
             FROM external_apps ORDER BY display_name COLLATE NOCASE ASC, id ASC LIMIT ?1",
        ).map_err(database_error)?;
        let rows = statement
            .query_map([MAX_EXTERNAL_APPS], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                ))
            })
            .map_err(database_error)?;
        rows.map(|row| {
            let (id, display_name, executable_path, fixed_args_json, target_mode, updated_at_ms) =
                row.map_err(database_error)?;
            let fixed_args = serde_json::from_str::<Vec<String>>(&fixed_args_json)
                .map_err(|_| invalid_stored_external_app())?;
            Ok(ExternalAppRecord {
                id,
                display_name,
                executable_path,
                fixed_args,
                target_mode,
                updated_at_ms: updated_at_ms.max(0) as u64,
            })
        })
        .collect()
    }

    pub fn external_app(&self, id: i64) -> Result<Option<ExternalAppRecord>, AppError> {
        let row = self.connection.query_row(
            "SELECT id, display_name, executable_path, fixed_args_json, target_mode, updated_at_ms
             FROM external_apps WHERE id=?1",
            [id],
            |row| Ok((
                row.get::<_, i64>(0)?, row.get::<_, String>(1)?,
                row.get::<_, String>(2)?, row.get::<_, String>(3)?,
                row.get::<_, String>(4)?, row.get::<_, i64>(5)?,
            )),
        ).optional().map_err(database_error)?;
        row.map(
            |(id, display_name, executable_path, fixed_args_json, target_mode, updated_at_ms)| {
                let fixed_args = serde_json::from_str::<Vec<String>>(&fixed_args_json)
                    .map_err(|_| invalid_stored_external_app())?;
                Ok(ExternalAppRecord {
                    id,
                    display_name,
                    executable_path,
                    fixed_args,
                    target_mode,
                    updated_at_ms: updated_at_ms.max(0) as u64,
                })
            },
        )
        .transpose()
    }

    pub fn add_external_app(
        &mut self,
        app: &ExternalAppRecord,
    ) -> Result<ExternalAppRecord, AppError> {
        let transaction = self.connection.transaction().map_err(database_error)?;
        let duplicate = transaction
            .query_row(
                "SELECT 1 FROM external_apps WHERE executable_path=?1 COLLATE NOCASE",
                [&app.executable_path],
                |_| Ok(()),
            )
            .optional()
            .map_err(database_error)?
            .is_some();
        if duplicate {
            return Err(AppError {
                code: ErrorCode::Conflict,
                message: "That external application is already registered.".into(),
                target: None,
                retryable: false,
            });
        }
        let count = transaction
            .query_row("SELECT COUNT(*) FROM external_apps", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(database_error)?;
        if count >= MAX_EXTERNAL_APPS {
            return Err(AppError {
                code: ErrorCode::ResourceLimit,
                message: "External application limit reached.".into(),
                target: None,
                retryable: false,
            });
        }
        let fixed_args_json =
            serde_json::to_string(&app.fixed_args).map_err(|_| invalid_stored_external_app())?;
        transaction.execute(
            "INSERT INTO external_apps(display_name, executable_path, fixed_args_json, target_mode, updated_at_ms)
             VALUES(?1, ?2, ?3, ?4, ?5)",
            params![app.display_name, app.executable_path, fixed_args_json, app.target_mode,
                i64::try_from(app.updated_at_ms).unwrap_or(i64::MAX)],
        ).map_err(database_error)?;
        let id = transaction.last_insert_rowid();
        transaction.commit().map_err(database_error)?;
        let mut stored = app.clone();
        stored.id = id;
        Ok(stored)
    }

    pub fn update_external_app(&self, app: &ExternalAppRecord) -> Result<bool, AppError> {
        let fixed_args_json =
            serde_json::to_string(&app.fixed_args).map_err(|_| invalid_stored_external_app())?;
        self.connection.execute(
            "UPDATE external_apps SET display_name=?2, fixed_args_json=?3, target_mode=?4, updated_at_ms=?5
             WHERE id=?1",
            params![app.id, app.display_name, fixed_args_json, app.target_mode,
                i64::try_from(app.updated_at_ms).unwrap_or(i64::MAX)],
        ).map(|count| count == 1).map_err(database_error)
    }

    pub fn delete_external_app(&self, id: i64) -> Result<bool, AppError> {
        self.connection
            .execute("DELETE FROM external_apps WHERE id=?1", [id])
            .map(|count| count == 1)
            .map_err(database_error)
    }

    pub fn list_external_app_history(&self) -> Result<Vec<ExternalAppHistoryRecord>, AppError> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT app_id, display_name, target_mode, target_count, launched_at_ms
             FROM external_app_history ORDER BY launched_at_ms DESC, id DESC LIMIT ?1",
            )
            .map_err(database_error)?;
        let rows = statement
            .query_map([MAX_EXTERNAL_APP_HISTORY], |row| {
                Ok(ExternalAppHistoryRecord {
                    app_id: row.get(0)?,
                    display_name: row.get(1)?,
                    target_mode: row.get(2)?,
                    target_count: row.get::<_, i64>(3)?.max(0) as u64,
                    launched_at_ms: row.get::<_, i64>(4)?.max(0) as u64,
                })
            })
            .map_err(database_error)?;
        rows.map(|row| row.map_err(database_error)).collect()
    }

    pub fn record_external_app_launch(
        &mut self,
        history: &ExternalAppHistoryRecord,
    ) -> Result<(), AppError> {
        let transaction = self.connection.transaction().map_err(database_error)?;
        transaction.execute(
            "INSERT INTO external_app_history(app_id, display_name, target_mode, target_count, launched_at_ms)
             VALUES(?1, ?2, ?3, ?4, ?5)",
            params![history.app_id, history.display_name, history.target_mode,
                i64::try_from(history.target_count).unwrap_or(i64::MAX),
                i64::try_from(history.launched_at_ms).unwrap_or(i64::MAX)],
        ).map_err(database_error)?;
        transaction
            .execute(
                "DELETE FROM external_app_history WHERE id NOT IN
             (SELECT id FROM external_app_history ORDER BY launched_at_ms DESC, id DESC LIMIT ?1)",
                [MAX_EXTERNAL_APP_HISTORY],
            )
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)
    }

    pub fn load_rename_preferences(&self) -> Result<RenamePreferencesRecord, AppError> {
        let mut preferences = RenamePreferencesRecord::default();
        let mut statement = self
            .connection
            .prepare(
                "SELECT key, value FROM settings WHERE key IN (
               'renameSelectExtension', 'renameSequenceStart', 'renameSequenceDigits',
               'renameSeparator', 'renamePreserveExtension'
             )",
            )
            .map_err(database_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(database_error)?;
        for row in rows {
            let (key, value) = row.map_err(database_error)?;
            match key.as_str() {
                "renameSelectExtension" => preferences.select_extension = value == "true",
                "renameSequenceStart" => preferences.sequence_start = value.parse().unwrap_or(1),
                "renameSequenceDigits" => preferences.sequence_digits = value.parse().unwrap_or(3),
                "renameSeparator" => preferences.separator = value,
                "renamePreserveExtension" => preferences.preserve_extension = value == "true",
                _ => {}
            }
        }
        Ok(preferences)
    }

    pub fn save_rename_preferences(
        &mut self,
        preferences: &RenamePreferencesRecord,
    ) -> Result<(), AppError> {
        let transaction = self.connection.transaction().map_err(database_error)?;
        let values = [
            (
                "renameSelectExtension",
                preferences.select_extension.to_string(),
            ),
            (
                "renameSequenceStart",
                preferences.sequence_start.to_string(),
            ),
            (
                "renameSequenceDigits",
                preferences.sequence_digits.to_string(),
            ),
            ("renameSeparator", preferences.separator.clone()),
            (
                "renamePreserveExtension",
                preferences.preserve_extension.to_string(),
            ),
        ];
        for (key, value) in values {
            transaction
                .execute(
                    "INSERT INTO settings(key, value) VALUES(?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    params![key, value],
                )
                .map_err(database_error)?;
        }
        transaction.commit().map_err(database_error)
    }
}

fn invalid_stored_external_app() -> AppError {
    AppError {
        code: ErrorCode::Internal,
        message: "Stored external application data is invalid.".into(),
        target: None,
        retryable: false,
    }
}
