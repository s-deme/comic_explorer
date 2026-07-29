use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, params};

use crate::domain::{AppError, ErrorCode, RelativePath};

use super::{AppPaths, ReadingPosition, SourceFingerprint};

const SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Settings {
    pub library_root: Option<PathBuf>,
    pub sort_field: String,
    pub sort_descending: bool,
    pub view_mode: String,
    pub reading_direction: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            library_root: None,
            sort_field: "name".into(),
            sort_descending: false,
            view_mode: "single".into(),
            reading_direction: "rightToLeft".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecoveryNotice {
    pub isolated_database: PathBuf,
    pub reason: String,
}

pub struct StateStore {
    connection: Connection,
}

impl StateStore {
    pub fn open(paths: &AppPaths) -> Result<(Self, Option<RecoveryNotice>), AppError> {
        paths.create(None)?;
        match Self::open_existing(&paths.database) {
            Ok(store) => Ok((store, None)),
            Err(first_error) if paths.database.exists() => {
                let isolated_database = isolate_database(paths)?;
                let store = Self::open_existing(&paths.database)?;
                Ok((
                    store,
                    Some(RecoveryNotice {
                        isolated_database,
                        reason: first_error.message,
                    }),
                ))
            }
            Err(error) => Err(error),
        }
    }

    fn open_existing(path: &Path) -> Result<Self, AppError> {
        let connection = Connection::open(path).map_err(database_error)?;
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(database_error)?;
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .map_err(database_error)?;
        migrate(&connection)?;
        Ok(Self { connection })
    }

    pub fn load_settings(&self) -> Result<Settings, AppError> {
        let mut settings = Settings::default();
        let mut statement = self
            .connection
            .prepare("SELECT key, value FROM settings")
            .map_err(database_error)?;
        let values = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(database_error)?;
        for value in values {
            let (key, value) = value.map_err(database_error)?;
            match key.as_str() {
                "libraryRoot" => settings.library_root = Some(PathBuf::from(value)),
                "sortField" => settings.sort_field = value,
                "sortDescending" => settings.sort_descending = value == "true",
                "viewMode" => settings.view_mode = value,
                "readingDirection" => settings.reading_direction = value,
                _ => {}
            }
        }
        Ok(settings)
    }

    pub fn save_settings(&mut self, settings: &Settings) -> Result<(), AppError> {
        let transaction = self.connection.transaction().map_err(database_error)?;
        let mut values = vec![
            ("sortField", settings.sort_field.clone()),
            ("sortDescending", settings.sort_descending.to_string()),
            ("viewMode", settings.view_mode.clone()),
            ("readingDirection", settings.reading_direction.clone()),
        ];
        if let Some(root) = &settings.library_root {
            values.push(("libraryRoot", root.to_string_lossy().into_owned()));
        }
        for (key, value) in values {
            transaction
                .execute(
                    "INSERT INTO settings(key, value) VALUES(?1, ?2)
                     ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    params![key, value],
                )
                .map_err(database_error)?;
        }
        if settings.library_root.is_none() {
            transaction
                .execute("DELETE FROM settings WHERE key='libraryRoot'", [])
                .map_err(database_error)?;
        }
        transaction.commit().map_err(database_error)
    }

    pub fn reading_position(&self, item_key: &str) -> Result<Option<ReadingPosition>, AppError> {
        self.connection
            .query_row(
                "SELECT page_key, natural_ordinal FROM reading_positions WHERE item_key=?1",
                [item_key],
                |row| {
                    let page_key = row.get::<_, String>(0)?;
                    let natural_ordinal = row.get::<_, i64>(1)?;
                    Ok((page_key, natural_ordinal))
                },
            )
            .optional()
            .map_err(database_error)?
            .map(|(page_key, natural_ordinal)| {
                Ok(ReadingPosition {
                    page_key: RelativePath::parse(page_key).map_err(|message| AppError {
                        code: ErrorCode::Internal,
                        message: message.into(),
                        target: None,
                        retryable: false,
                    })?,
                    natural_ordinal: usize::try_from(natural_ordinal).map_err(|_| AppError {
                        code: ErrorCode::Internal,
                        message: "Stored page ordinal is invalid.".into(),
                        target: None,
                        retryable: false,
                    })?,
                })
            })
            .transpose()
    }

    pub fn save_reading_position(
        &self,
        item_key: &str,
        position: &ReadingPosition,
        updated_at_ms: i64,
    ) -> Result<(), AppError> {
        self.connection
            .execute(
                "INSERT INTO reading_positions(item_key, page_key, natural_ordinal, updated_at_ms)
                 VALUES(?1, ?2, ?3, ?4)
                 ON CONFLICT(item_key) DO UPDATE SET
                   page_key=excluded.page_key,
                   natural_ordinal=excluded.natural_ordinal,
                   updated_at_ms=excluded.updated_at_ms",
                params![
                    item_key,
                    position.page_key.as_str(),
                    i64::try_from(position.natural_ordinal).unwrap_or(i64::MAX),
                    updated_at_ms
                ],
            )
            .map_err(database_error)?;
        Ok(())
    }

    pub fn source_fingerprint(
        &self,
        item_key: &str,
    ) -> Result<Option<SourceFingerprint>, AppError> {
        self.connection
            .query_row(
                "SELECT size_bytes, modified_ns, detail_hash
                 FROM source_fingerprints WHERE item_key=?1",
                [item_key],
                |row| {
                    Ok(SourceFingerprint {
                        size_bytes: row.get::<_, i64>(0)?.max(0) as u64,
                        modified_ns: row.get::<_, String>(1)?.parse::<u128>().unwrap_or_default(),
                        detail_hash: row.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(database_error)
    }

    pub fn save_source_fingerprint(
        &self,
        item_key: &str,
        fingerprint: &SourceFingerprint,
    ) -> Result<(), AppError> {
        self.connection
            .execute(
                "INSERT INTO source_fingerprints(item_key, size_bytes, modified_ns, detail_hash)
                 VALUES(?1, ?2, ?3, ?4)
                 ON CONFLICT(item_key) DO UPDATE SET
                   size_bytes=excluded.size_bytes,
                   modified_ns=excluded.modified_ns,
                   detail_hash=excluded.detail_hash",
                params![
                    item_key,
                    i64::try_from(fingerprint.size_bytes).unwrap_or(i64::MAX),
                    fingerprint.modified_ns.to_string(),
                    fingerprint.detail_hash
                ],
            )
            .map_err(database_error)?;
        Ok(())
    }

    pub(crate) fn connection(&self) -> &Connection {
        &self.connection
    }
}

fn migrate(connection: &Connection) -> Result<(), AppError> {
    let version = connection
        .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
        .map_err(database_error)?;
    if version > SCHEMA_VERSION {
        return Err(AppError {
            code: ErrorCode::UnsupportedFormat,
            message: format!("Database schema {version} is newer than supported."),
            target: None,
            retryable: false,
        });
    }
    if version == 0 {
        let transaction = connection.unchecked_transaction().map_err(database_error)?;
        transaction
            .execute_batch(
                "CREATE TABLE settings (
                    key TEXT PRIMARY KEY NOT NULL,
                    value TEXT NOT NULL
                 );
                 CREATE TABLE reading_positions (
                    item_key TEXT PRIMARY KEY NOT NULL,
                    page_key TEXT NOT NULL,
                    natural_ordinal INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL
                 );
                 CREATE TABLE source_fingerprints (
                    item_key TEXT PRIMARY KEY NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    modified_ns TEXT NOT NULL,
                    detail_hash TEXT
                 );
                 CREATE TABLE thumbnail_index (
                    content_hash TEXT PRIMARY KEY NOT NULL,
                    relative_path TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    width INTEGER NOT NULL,
                    height INTEGER NOT NULL,
                    last_access_ms INTEGER NOT NULL
                 );
                 CREATE TABLE schema_migrations (
                    version INTEGER PRIMARY KEY NOT NULL,
                    applied_at_ms INTEGER NOT NULL
                 );",
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO schema_migrations(version, applied_at_ms) VALUES(?1, ?2)",
                params![SCHEMA_VERSION, unix_millis()],
            )
            .map_err(database_error)?;
        transaction
            .pragma_update(None, "user_version", SCHEMA_VERSION)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    connection
        .execute_batch("PRAGMA quick_check;")
        .map_err(database_error)?;
    Ok(())
}

fn isolate_database(paths: &AppPaths) -> Result<PathBuf, AppError> {
    fs::create_dir_all(&paths.recovery).map_err(database_error)?;
    let isolated = paths
        .recovery
        .join(format!("state-{}.sqlite3", unix_millis()));
    fs::rename(&paths.database, &isolated).map_err(database_error)?;
    for suffix in ["-wal", "-shm"] {
        let source = PathBuf::from(format!("{}{}", paths.database.display(), suffix));
        if source.exists() {
            let target = PathBuf::from(format!("{}{}", isolated.display(), suffix));
            fs::rename(source, target).map_err(database_error)?;
        }
    }
    Ok(isolated)
}

fn unix_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(i64::MAX)
}

fn database_error(error: impl std::fmt::Display) -> AppError {
    AppError {
        code: ErrorCode::Internal,
        message: format!("Local state database error: {error}"),
        target: None,
        retryable: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_paths(test_name: &str) -> AppPaths {
        AppPaths::under(std::env::temp_dir().join(format!(
            "comic-explorer-{test_name}-{}-{}",
            std::process::id(),
            unix_millis()
        )))
    }

    #[test]
    fn settings_and_reading_position_survive_reopen() {
        let paths = temporary_paths("state-reopen");
        {
            let (mut store, notice) = StateStore::open(&paths).unwrap();
            assert!(notice.is_none());
            let settings = Settings {
                library_root: Some(PathBuf::from(r"C:\Comics")),
                sort_field: "modified".into(),
                sort_descending: true,
                view_mode: "spread".into(),
                reading_direction: "leftToRight".into(),
            };
            store.save_settings(&settings).unwrap();
            store
                .save_reading_position(
                    "item-1",
                    &ReadingPosition {
                        page_key: RelativePath::parse("page7.png").unwrap(),
                        natural_ordinal: 6,
                    },
                    42,
                )
                .unwrap();
        }
        let (store, _) = StateStore::open(&paths).unwrap();
        assert_eq!(
            store.load_settings().unwrap().library_root,
            Some(PathBuf::from(r"C:\Comics"))
        );
        assert_eq!(
            store.reading_position("item-1").unwrap().unwrap().page_key,
            RelativePath::parse("page7.png").unwrap()
        );
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn corrupt_database_is_isolated_in_recovery() {
        let paths = temporary_paths("state-recovery");
        paths.create(None).unwrap();
        fs::write(&paths.database, b"not sqlite").unwrap();

        let (_, notice) = StateStore::open(&paths).unwrap();
        let notice = notice.expect("recovery notice");
        assert!(notice.isolated_database.starts_with(&paths.recovery));
        assert_eq!(fs::read(notice.isolated_database).unwrap(), b"not sqlite");
        fs::remove_dir_all(paths.root).unwrap();
    }
}
