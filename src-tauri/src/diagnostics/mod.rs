//! Read-only library diagnostics for FR-B09.
//!
//! The scanner deliberately keeps its snapshot in the request/response
//! boundary.  Nothing is persisted next to the library, and archive
//! validation reuses the existing ZIP/CBZ/EPUB/RAR page enumerator rather than adding
//! another decoder or extraction path.

use std::collections::{BTreeMap, HashMap};
use std::fmt::Write as _;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

use crate::catalog::{ArchiveKind, CatalogEntry, enumerate_archive_pages, enumerate_folder};
use crate::domain::{AppError, ErrorCode, ItemKind, RelativePath, item_id_for};

pub const DIAGNOSTIC_SCHEMA: &str = "fr-b09/v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticStatus {
    Added,
    Changed,
    Missing,
    Duplicate,
    Corrupt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticSeverity {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticSnapshotEntry {
    pub item_identity: String,
    pub relative_path: RelativePath,
    pub kind: ItemKind,
    pub byte_size: Option<u64>,
    pub modified_ms: Option<u64>,
    pub content_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticFinding {
    pub status: DiagnosticStatus,
    pub severity: DiagnosticSeverity,
    pub item_identity: String,
    pub relative_path: Option<RelativePath>,
    pub kind: Option<ItemKind>,
    pub content_hash: Option<String>,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticSummary {
    pub scanned: usize,
    pub findings: usize,
    pub added: usize,
    pub changed: usize,
    pub missing: usize,
    pub duplicates: usize,
    pub corrupt: usize,
    pub errors: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticReport {
    pub schema: String,
    pub snapshot: Vec<DiagnosticSnapshotEntry>,
    pub findings: Vec<DiagnosticFinding>,
    pub summary: DiagnosticSummary,
    pub retry_requested: bool,
}

#[derive(Debug, Clone)]
struct ScannedEntry {
    snapshot: DiagnosticSnapshotEntry,
}

#[derive(Debug, Default)]
struct ScannedDirectory {
    entries: Vec<ScannedEntry>,
    content_hash: String,
}

#[derive(Debug, Clone)]
struct ArchiveProblem {
    path: RelativePath,
    error: AppError,
}

#[derive(Debug, Default)]
struct ScanState {
    archive_problems: Vec<ArchiveProblem>,
}

/// Scan a canonical library root and compare it with the caller's last
/// in-memory snapshot.  The baseline is treated as data only; it is never
/// used as a filesystem path or written back to disk.
pub fn scan_library(
    root: &Path,
    baseline: &[DiagnosticSnapshotEntry],
    retry_requested: bool,
    cancellation: &CancellationToken,
) -> Result<DiagnosticReport, AppError> {
    check_cancelled(cancellation)?;
    let root = root
        .canonicalize()
        .map_err(|source| io_error(root, source))?;
    if !root.is_dir() {
        return Err(AppError {
            code: ErrorCode::InvalidPath,
            message: "Library root is not a directory.".into(),
            target: None,
            retryable: false,
        });
    }

    let mut state = ScanState::default();
    let scanned = scan_directory(&root, &root, cancellation, &mut state)?;
    check_cancelled(cancellation)?;
    let mut snapshot = scanned
        .entries
        .into_iter()
        .map(|entry| entry.snapshot)
        .collect::<Vec<_>>();
    snapshot.sort_by(|left, right| {
        left.relative_path
            .as_str()
            .cmp(right.relative_path.as_str())
    });

    let mut findings = compare_baseline(&snapshot, baseline);
    findings.extend(duplicate_findings(&snapshot));
    findings.extend(archive_findings(&state.archive_problems));
    findings.sort_by(|left, right| finding_sort_key(left).cmp(&finding_sort_key(right)));

    let summary = summarize(&findings, snapshot.len());
    Ok(DiagnosticReport {
        schema: DIAGNOSTIC_SCHEMA.into(),
        snapshot,
        findings,
        summary,
        retry_requested,
    })
}

fn scan_directory(
    root: &Path,
    directory: &Path,
    cancellation: &CancellationToken,
    state: &mut ScanState,
) -> Result<ScannedDirectory, AppError> {
    check_cancelled(cancellation)?;
    let entries = enumerate_folder(root, directory)?;
    let mut result = ScannedDirectory::default();
    let mut child_digests = Vec::with_capacity(entries.len());

    for entry in entries {
        check_cancelled(cancellation)?;
        let path = root.join(entry.relative_path.as_str());
        let metadata = fs::symlink_metadata(&path).map_err(|source| io_error(&path, source))?;
        let content_hash = if metadata.is_dir() {
            let nested = scan_directory(root, &path, cancellation, state)?;
            let hash = nested.content_hash;
            result.entries.extend(nested.entries);
            hash
        } else {
            let hash = hash_file(&path, cancellation)?;
            if entry.kind == ItemKind::Archive && archive_reader_available(&entry) {
                state
                    .archive_problems
                    .extend(validate_archive(&path, &entry)?);
            }
            hash
        };

        let snapshot = snapshot_entry(&entry, &metadata, content_hash.clone());
        child_digests.push((
            child_name(&entry),
            kind_key(entry.kind),
            snapshot.byte_size.unwrap_or_default(),
            content_hash,
        ));
        result.entries.push(ScannedEntry { snapshot });
    }

    child_digests.sort();
    result.content_hash = hash_directory(&child_digests);
    Ok(result)
}

fn archive_reader_available(entry: &CatalogEntry) -> bool {
    matches!(
        entry.archive_kind,
        Some(ArchiveKind::Zip | ArchiveKind::Cbz | ArchiveKind::Epub | ArchiveKind::Rar)
    )
}

fn snapshot_entry(
    entry: &CatalogEntry,
    metadata: &fs::Metadata,
    content_hash: String,
) -> DiagnosticSnapshotEntry {
    DiagnosticSnapshotEntry {
        item_identity: item_id_for(entry.relative_path.as_str()).to_string(),
        relative_path: entry.relative_path.clone(),
        kind: entry.kind,
        byte_size: metadata.is_file().then_some(metadata.len()),
        modified_ms: metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .and_then(|value| u64::try_from(value.as_millis()).ok()),
        content_hash,
    }
}

fn validate_archive(path: &Path, entry: &CatalogEntry) -> Result<Vec<ArchiveProblem>, AppError> {
    match enumerate_archive_pages(path) {
        Ok(_) => Ok(Vec::new()),
        Err(error) => Ok(vec![ArchiveProblem {
            path: entry.relative_path.clone(),
            error,
        }]),
    }
}

fn compare_baseline(
    current: &[DiagnosticSnapshotEntry],
    baseline: &[DiagnosticSnapshotEntry],
) -> Vec<DiagnosticFinding> {
    let current_by_path = current
        .iter()
        .map(|entry| (entry.relative_path.as_str(), entry))
        .collect::<HashMap<_, _>>();
    let baseline_by_path = baseline
        .iter()
        .map(|entry| (entry.relative_path.as_str(), entry))
        .collect::<HashMap<_, _>>();
    let mut findings = Vec::new();

    for entry in current {
        match baseline_by_path.get(entry.relative_path.as_str()) {
            None => findings.push(finding_for(
                DiagnosticStatus::Added,
                DiagnosticSeverity::Info,
                entry,
                "新しい項目が見つかりました。",
                true,
            )),
            Some(previous)
                if previous.kind != entry.kind || previous.content_hash != entry.content_hash =>
            {
                findings.push(finding_for(
                    DiagnosticStatus::Changed,
                    DiagnosticSeverity::Warning,
                    entry,
                    "項目の内容または種別が変わりました。",
                    true,
                ));
            }
            Some(_) => {}
        }
    }

    for entry in baseline {
        if !current_by_path.contains_key(entry.relative_path.as_str()) {
            findings.push(DiagnosticFinding {
                status: DiagnosticStatus::Missing,
                severity: DiagnosticSeverity::Warning,
                item_identity: entry.item_identity.clone(),
                relative_path: Some(entry.relative_path.clone()),
                kind: Some(entry.kind),
                content_hash: Some(entry.content_hash.clone()),
                message: "前回のスナップショットにあった項目が見つかりません。".into(),
                retryable: true,
            });
        }
    }
    findings
}

fn duplicate_findings(current: &[DiagnosticSnapshotEntry]) -> Vec<DiagnosticFinding> {
    let mut groups: BTreeMap<(String, String), Vec<&DiagnosticSnapshotEntry>> = BTreeMap::new();
    for entry in current {
        if !matches!(entry.kind, ItemKind::Archive | ItemKind::ComicFolder)
            || entry.content_hash.is_empty()
        {
            continue;
        }
        groups
            .entry((kind_key(entry.kind), entry.content_hash.clone()))
            .or_default()
            .push(entry);
    }

    groups
        .into_values()
        .filter(|entries| entries.len() > 1)
        .flat_map(|entries| {
            entries.into_iter().map(|entry| {
                finding_for(
                    DiagnosticStatus::Duplicate,
                    DiagnosticSeverity::Warning,
                    entry,
                    "同一内容の作品が別の場所にもあります。",
                    false,
                )
            })
        })
        .collect()
}

fn archive_findings(problems: &[ArchiveProblem]) -> Vec<DiagnosticFinding> {
    problems
        .iter()
        .map(|problem| DiagnosticFinding {
            status: DiagnosticStatus::Corrupt,
            severity: DiagnosticSeverity::Error,
            item_identity: item_id_for(problem.path.as_str()).to_string(),
            relative_path: Some(problem.path.clone()),
            kind: Some(ItemKind::Archive),
            content_hash: None,
            message: archive_error_message(problem.error.code).into(),
            retryable: problem.error.retryable,
        })
        .collect()
}

fn finding_for(
    status: DiagnosticStatus,
    severity: DiagnosticSeverity,
    entry: &DiagnosticSnapshotEntry,
    message: &str,
    retryable: bool,
) -> DiagnosticFinding {
    DiagnosticFinding {
        status,
        severity,
        item_identity: entry.item_identity.clone(),
        relative_path: Some(entry.relative_path.clone()),
        kind: Some(entry.kind),
        content_hash: Some(entry.content_hash.clone()),
        message: message.into(),
        retryable,
    }
}

fn summarize(findings: &[DiagnosticFinding], scanned: usize) -> DiagnosticSummary {
    let mut summary = DiagnosticSummary {
        scanned,
        findings: findings.len(),
        ..DiagnosticSummary::default()
    };
    for finding in findings {
        match finding.status {
            DiagnosticStatus::Added => summary.added += 1,
            DiagnosticStatus::Changed => summary.changed += 1,
            DiagnosticStatus::Missing => summary.missing += 1,
            DiagnosticStatus::Duplicate => summary.duplicates += 1,
            DiagnosticStatus::Corrupt => summary.corrupt += 1,
        }
        if finding.severity == DiagnosticSeverity::Error {
            summary.errors += 1;
        }
    }
    summary
}

fn finding_sort_key(finding: &DiagnosticFinding) -> (String, u8, u8) {
    let path = finding
        .relative_path
        .as_ref()
        .map(|value| value.as_str().to_owned())
        .unwrap_or_else(|| finding.item_identity.clone());
    let status = match finding.status {
        DiagnosticStatus::Added => 0,
        DiagnosticStatus::Changed => 1,
        DiagnosticStatus::Missing => 2,
        DiagnosticStatus::Duplicate => 3,
        DiagnosticStatus::Corrupt => 4,
    };
    let severity = match finding.severity {
        DiagnosticSeverity::Info => 0,
        DiagnosticSeverity::Warning => 1,
        DiagnosticSeverity::Error => 2,
    };
    (path, status, severity)
}

fn child_name(entry: &CatalogEntry) -> String {
    entry
        .relative_path
        .as_str()
        .rsplit('/')
        .next()
        .unwrap_or_default()
        .to_owned()
}

fn kind_key(kind: ItemKind) -> String {
    match kind {
        ItemKind::Folder => "folder",
        ItemKind::ComicFolder => "comicFolder",
        ItemKind::Archive => "archive",
        ItemKind::Page => "page",
        ItemKind::Unsupported => "unsupported",
    }
    .into()
}

fn archive_error_message(code: ErrorCode) -> &'static str {
    match code {
        ErrorCode::CorruptArchive => "ZIP/CBZ/EPUB/RAR書庫を読み取れません。",
        ErrorCode::EncryptedArchive => "暗号化されたZIP/CBZ/EPUB/RAR書庫は診断できません。",
        ErrorCode::UnsupportedFormat => "ZIP/CBZ/EPUB/RAR書庫の形式に対応していません。",
        ErrorCode::ResourceLimit => "ZIP/CBZ/EPUB/RAR書庫が安全な読み取り上限を超えています。",
        ErrorCode::NotFound => "診断中にZIP/CBZ/EPUB/RAR書庫が見つからなくなりました。",
        ErrorCode::AccessDenied => "ZIP/CBZ/EPUB/RAR書庫へアクセスできません。",
        _ => "ZIP/CBZ/EPUB/RAR書庫の診断に失敗しました。",
    }
}

fn check_cancelled(cancellation: &CancellationToken) -> Result<(), AppError> {
    if cancellation.is_cancelled() {
        Err(AppError::cancelled())
    } else {
        Ok(())
    }
}

fn io_error(path: &Path, source: io::Error) -> AppError {
    let code = match source.kind() {
        io::ErrorKind::NotFound => ErrorCode::NotFound,
        io::ErrorKind::PermissionDenied => ErrorCode::AccessDenied,
        _ => ErrorCode::InvalidPath,
    };
    AppError {
        code,
        message: format!("Cannot read {}: {source}", path.display()),
        target: None,
        retryable: true,
    }
}

fn hash_file(path: &Path, cancellation: &CancellationToken) -> Result<String, AppError> {
    let mut file = File::open(path).map_err(|source| io_error(path, source))?;
    let mut hasher = StableDigest::default();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        check_cancelled(cancellation)?;
        let read = file
            .read(&mut buffer)
            .map_err(|source| io_error(path, source))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finish())
}

fn hash_directory(children: &[(String, String, u64, String)]) -> String {
    let mut hasher = StableDigest::default();
    for (name, kind, size, hash) in children {
        let mut line = String::new();
        let _ = writeln!(&mut line, "{name}\0{kind}\0{size}\0{hash}");
        hasher.update(line.as_bytes());
    }
    hasher.finish()
}

#[derive(Debug)]
struct StableDigest {
    first: u64,
    second: u64,
}

impl Default for StableDigest {
    fn default() -> Self {
        Self {
            first: 0xcbf29ce484222325,
            second: 0x84222325cbf29ce4,
        }
    }
}

impl StableDigest {
    fn update(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.first = (self.first ^ u64::from(*byte)).wrapping_mul(0x100000001b3);
            self.second =
                (self.second ^ u64::from(byte.rotate_left(1))).wrapping_mul(0x100000001b3);
        }
    }

    fn finish(self) -> String {
        format!("{:016x}{:016x}", self.first, self.second)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};
    use zip::write::SimpleFileOptions;

    fn temporary_root(test_name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "comic-explorer-fr-b09-{test_name}-{}-{nonce}",
            std::process::id()
        ))
    }

    fn scan(root: &Path, baseline: &[DiagnosticSnapshotEntry]) -> DiagnosticReport {
        scan_library(root, baseline, false, &CancellationToken::new()).unwrap()
    }

    fn statuses(report: &DiagnosticReport) -> Vec<DiagnosticStatus> {
        report
            .findings
            .iter()
            .map(|finding| finding.status)
            .collect()
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    struct SourceState {
        path_set: Vec<String>,
        bytes_by_path: Vec<(String, Vec<u8>)>,
        sha_by_path: Vec<(String, String)>,
        archive_entry_sets: Vec<(String, Vec<String>)>,
    }

    fn source_state(root: &Path) -> SourceState {
        fn visit(root: &Path, directory: &Path, state: &mut SourceState) {
            let mut children = fs::read_dir(directory)
                .unwrap()
                .map(|entry| entry.unwrap().path())
                .collect::<Vec<_>>();
            children.sort();
            for path in children {
                let relative = path
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                state.path_set.push(relative.clone());
                if path.is_dir() {
                    visit(root, &path, state);
                    continue;
                }

                let bytes = fs::read(&path).unwrap();
                let hash = hash_file(&path, &CancellationToken::new()).unwrap();
                state.bytes_by_path.push((relative.clone(), bytes));
                state.sha_by_path.push((relative.clone(), hash));
                let extension = path
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| value.to_ascii_lowercase());
                if matches!(extension.as_deref(), Some("zip" | "cbz" | "epub" | "rar")) {
                    let entries = enumerate_archive_pages(&path)
                        .unwrap()
                        .into_iter()
                        .map(|entry| entry.to_string())
                        .collect::<Vec<_>>();
                    state.archive_entry_sets.push((relative, entries));
                }
            }
        }

        let mut state = SourceState {
            path_set: Vec::new(),
            bytes_by_path: Vec::new(),
            sha_by_path: Vec::new(),
            archive_entry_sets: Vec::new(),
        };
        visit(root, root, &mut state);
        state.path_set.sort();
        state
            .bytes_by_path
            .sort_by(|left, right| left.0.cmp(&right.0));
        state
            .sha_by_path
            .sort_by(|left, right| left.0.cmp(&right.0));
        state
            .archive_entry_sets
            .sort_by(|left, right| left.0.cmp(&right.0));
        state
    }

    #[test]
    fn fr_b09_001_added_changed_missing_are_detected_against_snapshot() {
        let root = temporary_root("changes");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("stable.png"), b"stable").unwrap();
        fs::write(root.join("changed.png"), b"before").unwrap();
        fs::write(root.join("missing.png"), b"missing").unwrap();
        let first = scan(&root, &[]);

        fs::write(root.join("changed.png"), b"after").unwrap();
        fs::remove_file(root.join("missing.png")).unwrap();
        fs::write(root.join("added.png"), b"added").unwrap();
        let second = scan(&root, &first.snapshot);

        assert_eq!(second.summary.added, 1);
        assert_eq!(second.summary.changed, 1);
        assert_eq!(second.summary.missing, 1);
        assert_eq!(second.summary.errors, 0);
        assert!(statuses(&second).contains(&DiagnosticStatus::Added));
        assert!(statuses(&second).contains(&DiagnosticStatus::Changed));
        assert!(statuses(&second).contains(&DiagnosticStatus::Missing));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fr_b09_002_duplicate_identity_requires_matching_work_content() {
        let root = temporary_root("duplicates");
        fs::create_dir_all(root.join("one")).unwrap();
        fs::create_dir_all(root.join("two")).unwrap();
        fs::write(root.join("one/1.png"), b"same-page").unwrap();
        fs::write(root.join("two/1.png"), b"same-page").unwrap();
        fs::create_dir_all(root.join("different")).unwrap();
        fs::write(root.join("different/1.png"), b"different-page").unwrap();

        let report = scan(&root, &[]);
        assert_eq!(report.summary.duplicates, 2);
        let duplicate_paths = report
            .findings
            .iter()
            .filter(|finding| finding.status == DiagnosticStatus::Duplicate)
            .filter_map(|finding| finding.relative_path.as_ref())
            .map(|path| path.as_str())
            .collect::<Vec<_>>();
        assert_eq!(duplicate_paths, ["one", "two"]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fr_b09_003_corrupt_zip_isolated_without_source_mutation() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/generated/FIX-ZIP-ERROR-001")
            .canonicalize()
            .unwrap();
        let corrupt = root.join("corrupt.zip");
        let before = fs::read(&corrupt).unwrap();
        let report = scan(root.parent().unwrap(), &[]);
        assert!(report.findings.iter().any(|finding| {
            finding.status == DiagnosticStatus::Corrupt
                && finding.severity == DiagnosticSeverity::Error
                && finding.relative_path.as_ref().map(RelativePath::as_str)
                    == Some("FIX-ZIP-ERROR-001/corrupt.zip")
        }));
        assert_eq!(fs::read(corrupt).unwrap(), before);
    }

    #[test]
    fn fr_b12_cbr_and_7z_are_unsupported_and_not_reported_as_corrupt_archive() {
        let root = temporary_root("unsupported-archives");
        fs::create_dir_all(&root).unwrap();
        for (name, bytes) in [
            ("volume.cbr", b"Rar!\x1a\x07\x00".as_slice()),
            ("volume.7z", b"7z\xbc\xaf\x27\x1c".as_slice()),
        ] {
            fs::write(root.join(name), bytes).unwrap();
        }
        let before = source_state(&root);

        let report = scan(&root, &[]);

        for name in ["volume.cbr", "volume.7z"] {
            let snapshot = report
                .snapshot
                .iter()
                .find(|entry| entry.relative_path.as_str() == name)
                .unwrap();
            assert_eq!(snapshot.kind, ItemKind::Unsupported);
        }
        assert!(
            report
                .findings
                .iter()
                .all(|finding| finding.status != DiagnosticStatus::Corrupt)
        );
        assert_eq!(source_state(&root), before);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fr_b12_rar_is_scanned_as_a_readable_archive_without_source_mutation() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/generated/FIX-RAR-001")
            .canonicalize()
            .unwrap();
        let before = source_state(&root);

        let report = scan(&root, &[]);

        assert_eq!(report.summary.errors, 0);
        assert!(
            report
                .snapshot
                .iter()
                .all(|entry| entry.kind == ItemKind::Archive)
        );
        assert_eq!(source_state(&root), before);
    }

    #[test]
    fn fr_b09_004_mixed_results_have_deterministic_severity_and_summary() {
        let root = temporary_root("mixed");
        fs::create_dir_all(root.join("one")).unwrap();
        fs::create_dir_all(root.join("two")).unwrap();
        fs::write(root.join("one/1.png"), b"same").unwrap();
        fs::write(root.join("two/1.png"), b"same").unwrap();
        fs::write(root.join("old.png"), b"old").unwrap();
        let first = scan(&root, &[]);
        fs::write(root.join("old.png"), b"new").unwrap();
        fs::remove_dir_all(root.join("two")).unwrap();
        fs::write(root.join("new.png"), b"new-item").unwrap();

        let report = scan(&root, &first.snapshot);
        assert_eq!(report.summary.added, 1);
        assert_eq!(report.summary.changed, 1);
        assert_eq!(report.summary.missing, 2);
        assert_eq!(report.summary.duplicates, 0);
        assert!(report.findings.iter().any(|finding| {
            finding.status == DiagnosticStatus::Added
                && finding.severity == DiagnosticSeverity::Info
        }));
        assert!(report.findings.iter().any(|finding| {
            finding.status == DiagnosticStatus::Changed
                && finding.severity == DiagnosticSeverity::Warning
        }));
        assert!(report.findings.iter().any(|finding| {
            finding.status == DiagnosticStatus::Missing
                && finding.severity == DiagnosticSeverity::Warning
        }));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fr_b09_005_cancel_and_retry_keep_snapshot_hashes_unchanged() {
        let root = temporary_root("retry");
        fs::create_dir_all(root.join("book/chapter")).unwrap();
        fs::write(root.join("book/1.png"), b"folder-page-1").unwrap();
        fs::write(root.join("book/chapter/2.png"), b"folder-page-2").unwrap();
        let archive_path = root.join("volume.cbz");
        let archive_file = File::create(&archive_path).unwrap();
        let mut archive = zip::ZipWriter::new(archive_file);
        for (entry, bytes) in [
            ("pages/1.png", b"archive-page-1"),
            ("pages/2.jpg", b"archive-page-2"),
        ] {
            archive
                .start_file(entry, SimpleFileOptions::default())
                .unwrap();
            archive.write_all(bytes).unwrap();
        }
        archive.finish().unwrap();

        let before = source_state(&root);
        let first = scan(&root, &[]);
        assert_eq!(
            first
                .snapshot
                .iter()
                .map(|entry| entry.relative_path.as_str().to_owned())
                .collect::<Vec<_>>(),
            before.path_set
        );
        assert_eq!(source_state(&root), before);

        let cancelled = CancellationToken::new();
        cancelled.cancel();
        assert_eq!(
            scan_library(&root, &first.snapshot, true, &cancelled)
                .unwrap_err()
                .code,
            ErrorCode::Cancelled
        );
        assert_eq!(source_state(&root), before);

        let retried = scan(&root, &first.snapshot);
        assert_eq!(retried.snapshot, first.snapshot);
        assert_eq!(retried.findings, Vec::<DiagnosticFinding>::new());
        assert!(!retried.retry_requested);
        assert_eq!(source_state(&root), before);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn retry_flag_is_disclosed_without_changing_the_scan_result() {
        let root = temporary_root("retry-flag");
        fs::create_dir_all(&root).unwrap();
        let report = scan_library(&root, &[], true, &CancellationToken::new()).unwrap();
        assert!(report.retry_requested);
        assert_eq!(report.summary.scanned, 0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hash_is_stable_and_does_not_depend_on_absolute_root() {
        let left = temporary_root("stable-left");
        let right = temporary_root("stable-right");
        fs::create_dir_all(left.join("book")).unwrap();
        fs::create_dir_all(right.join("book")).unwrap();
        fs::write(left.join("book/1.png"), b"same").unwrap();
        fs::write(right.join("book/1.png"), b"same").unwrap();
        let left_report = scan(&left, &[]);
        let right_report = scan(&right, &[]);
        let left_hash = left_report
            .snapshot
            .iter()
            .find(|entry| entry.relative_path.as_str() == "book")
            .unwrap()
            .content_hash
            .clone();
        let right_hash = right_report
            .snapshot
            .iter()
            .find(|entry| entry.relative_path.as_str() == "book")
            .unwrap()
            .content_hash
            .clone();
        assert_eq!(left_hash, right_hash);
        fs::remove_dir_all(left).unwrap();
        fs::remove_dir_all(right).unwrap();
    }

    #[test]
    fn archive_validation_does_not_extract_entries() {
        let root = temporary_root("archive-read-only");
        fs::create_dir_all(&root).unwrap();
        let archive_path = root.join("book.cbz");
        let file = File::create(&archive_path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        writer
            .start_file("page.png", zip::write::SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"not-an-image").unwrap();
        writer.finish().unwrap();
        let report = scan(&root, &[]);
        assert!(
            report
                .findings
                .iter()
                .all(|finding| finding.status != DiagnosticStatus::Corrupt)
        );
        assert!(archive_path.is_file());
        assert!(!root.join("page.png").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
