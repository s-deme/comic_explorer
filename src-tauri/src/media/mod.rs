use std::collections::HashMap;
use std::fs;
use std::hash::{BuildHasher, Hasher, RandomState};
use std::io::Read;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::domain::{AppError, ErrorCode, PageId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PageSource {
    File(PathBuf),
    ArchiveEntry { archive: PathBuf, entry: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaGrant {
    pub page_id: PageId,
    pub mime_type: &'static str,
    pub max_bytes: u64,
    pub source: PageSource,
}

pub struct MediaTokenRegistry {
    grants: HashMap<String, (Instant, MediaGrant)>,
    lifetime: Duration,
    counter: u64,
    random_state: RandomState,
}

impl MediaTokenRegistry {
    pub fn new(lifetime: Duration) -> Self {
        Self {
            grants: HashMap::new(),
            lifetime,
            counter: 0,
            random_state: RandomState::new(),
        }
    }

    pub fn issue(&mut self, grant: MediaGrant) -> String {
        self.counter = self.counter.wrapping_add(1);
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let mut first = self.random_state.build_hasher();
        first.write_u128(now);
        first.write_u64(self.counter);
        first.write(grant.page_id.as_str().as_bytes());
        let mut second = self.random_state.build_hasher();
        second.write_u64(first.finish());
        second.write_u128(now.rotate_left(31));
        let token = format!("{:016x}{:016x}", first.finish(), second.finish());
        self.grants
            .insert(token.clone(), (Instant::now() + self.lifetime, grant));
        token
    }

    pub fn resolve(&mut self, token: &str) -> Result<MediaGrant, AppError> {
        self.remove_expired();
        self.grants
            .get(token)
            .map(|(_, grant)| grant.clone())
            .ok_or_else(|| AppError {
                code: ErrorCode::AccessDenied,
                message: "Media token is invalid or expired.".into(),
                target: None,
                retryable: false,
            })
    }

    pub fn read(&mut self, token: &str) -> Result<(MediaGrant, Vec<u8>), AppError> {
        let grant = self.resolve(token)?;
        let bytes = match &grant.source {
            PageSource::File(path) => fs::read(path).map_err(media_io_error)?,
            PageSource::ArchiveEntry { archive, entry } => {
                let file = fs::File::open(archive).map_err(media_io_error)?;
                let mut archive = zip::ZipArchive::new(file).map_err(media_error)?;
                let entry = archive.by_name(entry).map_err(media_error)?;
                if entry.encrypted() || entry.size() > grant.max_bytes {
                    return Err(limit_error());
                }
                let mut bytes = Vec::with_capacity(
                    usize::try_from(entry.size().min(grant.max_bytes)).unwrap_or_default(),
                );
                entry
                    .take(grant.max_bytes.saturating_add(1))
                    .read_to_end(&mut bytes)
                    .map_err(media_io_error)?;
                bytes
            }
        };
        if bytes.len() as u64 > grant.max_bytes {
            return Err(limit_error());
        }
        let signature_valid = match grant.mime_type {
            "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
            "image/jpeg" => bytes.starts_with(&[0xff, 0xd8]),
            _ => false,
        };
        if !signature_valid {
            return Err(AppError {
                code: ErrorCode::CorruptImage,
                message: "Image signature does not match its media type.".into(),
                target: None,
                retryable: false,
            });
        }
        Ok((grant, bytes))
    }

    pub fn revoke_all(&mut self) {
        self.grants.clear();
    }

    fn remove_expired(&mut self) {
        let now = Instant::now();
        self.grants.retain(|_, (expiry, _)| *expiry > now);
    }
}

fn limit_error() -> AppError {
    AppError {
        code: ErrorCode::ResourceLimit,
        message: "Page byte limit exceeded.".into(),
        target: None,
        retryable: false,
    }
}

fn media_io_error(error: impl std::fmt::Display) -> AppError {
    AppError {
        code: ErrorCode::NotFound,
        message: format!("Cannot read page source: {error}"),
        target: None,
        retryable: true,
    }
}

fn media_error(error: impl std::fmt::Display) -> AppError {
    AppError {
        code: ErrorCode::CorruptArchive,
        message: format!("Cannot read archive page: {error}"),
        target: None,
        retryable: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_are_opaque_scoped_and_revocable() {
        let mut registry = MediaTokenRegistry::new(Duration::from_secs(60));
        let token = registry.issue(MediaGrant {
            page_id: PageId::parse("page-1").unwrap(),
            mime_type: "image/png",
            max_bytes: 1024,
            source: PageSource::File(PathBuf::from("secret/page-1.png")),
        });
        assert!(!token.contains("page-1"));
        assert!(!token.contains("secret"));
        assert_eq!(registry.resolve(&token).unwrap().page_id.as_str(), "page-1");
        registry.revoke_all();
        assert_eq!(
            registry.resolve(&token).unwrap_err().code,
            ErrorCode::AccessDenied
        );
    }

    #[test]
    fn expired_tokens_are_rejected() {
        let mut registry = MediaTokenRegistry::new(Duration::ZERO);
        let token = registry.issue(MediaGrant {
            page_id: PageId::parse("page-2").unwrap(),
            mime_type: "image/jpeg",
            max_bytes: 1024,
            source: PageSource::File(PathBuf::from("page-2.jpg")),
        });
        assert_eq!(
            registry.resolve(&token).unwrap_err().code,
            ErrorCode::AccessDenied
        );
    }
}
