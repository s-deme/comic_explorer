use serde::{Deserialize, Serialize};
use std::fmt;

macro_rules! identifier {
    ($name:ident) => {
        #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(String);

        impl $name {
            pub fn parse(value: impl Into<String>) -> Result<Self, &'static str> {
                let value = value.into();
                if value.is_empty() {
                    return Err("identifier must not be empty");
                }
                if value.len() > 128 {
                    return Err("identifier exceeds 128 bytes");
                }
                if !value
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"-_:".contains(&byte))
                {
                    return Err("identifier contains an unsupported character");
                }
                Ok(Self(value))
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.fmt(formatter)
            }
        }
    };
}

identifier!(ItemId);
identifier!(PageId);
identifier!(RequestId);

fn stable_path_hash(value: &str) -> u64 {
    value
        .as_bytes()
        .iter()
        .fold(0xcbf29ce484222325, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
        })
}

pub fn item_id_for(item_relative_path: &str) -> ItemId {
    ItemId::parse(format!(
        "item-{:016x}",
        stable_path_hash(item_relative_path)
    ))
    .expect("generated item id")
}

pub fn page_id_for(item_relative_path: &str, page_relative_path: &str) -> PageId {
    PageId::parse(format!(
        "page-{:016x}-{:016x}",
        stable_path_hash(item_relative_path),
        stable_path_hash(page_relative_path)
    ))
    .expect("generated page id")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifiers_reject_empty_and_opaque_unsafe_values() {
        assert!(ItemId::parse("").is_err());
        assert!(PageId::parse("page/absolute").is_err());
        assert_eq!(
            RequestId::parse("request:42").unwrap().as_str(),
            "request:42"
        );
    }

    #[test]
    fn folder_and_archive_item_and_page_identities_do_not_collide() {
        let folder = item_id_for("Series/Volume");
        let archive = item_id_for("Series/Volume.zip");
        assert_ne!(folder, archive);
        assert_eq!(folder, item_id_for("Series/Volume"));

        let folder_page = page_id_for("Series/Volume", "page1.png");
        let archive_page = page_id_for("Series/Volume.zip", "page1.png");
        assert_ne!(folder_page, archive_page);
        assert_ne!(folder_page, page_id_for("Series/Volume", "page2.png"));
        assert_eq!(folder_page, page_id_for("Series/Volume", "page1.png"));
    }
}
