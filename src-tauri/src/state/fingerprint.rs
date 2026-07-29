use std::fs::Metadata;
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceFingerprint {
    pub size_bytes: u64,
    pub modified_ns: u128,
    /// Archive entry CRC/size summary or an optional coarse-filesystem sample hash.
    pub detail_hash: Option<String>,
}

impl SourceFingerprint {
    pub fn from_metadata(metadata: &Metadata, detail_hash: Option<String>) -> Self {
        Self {
            size_bytes: metadata.len(),
            modified_ns: metadata
                .modified()
                .ok()
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |duration| duration.as_nanos()),
            detail_hash,
        }
    }

    pub fn is_stale_against(&self, current: &Self) -> bool {
        self != current
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn size_mtime_and_archive_detail_participate_in_staleness() {
        let original = SourceFingerprint {
            size_bytes: 10,
            modified_ns: 20,
            detail_hash: Some("crc:1:size:10".into()),
        };
        assert!(!original.is_stale_against(&original));
        assert!(original.is_stale_against(&SourceFingerprint {
            detail_hash: Some("crc:2:size:10".into()),
            ..original.clone()
        }));
    }
}
