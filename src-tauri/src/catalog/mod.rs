mod archive;
mod folder;
mod image_metadata;
mod thumbnail;

pub use archive::{ArchiveAdapterKind, archive_adapter_kind, enumerate_archive_pages};
pub use folder::{ArchiveKind, CatalogEntry, enumerate_folder, enumerate_folder_pages};
pub use image_metadata::{ImageMetadata, inspect_image};
#[cfg(target_os = "windows")]
pub use thumbnail::encode_wic_jpeg;
pub use thumbnail::{
    CoverBytes, THUMBNAIL_JPEG_QUALITY, THUMBNAIL_LONG_EDGE, exif_orientation, output_dimensions,
    read_cover,
};

#[cfg(test)]
mod fixture_tests {
    use super::*;
    use crate::domain::{ErrorCode, PageId};
    use crate::media::{MediaGrant, MediaTokenRegistry, PageSource};
    use std::fs;
    use std::io::Write;
    use std::path::{Path, PathBuf};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use zip::write::SimpleFileOptions;
    use zip::{CompressionMethod, ZipWriter};

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

    fn temporary_root(test_name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "comic-explorer-{test_name}-{}-{nonce}",
            std::process::id()
        ))
    }

    fn source_snapshot(root: &Path) -> Vec<(PathBuf, bool, Vec<u8>)> {
        fn visit(root: &Path, path: &Path, output: &mut Vec<(PathBuf, bool, Vec<u8>)>) {
            let mut entries = fs::read_dir(path)
                .unwrap()
                .map(Result::unwrap)
                .collect::<Vec<_>>();
            entries.sort_by_key(|entry| entry.file_name());
            for entry in entries {
                let path = entry.path();
                let is_directory = entry.file_type().unwrap().is_dir();
                output.push((
                    path.strip_prefix(root).unwrap().to_path_buf(),
                    is_directory,
                    (!is_directory)
                        .then(|| fs::read(&path).unwrap())
                        .unwrap_or_default(),
                ));
                if is_directory {
                    visit(root, &path, output);
                }
            }
        }

        let mut output = Vec::new();
        visit(root, root, &mut output);
        output
    }

    fn write_webp_archive(path: &Path) {
        let file = fs::File::create(path).unwrap();
        let mut writer = ZipWriter::new(file);
        for (name, bytes, compression) in [
            ("chapter/10.webp", &b"ten"[..], CompressionMethod::Deflated),
            ("chapter/2.WEBP", &b"two"[..], CompressionMethod::Stored),
            ("notes.txt", &b"ignored"[..], CompressionMethod::Stored),
        ] {
            writer
                .start_file(
                    name,
                    SimpleFileOptions::default().compression_method(compression),
                )
                .unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap();
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
        let epub_pages = enumerate_archive_pages(&archive_root.join("standard.epub")).unwrap();
        assert_eq!(zip_pages, cbz_pages);
        assert_eq!(zip_pages, epub_pages);
        assert_eq!(
            zip_pages
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>(),
            ["1.JPG", "章/2.PNG", "章/10.JPEG"]
        );
    }

    #[test]
    fn mixed_library_fixture_classifies_every_entry_without_promoting_unknown_files() {
        use crate::domain::ItemKind;

        let root = fixtures();
        let entries = enumerate_folder(&root, &root.join("FIX-LIBRARY-001")).unwrap();
        let by_name = entries
            .iter()
            .map(|entry| {
                (
                    entry
                        .relative_path
                        .as_str()
                        .rsplit('/')
                        .next()
                        .unwrap()
                        .to_owned(),
                    entry.kind,
                )
            })
            .collect::<std::collections::HashMap<_, _>>();

        assert_eq!(by_name["normal-folder"], ItemKind::Folder);
        assert_eq!(by_name["empty-folder"], ItemKind::Folder);
        assert_eq!(by_name["comic-folder"], ItemKind::ComicFolder);
        assert_eq!(by_name["volume.zip"], ItemKind::Archive);
        assert_eq!(by_name["volume.cbz"], ItemKind::Archive);
        assert_eq!(by_name["volume.epub"], ItemKind::Archive);
        assert_eq!(by_name["future.rar"], ItemKind::Unsupported);
        assert_eq!(
            entries
                .iter()
                .find(|entry| entry.relative_path.as_str().ends_with("future.rar"))
                .and_then(|entry| entry.archive_kind),
            Some(ArchiveKind::Rar)
        );
        assert_eq!(entries.len(), by_name.len());
    }

    #[test]
    fn fr_b08_webp_enumerates_folder_zip_cbz_and_epub_without_mutating_sources() {
        let root = temporary_root("webp-enumeration");
        let comic = root.join("webp-comic");
        fs::create_dir_all(&comic).unwrap();
        fs::write(comic.join("10.webp"), b"ten").unwrap();
        fs::write(comic.join("2.WEBP"), b"two").unwrap();
        let zip = root.join("webp-volume.zip");
        let cbz = root.join("webp-volume.cbz");
        let epub = root.join("webp-volume.epub");
        write_webp_archive(&zip);
        write_webp_archive(&cbz);
        write_webp_archive(&epub);
        let before = source_snapshot(&root);
        let metadata_before = snapshot(&root);

        let catalog = enumerate_folder(&root, &root).unwrap();
        assert_eq!(
            catalog
                .iter()
                .map(|entry| (entry.relative_path.to_string(), entry.kind))
                .collect::<Vec<_>>(),
            [
                (
                    "webp-comic".to_owned(),
                    crate::domain::ItemKind::ComicFolder
                ),
                (
                    "webp-volume.cbz".to_owned(),
                    crate::domain::ItemKind::Archive
                ),
                (
                    "webp-volume.epub".to_owned(),
                    crate::domain::ItemKind::Archive
                ),
                (
                    "webp-volume.zip".to_owned(),
                    crate::domain::ItemKind::Archive
                ),
            ]
        );
        assert_eq!(
            enumerate_folder_pages(&root, &comic)
                .unwrap()
                .into_iter()
                .map(|page| page.to_string())
                .collect::<Vec<_>>(),
            ["webp-comic/2.WEBP", "webp-comic/10.webp"]
        );
        for archive in [&zip, &cbz, &epub] {
            assert_eq!(
                enumerate_archive_pages(archive)
                    .unwrap()
                    .into_iter()
                    .map(|page| page.to_string())
                    .collect::<Vec<_>>(),
                ["chapter/2.WEBP", "chapter/10.webp"]
            );
        }

        assert_eq!(source_snapshot(&root), before);
        assert_eq!(snapshot(&root), metadata_before);
        assert!(!root.join("chapter").exists());
        fs::remove_dir_all(root).unwrap();
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
        type ArchiveEntries = Vec<(String, u64, u32, String, bool)>;
        type SnapshotEntry = (
            PathBuf,
            bool,
            u64,
            std::time::SystemTime,
            Option<Vec<u8>>,
            Option<ArchiveEntries>,
        );

        fn complete_snapshot(root: &Path) -> Vec<SnapshotEntry> {
            fn visit(root: &Path, path: &Path, output: &mut Vec<SnapshotEntry>) {
                let mut entries = fs::read_dir(path)
                    .unwrap()
                    .map(Result::unwrap)
                    .collect::<Vec<_>>();
                entries.sort_by_key(|entry| entry.file_name());
                for entry in entries {
                    let metadata = entry.metadata().unwrap();
                    let entry_path = entry.path();
                    let extension = entry_path
                        .extension()
                        .and_then(|value| value.to_str())
                        .unwrap_or_default();
                    let archive_entries = if metadata.is_file()
                        && matches!(extension.to_ascii_lowercase().as_str(), "zip" | "cbz")
                    {
                        fs::File::open(&entry_path)
                            .ok()
                            .and_then(|file| zip::ZipArchive::new(file).ok())
                            .map(|mut archive| {
                                (0..archive.len())
                                    .filter_map(|index| {
                                        archive.by_index(index).ok().map(|item| {
                                            (
                                                item.name().to_owned(),
                                                item.size(),
                                                item.crc32(),
                                                format!("{:?}", item.compression()),
                                                item.encrypted(),
                                            )
                                        })
                                    })
                                    .collect::<ArchiveEntries>()
                            })
                    } else {
                        None
                    };
                    output.push((
                        entry_path.strip_prefix(root).unwrap().to_path_buf(),
                        metadata.is_dir(),
                        metadata.len(),
                        metadata.modified().unwrap(),
                        metadata.is_file().then(|| fs::read(&entry_path).unwrap()),
                        archive_entries,
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
        enumerate_archive_pages(&root.join("FIX-ZIP-001/standard.epub")).unwrap();

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
                archive: root.join("FIX-ZIP-001/standard.epub"),
                entry: "1.JPG".into(),
            },
        });
        media.read(&archive_token).unwrap();

        let after = complete_snapshot(&root);
        assert_eq!(after, before);
        assert!(!after.iter().any(|entry| {
            let name = entry.0.to_string_lossy().to_ascii_lowercase();
            name.ends_with(".sqlite")
                || name.ends_with(".sqlite-wal")
                || name.ends_with(".sqlite-shm")
                || name.ends_with(".tmp")
                || name.ends_with(".log")
                || name.contains("/cache/")
        }));
    }
}
