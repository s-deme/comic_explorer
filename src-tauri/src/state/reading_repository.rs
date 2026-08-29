//! Domain-specific SQLite operations kept behind the StateStore connection boundary.

use super::*;

impl StateStore {
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

    pub fn list_bookmarks(
        &self,
        root_namespace: &str,
        item_key: &str,
    ) -> Result<Vec<BookmarkRecord>, AppError> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT root_namespace, item_key, page_key, natural_ordinal, created_at_ms
                 FROM page_bookmarks
                 WHERE root_namespace=?1 AND item_key=?2
                 ORDER BY natural_ordinal ASC, created_at_ms ASC, page_key ASC
                 LIMIT ?3",
            )
            .map_err(database_error)?;
        let values = statement
            .query_map(
                params![root_namespace, item_key, MAX_BOOKMARKS_PER_ITEM],
                |row| {
                    Ok(BookmarkRecord {
                        root_namespace: row.get(0)?,
                        item_key: row.get(1)?,
                        page_key: row.get(2)?,
                        natural_ordinal: row.get::<_, i64>(3)?.max(0) as u64,
                        created_at_ms: row.get::<_, i64>(4)?.max(0) as u64,
                    })
                },
            )
            .map_err(database_error)?;
        values
            .map(|value| value.map_err(database_error))
            .collect::<Result<Vec<_>, _>>()
    }

    pub fn save_bookmark(&self, bookmark: &BookmarkRecord) -> Result<(), AppError> {
        let existing = self
            .connection
            .query_row(
                "SELECT 1 FROM page_bookmarks
                 WHERE root_namespace=?1 AND item_key=?2 AND page_key=?3",
                params![
                    bookmark.root_namespace,
                    bookmark.item_key,
                    bookmark.page_key
                ],
                |_| Ok(()),
            )
            .optional()
            .map_err(database_error)?
            .is_some();
        if !existing {
            let count = self
                .connection
                .query_row(
                    "SELECT COUNT(*) FROM page_bookmarks
                     WHERE root_namespace=?1 AND item_key=?2",
                    params![bookmark.root_namespace, bookmark.item_key],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(database_error)?;
            if count >= MAX_BOOKMARKS_PER_ITEM {
                return Err(AppError {
                    code: ErrorCode::InvalidRequest,
                    message: "Bookmark limit reached for this item.".into(),
                    target: None,
                    retryable: false,
                });
            }
        }
        self.connection
            .execute(
                "INSERT INTO page_bookmarks(
                   root_namespace, item_key, page_key, natural_ordinal, created_at_ms
                 ) VALUES(?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(root_namespace, item_key, page_key) DO UPDATE SET
                   natural_ordinal=excluded.natural_ordinal,
                   created_at_ms=excluded.created_at_ms",
                params![
                    bookmark.root_namespace,
                    bookmark.item_key,
                    bookmark.page_key,
                    i64::try_from(bookmark.natural_ordinal).unwrap_or(i64::MAX),
                    i64::try_from(bookmark.created_at_ms).unwrap_or(i64::MAX),
                ],
            )
            .map_err(database_error)?;
        Ok(())
    }

    pub fn delete_bookmark(
        &self,
        root_namespace: &str,
        item_key: &str,
        page_key: &str,
    ) -> Result<(), AppError> {
        self.connection
            .execute(
                "DELETE FROM page_bookmarks
                 WHERE root_namespace=?1 AND item_key=?2 AND page_key=?3",
                params![root_namespace, item_key, page_key],
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
                 ORDER BY last_viewed_at_ms DESC, item_identity ASC
                 LIMIT 20",
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

    pub fn clear_reading_history(&self) -> Result<(), AppError> {
        self.connection
            .execute("DELETE FROM reading_history", [])
            .map_err(database_error)?;
        Ok(())
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
}
