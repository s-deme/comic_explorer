use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher, RandomState};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::domain::{AppError, ErrorCode, PageId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaGrant {
    pub page_id: PageId,
    pub mime_type: &'static str,
    pub max_bytes: u64,
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

    pub fn revoke_all(&mut self) {
        self.grants.clear();
    }

    fn remove_expired(&mut self) {
        let now = Instant::now();
        self.grants.retain(|_, (expiry, _)| *expiry > now);
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
        });
        assert!(!token.contains("page-1"));
        assert_eq!(registry.resolve(&token).unwrap().page_id.as_str(), "page-1");
        registry.revoke_all();
        assert_eq!(
            registry.resolve(&token).unwrap_err().code,
            ErrorCode::AccessDenied
        );
    }
}
