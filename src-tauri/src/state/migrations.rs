use rusqlite::{Connection, params};

use crate::domain::{AppError, ErrorCode};

use super::{INITIAL_SCHEMA_VERSION, SCHEMA_VERSION, database_error, unix_millis};

pub(super) fn migrate(connection: &Connection) -> Result<(), AppError> {
    migrate_through(connection, SCHEMA_VERSION)
}

pub(super) fn migrate_through(
    connection: &Connection,
    target_version: i64,
) -> Result<(), AppError> {
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
    if version == 0 && target_version >= INITIAL_SCHEMA_VERSION {
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
        // Persist fresh-install provenance before any later migration commit.
        // If startup is interrupted between schema steps, v13's legacy-light
        // compatibility insert remains an OR IGNORE and cannot replace this.
        transaction
            .execute(
                "INSERT INTO settings(key,value) VALUES('appThemeSelection',?1)",
                [r#"{"kind":"system"}"#],
            )
            .map_err(database_error)?;
        transaction
            .pragma_update(None, "user_version", INITIAL_SCHEMA_VERSION)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    if version < 2 && target_version >= 2 {
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
    if version < 3 && target_version >= 3 {
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
            .pragma_update(None, "user_version", 3)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    if version < 4 && target_version >= 4 {
        let transaction = connection.unchecked_transaction().map_err(database_error)?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS tags (
                    tag_id TEXT PRIMARY KEY NOT NULL,
                    name TEXT NOT NULL UNIQUE,
                    created_at_ms INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS item_tags (
                    item_identity TEXT NOT NULL,
                    tag_id TEXT NOT NULL,
                    assigned_at_ms INTEGER NOT NULL,
                    PRIMARY KEY(item_identity, tag_id),
                    FOREIGN KEY(tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
                 );
                 CREATE INDEX IF NOT EXISTS tags_name
                   ON tags(name);
                 CREATE INDEX IF NOT EXISTS item_tags_tag_id
                   ON item_tags(tag_id, item_identity);",
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO schema_migrations(version, applied_at_ms) VALUES(?1, ?2)",
                params![4, unix_millis()],
            )
            .map_err(database_error)?;
        transaction
            .pragma_update(None, "user_version", 4)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    if version < 5 && target_version >= 5 {
        let transaction = connection.unchecked_transaction().map_err(database_error)?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS page_bookmarks (
                    root_namespace TEXT NOT NULL,
                    item_key TEXT NOT NULL,
                    page_key TEXT NOT NULL,
                    natural_ordinal INTEGER NOT NULL CHECK(natural_ordinal >= 0),
                    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
                    PRIMARY KEY(root_namespace, item_key, page_key)
                 );
                 CREATE INDEX IF NOT EXISTS page_bookmarks_item_order
                   ON page_bookmarks(
                     root_namespace, item_key, natural_ordinal, created_at_ms, page_key
                   );",
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO schema_migrations(version, applied_at_ms) VALUES(?1, ?2)",
                params![5, unix_millis()],
            )
            .map_err(database_error)?;
        transaction
            .pragma_update(None, "user_version", 5)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    if version < 6 && target_version >= 6 {
        let transaction = connection.unchecked_transaction().map_err(database_error)?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS catalog_masks (
                    name TEXT PRIMARY KEY NOT NULL CHECK(length(name) BETWEEN 1 AND 64),
                    expression TEXT NOT NULL CHECK(length(expression) <= 1024),
                    include_folders INTEGER NOT NULL CHECK(include_folders IN (0, 1)),
                    include_files INTEGER NOT NULL CHECK(include_files IN (0, 1)),
                    min_size_bytes INTEGER CHECK(min_size_bytes >= 0),
                    max_size_bytes INTEGER CHECK(max_size_bytes >= 0),
                    modified_after_ms INTEGER CHECK(modified_after_ms >= 0),
                    modified_before_ms INTEGER CHECK(modified_before_ms >= 0),
                    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0)
                 );
                 CREATE INDEX IF NOT EXISTS catalog_masks_updated
                   ON catalog_masks(updated_at_ms DESC, name ASC);",
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO schema_migrations(version, applied_at_ms) VALUES(?1, ?2)",
                params![6, unix_millis()],
            )
            .map_err(database_error)?;
        transaction
            .pragma_update(None, "user_version", 6)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    if version < 7 && target_version >= 7 {
        let transaction = connection.unchecked_transaction().map_err(database_error)?;
        transaction.execute_batch(
            "CREATE TABLE IF NOT EXISTS external_apps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 64),
                executable_path TEXT NOT NULL UNIQUE,
                fixed_args_json TEXT NOT NULL,
                target_mode TEXT NOT NULL CHECK(target_mode IN ('firstItem', 'allSelected', 'parentFolder')),
                updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0)
             );
             CREATE INDEX IF NOT EXISTS external_apps_name ON external_apps(display_name COLLATE NOCASE, id);
             CREATE TABLE IF NOT EXISTS external_app_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_id INTEGER NOT NULL,
                display_name TEXT NOT NULL,
                target_mode TEXT NOT NULL,
                target_count INTEGER NOT NULL CHECK(target_count BETWEEN 1 AND 64),
                launched_at_ms INTEGER NOT NULL CHECK(launched_at_ms >= 0)
             );
             CREATE INDEX IF NOT EXISTS external_app_history_time
               ON external_app_history(launched_at_ms DESC, id DESC);"
        ).map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO schema_migrations(version, applied_at_ms) VALUES(?1, ?2)",
                params![7, unix_millis()],
            )
            .map_err(database_error)?;
        transaction
            .pragma_update(None, "user_version", 7)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    if version < 8 && target_version >= 8 {
        let transaction = connection.unchecked_transaction().map_err(database_error)?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS named_settings_profiles (
                    name TEXT PRIMARY KEY COLLATE NOCASE NOT NULL
                      CHECK(length(name) BETWEEN 1 AND 64),
                    profile_json TEXT NOT NULL CHECK(length(profile_json) BETWEEN 2 AND 131072),
                    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0)
                 );
                 CREATE INDEX IF NOT EXISTS named_settings_profiles_updated
                   ON named_settings_profiles(updated_at_ms DESC, name COLLATE NOCASE ASC);",
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO schema_migrations(version, applied_at_ms) VALUES(?1, ?2)",
                params![8, unix_millis()],
            )
            .map_err(database_error)?;
        transaction
            .pragma_update(None, "user_version", 8)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    if version < 9 && target_version >= 9 {
        let transaction = connection.unchecked_transaction().map_err(database_error)?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS csv_export_presets (
                    name TEXT PRIMARY KEY COLLATE NOCASE NOT NULL
                      CHECK(length(name) BETWEEN 1 AND 64),
                    config_json TEXT NOT NULL CHECK(length(config_json) BETWEEN 2 AND 8192),
                    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0)
                 );
                 CREATE INDEX IF NOT EXISTS csv_export_presets_updated
                   ON csv_export_presets(updated_at_ms DESC, name COLLATE NOCASE ASC);",
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO schema_migrations(version, applied_at_ms) VALUES(?1, ?2)",
                params![9, unix_millis()],
            )
            .map_err(database_error)?;
        transaction
            .pragma_update(None, "user_version", 9)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    if version < 10 && target_version >= 10 {
        let transaction = connection.unchecked_transaction().map_err(database_error)?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS virtual_shelves (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(name) BETWEEN 1 AND 64),
                    icon TEXT NOT NULL CHECK(icon IN ('books', 'folder', 'star', 'archive', 'image')),
                    sort_order INTEGER NOT NULL CHECK(sort_order >= 0),
                    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
                    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0)
                 );
                 CREATE UNIQUE INDEX IF NOT EXISTS virtual_shelves_order
                   ON virtual_shelves(sort_order);
                 CREATE TABLE IF NOT EXISTS virtual_shelf_nodes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    shelf_id INTEGER NOT NULL REFERENCES virtual_shelves(id) ON DELETE CASCADE,
                    parent_id INTEGER REFERENCES virtual_shelf_nodes(id) ON DELETE CASCADE,
                    node_type TEXT NOT NULL CHECK(node_type IN ('folder', 'item')),
                    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 64),
                    target_path TEXT,
                    target_kind TEXT,
                    icon TEXT NOT NULL CHECK(icon IN ('books', 'folder', 'star', 'archive', 'image')),
                    sort_order INTEGER NOT NULL CHECK(sort_order >= 0),
                    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
                    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0),
                    CHECK((node_type='folder' AND target_path IS NULL AND target_kind IS NULL)
                       OR (node_type='item' AND target_path IS NOT NULL AND target_kind IS NOT NULL)),
                    UNIQUE(shelf_id, parent_id, name COLLATE NOCASE),
                    UNIQUE(shelf_id, parent_id, sort_order)
                 );
                 CREATE INDEX IF NOT EXISTS virtual_shelf_nodes_parent
                   ON virtual_shelf_nodes(shelf_id, parent_id, sort_order, id);
                 CREATE UNIQUE INDEX IF NOT EXISTS virtual_shelf_item_target
                   ON virtual_shelf_nodes(shelf_id, IFNULL(parent_id, -1), target_path COLLATE NOCASE)
                   WHERE node_type='item';
                 CREATE TABLE IF NOT EXISTS virtual_shelf_preferences (
                    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
                    startup_shelf_id INTEGER REFERENCES virtual_shelves(id) ON DELETE SET NULL
                 );
                 INSERT OR IGNORE INTO virtual_shelf_preferences(singleton, startup_shelf_id)
                   VALUES(1, NULL);",
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO schema_migrations(version, applied_at_ms) VALUES(?1, ?2)",
                params![10, unix_millis()],
            )
            .map_err(database_error)?;
        transaction
            .pragma_update(None, "user_version", 10)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    if version < 11 && target_version >= 11 {
        let transaction = connection.unchecked_transaction().map_err(database_error)?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS offline_media (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    identity TEXT NOT NULL UNIQUE CHECK(length(identity) BETWEEN 1 AND 128),
                    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 128),
                    source_subpath TEXT NOT NULL CHECK(length(source_subpath) <= 32767),
                    volume_label TEXT NOT NULL CHECK(length(volume_label) <= 128),
                    icon TEXT NOT NULL CHECK(icon IN ('disc', 'removable', 'archive', 'star')),
                    filesystem TEXT NOT NULL CHECK(length(filesystem) BETWEEN 1 AND 32),
                    volume_serial INTEGER NOT NULL CHECK(volume_serial >= 0),
                    scanned_at_ms INTEGER NOT NULL CHECK(scanned_at_ms >= 0),
                    entry_count INTEGER NOT NULL CHECK(entry_count BETWEEN 0 AND 50000),
                    thumbnail_count INTEGER NOT NULL CHECK(thumbnail_count BETWEEN 0 AND 256)
                 );
                 CREATE TABLE IF NOT EXISTS offline_media_entries (
                    media_id INTEGER NOT NULL REFERENCES offline_media(id) ON DELETE CASCADE,
                    relative_path TEXT NOT NULL CHECK(length(relative_path) BETWEEN 1 AND 32767),
                    parent_path TEXT NOT NULL CHECK(length(parent_path) <= 32767),
                    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 255),
                    kind TEXT NOT NULL CHECK(kind IN ('folder', 'image', 'archive', 'pdf', 'other')),
                    size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
                    modified_ms INTEGER NOT NULL CHECK(modified_ms >= 0),
                    has_thumbnail INTEGER NOT NULL CHECK(has_thumbnail IN (0, 1)),
                    sort_order INTEGER NOT NULL CHECK(sort_order >= 0),
                    PRIMARY KEY(media_id, relative_path)
                 );
                 CREATE INDEX IF NOT EXISTS offline_media_entries_parent
                   ON offline_media_entries(media_id, parent_path, sort_order, relative_path);
                 CREATE TABLE IF NOT EXISTS offline_media_thumbnails (
                    media_id INTEGER NOT NULL,
                    relative_path TEXT NOT NULL,
                    jpeg BLOB NOT NULL CHECK(length(jpeg) BETWEEN 1 AND 1048576),
                    width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 16384),
                    height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 16384),
                    PRIMARY KEY(media_id, relative_path),
                    FOREIGN KEY(media_id, relative_path)
                      REFERENCES offline_media_entries(media_id, relative_path) ON DELETE CASCADE
                 );",
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO schema_migrations(version, applied_at_ms) VALUES(?1, ?2)",
                params![11, unix_millis()],
            )
            .map_err(database_error)?;
        transaction
            .pragma_update(None, "user_version", 11)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    if version < 12 && target_version >= 12 {
        let transaction = connection.unchecked_transaction().map_err(database_error)?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS viewer_filter_sets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(name) BETWEEN 1 AND 64),
                    chain_json TEXT NOT NULL CHECK(length(chain_json) BETWEEN 2 AND 32768),
                    active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1)),
                    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0)
                 );
                 CREATE UNIQUE INDEX IF NOT EXISTS viewer_filter_sets_one_active
                   ON viewer_filter_sets(active) WHERE active=1;
                 CREATE INDEX IF NOT EXISTS viewer_filter_sets_updated
                   ON viewer_filter_sets(updated_at_ms DESC, id DESC);",
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO schema_migrations(version, applied_at_ms) VALUES(?1, ?2)",
                params![12, unix_millis()],
            )
            .map_err(database_error)?;
        transaction
            .pragma_update(None, "user_version", 12)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    if version < 13 && target_version >= 13 {
        let transaction = connection.unchecked_transaction().map_err(database_error)?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS custom_themes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL
                      CHECK(length(name) BETWEEN 1 AND 64),
                    name_key TEXT NOT NULL UNIQUE CHECK(length(name_key) >= 1),
                    definition_json TEXT NOT NULL
                      CHECK(length(CAST(definition_json AS BLOB)) BETWEEN 2 AND 65536),
                    revision INTEGER NOT NULL CHECK(revision >= 1),
                    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
                    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0)
                 );
                 CREATE INDEX IF NOT EXISTS custom_themes_updated
                   ON custom_themes(updated_at_ms DESC,id DESC);",
            )
            .map_err(database_error)?;
        // The initial `version` remains zero while a fresh database runs all
        // migrations. Only pre-existing databases receive the compatibility
        // value; a truly new database keeps Settings::default() == system.
        if version > 0 {
            transaction
                .execute(
                    "INSERT OR IGNORE INTO settings(key,value)
                     VALUES('appThemeSelection',?1)",
                    [r#"{"kind":"builtin","themeId":"light"}"#],
                )
                .map_err(database_error)?;
        }
        transaction
            .execute(
                "INSERT INTO schema_migrations(version, applied_at_ms) VALUES(?1, ?2)",
                params![13, unix_millis()],
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
