mod archive;
mod folder;
mod image_metadata;

pub use archive::enumerate_archive_pages;
pub use folder::{CatalogEntry, enumerate_folder, enumerate_folder_pages};
pub use image_metadata::{ImageMetadata, inspect_image};

#[cfg(test)]
mod fixture_tests {
    use super::*;
    use crate::domain::ErrorCode;
    use std::fs;
    use std::path::{Path, PathBuf};

    fn fixtures() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/generated")
            .canonicalize()
            .expect("generate fixtures before running cargo test")
    }

    fn snapshot(root: &Path) -> Vec<(PathBuf, u64, std::time::SystemTime)> {
        fn visit(
            root: &Path,
            path: &Path,
            output: &mut Vec<(PathBuf, u64, std::time::SystemTime)>,
        ) {
            let mut entries = fs::read_dir(path)
                .unwrap()
                .map(Result::unwrap)
                .collect::<Vec<_>>();
            entries.sort_by_key(|entry| entry.file_name());
            for entry in entries {
                let metadata = entry.metadata().unwrap();
                if metadata.is_dir() {
                    visit(root, &entry.path(), output);
                } else {
                    output.push((
                        entry.path().strip_prefix(root).unwrap().to_path_buf(),
                        metadata.len(),
                        metadata.modified().unwrap(),
                    ));
                }
            }
        }
        let mut output = Vec::new();
        visit(root, root, &mut output);
        output
    }

    #[test]
    fn generated_folder_and_archives_have_the_manifest_page_order() {
        let root = fixtures();
        let folder = root.join("FIX-NESTED-001");
        let pages = enumerate_folder_pages(&root, &folder)
            .unwrap()
            .into_iter()
            .map(|path| {
                path.as_str()
                    .strip_prefix("FIX-NESTED-001/")
                    .unwrap()
                    .to_string()
            })
            .collect::<Vec<_>>();
        assert_eq!(
            pages,
            [
                "1.png",
                "chapter/2.png",
                "chapter/10.png",
                "chapter/deep/11.png"
            ]
        );

        let archive_root = root.join("FIX-ZIP-001");
        let zip_pages = enumerate_archive_pages(&archive_root.join("standard.zip")).unwrap();
        let cbz_pages = enumerate_archive_pages(&archive_root.join("standard.cbz")).unwrap();
        assert_eq!(zip_pages, cbz_pages);
        assert_eq!(
            zip_pages
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>(),
            ["1.JPG", "章/2.PNG", "章/10.JPEG"]
        );
    }

    #[test]
    fn corrupt_and_encrypted_archives_are_classified_without_writes() {
        let root = fixtures();
        let archive_root = root.join("FIX-ZIP-ERROR-001");
        let before = snapshot(&root);

        assert_eq!(
            enumerate_archive_pages(&archive_root.join("corrupt.zip"))
                .unwrap_err()
                .code,
            ErrorCode::CorruptArchive
        );
        assert_eq!(
            enumerate_archive_pages(&archive_root.join("encrypted-flag.zip"))
                .unwrap_err()
                .code,
            ErrorCode::EncryptedArchive
        );
        assert_eq!(snapshot(&root), before);
    }
}
