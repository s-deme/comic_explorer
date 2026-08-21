use std::collections::VecDeque;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::api::{RequestContext, Response};
use crate::domain::{FileKind, ItemKind, classify_file_name};

use super::{AppState, error_response, library_root, validate_request};

pub const CLI_LAUNCH_PENDING_EVENT: &str = "cli-launch-pending";
const MAX_PENDING_LAUNCHES: usize = 16;
const MAX_PATH_UTF16: usize = 32_767;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CliLaunchMode {
    Normal,
    Fullscreen,
    Slideshow,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliLaunchPlan {
    pub library_root: String,
    pub item_relative_path: Option<String>,
    pub item_kind: Option<ItemKind>,
    pub mode: CliLaunchMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliLaunchRequest {
    pub plan: Option<CliLaunchPlan>,
    pub error: Option<String>,
}

impl CliLaunchRequest {
    fn success(plan: CliLaunchPlan) -> Self {
        Self {
            plan: Some(plan),
            error: None,
        }
    }

    fn failure(message: impl Into<String>) -> Self {
        Self {
            plan: None,
            error: Some(message.into()),
        }
    }
}

#[derive(Debug, Default)]
struct CliLaunchQueueState {
    items: VecDeque<CliLaunchRequest>,
    overflowed: bool,
}

#[derive(Debug, Default)]
pub struct CliLaunchQueue {
    state: Mutex<CliLaunchQueueState>,
}

impl CliLaunchQueue {
    fn push(&self, request: CliLaunchRequest) {
        if let Ok(mut state) = self.state.lock() {
            if state.items.len() >= MAX_PENDING_LAUNCHES {
                state.overflowed = true;
            } else {
                state.items.push_back(request);
            }
        }
    }

    fn take(&self) -> Option<CliLaunchRequest> {
        let mut state = self.state.lock().ok()?;
        if let Some(request) = state.items.pop_front() {
            return Some(request);
        }
        if state.overflowed {
            state.overflowed = false;
            return Some(CliLaunchRequest::failure(
                "CLI起動要求が16件を超えたため、超過分を受け付けませんでした。",
            ));
        }
        None
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedArguments {
    path: String,
    mode: CliLaunchMode,
}

fn parse_arguments(arguments: Vec<OsString>) -> Option<Result<ParsedArguments, String>> {
    if arguments.is_empty() {
        return None;
    }
    let mut mode = CliLaunchMode::Normal;
    let mut mode_seen = false;
    let mut positional_only = false;
    let mut path = None;
    for argument in arguments {
        let Some(argument) = argument.to_str() else {
            return Some(Err(
                "CLI引数にUnicodeとして解釈できない値があります。".into()
            ));
        };
        if !positional_only && argument == "--" {
            positional_only = true;
            continue;
        }
        let requested_mode = if !positional_only {
            match argument {
                "-f" | "--fullscreen" => Some(CliLaunchMode::Fullscreen),
                "-s" | "--slideshow" => Some(CliLaunchMode::Slideshow),
                _ => None,
            }
        } else {
            None
        };
        if let Some(requested_mode) = requested_mode {
            if mode_seen {
                return Some(Err(
                    "CLIの表示modeは -f または -s のどちらか1つだけ指定できます。".into(),
                ));
            }
            mode = requested_mode;
            mode_seen = true;
            continue;
        }
        if !positional_only && argument.starts_with('-') {
            return Some(Err(format!("未知のCLI optionです: {argument}")));
        }
        if argument.chars().any(char::is_control) {
            return Some(Err("CLI pathにcontrol文字は使用できません。".into()));
        }
        if argument.encode_utf16().count() > MAX_PATH_UTF16 {
            return Some(Err("CLI pathがWindowsの上限を超えています。".into()));
        }
        if path.replace(argument.to_owned()).is_some() {
            return Some(Err("CLIで開けるpathは1件だけです。".into()));
        }
    }
    Some(path.map_or_else(
        || Err("CLIで開くfileまたはfolder pathを指定してください。".into()),
        |path| Ok(ParsedArguments { path, mode }),
    ))
}

fn readable_directory(path: &Path) -> Result<(), String> {
    let mut entries =
        fs::read_dir(path).map_err(|error| format!("指定folderを読み取れません: {error}"))?;
    if let Some(entry) = entries.next() {
        entry.map_err(|error| format!("指定folderを列挙できません: {error}"))?;
    }
    Ok(())
}

fn canonical_target(path: &str, cwd: &Path) -> Result<PathBuf, String> {
    let requested = PathBuf::from(path);
    let requested = if requested.is_absolute() {
        requested
    } else {
        cwd.join(requested)
    };
    requested
        .canonicalize()
        .map_err(|error| format!("CLIで指定したpathが見つかりません: {error}"))
}

fn relative_name(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "CLI対象をlibrary内の安全な名前に変換できません。".into())
}

fn resolve_plan(parsed: ParsedArguments, cwd: &Path) -> Result<CliLaunchPlan, String> {
    let target = canonical_target(&parsed.path, cwd)?;
    if target.is_dir() {
        readable_directory(&target)?;
        if parsed.mode == CliLaunchMode::Normal {
            return Ok(CliLaunchPlan {
                library_root: library_root::display_path(&target),
                item_relative_path: None,
                item_kind: None,
                mode: parsed.mode,
            });
        }
        let parent = target
            .parent()
            .ok_or_else(|| "drive root自体は -f/-s のviewer対象にできません。".to_owned())?;
        let parent = library_root::validate_library_root(parent).map_err(|error| error.message)?;
        return Ok(CliLaunchPlan {
            library_root: library_root::display_path(&parent),
            item_relative_path: Some(relative_name(&target)?),
            item_kind: Some(ItemKind::ComicFolder),
            mode: parsed.mode,
        });
    }
    if !target.is_file() {
        return Err("CLI対象はfileまたはfolderではありません。".into());
    }
    let target = library_root::validate_library_file(&target).map_err(|error| error.message)?;
    let parent = target
        .parent()
        .ok_or_else(|| "CLI対象fileに読取可能な親folderがありません。".to_owned())?;
    let parent = library_root::validate_library_root(parent).map_err(|error| error.message)?;
    let relative = relative_name(&target)?;
    let item_kind = match classify_file_name(&relative) {
        FileKind::Archive => ItemKind::Archive,
        FileKind::Image => ItemKind::Page,
        FileKind::Pdf => ItemKind::Pdf,
        FileKind::Unsupported => {
            return Err("指定fileの形式はviewerでサポートされていません。".into());
        }
    };
    Ok(CliLaunchPlan {
        library_root: library_root::display_path(&parent),
        item_relative_path: Some(relative),
        item_kind: Some(item_kind),
        mode: parsed.mode,
    })
}

pub(crate) fn resolve_target_plan(
    target: &Path,
    mode: CliLaunchMode,
) -> Result<CliLaunchPlan, String> {
    let path = target
        .to_str()
        .ok_or_else(|| "対象pathをUnicodeとして解釈できません。".to_owned())?;
    resolve_plan(
        ParsedArguments {
            path: path.to_owned(),
            mode,
        },
        Path::new(""),
    )
}

fn request_from_arguments(arguments: Vec<OsString>, cwd: &Path) -> Option<CliLaunchRequest> {
    parse_arguments(arguments).map(|parsed| {
        match parsed.and_then(|parsed| resolve_plan(parsed, cwd)) {
            Ok(plan) => CliLaunchRequest::success(plan),
            Err(error) => CliLaunchRequest::failure(error),
        }
    })
}

pub fn accept_arguments<R: Runtime>(app: AppHandle<R>, arguments: Vec<OsString>, cwd: PathBuf) {
    std::thread::spawn(move || {
        let Some(request) = request_from_arguments(arguments, &cwd) else {
            return;
        };
        app.state::<AppState>().cli_launch.push(request);
        let _ = app.emit(CLI_LAUNCH_PENDING_EVENT, ());
    });
}

pub fn focus_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn take_cli_launch_request(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<Option<CliLaunchRequest>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: state.cli_launch.take(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Instant, SystemTime, UNIX_EPOCH};

    fn temp_root(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("comic-explorer-cli-{name}-{nonce}"))
    }

    fn os(arguments: &[&str]) -> Vec<OsString> {
        arguments.iter().map(OsString::from).collect()
    }

    #[test]
    fn parses_literal_paths_modes_and_option_terminator() {
        assert_eq!(
            parse_arguments(os(&["-f", "folder with space"])),
            Some(Ok(ParsedArguments {
                path: "folder with space".into(),
                mode: CliLaunchMode::Fullscreen,
            }))
        );
        assert_eq!(
            parse_arguments(os(&["--slideshow", "漫画.cbz"])),
            Some(Ok(ParsedArguments {
                path: "漫画.cbz".into(),
                mode: CliLaunchMode::Slideshow,
            }))
        );
        assert_eq!(
            parse_arguments(os(&["--", "-named.cbz"])),
            Some(Ok(ParsedArguments {
                path: "-named.cbz".into(),
                mode: CliLaunchMode::Normal,
            }))
        );
        assert_eq!(parse_arguments(Vec::new()), None);
    }

    #[test]
    fn rejects_unknown_conflicting_duplicate_and_multiple_arguments() {
        for arguments in [
            vec!["--unknown", "book.cbz"],
            vec!["-f", "-s", "book.cbz"],
            vec!["-f", "--fullscreen", "book.cbz"],
            vec!["one.cbz", "two.cbz"],
            vec!["-s"],
            vec!["bad\nname.cbz"],
        ] {
            assert!(
                parse_arguments(os(&arguments)).unwrap().is_err(),
                "{arguments:?}"
            );
        }
        let too_long = "a".repeat(MAX_PATH_UTF16 + 1);
        assert!(parse_arguments(vec![too_long.into()]).unwrap().is_err());
    }

    #[test]
    fn resolves_relative_file_folder_and_viewer_modes_in_rust() {
        let root = temp_root("plans");
        let folder = root.join("folder with space");
        fs::create_dir_all(&folder).unwrap();
        fs::write(root.join("漫画.cbz"), b"fixture").unwrap();

        let catalog = resolve_plan(
            parse_arguments(os(&["folder with space"]))
                .unwrap()
                .unwrap(),
            &root,
        )
        .unwrap();
        assert_eq!(catalog.mode, CliLaunchMode::Normal);
        assert_eq!(catalog.item_relative_path, None);
        assert_eq!(
            catalog.library_root,
            library_root::display_path(&folder.canonicalize().unwrap())
        );

        let fullscreen = resolve_plan(
            parse_arguments(os(&["-f", "folder with space"]))
                .unwrap()
                .unwrap(),
            &root,
        )
        .unwrap();
        assert_eq!(
            fullscreen.item_relative_path.as_deref(),
            Some("folder with space")
        );
        assert_eq!(fullscreen.item_kind, Some(ItemKind::ComicFolder));

        let slideshow = resolve_plan(
            parse_arguments(os(&["-s", "漫画.cbz"])).unwrap().unwrap(),
            &root,
        )
        .unwrap();
        assert_eq!(slideshow.item_relative_path.as_deref(), Some("漫画.cbz"));
        assert_eq!(slideshow.item_kind, Some(ItemKind::Archive));
        assert_eq!(slideshow.mode, CliLaunchMode::Slideshow);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_missing_and_unsupported_targets_without_changing_state() {
        let root = temp_root("invalid");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("notes.txt"), b"fixture").unwrap();
        for path in ["missing.cbz", "notes.txt"] {
            let parsed = parse_arguments(os(&[path])).unwrap().unwrap();
            assert!(resolve_plan(parsed, &root).is_err());
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn preserves_fifo_order_and_reports_bounded_overflow() {
        let queue = CliLaunchQueue::default();
        let started = Instant::now();
        for index in 0..10_000 {
            queue.push(CliLaunchRequest::failure(index.to_string()));
        }
        for index in 0..MAX_PENDING_LAUNCHES {
            assert_eq!(queue.take().unwrap().error.unwrap(), index.to_string());
        }
        assert!(queue.take().unwrap().error.unwrap().contains("16件"));
        assert!(queue.take().is_none());
        eprintln!("CLI queue 10,000 requests: {:.3?}", started.elapsed());
    }
}
