mod archive;
mod folder;
mod image_metadata;

pub use archive::enumerate_archive_pages;
pub use folder::{ArchiveKind, CatalogEntry, enumerate_folder, enumerate_folder_pages};
pub use image_metadata::{ImageMetadata, inspect_image};

#[cfg(test)]
mod fixture_tests {
    use super::*;
    use crate::domain::{ErrorCode, PageId};
    use crate::media::{MediaGrant, MediaTokenRegistry, PageSource};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::Duration;

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

    #[test]
    fn all_read_paths_leave_the_source_tree_byte_for_byte_unchanged() {
        fn complete_snapshot(
            root: &Path,
        ) -> Vec<(PathBuf, bool, u64, std::time::SystemTime, Option<Vec<u8>>)> {
            fn visit(
                root: &Path,
                path: &Path,
                output: &mut Vec<(PathBuf, bool, u64, std::time::SystemTime, Option<Vec<u8>>)>,
            ) {
                let mut entries = fs::read_dir(path)
                    .unwrap()
                    .map(Result::unwrap)
                    .collect::<Vec<_>>();
                entries.sort_by_key(|entry| entry.file_name());
                for entry in entries {
                    let metadata = entry.metadata().unwrap();
                    let entry_path = entry.path();
                    output.push((
                        entry_path.strip_prefix(root).unwrap().to_path_buf(),
                        metadata.is_dir(),
                        metadata.len(),
                        metadata.modified().unwrap(),
                        metadata.is_file().then(|| fs::read(&entry_path).unwrap()),
                    ));
                    if metadata.is_dir() {
                        visit(root, &entry_path, output);
                    }
                }
            }
            let mut output = Vec::new();
            visit(root, root, &mut output);
            output
        }

        let root = fixtures();
        let before = complete_snapshot(&root);
        enumerate_folder(&root, &root).unwrap();
        enumerate_folder_pages(&root, &root.join("FIX-NESTED-001")).unwrap();
        enumerate_archive_pages(&root.join("FIX-ZIP-001/standard.zip")).unwrap();
        enumerate_archive_pages(&root.join("FIX-ZIP-001/standard.cbz")).unwrap();

        let mut media = MediaTokenRegistry::new(Duration::from_secs(60));
        let file_token = media.issue(MediaGrant {
            page_id: PageId::parse("source-file").unwrap(),
            mime_type: "image/png",
            max_bytes: crate::api::MAX_IMAGE_BYTES,
            source: PageSource::File(root.join("FIX-NESTED-001/1.png")),
        });
        media.read(&file_token).unwrap();
        let archive_token = media.issue(MediaGrant {
            page_id: PageId::parse("source-archive").unwrap(),
            mime_type: "image/jpeg",
            max_bytes: crate::api::MAX_IMAGE_BYTES,
            source: PageSource::ArchiveEntry {
                archive: root.join("FIX-ZIP-001/standard.cbz"),
                entry: "1.JPG".into(),
            },
        });
        media.read(&archive_token).unwrap();

        assert_eq!(complete_snapshot(&root), before);
    }
}
