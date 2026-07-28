use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct RelativePath(String);

impl RelativePath {
    pub fn parse(value: impl AsRef<str>) -> Result<Self, &'static str> {
        let normalized = value.as_ref().replace('\\', "/");
        if normalized.is_empty() {
            return Ok(Self(String::new()));
        }
        if normalized.starts_with('/')
            || normalized.starts_with("//")
            || normalized.as_bytes().get(1) == Some(&b':')
        {
            return Err("absolute paths are not allowed");
        }

        let mut components = Vec::new();
        for component in normalized.split('/') {
            match component {
                "" | "." => {}
                ".." => return Err("parent traversal is not allowed"),
                part if part.contains('\0') => return Err("NUL is not allowed"),
                part => components.push(part),
            }
        }
        Ok(Self(components.join("/")))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for RelativePath {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

#[cfg(test)]
mod tests {
    use super::RelativePath;

    #[test]
    fn normalizes_separators_without_making_an_absolute_path() {
        assert_eq!(
            RelativePath::parse(r"chapter\.\2.png").unwrap().as_str(),
            "chapter/2.png"
        );
    }

    #[test]
    fn rejects_root_escape_and_absolute_forms() {
        for path in [
            "../page.png",
            "/page.png",
            r"C:\page.png",
            r"\\server\share",
        ] {
            assert!(RelativePath::parse(path).is_err(), "{path}");
        }
    }
}
