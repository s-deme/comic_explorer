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
}
