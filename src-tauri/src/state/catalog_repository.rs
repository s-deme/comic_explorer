//! Domain-specific SQLite operations kept behind the StateStore connection boundary.

use super::*;

impl StateStore {
    pub fn list_catalog_masks(&self) -> Result<Vec<CatalogMaskRecord>, AppError> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT name, expression, include_folders, include_files,
                        min_size_bytes, max_size_bytes, modified_after_ms,
                        modified_before_ms, updated_at_ms
                 FROM catalog_masks
                 ORDER BY updated_at_ms DESC, name ASC
                 LIMIT ?1",
            )
            .map_err(database_error)?;
        let values = statement
            .query_map([MAX_SAVED_CATALOG_MASKS], |row| {
                Ok(CatalogMaskRecord {
                    name: row.get(0)?,
                    expression: row.get(1)?,
                    include_folders: row.get::<_, i64>(2)? != 0,
                    include_files: row.get::<_, i64>(3)? != 0,
                    min_size_bytes: optional_nonnegative_integer(row, 4)?,
                    max_size_bytes: optional_nonnegative_integer(row, 5)?,
                    modified_after_ms: optional_nonnegative_integer(row, 6)?,
                    modified_before_ms: optional_nonnegative_integer(row, 7)?,
                    updated_at_ms: row.get::<_, i64>(8)?.max(0) as u64,
                })
            })
            .map_err(database_error)?;
        values
            .map(|value| value.map_err(database_error))
            .collect::<Result<Vec<_>, _>>()
    }

    pub fn save_catalog_mask(&mut self, mask: &CatalogMaskRecord) -> Result<(), AppError> {
        let transaction = self.connection.transaction().map_err(database_error)?;
        let exists = transaction
            .query_row(
                "SELECT 1 FROM catalog_masks WHERE name=?1",
                [&mask.name],
                |_| Ok(()),
            )
            .optional()
            .map_err(database_error)?
            .is_some();
        if !exists {
            let count = transaction
                .query_row("SELECT COUNT(*) FROM catalog_masks", [], |row| {
                    row.get::<_, i64>(0)
                })
                .map_err(database_error)?;
            if count >= MAX_SAVED_CATALOG_MASKS {
                return Err(AppError {
                    code: ErrorCode::InvalidRequest,
                    message: "Saved catalog mask limit reached.".into(),
                    target: None,
                    retryable: false,
                });
            }
        }
        transaction
            .execute(
                "INSERT INTO catalog_masks(
                   name, expression, include_folders, include_files,
                   min_size_bytes, max_size_bytes, modified_after_ms,
                   modified_before_ms, updated_at_ms
                 ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(name) DO UPDATE SET
                   expression=excluded.expression,
                   include_folders=excluded.include_folders,
                   include_files=excluded.include_files,
                   min_size_bytes=excluded.min_size_bytes,
                   max_size_bytes=excluded.max_size_bytes,
                   modified_after_ms=excluded.modified_after_ms,
                   modified_before_ms=excluded.modified_before_ms,
                   updated_at_ms=excluded.updated_at_ms",
                params![
                    mask.name,
                    mask.expression,
                    mask.include_folders,
                    mask.include_files,
                    mask.min_size_bytes
                        .map(|value| i64::try_from(value).unwrap_or(i64::MAX)),
                    mask.max_size_bytes
                        .map(|value| i64::try_from(value).unwrap_or(i64::MAX)),
                    mask.modified_after_ms
                        .map(|value| i64::try_from(value).unwrap_or(i64::MAX)),
                    mask.modified_before_ms
                        .map(|value| i64::try_from(value).unwrap_or(i64::MAX)),
                    i64::try_from(mask.updated_at_ms).unwrap_or(i64::MAX),
                ],
            )
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)
    }

    pub fn delete_catalog_mask(&self, name: &str) -> Result<(), AppError> {
        self.connection
            .execute("DELETE FROM catalog_masks WHERE name=?1", [name])
            .map_err(database_error)?;
        Ok(())
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
}
