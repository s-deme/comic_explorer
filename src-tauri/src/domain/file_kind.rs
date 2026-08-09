#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileKind {
    Image,
    Archive,
    Unsupported,
}

pub fn classify_file_name(name: &str) -> FileKind {
    let extension = name.rsplit_once('.').map(|(_, extension)| extension);
    match extension.map(str::to_ascii_lowercase).as_deref() {
        Some("jpg" | "jpeg" | "png" | "webp" | "gif" | "avif") => FileKind::Image,
        Some("zip" | "cbz") => FileKind::Archive,
        _ => FileKind::Unsupported,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supported_extensions_are_ascii_case_insensitive() {
        for name in ["1.jpg", "2.JPEG", "3.PnG", "4.WeBp", "5.GIF", "6.AvIf"] {
            assert_eq!(classify_file_name(name), FileKind::Image);
        }
        for name in ["book.ZIP", "book.cBz"] {
            assert_eq!(classify_file_name(name), FileKind::Archive);
        }
        for name in ["book.rar", "no-extension"] {
            assert_eq!(classify_file_name(name), FileKind::Unsupported);
        }
    }
}
