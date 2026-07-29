use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use rusqlite::params;

use crate::domain::{AppError, ErrorCode};

use super::{AppPaths, StateStore};

pub const CACHE_HARD_CAP_BYTES: u64 = 10 * 1024 * 1024 * 1024;

pub struct ThumbnailCache {
    root: PathBuf,
    pinned: HashSet<String>,
}

impl ThumbnailCache {
    pub fn new(paths: &AppPaths) -> Result<Self, AppError> {
        let root = paths.cache.join("thumb");
        fs::create_dir_all(&root).map_err(cache_error)?;
        Ok(Self {
            root,
            pinned: HashSet::new(),
        })
    }

    pub fn path_for(&self, content_hash: &str) -> Result<PathBuf, AppError> {
        validate_hash(content_hash)?;
        Ok(self
            .root
            .join(&content_hash[..2])
            .join(format!("{content_hash}.jpg")))
    }

    pub fn write_atomic(
        &self,
        store: &StateStore,
        content_hash: &str,
        jpeg: &[u8],
        width: u32,
        height: u32,
        now_ms: i64,
    ) -> Result<PathBuf, AppError> {
        let target = self.path_for(content_hash)?;
        let parent = target.parent().expect("cache target parent");
        fs::create_dir_all(parent).map_err(cache_error)?;
        let temporary = parent.join(format!(".{content_hash}-{}.tmp", std::process::id()));
        let result = (|| {
            let mut file = fs::File::create(&temporary).map_err(cache_error)?;
            file.write_all(jpeg).map_err(cache_error)?;
            file.sync_all().map_err(cache_error)?;
            if target.exists() {
                fs::remove_file(&target).map_err(cache_error)?;
            }
            fs::rename(&temporary, &target).map_err(cache_error)?;
            let relative_path = target
                .strip_prefix(&self.root)
                .expect("cache path is below root")
                .to_string_lossy();
            store
                .connection()
                .execute(
                    "INSERT INTO thumbnail_index(
                       content_hash, relative_path, size_bytes, width, height, last_access_ms
                     ) VALUES(?1, ?2, ?3, ?4, ?5, ?6)
                     ON CONFLICT(content_hash) DO UPDATE SET
                       relative_path=excluded.relative_path,
                       size_bytes=excluded.size_bytes,
                       width=excluded.width,
                       height=excluded.height,
                       last_access_ms=excluded.last_access_ms",
                    params![
                        content_hash,
                        relative_path,
                        i64::try_from(jpeg.len()).unwrap_or(i64::MAX),
                        width,
                        height,
                        now_ms
                    ],
                )
                .map_err(cache_error)?;
            Ok(target.clone())
        })();
        if result.is_err() {
            let _ = fs::remove_file(temporary);
        }
        result
    }

    pub fn lookup(
        &self,
        store: &StateStore,
        content_hash: &str,
        now_ms: i64,
    ) -> Result<Option<PathBuf>, AppError> {
        let path = self.path_for(content_hash)?;
        if !path.is_file() {
            store
                .connection()
                .execute(
                    "DELETE FROM thumbnail_index WHERE content_hash=?1",
                    [content_hash],
                )
                .map_err(cache_error)?;
            return Ok(None);
        }
        store
            .connection()
            .execute(
                "UPDATE thumbnail_index SET last_access_ms=?2 WHERE content_hash=?1",
                params![content_hash, now_ms],
            )
            .map_err(cache_error)?;
        Ok(Some(path))
    }

    pub fn pin(&mut self, content_hash: &str) -> Result<(), AppError> {
        validate_hash(content_hash)?;
        self.pinned.insert(content_hash.into());
        Ok(())
    }

    pub fn unpin(&mut self, content_hash: &str) {
        self.pinned.remove(content_hash);
    }

    pub fn evict_to_limit(&self, store: &StateStore, limit_bytes: u64) -> Result<u64, AppError> {
        let mut statement = store
            .connection()
            .prepare(
                "SELECT content_hash, relative_path, size_bytes
                 FROM thumbnail_index ORDER BY last_access_ms ASC, content_hash ASC",
            )
            .map_err(cache_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })
            .map_err(cache_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(cache_error)?;
        let mut total = rows.iter().fold(0_u64, |sum, (_, _, bytes)| {
            sum.saturating_add((*bytes).max(0) as u64)
        });
        for (hash, relative, bytes) in rows {
            if total <= limit_bytes {
                break;
            }
            if self.pinned.contains(&hash) {
                continue;
            }
            let path = self.root.join(relative);
            if path.exists() {
                fs::remove_file(path).map_err(cache_error)?;
            }
            store
                .connection()
                .execute("DELETE FROM thumbnail_index WHERE content_hash=?1", [&hash])
                .map_err(cache_error)?;
            total = total.saturating_sub(bytes.max(0) as u64);
        }
        Ok(total)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
}

fn validate_hash(content_hash: &str) -> Result<(), AppError> {
    if content_hash.len() != 64 || !content_hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(AppError {
            code: ErrorCode::InvalidPath,
            message: "Cache key must be a 64-character hexadecimal digest.".into(),
            target: None,
            retryable: false,
        });
    }
    Ok(())
}

fn cache_error(error: impl std::fmt::Display) -> AppError {
    AppError {
        code: ErrorCode::Internal,
        message: format!("Thumbnail cache error: {error}"),
        target: None,
        retryable: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_paths() -> AppPaths {
        AppPaths::under(std::env::temp_dir().join(format!(
            "comic-explorer-cache-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        )))
    }

    #[test]
    fn atomic_cache_write_lookup_and_lru_respect_pins() {
        let paths = temporary_paths();
        let (store, _) = StateStore::open(&paths).unwrap();
        let mut cache = ThumbnailCache::new(&paths).unwrap();
        let first = "01".repeat(32);
        let second = "02".repeat(32);
        cache
            .write_atomic(&store, &first, b"first", 100, 150, 1)
            .unwrap();
        cache
            .write_atomic(&store, &second, b"second", 100, 150, 2)
            .unwrap();
        cache.pin(&first).unwrap();

        assert_eq!(cache.evict_to_limit(&store, 5).unwrap(), 5);
        assert!(cache.lookup(&store, &first, 3).unwrap().is_some());
        assert!(cache.lookup(&store, &second, 3).unwrap().is_none());
        cache.unpin(&first);
        assert_eq!(cache.evict_to_limit(&store, 0).unwrap(), 0);
        drop(cache);
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }
}
