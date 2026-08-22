use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use crate::catalog::{CoverBytes, read_cover};
use crate::domain::{AppError, ErrorCode, RelativePath};

use super::{AppPaths, CACHE_HARD_CAP_BYTES, StateStore, ThumbnailCache, ThumbnailPins};

const NEGATIVE_CACHE_TTL_MS: i64 = 30_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NegativeThumbnail {
    pub reason: AppError,
    pub expires_at_ms: i64,
}

pub struct ThumbnailPipeline {
    cache: ThumbnailCache,
    temp: PathBuf,
    negative: HashMap<String, NegativeThumbnail>,
}

impl ThumbnailPipeline {
    pub fn new(paths: &AppPaths) -> Result<Self, AppError> {
        std::fs::create_dir_all(&paths.temp).map_err(pipeline_io_error)?;
        Ok(Self {
            cache: ThumbnailCache::new(paths)?,
            temp: paths.temp.clone(),
            negative: HashMap::new(),
        })
    }

    pub fn pins(&self) -> ThumbnailPins {
        self.cache.pins()
    }

    #[cfg(target_os = "windows")]
    pub fn resolve(
        &mut self,
        store: &StateStore,
        root: &Path,
        item: &RelativePath,
        now_ms: i64,
    ) -> Result<ThumbnailResult, AppError> {
        self.negative
            .retain(|_, failure| failure.expires_at_ms > now_ms);
        if let Some(failure) = self.negative.get(item.as_str()) {
            return Err(failure.reason.clone());
        }

        let result = (|| {
            let cover = read_cover(root, item)?;
            self.resolve_cover(store, cover, now_ms)
        })();

        if let Err(error) = &result {
            self.negative.insert(
                item.to_string(),
                NegativeThumbnail {
                    reason: error.clone(),
                    expires_at_ms: now_ms.saturating_add(NEGATIVE_CACHE_TTL_MS),
                },
            );
        }
        result
    }

    #[cfg(target_os = "windows")]
    pub fn resolve_cover(
        &mut self,
        store: &StateStore,
        cover: CoverBytes,
        now_ms: i64,
    ) -> Result<ThumbnailResult, AppError> {
        let content_hash =
            stable_digest(&(cover.source_key.as_str(), cover.fingerprint_detail.as_str()));
        if let Some(path) = self.cache.lookup(store, &content_hash, now_ms)? {
            self.cache.pin(&content_hash)?;
            return Ok(ThumbnailResult {
                content_hash,
                path,
                cache_hit: true,
            });
        }

        let temporary = self.temp.join(format!(
            "thumb-{}-{}-{}.jpg",
            std::process::id(),
            now_ms,
            &content_hash[..16]
        ));
        let generated: Result<ThumbnailResult, AppError> = (|| {
            let (width, height) = crate::catalog::encode_wic_jpeg(&cover.bytes, &temporary)?;
            let jpeg = std::fs::read(&temporary).map_err(pipeline_io_error)?;
            let path =
                self.cache
                    .write_atomic(store, &content_hash, &jpeg, width, height, now_ms)?;
            self.cache.pin(&content_hash)?;
            self.cache.evict_to_limit(store, CACHE_HARD_CAP_BYTES)?;
            Ok(ThumbnailResult {
                content_hash,
                path,
                cache_hit: false,
            })
        })();
        let _ = std::fs::remove_file(&temporary);
        generated
    }

    pub fn replace_pins(&mut self, content_hashes: &[String]) -> Result<(), AppError> {
        self.cache.clear_pins()?;
        for hash in content_hashes {
            self.cache.pin(hash)?;
        }
        Ok(())
    }

    pub fn retry(&mut self, item: &RelativePath) {
        self.negative.remove(item.as_str());
    }

    #[cfg(test)]
    fn negative(&self, item: &str) -> Option<&NegativeThumbnail> {
        self.negative.get(item)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ThumbnailResult {
    pub content_hash: String,
    pub path: PathBuf,
    pub cache_hit: bool,
}

fn stable_digest(value: &impl Hash) -> String {
    let mut output = String::with_capacity(64);
    for seed in [
        0xcbf2_9ce4_8422_2325,
        0x9e37_79b9_7f4a_7c15,
        0xd6e8_feb8_6659_fd93,
        0xa076_1d64_78bd_642f,
    ] {
        let mut hasher = StableHasher(seed);
        value.hash(&mut hasher);
        output.push_str(&format!("{:016x}", hasher.finish()));
    }
    output
}

struct StableHasher(u64);

impl Hasher for StableHasher {
    fn finish(&self) -> u64 {
        self.0
    }

    fn write(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.0 ^= u64::from(*byte);
            self.0 = self.0.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
}

fn pipeline_io_error(error: impl std::fmt::Display) -> AppError {
    AppError {
        code: ErrorCode::Internal,
        message: format!("Thumbnail pipeline storage error: {error}"),
        target: None,
        retryable: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Instant, SystemTime, UNIX_EPOCH};

    fn temporary_paths(name: &str) -> AppPaths {
        AppPaths::under(std::env::temp_dir().join(format!(
            "comic-explorer-thumbnail-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        )))
    }

    #[test]
    fn digest_is_stable_and_cache_compatible() {
        let digest = stable_digest(&("folder:book", "size:10"));
        assert_eq!(digest.len(), 64);
        assert!(digest.bytes().all(|byte| byte.is_ascii_hexdigit()));
        assert_eq!(digest, stable_digest(&("folder:book", "size:10")));
        assert_ne!(digest, stable_digest(&("folder:book", "size:11")));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn real_folder_cover_generates_then_hits_atomic_cache_and_negative_cache_expires() {
        let paths = temporary_paths("integration");
        let (store, _) = StateStore::open(&paths).unwrap();
        let mut pipeline = ThumbnailPipeline::new(&paths).unwrap();
        let fixture_root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/generated");
        let item = RelativePath::parse("FIX-IMAGE-001").unwrap();
        let first = pipeline.resolve(&store, &fixture_root, &item, 100).unwrap();
        assert!(!first.cache_hit);
        assert!(first.path.starts_with(&paths.cache));
        assert!(first.path.is_file());
        pipeline.replace_pins(&[]).unwrap();
        let second = pipeline.resolve(&store, &fixture_root, &item, 101).unwrap();
        assert!(second.cache_hit);
        assert_eq!(first.path, second.path);

        let mutable_root = paths.root.join("library");
        let mutable_book = mutable_root.join("book");
        std::fs::create_dir_all(&mutable_book).unwrap();
        std::fs::copy(
            fixture_root.join("FIX-IMAGE-001/portrait.png"),
            mutable_book.join("1.png"),
        )
        .unwrap();
        let mutable_item = RelativePath::parse("book").unwrap();
        let original = pipeline
            .resolve(&store, &mutable_root, &mutable_item, 150)
            .unwrap();
        pipeline.replace_pins(&[]).unwrap();
        std::fs::copy(
            fixture_root.join("FIX-IMAGE-001/wide.png"),
            mutable_book.join("1.png"),
        )
        .unwrap();
        let regenerated = pipeline
            .resolve(&store, &mutable_root, &mutable_item, 151)
            .unwrap();
        assert!(!regenerated.cache_hit);
        assert_ne!(original.content_hash, regenerated.content_hash);
        assert_ne!(original.path, regenerated.path);

        let archive = RelativePath::parse("FIX-LIBRARY-001/same-a.cbz").unwrap();
        let archive_thumbnail = pipeline
            .resolve(&store, &fixture_root, &archive, 175)
            .unwrap();
        assert!(archive_thumbnail.path.is_file());
        assert!(!fixture_root.join("FIX-LIBRARY-001/1.png").exists());

        let direct_image = RelativePath::parse("FIX-IMAGE-001/portrait.png").unwrap();
        let direct_thumbnail = pipeline
            .resolve(&store, &fixture_root, &direct_image, 180)
            .unwrap();
        assert!(direct_thumbnail.path.is_file());

        let broken = RelativePath::parse("FIX-IMAGE-ERROR-001").unwrap();
        let first_error = pipeline
            .resolve(&store, &fixture_root, &broken, 200)
            .unwrap_err();
        assert!(pipeline.negative(broken.as_str()).is_some());
        assert_eq!(
            pipeline
                .resolve(&store, &fixture_root, &broken, 201)
                .unwrap_err(),
            first_error
        );
        pipeline.retry(&broken);
        assert!(pipeline.negative(broken.as_str()).is_none());
        drop(store);
        std::fs::remove_dir_all(paths.root).unwrap();
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn req_ley_p3_009_measures_small_real_recursive_batch_through_shared_pipeline() {
        let paths = temporary_paths("recursive-batch-measure");
        let (store, _) = StateStore::open(&paths).unwrap();
        let mut pipeline = ThumbnailPipeline::new(&paths).unwrap();
        let fixture_root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/generated");
        let candidates = [
            RelativePath::parse("FIX-IMAGE-001").unwrap(),
            RelativePath::parse("FIX-IMAGE-001/portrait.png").unwrap(),
            RelativePath::parse("FIX-LIBRARY-001/same-a.cbz").unwrap(),
        ];
        let started = Instant::now();
        for (index, candidate) in candidates.iter().enumerate() {
            let thumbnail = pipeline
                .resolve(&store, &fixture_root, candidate, 1_000 + index as i64)
                .unwrap();
            assert!(thumbnail.path.is_file());
            pipeline.replace_pins(&[]).unwrap();
        }
        let elapsed = started.elapsed();
        assert!(elapsed < std::time::Duration::from_secs(60));
        eprintln!("REQ-LEY-P3-009 3 real thumbnail batch generation: {elapsed:?}");
        drop(store);
        std::fs::remove_dir_all(paths.root).unwrap();
    }
}
