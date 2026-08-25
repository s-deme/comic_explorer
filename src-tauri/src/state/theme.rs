use icu_casemap::CaseMapper;
use rusqlite::{OptionalExtension, Transaction, params};

use crate::domain::{AppError, ErrorCode};

use super::{Settings, StateStore};

pub const MAX_CUSTOM_THEMES: i64 = 32;
pub const MAX_THEME_TRANSPORT_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomThemeRecord {
    pub theme_id: i64,
    pub name: String,
    pub definition_json: String,
    pub revision: u64,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
}

fn database_error(source: rusqlite::Error) -> AppError {
    AppError {
        code: ErrorCode::Internal,
        message: format!("Local theme database operation failed: {source}"),
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
        message: "Custom theme was not found.".into(),
        target: None,
        retryable: false,
    }
}

pub(crate) fn custom_theme_name_key(name: &str) -> String {
    // SQLite NOCASE only handles ASCII. ICU's default full fold provides an
    // explicit, locale-independent Unicode comparison key instead.
    CaseMapper::new().fold_string(name).into_owned()
}

fn row_to_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<CustomThemeRecord> {
    Ok(CustomThemeRecord {
        theme_id: row.get(0)?,
        name: row.get(1)?,
        definition_json: row.get(2)?,
        revision: row.get::<_, i64>(3)?.max(0) as u64,
        created_at_ms: row.get::<_, i64>(4)?.max(0) as u64,
        updated_at_ms: row.get::<_, i64>(5)?.max(0) as u64,
    })
}

pub(crate) fn create_custom_theme_in_transaction(
    transaction: &Transaction<'_>,
    name: &str,
    definition_json: &str,
    now_ms: u64,
) -> Result<CustomThemeRecord, AppError> {
    let name_key = custom_theme_name_key(name);
    if transaction
        .query_row(
            "SELECT 1 FROM custom_themes WHERE name_key=?1",
            [&name_key],
            |_row| Ok(()),
        )
        .optional()
        .map_err(database_error)?
        .is_some()
    {
        return Err(conflict("A custom theme with that name already exists."));
    }
    let count = transaction
        .query_row("SELECT COUNT(*) FROM custom_themes", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(database_error)?;
    if count >= MAX_CUSTOM_THEMES {
        return Err(AppError {
            code: ErrorCode::ResourceLimit,
            message: "Custom themes are limited to 32.".into(),
            target: None,
            retryable: false,
        });
    }
    let now_ms = i64::try_from(now_ms).unwrap_or(i64::MAX);
    transaction
        .execute(
            "INSERT INTO custom_themes(
                name,name_key,definition_json,revision,created_at_ms,updated_at_ms
             ) VALUES(?1,?2,?3,1,?4,?4)",
            params![name, name_key, definition_json, now_ms],
        )
        .map_err(database_error)?;
    let theme_id = transaction.last_insert_rowid();
    if theme_id <= 0 || theme_id as u64 > MAX_THEME_TRANSPORT_INTEGER {
        return Err(AppError {
            code: ErrorCode::ResourceLimit,
            message: "Custom theme ID limit reached.".into(),
            target: None,
            retryable: false,
        });
    }
    Ok(CustomThemeRecord {
        theme_id,
        name: name.into(),
        definition_json: definition_json.into(),
        revision: 1,
        created_at_ms: now_ms.max(0) as u64,
        updated_at_ms: now_ms.max(0) as u64,
    })
}

impl StateStore {
    pub(crate) fn delete_custom_theme_and_save_settings(
        &mut self,
        theme_id: i64,
        settings: &Settings,
    ) -> Result<(), AppError> {
        let mut settings = settings.clone();
        self.save_settings_with_preparation(&mut settings, None, |transaction, _settings| {
            if transaction
                .execute("DELETE FROM custom_themes WHERE id=?1", [theme_id])
                .map_err(database_error)?
                == 0
            {
                return Err(not_found());
            }
            Ok(())
        })
    }

    pub(crate) fn create_custom_theme_and_save_settings<F>(
        &mut self,
        settings: &mut Settings,
        active_profile: Option<&str>,
        name: &str,
        definition_json: &str,
        now_ms: u64,
        finalize_settings: F,
    ) -> Result<CustomThemeRecord, AppError>
    where
        F: FnOnce(&mut Settings, &CustomThemeRecord) -> Result<(), AppError>,
    {
        self.save_settings_with_preparation(settings, active_profile, |transaction, settings| {
            if let Some(active_profile) = active_profile {
                let exists = transaction
                    .query_row(
                        "SELECT 1 FROM named_settings_profiles
                             WHERE name=?1 COLLATE NOCASE",
                        [active_profile],
                        |_row| Ok(()),
                    )
                    .optional()
                    .map_err(database_error)?
                    .is_some();
                if !exists {
                    return Err(AppError {
                        code: ErrorCode::NotFound,
                        message: "Settings profile was not found.".into(),
                        target: None,
                        retryable: false,
                    });
                }
            }
            let record =
                create_custom_theme_in_transaction(transaction, name, definition_json, now_ms)?;
            finalize_settings(settings, &record)?;
            Ok(record)
        })
    }

    pub fn list_custom_theme_records(&self) -> Result<Vec<CustomThemeRecord>, AppError> {
        let mut statement = self
            .connection()
            .prepare(
                "SELECT id,name,definition_json,revision,created_at_ms,updated_at_ms
                 FROM custom_themes
                 ORDER BY name COLLATE NOCASE ASC,id ASC
                 LIMIT ?1",
            )
            .map_err(database_error)?;
        statement
            .query_map([MAX_CUSTOM_THEMES], row_to_record)
            .map_err(database_error)?
            .map(|row| row.map_err(database_error))
            .collect()
    }

    pub fn custom_theme_record(
        &self,
        theme_id: i64,
    ) -> Result<Option<CustomThemeRecord>, AppError> {
        self.connection()
            .query_row(
                "SELECT id,name,definition_json,revision,created_at_ms,updated_at_ms
                 FROM custom_themes WHERE id=?1",
                [theme_id],
                row_to_record,
            )
            .optional()
            .map_err(database_error)
    }

    pub fn custom_theme_record_by_name(
        &self,
        name: &str,
    ) -> Result<Option<CustomThemeRecord>, AppError> {
        let name_key = custom_theme_name_key(name);
        self.connection()
            .query_row(
                "SELECT id,name,definition_json,revision,created_at_ms,updated_at_ms
                 FROM custom_themes WHERE name_key=?1",
                [name_key],
                row_to_record,
            )
            .optional()
            .map_err(database_error)
    }

    pub fn create_custom_theme(
        &self,
        name: &str,
        definition_json: &str,
        now_ms: u64,
    ) -> Result<CustomThemeRecord, AppError> {
        let transaction = self
            .connection()
            .unchecked_transaction()
            .map_err(database_error)?;
        let record =
            create_custom_theme_in_transaction(&transaction, name, definition_json, now_ms)?;
        transaction.commit().map_err(database_error)?;
        Ok(record)
    }

    pub fn update_custom_theme(
        &self,
        theme_id: i64,
        expected_revision: u64,
        name: &str,
        definition_json: &str,
        now_ms: u64,
    ) -> Result<CustomThemeRecord, AppError> {
        let transaction = self
            .connection()
            .unchecked_transaction()
            .map_err(database_error)?;
        let current = transaction
            .query_row(
                "SELECT id,name,definition_json,revision,created_at_ms,updated_at_ms
                 FROM custom_themes WHERE id=?1",
                [theme_id],
                row_to_record,
            )
            .optional()
            .map_err(database_error)?
            .ok_or_else(not_found)?;
        if current.revision != expected_revision {
            return Err(conflict(
                "Custom theme changed after it was loaded; reload before saving.",
            ));
        }
        let name_key = custom_theme_name_key(name);
        if transaction
            .query_row(
                "SELECT 1 FROM custom_themes
                 WHERE name_key=?1 AND id<>?2",
                params![name_key, theme_id],
                |_row| Ok(()),
            )
            .optional()
            .map_err(database_error)?
            .is_some()
        {
            return Err(conflict("A custom theme with that name already exists."));
        }
        let next_revision = current
            .revision
            .checked_add(1)
            .filter(|revision| *revision <= MAX_THEME_TRANSPORT_INTEGER)
            .and_then(|revision| i64::try_from(revision).ok())
            .ok_or_else(|| AppError {
                code: ErrorCode::ResourceLimit,
                message: "Custom theme revision limit reached.".into(),
                target: None,
                retryable: false,
            })?;
        transaction
            .execute(
                "UPDATE custom_themes
                 SET name=?1,name_key=?2,definition_json=?3,revision=?4,updated_at_ms=?5
                 WHERE id=?6 AND revision=?7",
                params![
                    name,
                    custom_theme_name_key(name),
                    definition_json,
                    next_revision,
                    i64::try_from(now_ms).unwrap_or(i64::MAX),
                    theme_id,
                    i64::try_from(expected_revision).unwrap_or(i64::MAX),
                ],
            )
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
        self.custom_theme_record(theme_id)?.ok_or_else(not_found)
    }

    pub fn replace_custom_theme_by_name(
        &self,
        name: &str,
        definition_json: &str,
        expected_theme_id: i64,
        expected_revision: u64,
        now_ms: u64,
    ) -> Result<CustomThemeRecord, AppError> {
        let current = self
            .custom_theme_record_by_name(name)?
            .ok_or_else(not_found)?;
        if current.theme_id != expected_theme_id || current.revision != expected_revision {
            return Err(conflict(
                "Custom theme import preview is stale; preview the file again.",
            ));
        }
        self.update_custom_theme(
            current.theme_id,
            current.revision,
            name,
            definition_json,
            now_ms,
        )
    }

    pub fn delete_custom_theme(&self, theme_id: i64) -> Result<(), AppError> {
        if self
            .connection()
            .execute("DELETE FROM custom_themes WHERE id=?1", [theme_id])
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
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;
    use crate::state::AppPaths;

    fn temporary_paths(label: &str) -> AppPaths {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        AppPaths::under(std::env::temp_dir().join(format!("comic-explorer-theme-{label}-{nonce}")))
    }

    #[test]
    fn req_fr_b24_004_custom_theme_crud_is_bounded_revisioned_and_durable() {
        let paths = temporary_paths("crud");
        let store = StateStore::open(&paths).unwrap().0;
        let first = store
            .create_custom_theme("Blue", r#"{"name":"Blue"}"#, 1)
            .unwrap();
        assert!(first.theme_id > 0);
        assert_eq!(first.revision, 1);
        assert_eq!(
            store
                .create_custom_theme("blue", r#"{"name":"blue"}"#, 2)
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        let updated = store
            .update_custom_theme(
                first.theme_id,
                first.revision,
                "Azure",
                r#"{"name":"Azure"}"#,
                3,
            )
            .unwrap();
        assert_eq!(updated.revision, 2);
        assert_eq!(
            store
                .update_custom_theme(
                    first.theme_id,
                    first.revision,
                    "Stale",
                    r#"{"name":"Stale"}"#,
                    4,
                )
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        drop(store);

        let store = StateStore::open(&paths).unwrap().0;
        assert_eq!(
            store
                .custom_theme_record(first.theme_id)
                .unwrap()
                .unwrap()
                .name,
            "Azure"
        );
        store.delete_custom_theme(first.theme_id).unwrap();
        assert!(store.custom_theme_record(first.theme_id).unwrap().is_none());
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn req_fr_b24_004_custom_theme_limit_is_transactional() {
        let paths = temporary_paths("limit");
        let store = StateStore::open(&paths).unwrap().0;
        for index in 0..MAX_CUSTOM_THEMES {
            store
                .create_custom_theme(
                    &format!("Theme {index}"),
                    &format!(r#"{{"name":"Theme {index}"}}"#),
                    index as u64,
                )
                .unwrap();
        }
        assert_eq!(
            store
                .create_custom_theme("Overflow", r#"{"name":"Overflow"}"#, 99)
                .unwrap_err()
                .code,
            ErrorCode::ResourceLimit
        );
        assert_eq!(
            store.list_custom_theme_records().unwrap().len(),
            MAX_CUSTOM_THEMES as usize
        );
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn req_fr_b24_004_unicode_case_keys_are_unique_and_searchable() {
        let paths = temporary_paths("unicode-name");
        let store = StateStore::open(&paths).unwrap().0;
        let first = store
            .create_custom_theme("Äther", r#"{"name":"Äther"}"#, 1)
            .unwrap();
        assert_eq!(
            store
                .custom_theme_record_by_name("äTHER")
                .unwrap()
                .unwrap()
                .theme_id,
            first.theme_id
        );
        assert_eq!(
            store
                .create_custom_theme("äTHER", r#"{"name":"äTHER"}"#, 2)
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        let second = store
            .create_custom_theme("Öcean", r#"{"name":"Öcean"}"#, 3)
            .unwrap();
        assert_eq!(
            store
                .update_custom_theme(
                    first.theme_id,
                    first.revision,
                    "öCEAN",
                    r#"{"name":"öCEAN"}"#,
                    4,
                )
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        assert_eq!(
            store
                .custom_theme_record_by_name("öcean")
                .unwrap()
                .unwrap()
                .theme_id,
            second.theme_id
        );
        let street = store
            .create_custom_theme("Straße", r#"{"name":"Straße"}"#, 5)
            .unwrap();
        assert_eq!(
            store
                .custom_theme_record_by_name("STRASSE")
                .unwrap()
                .unwrap()
                .theme_id,
            street.theme_id
        );
        assert_eq!(
            store
                .create_custom_theme("STRASSE", r#"{"name":"STRASSE"}"#, 6)
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        let sigma = store
            .create_custom_theme("ΟΣ", r#"{"name":"ΟΣ"}"#, 7)
            .unwrap();
        assert_eq!(
            store
                .custom_theme_record_by_name("Ος")
                .unwrap()
                .unwrap()
                .theme_id,
            sigma.theme_id
        );
        assert_eq!(
            store
                .create_custom_theme("Ος", r#"{"name":"Ος"}"#, 8)
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn req_fr_b24_004_and_005_materialization_and_named_activation_roll_back_together() {
        let paths = temporary_paths("atomic-materialization");
        let mut store = StateStore::open(&paths).unwrap().0;
        store
            .connection()
            .execute_batch(
                "INSERT INTO named_settings_profiles(name,profile_json,updated_at_ms)
                   VALUES('Portable','{}',1);
                 CREATE TRIGGER reject_theme_setting
                   BEFORE UPDATE OF value ON settings
                   WHEN OLD.key='appThemeSelection'
                 BEGIN
                   SELECT RAISE(ABORT,'forced settings failure');
                 END;",
            )
            .unwrap();
        let before = store.load_settings().unwrap();
        let mut candidate = before.clone();
        let error = store
            .create_custom_theme_and_save_settings(
                &mut candidate,
                Some("Portable"),
                "Atomic",
                r#"{"name":"Atomic"}"#,
                2,
                |settings, record| {
                    settings.app_theme_selection_json = format!(
                        r#"{{"kind":"custom","themeId":{},"revision":1}}"#,
                        record.theme_id
                    );
                    settings.custom_theme_snapshot_json = Some("{}".into());
                    Ok(())
                },
            )
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::Internal);
        assert!(store.list_custom_theme_records().unwrap().is_empty());
        assert_eq!(store.load_settings().unwrap(), before);
        assert!(
            store
                .connection()
                .query_row(
                    "SELECT value FROM settings WHERE key='activeSettingsProfile'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .unwrap()
                .is_none()
        );
        store
            .connection()
            .execute_batch("DROP TRIGGER reject_theme_setting;")
            .unwrap();
        let mut candidate = before;
        let record = store
            .create_custom_theme_and_save_settings(
                &mut candidate,
                Some("Portable"),
                "Atomic",
                r#"{"name":"Atomic"}"#,
                3,
                |settings, record| {
                    settings.app_theme_selection_json = format!(
                        r#"{{"kind":"custom","themeId":{},"revision":1}}"#,
                        record.theme_id
                    );
                    settings.custom_theme_snapshot_json = Some("{}".into());
                    Ok(())
                },
            )
            .unwrap();
        assert_eq!(store.list_custom_theme_records().unwrap(), vec![record]);
        assert_eq!(
            store
                .connection()
                .query_row(
                    "SELECT value FROM settings WHERE key='activeSettingsProfile'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "Portable"
        );
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }
}
