#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileKind {
    Image,
    Archive,
    Unsupported,
}

pub fn classify_file_name(name: &str) -> FileKind {
    let extension = name.rsplit_once('.').map(|(_, extension)| extension);
    match extension.map(str::to_ascii_lowercase).as_deref() {
        Some(
            "bmp" | "jpg" | "jpeg" | "png" | "webp" | "gif" | "tif" | "tiff" | "ico" | "svg"
            | "avif",
        ) => FileKind::Image,
        Some("zip" | "cbz" | "epub" | "rar" | "cbr" | "7z" | "cb7" | "lzh" | "lha") => {
            FileKind::Archive
        }
        _ => FileKind::Unsupported,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supported_extensions_are_ascii_case_insensitive() {
        for name in [
            "1.BMP", "2.jpg", "3.JPEG", "4.PnG", "5.WeBp", "6.GIF", "7.tif", "8.TIFF", "9.IcO",
            "10.SvG", "11.AvIf",
        ] {
            assert_eq!(classify_file_name(name), FileKind::Image);
        }
        for name in [
            "book.ZIP",
            "book.cBz",
            "book.EpUb",
            "book.RAR",
            "book.CBR",
            "book.7Z",
            "book.CB7",
            "book.LzH",
            "book.LHA",
        ] {
            assert_eq!(classify_file_name(name), FileKind::Archive);
        }
        for name in ["book.pdf", "image.wic", "no-extension"] {
            assert_eq!(classify_file_name(name), FileKind::Unsupported);
        }
    }
}
