use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, params};

use crate::domain::{AppError, ErrorCode, ItemKind, RelativePath, item_id_for};

use super::{AppPaths, ReadingPosition, SourceFingerprint};

const INITIAL_SCHEMA_VERSION: i64 = 1;
const SCHEMA_VERSION: i64 = 4;

fn default_shortcut_bindings() -> BTreeMap<String, String> {
    [
        ("openSelected", "Enter"),
        ("navigateBack", "Alt+ArrowLeft"),
        ("navigateForward", "Alt+ArrowRight"),
        ("navigateUp", "Alt+ArrowUp"),
        ("refreshCatalog", "F5"),
        ("toggleSearch", "Ctrl+F"),
        ("nextPage", "PageDown"),
        ("previousPage", "PageUp"),
        ("closeViewer", "Escape"),
        ("singlePage", "1"),
        ("spreadPage", "2"),
        ("toggleDirection", "R"),
        ("zoomIn", "+"),
        ("zoomOut", "-"),
        ("toggleLoupe", "L"),
        ("toggleFullscreen", "F11"),
    ]
    .into_iter()
    .map(|(command, shortcut)| (command.to_owned(), shortcut.to_owned()))
    .collect()
}

fn default_mouse_gesture_bindings() -> BTreeMap<String, String> {
    [
        ("swipeLeft", "nextPage"),
        ("swipeRight", "previousPage"),
        ("wheelUp", "previousPage"),
        ("wheelDown", "nextPage"),
        ("rightWheelUp", "zoomIn"),
        ("rightWheelDown", "zoomOut"),
        ("middleClick", "none"),
        ("backButton", "previousPage"),
        ("forwardButton", "nextPage"),
        ("doubleClick", "toggleFullscreen"),
    ]
    .into_iter()
    .map(|(gesture, action)| (gesture.to_owned(), action.to_owned()))
    .collect()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Settings {
    pub library_root: Option<PathBuf>,
    pub sort_field: String,
    pub sort_descending: bool,
    pub end_of_volume_policy: String,
    pub catalog_view_mode: String,
    pub small_thumbnail_size: String,
    pub cover_list_thumbnail_size: String,
    pub card_grid_thumbnail_size: String,
    pub reference_tile_thumbnail_size: String,
    pub view_mode: String,
    pub layout_mode: String,
    pub reading_direction: String,
    pub scale_mode: String,
    pub scale: String,
    pub loupe_enabled: bool,
    pub viewer_background: String,
    pub viewer_page_margin: String,
    pub viewer_spread_gap: String,
    pub cursor_auto_hide_ms: String,
    pub zoom_retention: String,
    pub viewer_grid_enabled: bool,
    pub viewer_grid_size: String,
    pub viewer_grid_color: String,
    pub pan_factor: String,
    pub wheel_dead_zone: String,
    pub tree_visible: bool,
    pub menu_bar_visible: bool,
    pub toolbar_visible: bool,
    pub address_bar_visible: bool,
    pub status_bar_visible: bool,
    pub always_on_top: bool,
    pub shortcut_bindings: BTreeMap<String, String>,
    pub mouse_gesture_bindings: BTreeMap<String, String>,
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
            small_thumbnail_size: "104".into(),
            cover_list_thumbnail_size: "144".into(),
            card_grid_thumbnail_size: "216".into(),
            reference_tile_thumbnail_size: "128".into(),
            view_mode: "single".into(),
            layout_mode: "paged".into(),
            reading_direction: "rightToLeft".into(),
            scale_mode: "fit".into(),
            scale: "1".into(),
            loupe_enabled: false,
            viewer_background: "checker".into(),
            viewer_page_margin: "0".into(),
            viewer_spread_gap: "8".into(),
            cursor_auto_hide_ms: "0".into(),
            zoom_retention: "global".into(),
            viewer_grid_enabled: false,
            viewer_grid_size: "32".into(),
            viewer_grid_color: "light".into(),
            pan_factor: "1".into(),
            wheel_dead_zone: "0".into(),
            tree_visible: true,
            menu_bar_visible: true,
            toolbar_visible: true,
            address_bar_visible: true,
            status_bar_visible: true,
            always_on_top: false,
            shortcut_bindings: default_shortcut_bindings(),
            mouse_gesture_bindings: default_mouse_gesture_bindings(),
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
                "smallThumbnailSize" => settings.small_thumbnail_size = value,
                "coverListThumbnailSize" => settings.cover_list_thumbnail_size = value,
                "cardGridThumbnailSize" => settings.card_grid_thumbnail_size = value,
                "referenceTileThumbnailSize" => settings.reference_tile_thumbnail_size = value,
                "viewMode" => settings.view_mode = value,
                "layoutMode" => settings.layout_mode = value,
                "readingDirection" => settings.reading_direction = value,
                "scaleMode" => settings.scale_mode = value,
                "scale" => settings.scale = value,
                "loupeEnabled" => settings.loupe_enabled = value == "true",
                "viewerBackground" => settings.viewer_background = value,
                "viewerPageMargin" => settings.viewer_page_margin = value,
                "viewerSpreadGap" => settings.viewer_spread_gap = value,
                "cursorAutoHideMs" => settings.cursor_auto_hide_ms = value,
                "zoomRetention" => settings.zoom_retention = value,
                "viewerGridEnabled" => settings.viewer_grid_enabled = value == "true",
                "viewerGridSize" => settings.viewer_grid_size = value,
                "viewerGridColor" => settings.viewer_grid_color = value,
                "panFactor" => settings.pan_factor = value,
                "wheelDeadZone" => settings.wheel_dead_zone = value,
                "treeVisible" => settings.tree_visible = value == "true",
                "menuBarVisible" => settings.menu_bar_visible = value == "true",
                "toolbarVisible" => settings.toolbar_visible = value == "true",
                "addressBarVisible" => settings.address_bar_visible = value == "true",
                "statusBarVisible" => settings.status_bar_visible = value == "true",
                "alwaysOnTop" => settings.always_on_top = value == "true",
                "shortcutBindings" => {
                    if let Ok(bindings) = serde_json::from_str::<BTreeMap<String, String>>(&value) {
                        settings.shortcut_bindings = bindings;
                    }
                }
                "mouseGestureBindings" => {
                    if let Ok(bindings) = serde_json::from_str::<BTreeMap<String, String>>(&value) {
                        settings.mouse_gesture_bindings = bindings;
                    }
                }
                _ => {}
            }
        }
        Ok(settings)
    }

    pub fn save_settings(&mut self, settings: &Settings) -> Result<(), AppError> {
        let transaction = self.connection.transaction().map_err(database_error)?;
        let shortcut_bindings =
            serde_json::to_string(&settings.shortcut_bindings).map_err(|error| AppError {
                code: ErrorCode::Internal,
                message: format!("Shortcut settings could not be encoded: {error}"),
                target: None,
                retryable: false,
            })?;
        let mouse_gesture_bindings = serde_json::to_string(&settings.mouse_gesture_bindings)
            .map_err(|error| AppError {
                code: ErrorCode::Internal,
                message: format!("Mouse gesture settings could not be encoded: {error}"),
                target: None,
                retryable: false,
            })?;
        let mut values = vec![
            ("sortField", settings.sort_field.clone()),
            ("sortDescending", settings.sort_descending.to_string()),
            ("endOfVolumePolicy", settings.end_of_volume_policy.clone()),
            ("catalogViewMode", settings.catalog_view_mode.clone()),
            ("smallThumbnailSize", settings.small_thumbnail_size.clone()),
            (
                "coverListThumbnailSize",
                settings.cover_list_thumbnail_size.clone(),
            ),
            (
                "cardGridThumbnailSize",
                settings.card_grid_thumbnail_size.clone(),
            ),
            (
                "referenceTileThumbnailSize",
                settings.reference_tile_thumbnail_size.clone(),
            ),
            ("viewMode", settings.view_mode.clone()),
            ("layoutMode", settings.layout_mode.clone()),
            ("readingDirection", settings.reading_direction.clone()),
            ("scaleMode", settings.scale_mode.clone()),
            ("scale", settings.scale.clone()),
            ("loupeEnabled", settings.loupe_enabled.to_string()),
            ("viewerBackground", settings.viewer_background.clone()),
            ("viewerPageMargin", settings.viewer_page_margin.clone()),
            ("viewerSpreadGap", settings.viewer_spread_gap.clone()),
            ("cursorAutoHideMs", settings.cursor_auto_hide_ms.clone()),
            ("zoomRetention", settings.zoom_retention.clone()),
            (
                "viewerGridEnabled",
                settings.viewer_grid_enabled.to_string(),
            ),
            ("viewerGridSize", settings.viewer_grid_size.clone()),
            ("viewerGridColor", settings.viewer_grid_color.clone()),
            ("panFactor", settings.pan_factor.clone()),
            ("wheelDeadZone", settings.wheel_dead_zone.clone()),
            ("treeVisible", settings.tree_visible.to_string()),
            ("menuBarVisible", settings.menu_bar_visible.to_string()),
            ("toolbarVisible", settings.toolbar_visible.to_string()),
            (
                "addressBarVisible",
                settings.address_bar_visible.to_string(),
            ),
            ("statusBarVisible", settings.status_bar_visible.to_string()),
            ("alwaysOnTop", settings.always_on_top.to_string()),
            ("shortcutBindings", shortcut_bindings),
            ("mouseGestureBindings", mouse_gesture_bindings),
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

    pub fn list_tags(&self) -> Result<Vec<(String, String, u64)>, AppError> {
        self.query_tags("")
    }

    pub fn query_tags(&self, query: &str) -> Result<Vec<(String, String, u64)>, AppError> {
        let normalized_query = normalize_tag_query(query)?;
        let mut statement = self
            .connection
            .prepare(
                "SELECT t.tag_id, t.name, COUNT(it.item_identity) AS item_count
                 FROM tags t
                 LEFT JOIN item_tags it ON it.tag_id=t.tag_id
                 GROUP BY t.tag_id, t.name
                 ORDER BY t.name ASC, t.tag_id ASC",
            )
            .map_err(database_error)?;
        let values = statement
            .query_map([], tag_from_row)
            .map_err(database_error)?;
        values
            .map(|value| value.map_err(database_error))
            .filter(|value| match value {
                Ok(tag) => normalized_query.is_empty() || tag.1.contains(&normalized_query),
                Err(_) => true,
            })
            .collect::<Result<Vec<_>, _>>()
    }

    pub fn tags_for_item(
        &self,
        item_identity: &str,
    ) -> Result<Vec<(String, String, u64)>, AppError> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT t.tag_id, t.name, COUNT(all_assignments.item_identity) AS item_count
                 FROM tags t
                 INNER JOIN item_tags selected ON selected.tag_id=t.tag_id
                 LEFT JOIN item_tags all_assignments ON all_assignments.tag_id=t.tag_id
                 WHERE selected.item_identity=?1
                 GROUP BY t.tag_id, t.name
                 ORDER BY t.name ASC, t.tag_id ASC",
            )
            .map_err(database_error)?;
        let values = statement
            .query_map([item_identity], tag_from_row)
            .map_err(database_error)?;
        values
            .map(|value| value.map_err(database_error))
            .collect::<Result<Vec<_>, _>>()
    }

    pub fn assign_tag(
        &self,
        item_identity: &str,
        tag_name: &str,
        now_ms: i64,
    ) -> Result<Vec<(String, String, u64)>, AppError> {
        let normalized = normalize_tag_name(tag_name)?;
        let tag_id = tag_id_for_name(&normalized);
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO tags(tag_id, name, created_at_ms, updated_at_ms)
                 VALUES(?1, ?2, ?3, ?3)
                 ON CONFLICT(name) DO UPDATE SET updated_at_ms=excluded.updated_at_ms",
                params![tag_id, normalized, now_ms],
            )
            .map_err(database_error)?;
        let canonical_tag_id = transaction
            .query_row(
                "SELECT tag_id FROM tags WHERE name=?1",
                [normalized.as_str()],
                |row| row.get::<_, String>(0),
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO item_tags(item_identity, tag_id, assigned_at_ms)
                 VALUES(?1, ?2, ?3)
                 ON CONFLICT(item_identity, tag_id) DO NOTHING",
                params![item_identity, canonical_tag_id, now_ms],
            )
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
        self.tags_for_item(item_identity)
    }

    pub fn remove_tag(
        &self,
        item_identity: &str,
        tag_id: &str,
    ) -> Result<Vec<(String, String, u64)>, AppError> {
        self.connection
            .execute(
                "DELETE FROM item_tags WHERE item_identity=?1 AND tag_id=?2",
                params![item_identity, tag_id],
            )
            .map_err(database_error)?;
        self.tags_for_item(item_identity)
    }

    pub fn rename_tag(
        &self,
        tag_id: &str,
        new_name: &str,
        now_ms: i64,
    ) -> Result<(String, String, u64), AppError> {
        let normalized = normalize_tag_name(new_name)?;
        let target_id = tag_id_for_name(&normalized);
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(database_error)?;
        let exists = transaction
            .query_row(
                "SELECT 1 FROM tags WHERE tag_id=?1",
                [tag_id],
                |_row| Ok(()),
            )
            .optional()
            .map_err(database_error)?;
        if exists.is_none() {
            return Err(AppError {
                code: ErrorCode::NotFound,
                message: "Tag was not found.".into(),
                target: None,
                retryable: false,
            });
        }
        if tag_id == target_id {
            transaction
                .execute(
                    "UPDATE tags SET name=?1, updated_at_ms=?2 WHERE tag_id=?3",
                    params![normalized, now_ms, tag_id],
                )
                .map_err(database_error)?;
        } else {
            let target_exists = transaction
                .query_row(
                    "SELECT 1 FROM tags WHERE tag_id=?1",
                    [target_id.as_str()],
                    |_row| Ok(()),
                )
                .optional()
                .map_err(database_error)?
                .is_some();
            if !target_exists {
                transaction
                    .execute(
                        "INSERT INTO tags(tag_id, name, created_at_ms, updated_at_ms)
                         SELECT ?1, ?2, created_at_ms, ?3 FROM tags WHERE tag_id=?4",
                        params![target_id, normalized, now_ms, tag_id],
                    )
                    .map_err(database_error)?;
            }
            transaction
                .execute(
                    "INSERT INTO item_tags(item_identity, tag_id, assigned_at_ms)
                     SELECT item_identity, ?1, assigned_at_ms FROM item_tags WHERE tag_id=?2
                     ON CONFLICT(item_identity, tag_id) DO NOTHING",
                    params![target_id, tag_id],
                )
                .map_err(database_error)?;
            transaction
                .execute("DELETE FROM item_tags WHERE tag_id=?1", [tag_id])
                .map_err(database_error)?;
            transaction
                .execute("DELETE FROM tags WHERE tag_id=?1", [tag_id])
                .map_err(database_error)?;
        }
        let renamed = transaction
            .query_row(
                "SELECT t.tag_id, t.name, COUNT(it.item_identity)
                 FROM tags t
                 LEFT JOIN item_tags it ON it.tag_id=t.tag_id
                 WHERE t.tag_id=?1
                 GROUP BY t.tag_id, t.name",
                [target_id.as_str()],
                tag_from_row,
            )
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
        Ok(renamed)
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
            .pragma_update(None, "user_version", 3)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    if version < 4 {
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
        ItemKind::Pdf => "pdf",
        ItemKind::Page => "page",
        ItemKind::Unsupported => "unsupported",
    }
}

fn item_kind_from_storage(value: &str) -> Result<ItemKind, AppError> {
    match value {
        "folder" => Ok(ItemKind::Folder),
        "comicFolder" => Ok(ItemKind::ComicFolder),
        "archive" => Ok(ItemKind::Archive),
        "pdf" => Ok(ItemKind::Pdf),
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

fn tag_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<(String, String, u64)> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get::<_, i64>(2)?.max(0) as u64,
    ))
}

fn tag_id_for_name(name: &str) -> String {
    item_id_for(&format!("tag:{name}"))
        .to_string()
        .replacen("item-", "tag-", 1)
}

fn normalize_tag_name(value: &str) -> Result<String, AppError> {
    let mut output = String::new();
    let mut pending_space = false;
    for character in value.chars() {
        if character == '\0' {
            return Err(AppError {
                code: ErrorCode::InvalidRequest,
                message: "Tag name contains an invalid character.".into(),
                target: None,
                retryable: false,
            });
        }
        let folded = match character {
            '\u{3000}' => ' ',
            '\u{ff01}'..='\u{ff5e}' => {
                char::from_u32(character as u32 - 0xfee0).unwrap_or(character)
            }
            _ => character,
        };
        if folded.is_whitespace() {
            if !output.is_empty() {
                pending_space = true;
            }
            continue;
        }
        if pending_space {
            output.push(' ');
            pending_space = false;
        }
        output.extend(folded.to_lowercase());
    }
    if output.len() > 128 {
        return Err(AppError {
            code: ErrorCode::InvalidRequest,
            message: "Tag name exceeds 128 bytes.".into(),
            target: None,
            retryable: false,
        });
    }
    if output.is_empty() {
        return Err(AppError {
            code: ErrorCode::InvalidRequest,
            message: "Tag name must not be empty.".into(),
            target: None,
            retryable: false,
        });
    }
    Ok(output)
}

fn normalize_tag_query(value: &str) -> Result<String, AppError> {
    if value.trim().is_empty() {
        return Ok(String::new());
    }
    normalize_tag_name(value)
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
    fn fr_b17_catalog_card_modes_and_settings_survive_reopen() {
        let paths = temporary_paths("state-reopen");
        {
            let (mut store, notice) = StateStore::open(&paths).unwrap();
            assert!(notice.is_none());
            let settings = Settings {
                library_root: Some(PathBuf::from(r"C:\Comics")),
                sort_field: "modified".into(),
                sort_descending: true,
                end_of_volume_policy: "loop".into(),
                catalog_view_mode: "card_grid".into(),
                small_thumbnail_size: "120".into(),
                cover_list_thumbnail_size: "176".into(),
                card_grid_thumbnail_size: "224".into(),
                reference_tile_thumbnail_size: "152".into(),
                view_mode: "spread".into(),
                layout_mode: "vertical_scroll".into(),
                reading_direction: "leftToRight".into(),
                scale_mode: "custom".into(),
                scale: "1.7".into(),
                loupe_enabled: true,
                viewer_background: "black".into(),
                viewer_page_margin: "24".into(),
                viewer_spread_gap: "18".into(),
                cursor_auto_hide_ms: "2000".into(),
                zoom_retention: "book".into(),
                viewer_grid_enabled: true,
                viewer_grid_size: "48".into(),
                viewer_grid_color: "dark".into(),
                pan_factor: "1.5".into(),
                wheel_dead_zone: "24".into(),
                tree_visible: false,
                menu_bar_visible: false,
                toolbar_visible: true,
                address_bar_visible: false,
                status_bar_visible: false,
                always_on_top: true,
                shortcut_bindings: [
                    ("nextPage".into(), "N".into()),
                    ("previousPage".into(), "P".into()),
                    ("closeViewer".into(), "Escape".into()),
                    ("singlePage".into(), "1".into()),
                    ("spreadPage".into(), "2".into()),
                    ("toggleDirection".into(), "R".into()),
                    ("zoomIn".into(), "+".into()),
                    ("zoomOut".into(), "-".into()),
                ]
                .into_iter()
                .collect(),
                mouse_gesture_bindings: [
                    ("swipeLeft".into(), "previousPage".into()),
                    ("swipeRight".into(), "nextPage".into()),
                    ("doubleClick".into(), "closeViewer".into()),
                ]
                .into_iter()
                .collect(),
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
        assert_eq!(restored.catalog_view_mode, "card_grid");
        assert_eq!(restored.card_grid_thumbnail_size, "224");
        assert_eq!(restored.reference_tile_thumbnail_size, "152");
        assert_eq!(restored.layout_mode, "vertical_scroll");
        assert!(restored.loupe_enabled);
        assert_eq!(restored.viewer_background, "black");
        assert_eq!(restored.viewer_page_margin, "24");
        assert_eq!(restored.viewer_spread_gap, "18");
        assert_eq!(restored.cursor_auto_hide_ms, "2000");
        assert_eq!(restored.zoom_retention, "book");
        assert!(restored.viewer_grid_enabled);
        assert_eq!(restored.viewer_grid_size, "48");
        assert_eq!(restored.viewer_grid_color, "dark");
        assert_eq!(restored.pan_factor, "1.5");
        assert_eq!(restored.wheel_dead_zone, "24");
        assert!(!restored.tree_visible);
        assert!(!restored.menu_bar_visible);
        assert!(restored.toolbar_visible);
        assert!(!restored.address_bar_visible);
        assert!(!restored.status_bar_visible);
        assert!(restored.always_on_top);
        assert_eq!(restored.shortcut_bindings["nextPage"], "N");
        assert_eq!(
            restored.mouse_gesture_bindings["doubleClick"],
            "closeViewer"
        );
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
    fn fr_b06_favorite_v1_migration_reopen_and_source_separation() {
        fn snapshot_tree(root: &std::path::Path) -> Vec<String> {
            fn collect(
                root: &std::path::Path,
                directory: &std::path::Path,
                rows: &mut Vec<String>,
            ) {
                for entry in fs::read_dir(directory).unwrap() {
                    let path = entry.unwrap().path();
                    let relative = path.strip_prefix(root).unwrap().to_string_lossy();
                    if path.is_dir() {
                        rows.push(format!("D:{relative}"));
                        collect(root, &path, rows);
                    } else {
                        rows.push(format!("F:{relative}:{:?}", fs::read(&path).unwrap()));
                    }
                }
            }

            let mut rows = Vec::new();
            collect(root, root, &mut rows);
            rows.sort();
            rows
        }

        let paths = temporary_paths("fr-b06-v1-migration");
        let fixture_root = std::env::temp_dir().join(format!(
            "comic-explorer-fr-b06-library-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        let library = fixture_root.join("library");
        let source_file = library.join("Series/01.cbz");
        let library_admin = library.join("library.index");
        fs::create_dir_all(source_file.parent().unwrap()).unwrap();
        fs::write(&source_file, b"favorite source bytes").unwrap();
        fs::write(&library_admin, b"library admin bytes").unwrap();
        let before_tree = snapshot_tree(&library);

        paths.create(None).unwrap();
        {
            let connection = Connection::open(&paths.database).unwrap();
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
                     INSERT INTO schema_migrations(version, applied_at_ms) VALUES(1, 1);
                     PRAGMA user_version=1;",
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
                    "INSERT INTO source_fingerprints(item_key, size_bytes, modified_ns, detail_hash)
                     VALUES(?1, ?2, ?3, ?4)",
                    params!["Series/01.cbz", 20, "21", "crc:22"],
                )
                .unwrap();
            connection
                .execute(
                    "INSERT INTO thumbnail_index(
                        content_hash, relative_path, size_bytes, width, height, last_access_ms
                     ) VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
                    params!["thumbnail-hash", "Series/01.cbz", 30, 40, 50, 60],
                )
                .unwrap();
        }

        let favorite = FavoriteRecord {
            favorite_id: "favorite-series-01".into(),
            item_identity: item_id_for("Series/01.cbz").to_string(),
            relative_path: RelativePath::parse("Series/01.cbz").unwrap(),
            kind: ItemKind::Archive,
            size_bytes: Some(20),
            modified_ms: Some(21),
        };
        {
            let (store, notice) = StateStore::open(&paths).unwrap();
            assert!(notice.is_none());
            assert_eq!(
                store
                    .connection()
                    .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                    .unwrap(),
                SCHEMA_VERSION
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
            assert_eq!(
                store.source_fingerprint("Series/01.cbz").unwrap(),
                Some(SourceFingerprint {
                    size_bytes: 20,
                    modified_ns: 21,
                    detail_hash: Some("crc:22".into()),
                })
            );
            assert_eq!(
                store
                    .connection()
                    .query_row(
                        "SELECT relative_path, size_bytes, width, height, last_access_ms
                         FROM thumbnail_index WHERE content_hash=?1",
                        ["thumbnail-hash"],
                        |row| {
                            Ok((
                                row.get::<_, String>(0)?,
                                row.get::<_, i64>(1)?,
                                row.get::<_, i64>(2)?,
                                row.get::<_, i64>(3)?,
                                row.get::<_, i64>(4)?,
                            ))
                        },
                    )
                    .unwrap(),
                ("Series/01.cbz".into(), 30, 40, 50, 60)
            );
            store.upsert_favorite(&favorite, 30).unwrap();
            store.upsert_favorite(&favorite, 31).unwrap();
            let disposable = FavoriteRecord {
                favorite_id: "favorite-disposable".into(),
                item_identity: item_id_for("Series/disposable.cbz").to_string(),
                relative_path: RelativePath::parse("Series/disposable.cbz").unwrap(),
                kind: ItemKind::Archive,
                size_bytes: Some(1),
                modified_ms: Some(2),
            };
            store.upsert_favorite(&disposable, 32).unwrap();
            store.remove_favorite(&disposable.favorite_id).unwrap();
            assert_eq!(store.favorite(&disposable.favorite_id).unwrap(), None);
            assert_eq!(store.list_favorites().unwrap(), vec![favorite.clone()]);
        }

        let (store, notice) = StateStore::open(&paths).unwrap();
        assert!(notice.is_none());
        assert_eq!(store.list_favorites().unwrap(), vec![favorite]);
        drop(store);
        assert_eq!(snapshot_tree(&library), before_tree);
        assert!(!library.join("Series/01.cbz.json").exists());
        fs::remove_dir_all(paths.root).unwrap();
        fs::remove_dir_all(fixture_root).unwrap();
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
            SCHEMA_VERSION
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

    #[test]
    fn fr_b10_ft_b10_001_assign_remove_is_idempotent_and_stable() {
        let paths = temporary_paths("fr-b10-assign-remove");
        let (store, _) = StateStore::open(&paths).unwrap();
        let item_identity = item_id_for("Series/01.cbz").to_string();
        let expected_tag_id = tag_id_for_name("favorite");

        let first = store
            .assign_tag(&item_identity, " Ｆａｖｏｒｉｔｅ ", 1)
            .unwrap();
        let second = store.assign_tag(&item_identity, "favorite", 2).unwrap();
        assert_eq!(first, second);
        assert_eq!(first, vec![(expected_tag_id.clone(), "favorite".into(), 1)]);
        assert_eq!(item_id_for("Series/01.cbz").to_string(), item_identity);

        let removed = store.remove_tag(&item_identity, &expected_tag_id).unwrap();
        assert!(removed.is_empty());
        assert!(
            store
                .remove_tag(&item_identity, &expected_tag_id)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            store.query_tags("").unwrap(),
            vec![(expected_tag_id, "favorite".into(), 0)]
        );
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn fr_b10_ft_b10_002_query_handles_unicode_and_empty_input() {
        let paths = temporary_paths("fr-b10-query");
        let (store, _) = StateStore::open(&paths).unwrap();
        store
            .assign_tag(
                &item_id_for("Series/01.cbz").to_string(),
                " Ｆａｖｏｒｉｔｅ ",
                1,
            )
            .unwrap();
        store
            .assign_tag(&item_id_for("Series/02.cbz").to_string(), "読書", 2)
            .unwrap();

        let favorite = store.query_tags("ＦＡＶ").unwrap();
        assert_eq!(favorite.len(), 1);
        assert_eq!(favorite[0].1, "favorite");
        assert_eq!(store.query_tags("読").unwrap().len(), 1);
        assert_eq!(store.query_tags(" \u{3000} ").unwrap().len(), 2);
        assert_eq!(store.list_tags().unwrap().len(), 2);
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn fr_b10_ft_b10_003_rename_merges_duplicates_and_rejects_invalid_names() {
        let paths = temporary_paths("fr-b10-rename");
        let (store, _) = StateStore::open(&paths).unwrap();
        let first_item = item_id_for("Series/01.cbz").to_string();
        let second_item = item_id_for("Series/02.cbz").to_string();
        store.assign_tag(&first_item, "red", 1).unwrap();
        store.assign_tag(&first_item, "blue", 2).unwrap();
        store.assign_tag(&second_item, "blue", 3).unwrap();

        let renamed = store
            .rename_tag(&tag_id_for_name("red"), " Ｂｌｕｅ ", 4)
            .unwrap();
        assert_eq!(renamed, (tag_id_for_name("blue"), "blue".into(), 2));
        assert_eq!(store.tags_for_item(&first_item).unwrap().len(), 1);
        assert_eq!(store.tags_for_item(&second_item).unwrap().len(), 1);
        assert_eq!(store.query_tags("").unwrap().len(), 1);

        let same_tag = store
            .rename_tag(&tag_id_for_name("blue"), "blue", 5)
            .unwrap();
        assert_eq!(same_tag, renamed);
        assert_eq!(
            store.assign_tag(&first_item, " \t\n ", 6).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        assert_eq!(
            store
                .rename_tag(&tag_id_for_name("blue"), "\0bad", 7)
                .unwrap_err()
                .code,
            ErrorCode::InvalidRequest
        );
        assert_eq!(
            store
                .rename_tag("tag-does-not-exist", "new", 8)
                .unwrap_err()
                .code,
            ErrorCode::NotFound
        );
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn fr_b10_ft_b10_004_v3_migration_restart_and_source_separation() {
        let paths = temporary_paths("fr-b10-migration");
        let fixture_root = std::env::temp_dir().join(format!(
            "comic-explorer-fr-b10-fixture-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        let original_file = fixture_root.join("original/Series/01.cbz");
        let sidecar_file = fixture_root.join("sidecar/Series/01.cbz.json");
        fs::create_dir_all(original_file.parent().unwrap()).unwrap();
        fs::create_dir_all(sidecar_file.parent().unwrap()).unwrap();
        fs::write(&original_file, b"original comic bytes").unwrap();
        fs::write(&sidecar_file, b"sidecar metadata bytes").unwrap();
        let original_before = fs::read(&original_file).unwrap();
        let sidecar_before = fs::read(&sidecar_file).unwrap();

        paths.create(None).unwrap();
        {
            let connection = Connection::open(&paths.database).unwrap();
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
                     CREATE TABLE memos (
                        item_identity TEXT PRIMARY KEY NOT NULL,
                        body TEXT NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                     );
                     CREATE TABLE reading_history (
                        item_identity TEXT PRIMARY KEY NOT NULL,
                        last_viewed_at_ms INTEGER NOT NULL
                     );
                     CREATE TABLE ratings (
                        item_identity TEXT PRIMARY KEY NOT NULL,
                        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
                        updated_at_ms INTEGER NOT NULL
                     );
                     INSERT INTO schema_migrations(version, applied_at_ms) VALUES(1, 1);
                     INSERT INTO schema_migrations(version, applied_at_ms) VALUES(2, 2);
                     INSERT INTO schema_migrations(version, applied_at_ms) VALUES(3, 3);
                     PRAGMA user_version=3;",
                )
                .unwrap();
        }

        {
            let (store, notice) = StateStore::open(&paths).unwrap();
            assert!(notice.is_none());
            assert_eq!(
                store
                    .connection()
                    .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                    .unwrap(),
                4
            );
            let item_identity = item_id_for("Series/01.cbz").to_string();
            store.assign_tag(&item_identity, "migrated", 10).unwrap();
            assert_eq!(store.query_tags("migrated").unwrap().len(), 1);
        }

        let (store, notice) = StateStore::open(&paths).unwrap();
        assert!(notice.is_none());
        let restored = store
            .tags_for_item(&item_id_for("Series/01.cbz").to_string())
            .unwrap();
        assert_eq!(restored.len(), 1);
        assert_eq!(restored[0].1, "migrated");
        drop(store);
        assert_eq!(fs::read(&original_file).unwrap(), original_before);
        assert_eq!(fs::read(&sidecar_file).unwrap(), sidecar_before);
        fs::remove_dir_all(paths.root).unwrap();
        fs::remove_dir_all(fixture_root).unwrap();
    }
}
