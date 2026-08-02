use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, params};

use crate::domain::{AppError, ErrorCode, ItemKind, RelativePath};

use super::{AppPaths, ReadingPosition, SourceFingerprint};

const INITIAL_SCHEMA_VERSION: i64 = 1;
const SCHEMA_VERSION: i64 = 3;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Settings {
    pub library_root: Option<PathBuf>,
    pub sort_field: String,
    pub sort_descending: bool,
    pub end_of_volume_policy: String,
    pub catalog_view_mode: String,
    pub view_mode: String,
    pub layout_mode: String,
    pub reading_direction: String,
    pub scale_mode: String,
    pub scale: String,
    pub loupe_enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FavoriteRecord {
    pub favorite_id: String,
    pub item_identity: String,
    pub relative_path: RelativePath,
    pub kind: ItemKind,
    pub size_bytes: Option<u64>,
    pub modified_ms: Option<u64>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            library_root: None,
            sort_field: "name".into(),
            sort_descending: false,
            end_of_volume_policy: "auto_next".into(),
            catalog_view_mode: "cover_list".into(),
            view_mode: "single".into(),
            layout_mode: "paged".into(),
            reading_direction: "rightToLeft".into(),
            scale_mode: "fit".into(),
            scale: "1".into(),
            loupe_enabled: false,
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
                "endOfVolumePolicy" => settings.end_of_volume_policy = value,
                "catalogViewMode" => settings.catalog_view_mode = value,
                "viewMode" => settings.view_mode = value,
                "layoutMode" => settings.layout_mode = value,
                "readingDirection" => settings.reading_direction = value,
                "scaleMode" => settings.scale_mode = value,
                "scale" => settings.scale = value,
                "loupeEnabled" => settings.loupe_enabled = value == "true",
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
            ("endOfVolumePolicy", settings.end_of_volume_policy.clone()),
            ("catalogViewMode", settings.catalog_view_mode.clone()),
            ("viewMode", settings.view_mode.clone()),
            ("layoutMode", settings.layout_mode.clone()),
            ("readingDirection", settings.reading_direction.clone()),
            ("scaleMode", settings.scale_mode.clone()),
            ("scale", settings.scale.clone()),
            ("loupeEnabled", settings.loupe_enabled.to_string()),
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

    pub fn memo(&self, item_identity: &str) -> Result<Option<String>, AppError> {
        self.connection
            .query_row(
                "SELECT body FROM memos WHERE item_identity=?1",
                [item_identity],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(database_error)
    }

    pub fn save_memo(
        &self,
        item_identity: &str,
        body: &str,
        updated_at_ms: i64,
    ) -> Result<Option<String>, AppError> {
        if body.trim().is_empty() {
            self.connection
                .execute("DELETE FROM memos WHERE item_identity=?1", [item_identity])
                .map_err(database_error)?;
            return Ok(None);
        }
        self.connection
            .execute(
                "INSERT INTO memos(item_identity, body, updated_at_ms)
                 VALUES(?1, ?2, ?3)
                 ON CONFLICT(item_identity) DO UPDATE SET
                   body=excluded.body,
                   updated_at_ms=excluded.updated_at_ms",
                params![item_identity, body, updated_at_ms],
            )
            .map_err(database_error)?;
        Ok(Some(body.to_owned()))
    }

    pub fn list_reading_history(&self) -> Result<Vec<(String, i64)>, AppError> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT item_identity, last_viewed_at_ms
                 FROM reading_history
                 ORDER BY last_viewed_at_ms DESC, item_identity ASC",
            )
            .map_err(database_error)?;
        let values = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(database_error)?;
        values
            .map(|value| value.map_err(database_error))
            .collect::<Result<Vec<_>, _>>()
    }

    pub fn record_reading_history(
        &self,
        item_identity: &str,
        last_viewed_at_ms: i64,
    ) -> Result<(), AppError> {
        self.connection
            .execute(
                "INSERT INTO reading_history(item_identity, last_viewed_at_ms)
                 VALUES(?1, ?2)
                 ON CONFLICT(item_identity) DO UPDATE SET
                   last_viewed_at_ms=excluded.last_viewed_at_ms",
                params![item_identity, last_viewed_at_ms],
            )
            .map_err(database_error)?;
        Ok(())
    }

    pub fn rating(&self, item_identity: &str) -> Result<Option<i64>, AppError> {
        self.connection
            .query_row(
                "SELECT rating FROM ratings WHERE item_identity=?1",
                [item_identity],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(database_error)
    }

    pub fn set_rating(
        &self,
        item_identity: &str,
        rating: Option<i64>,
        updated_at_ms: i64,
    ) -> Result<Option<i64>, AppError> {
        if rating.is_some_and(|value| !(1..=5).contains(&value)) {
            return Err(AppError {
                code: ErrorCode::InvalidRequest,
                message: "Rating must be an integer from 1 to 5 or unset.".into(),
                target: None,
                retryable: false,
            });
        }
        match rating {
            Some(rating) => {
                self.connection
                    .execute(
                        "INSERT INTO ratings(item_identity, rating, updated_at_ms)
                         VALUES(?1, ?2, ?3)
                         ON CONFLICT(item_identity) DO UPDATE SET
                           rating=excluded.rating,
                           updated_at_ms=excluded.updated_at_ms",
                        params![item_identity, rating, updated_at_ms],
                    )
                    .map_err(database_error)?;
            }
            None => {
                self.connection
                    .execute(
                        "DELETE FROM ratings WHERE item_identity=?1",
                        [item_identity],
                    )
                    .map_err(database_error)?;
            }
        }
        Ok(rating)
    }

    pub fn list_favorites(&self) -> Result<Vec<FavoriteRecord>, AppError> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT favorite_id, item_identity, relative_path, item_kind, size_bytes, modified_ms
                 FROM favorites
                 ORDER BY created_at_ms, favorite_id",
            )
            .map_err(database_error)?;
        let values = statement
            .query_map([], favorite_from_row)
            .map_err(database_error)?;
        values
            .map(|value| value.map_err(database_error))
            .collect::<Result<Vec<_>, _>>()
    }

    pub fn favorite(&self, favorite_id: &str) -> Result<Option<FavoriteRecord>, AppError> {
        self.connection
            .query_row(
                "SELECT favorite_id, item_identity, relative_path, item_kind, size_bytes, modified_ms
                 FROM favorites WHERE favorite_id=?1",
                [favorite_id],
                favorite_from_row,
            )
            .optional()
            .map_err(database_error)
    }

    pub fn upsert_favorite(&self, favorite: &FavoriteRecord, now_ms: i64) -> Result<(), AppError> {
        self.connection
            .execute(
                "INSERT INTO favorites(
                    favorite_id, item_identity, relative_path, item_kind,
                    size_bytes, modified_ms, created_at_ms, updated_at_ms
                 ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
                 ON CONFLICT(item_identity) DO UPDATE SET
                   relative_path=excluded.relative_path,
                   item_kind=excluded.item_kind,
                   size_bytes=excluded.size_bytes,
                   modified_ms=excluded.modified_ms,
                   updated_at_ms=excluded.updated_at_ms",
                params![
                    favorite.favorite_id,
                    favorite.item_identity,
                    favorite.relative_path.as_str(),
                    item_kind_storage(favorite.kind),
                    favorite
                        .size_bytes
                        .map(|value| i64::try_from(value).unwrap_or(i64::MAX)),
                    favorite
                        .modified_ms
                        .map(|value| i64::try_from(value).unwrap_or(i64::MAX)),
                    now_ms,
                ],
            )
            .map_err(database_error)?;
        Ok(())
    }

    pub fn remove_favorite(&self, favorite_id: &str) -> Result<(), AppError> {
        self.connection
            .execute("DELETE FROM favorites WHERE favorite_id=?1", [favorite_id])
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
                params![INITIAL_SCHEMA_VERSION, unix_millis()],
            )
            .map_err(database_error)?;
        transaction
            .pragma_update(None, "user_version", INITIAL_SCHEMA_VERSION)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    if version < 2 {
        let transaction = connection.unchecked_transaction().map_err(database_error)?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS favorites (
                    favorite_id TEXT PRIMARY KEY NOT NULL,
                    item_identity TEXT NOT NULL UNIQUE,
                    relative_path TEXT NOT NULL,
                    item_kind TEXT NOT NULL,
                    size_bytes INTEGER,
                    modified_ms INTEGER,
                    created_at_ms INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL
                 );
                 CREATE INDEX IF NOT EXISTS favorites_relative_path
                   ON favorites(relative_path);",
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO schema_migrations(version, applied_at_ms) VALUES(?1, ?2)",
                params![2, unix_millis()],
            )
            .map_err(database_error)?;
        transaction
            .pragma_update(None, "user_version", 2)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    if version < 3 {
        let transaction = connection.unchecked_transaction().map_err(database_error)?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS memos (
                    item_identity TEXT PRIMARY KEY NOT NULL,
                    body TEXT NOT NULL,
                    updated_at_ms INTEGER NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS reading_history (
                    item_identity TEXT PRIMARY KEY NOT NULL,
                    last_viewed_at_ms INTEGER NOT NULL
                 );
                 CREATE INDEX IF NOT EXISTS reading_history_last_viewed
                   ON reading_history(last_viewed_at_ms DESC, item_identity ASC);
                 CREATE TABLE IF NOT EXISTS ratings (
                    item_identity TEXT PRIMARY KEY NOT NULL,
                    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
                    updated_at_ms INTEGER NOT NULL
                 );",
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO schema_migrations(version, applied_at_ms) VALUES(?1, ?2)",
                params![3, unix_millis()],
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

fn favorite_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<FavoriteRecord> {
    let kind = item_kind_from_storage(&row.get::<_, String>(3)?).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            3,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::other(error.message)),
        )
    })?;
    let relative_path = RelativePath::parse(row.get::<_, String>(2)?).map_err(|message| {
        rusqlite::Error::FromSqlConversionFailure(
            2,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::other(message)),
        )
    })?;
    Ok(FavoriteRecord {
        favorite_id: row.get(0)?,
        item_identity: row.get(1)?,
        relative_path,
        kind,
        size_bytes: row
            .get::<_, Option<i64>>(4)?
            .map(|value| value.max(0) as u64),
        modified_ms: row
            .get::<_, Option<i64>>(5)?
            .map(|value| value.max(0) as u64),
    })
}

fn item_kind_storage(kind: ItemKind) -> &'static str {
    match kind {
        ItemKind::Folder => "folder",
        ItemKind::ComicFolder => "comicFolder",
        ItemKind::Archive => "archive",
        ItemKind::Page => "page",
        ItemKind::Unsupported => "unsupported",
    }
}

fn item_kind_from_storage(value: &str) -> Result<ItemKind, AppError> {
    match value {
        "folder" => Ok(ItemKind::Folder),
        "comicFolder" => Ok(ItemKind::ComicFolder),
        "archive" => Ok(ItemKind::Archive),
        "page" => Ok(ItemKind::Page),
        "unsupported" => Ok(ItemKind::Unsupported),
        _ => Err(AppError {
            code: ErrorCode::Internal,
            message: "Stored favorite kind is invalid.".into(),
            target: None,
            retryable: false,
        }),
    }
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
    use rusqlite::params;

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
                end_of_volume_policy: "loop".into(),
                catalog_view_mode: "detail_list".into(),
                view_mode: "spread".into(),
                layout_mode: "vertical_scroll".into(),
                reading_direction: "leftToRight".into(),
                scale_mode: "custom".into(),
                scale: "1.7".into(),
                loupe_enabled: true,
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
            store
                .upsert_favorite(
                    &FavoriteRecord {
                        favorite_id: "favorite-item-1".into(),
                        item_identity: "item-1".into(),
                        relative_path: RelativePath::parse("Series/Volume 1").unwrap(),
                        kind: ItemKind::ComicFolder,
                        size_bytes: None,
                        modified_ms: Some(42),
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
        let restored = store.load_settings().unwrap();
        assert_eq!(restored.scale_mode, "custom");
        assert_eq!(restored.scale, "1.7");
        assert_eq!(restored.end_of_volume_policy, "loop");
        assert_eq!(restored.catalog_view_mode, "detail_list");
        assert_eq!(restored.layout_mode, "vertical_scroll");
        assert!(restored.loupe_enabled);
        assert_eq!(
            store.reading_position("item-1").unwrap().unwrap().page_key,
            RelativePath::parse("page7.png").unwrap()
        );
        assert_eq!(
            store.list_favorites().unwrap(),
            vec![FavoriteRecord {
                favorite_id: "favorite-item-1".into(),
                item_identity: "item-1".into(),
                relative_path: RelativePath::parse("Series/Volume 1").unwrap(),
                kind: ItemKind::ComicFolder,
                size_bytes: None,
                modified_ms: Some(42),
            }]
        );
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn favorite_upsert_and_remove_are_idempotent_and_deduplicate_identity() {
        let paths = temporary_paths("favorite-idempotence");
        let (store, _) = StateStore::open(&paths).unwrap();
        let favorite = FavoriteRecord {
            favorite_id: "favorite-item-2".into(),
            item_identity: "item-2".into(),
            relative_path: RelativePath::parse("Series/Volume 2.cbz").unwrap(),
            kind: ItemKind::Archive,
            size_bytes: Some(12),
            modified_ms: Some(13),
        };
        store.upsert_favorite(&favorite, 1).unwrap();
        store.upsert_favorite(&favorite, 2).unwrap();
        assert_eq!(store.list_favorites().unwrap(), vec![favorite.clone()]);
        store.remove_favorite(&favorite.favorite_id).unwrap();
        store.remove_favorite(&favorite.favorite_id).unwrap();
        assert!(store.list_favorites().unwrap().is_empty());
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

    #[test]
    fn fr_b07_memo_crud_clear_and_reopen() {
        let paths = temporary_paths("fr-b07-memo");
        {
            let (store, _) = StateStore::open(&paths).unwrap();
            assert_eq!(store.memo("Series/01.cbz").unwrap(), None);
            assert_eq!(
                store.save_memo("Series/01.cbz", "first memo", 10).unwrap(),
                Some("first memo".into())
            );
            assert_eq!(
                store.memo("Series/01.cbz").unwrap(),
                Some("first memo".into())
            );
            assert_eq!(
                store
                    .save_memo("Series/01.cbz", "updated memo", 20)
                    .unwrap(),
                Some("updated memo".into())
            );
            assert_eq!(store.save_memo("Series/01.cbz", " \t\n", 30).unwrap(), None);
        }
        let (store, _) = StateStore::open(&paths).unwrap();
        assert_eq!(store.memo("Series/01.cbz").unwrap(), None);
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn fr_b07_rating_boundaries_and_invalid_rejection() {
        let paths = temporary_paths("fr-b07-rating");
        let (store, _) = StateStore::open(&paths).unwrap();
        assert_eq!(
            store.set_rating("Series/01.cbz", Some(1), 10).unwrap(),
            Some(1)
        );
        assert_eq!(store.rating("Series/01.cbz").unwrap(), Some(1));
        assert_eq!(
            store.set_rating("Series/01.cbz", Some(5), 20).unwrap(),
            Some(5)
        );
        assert_eq!(store.rating("Series/01.cbz").unwrap(), Some(5));
        let error = store.set_rating("Series/01.cbz", Some(0), 30).unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidRequest);
        assert_eq!(store.rating("Series/01.cbz").unwrap(), Some(5));
        let error = store.set_rating("Series/01.cbz", Some(6), 40).unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidRequest);
        assert_eq!(store.set_rating("Series/01.cbz", None, 50).unwrap(), None);
        assert_eq!(store.rating("Series/01.cbz").unwrap(), None);
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn fr_b07_v2_migration_preserves_old_values_and_is_idempotent() {
        let paths = temporary_paths("fr-b07-migration");
        paths.create(None).unwrap();
        {
            let connection = rusqlite::Connection::open(&paths.database).unwrap();
            connection
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
                     );
                     CREATE TABLE favorites (
                        favorite_id TEXT PRIMARY KEY NOT NULL,
                        item_identity TEXT NOT NULL UNIQUE,
                        relative_path TEXT NOT NULL,
                        item_kind TEXT NOT NULL,
                        size_bytes INTEGER,
                        modified_ms INTEGER,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                     );
                     INSERT INTO schema_migrations(version, applied_at_ms) VALUES(1, 1);
                     INSERT INTO schema_migrations(version, applied_at_ms) VALUES(2, 2);
                     PRAGMA user_version=2;",
                )
                .unwrap();
            connection
                .execute(
                    "INSERT INTO settings(key, value) VALUES(?1, ?2)",
                    params!["sortField", "modified"],
                )
                .unwrap();
            connection
                .execute(
                    "INSERT INTO reading_positions(item_key, page_key, natural_ordinal, updated_at_ms)
                     VALUES(?1, ?2, ?3, ?4)",
                    params!["Series/01.cbz", "page-2.png", 1, 7],
                )
                .unwrap();
            connection
                .execute(
                    "INSERT INTO favorites(
                        favorite_id, item_identity, relative_path, item_kind,
                        size_bytes, modified_ms, created_at_ms, updated_at_ms
                     ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
                    params![
                        "favorite-series-01",
                        "Series/01.cbz",
                        "Series/01.cbz",
                        "archive",
                        12,
                        13,
                        14
                    ],
                )
                .unwrap();
        }
        let (store, notice) = StateStore::open(&paths).unwrap();
        assert!(notice.is_none());
        assert_eq!(
            store
                .connection()
                .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            3
        );
        assert_eq!(store.load_settings().unwrap().sort_field, "modified");
        assert_eq!(
            store
                .reading_position("Series/01.cbz")
                .unwrap()
                .unwrap()
                .page_key,
            RelativePath::parse("page-2.png").unwrap()
        );
        assert_eq!(store.list_favorites().unwrap().len(), 1);
        store.save_memo("Series/01.cbz", "persisted", 20).unwrap();
        store.record_reading_history("Series/01.cbz", 21).unwrap();
        store.set_rating("Series/01.cbz", Some(4), 22).unwrap();
        drop(store);

        let (store, notice) = StateStore::open(&paths).unwrap();
        assert!(notice.is_none());
        assert_eq!(
            store.memo("Series/01.cbz").unwrap(),
            Some("persisted".into())
        );
        assert_eq!(
            store.list_reading_history().unwrap(),
            vec![("Series/01.cbz".into(), 21)]
        );
        assert_eq!(store.rating("Series/01.cbz").unwrap(), Some(4));
        assert_eq!(store.list_favorites().unwrap().len(), 1);
        assert_eq!(store.load_settings().unwrap().sort_field, "modified");
        assert_eq!(
            store
                .reading_position("Series/01.cbz")
                .unwrap()
                .unwrap()
                .natural_ordinal,
            1
        );
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn fr_b07_reading_position_separation_survives_metadata_crud() {
        let paths = temporary_paths("fr-b07-separation");
        let fixture_root = std::env::temp_dir().join(format!(
            "comic-explorer-fr-b07-fixture-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        let original_file = fixture_root.join("original/Series/01.cbz");
        let library_file = fixture_root.join("library/Series/01.cbz");
        let library_management_file = fixture_root.join("library/library.index");
        fs::create_dir_all(original_file.parent().unwrap()).unwrap();
        fs::create_dir_all(library_file.parent().unwrap()).unwrap();
        fs::write(&original_file, b"fixture-original-bytes").unwrap();
        fs::write(&library_file, b"fixture-original-bytes").unwrap();
        fs::write(&library_management_file, b"fixture-library-management").unwrap();
        let original_before = fs::read(&original_file).unwrap();
        let library_before = fs::read(&library_file).unwrap();
        let library_management_before = fs::read(&library_management_file).unwrap();
        assert_eq!(original_before, library_before);

        let (store, _) = StateStore::open(&paths).unwrap();
        store
            .save_reading_position(
                "Series/01.cbz",
                &ReadingPosition {
                    page_key: RelativePath::parse("page-7.png").unwrap(),
                    natural_ordinal: 6,
                },
                10,
            )
            .unwrap();
        store.save_memo("Series/01.cbz", "memo", 11).unwrap();
        store.record_reading_history("Series/01.cbz", 12).unwrap();
        store.set_rating("Series/01.cbz", Some(3), 13).unwrap();
        let position = store.reading_position("Series/01.cbz").unwrap().unwrap();
        assert_eq!(
            position.page_key,
            RelativePath::parse("page-7.png").unwrap()
        );
        assert_eq!(position.natural_ordinal, 6);
        assert_eq!(
            store.list_reading_history().unwrap(),
            vec![("Series/01.cbz".into(), 12)]
        );
        assert_eq!(
            store
                .connection()
                .query_row(
                    "SELECT page_key, natural_ordinal FROM reading_positions WHERE item_key=?1",
                    ["Series/01.cbz"],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
                )
                .unwrap(),
            ("page-7.png".into(), 6)
        );
        drop(store);

        assert_eq!(fs::read(&original_file).unwrap(), original_before);
        assert_eq!(fs::read(&library_file).unwrap(), library_before);
        assert_eq!(
            fs::read(&library_management_file).unwrap(),
            library_management_before
        );
        fs::remove_dir_all(paths.root).unwrap();
        fs::remove_dir_all(fixture_root).unwrap();
    }
}
