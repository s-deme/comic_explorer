use std::sync::{
    Mutex,
    atomic::{AtomicBool, Ordering},
};

use serde::{Deserialize, Serialize};
use tauri::{
    App, AppHandle, Manager, Runtime, State, WebviewWindow,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use crate::{
    api::{RequestContext, Response},
    domain::{AppError, ErrorCode},
};

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_ID: &str = "comic-explorer-tray";
const SHOW_MENU_ID: &str = "comic-explorer-tray-show";
const QUIT_MENU_ID: &str = "comic-explorer-tray-quit";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayStatus {
    pub available: bool,
    pub stored: bool,
    pub reason: Option<String>,
}

pub struct TrayState {
    available: AtomicBool,
    stored: AtomicBool,
    reason: Mutex<Option<String>>,
}

impl Default for TrayState {
    fn default() -> Self {
        Self {
            available: AtomicBool::new(false),
            stored: AtomicBool::new(false),
            reason: Mutex::new(Some("タスクトレイを初期化しています。".into())),
        }
    }
}

impl TrayState {
    pub fn status(&self) -> TrayStatus {
        TrayStatus {
            available: self.available.load(Ordering::Acquire),
            stored: self.stored.load(Ordering::Acquire),
            reason: self
                .reason
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .clone(),
        }
    }

    fn mark_available(&self) {
        self.available.store(true, Ordering::Release);
        self.stored.store(false, Ordering::Release);
        self.set_reason(None);
    }

    fn mark_unavailable(&self, reason: String) {
        self.available.store(false, Ordering::Release);
        self.stored.store(false, Ordering::Release);
        self.set_reason(Some(reason));
    }

    fn mark_stored(&self, stored: bool) {
        self.stored.store(stored, Ordering::Release);
        if self.available.load(Ordering::Acquire) {
            self.set_reason(None);
        }
    }

    fn mark_failure(&self, stored: bool, reason: String) {
        self.stored.store(stored, Ordering::Release);
        self.set_reason(Some(reason));
    }

    fn set_reason(&self, reason: Option<String>) {
        *self
            .reason
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = reason;
    }
}

trait MainWindowController {
    fn hide(&self) -> Result<(), String>;
    fn show(&self) -> Result<(), String>;
    fn unminimize(&self) -> Result<(), String>;
    fn focus(&self) -> Result<(), String>;
}

impl<R: Runtime> MainWindowController for WebviewWindow<R> {
    fn hide(&self) -> Result<(), String> {
        WebviewWindow::hide(self).map_err(|error| error.to_string())
    }

    fn show(&self) -> Result<(), String> {
        WebviewWindow::show(self).map_err(|error| error.to_string())
    }

    fn unminimize(&self) -> Result<(), String> {
        WebviewWindow::unminimize(self).map_err(|error| error.to_string())
    }

    fn focus(&self) -> Result<(), String> {
        WebviewWindow::set_focus(self).map_err(|error| error.to_string())
    }
}

fn store_window(
    window: &impl MainWindowController,
    state: &TrayState,
) -> Result<TrayStatus, String> {
    let status = state.status();
    if !status.available {
        return Err(status
            .reason
            .unwrap_or_else(|| "タスクトレイを利用できません。".into()));
    }
    if let Err(error) = window.hide() {
        let message = format!("メインウィンドウをタスクトレイへ収納できませんでした: {error}");
        state.mark_failure(false, message.clone());
        return Err(message);
    }
    state.mark_stored(true);
    Ok(state.status())
}

fn restore_window(
    window: &impl MainWindowController,
    state: &TrayState,
) -> Result<TrayStatus, String> {
    let was_stored = state.status().stored;
    if let Err(error) = window.show() {
        let message = format!("メインウィンドウを表示できませんでした: {error}");
        state.mark_failure(was_stored, message.clone());
        return Err(message);
    }

    // Once show succeeds the user is no longer stranded in a hidden window,
    // even if the best-effort restore of placement or focus fails afterwards.
    state.mark_stored(false);
    if let Err(error) = window.unminimize() {
        let message = format!("メインウィンドウの最小化を解除できませんでした: {error}");
        state.mark_failure(false, message.clone());
        return Err(message);
    }
    if let Err(error) = window.focus() {
        let message = format!("メインウィンドウへフォーカスを戻せませんでした: {error}");
        state.mark_failure(false, message.clone());
        return Err(message);
    }

    state.mark_stored(false);
    Ok(state.status())
}

fn main_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, String> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "メインウィンドウを取得できませんでした。".into())
}

fn restore_main_window<R: Runtime>(
    app: &AppHandle<R>,
    state: &TrayState,
) -> Result<TrayStatus, String> {
    match main_window(app) {
        Ok(window) => restore_window(&window, state),
        Err(message) => {
            let was_stored = state.status().stored;
            state.mark_failure(was_stored, message.clone());
            Err(message)
        }
    }
}

#[cfg(target_os = "windows")]
fn build_native_tray<R: Runtime>(app: &App<R>) -> Result<(), String> {
    let show = MenuItem::with_id(
        app,
        SHOW_MENU_ID,
        "Comic Explorerを表示",
        true,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    let quit = MenuItem::with_id(
        app,
        QUIT_MENU_ID,
        "Comic Explorerを終了",
        true,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    let menu = Menu::with_items(app, &[&show, &quit]).map_err(|error| error.to_string())?;
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| "タスクトレイ用アイコンを取得できませんでした。".to_string())?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("Comic Explorer")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if event.id() == SHOW_MENU_ID {
                let state = app.state::<TrayState>();
                let _ = restore_main_window(app, &state);
            } else if event.id() == QUIT_MENU_ID {
                app.exit(0);
            }
        })
        .on_tray_icon_event(|tray, event| {
            let restore = matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } | TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            );
            if restore {
                let app = tray.app_handle();
                let state = app.state::<TrayState>();
                let _ = restore_main_window(app, &state);
            }
        })
        .build(app)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn record_initialization(state: &TrayState, result: Result<(), String>) {
    match result {
        Ok(()) => state.mark_available(),
        Err(error) => {
            state.mark_unavailable(format!("タスクトレイを初期化できませんでした: {error}"))
        }
    }
}

pub fn initialize<R: Runtime>(app: &App<R>) {
    let state = app.state::<TrayState>();
    #[cfg(target_os = "windows")]
    let result = build_native_tray(app);
    #[cfg(not(target_os = "windows"))]
    let result = Err("タスクトレイはWindows版でのみ利用できます。".into());
    record_initialization(&state, result);
}

fn invalid_context<T>(context: &RequestContext, error: AppError) -> Response<T> {
    Response::Error {
        request_id: context.request_id.clone(),
        generation: context.generation,
        error,
    }
}

fn operation_response(
    context: RequestContext,
    state: &TrayState,
    result: Result<TrayStatus, String>,
) -> Response<TrayStatus> {
    match result {
        Ok(data) => Response::Ok {
            request_id: context.request_id,
            generation: context.generation,
            data,
        },
        Err(message) => Response::Error {
            request_id: context.request_id,
            generation: context.generation,
            error: AppError {
                code: if state.status().available {
                    ErrorCode::Internal
                } else {
                    ErrorCode::InvalidRequest
                },
                message,
                target: None,
                retryable: state.status().available,
            },
        },
    }
}

#[tauri::command]
pub fn get_tray_status(
    state: State<'_, TrayState>,
    context: RequestContext,
) -> Result<Response<TrayStatus>, String> {
    if let Err(error) = context.validate() {
        return Ok(invalid_context(&context, error));
    }
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: state.status(),
    })
}

#[tauri::command]
pub fn store_main_window_in_tray(
    app: AppHandle,
    state: State<'_, TrayState>,
    context: RequestContext,
) -> Result<Response<TrayStatus>, String> {
    if let Err(error) = context.validate() {
        return Ok(invalid_context(&context, error));
    }
    let result = match main_window(&app) {
        Ok(window) => store_window(&window, &state),
        Err(message) => {
            state.mark_failure(false, message.clone());
            Err(message)
        }
    };
    Ok(operation_response(context, &state, result))
}

#[tauri::command]
pub fn restore_main_window_from_tray(
    app: AppHandle,
    state: State<'_, TrayState>,
    context: RequestContext,
) -> Result<Response<TrayStatus>, String> {
    if let Err(error) = context.validate() {
        return Ok(invalid_context(&context, error));
    }
    let result = restore_main_window(&app, &state);
    Ok(operation_response(context, &state, result))
}

#[tauri::command]
pub fn quit_application(app: AppHandle, context: RequestContext) -> Result<Response<()>, String> {
    if let Err(error) = context.validate() {
        return Ok(invalid_context(&context, error));
    }
    let response = Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: (),
    };
    app.exit(0);
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct MockWindow {
        calls: Mutex<Vec<&'static str>>,
        failure: Option<&'static str>,
    }

    impl MockWindow {
        fn failing(operation: &'static str) -> Self {
            Self {
                failure: Some(operation),
                ..Self::default()
            }
        }

        fn call(&self, operation: &'static str) -> Result<(), String> {
            self.calls.lock().unwrap().push(operation);
            if self.failure == Some(operation) {
                Err(format!("{operation} failed"))
            } else {
                Ok(())
            }
        }
    }

    impl MainWindowController for MockWindow {
        fn hide(&self) -> Result<(), String> {
            self.call("hide")
        }

        fn show(&self) -> Result<(), String> {
            self.call("show")
        }

        fn unminimize(&self) -> Result<(), String> {
            self.call("unminimize")
        }

        fn focus(&self) -> Result<(), String> {
            self.call("focus")
        }
    }

    #[test]
    fn unavailable_tray_never_hides_the_window() {
        let state = TrayState::default();
        let window = MockWindow::default();

        assert!(store_window(&window, &state).is_err());
        assert!(window.calls.lock().unwrap().is_empty());
        assert!(!state.status().stored);
    }

    #[test]
    fn initialization_failure_is_non_fatal_and_records_a_disabled_reason() {
        let state = TrayState::default();

        record_initialization(&state, Err("OS tray failure".into()));

        assert!(!state.status().available);
        assert!(!state.status().stored);
        assert_eq!(
            state.status().reason.as_deref(),
            Some("タスクトレイを初期化できませんでした: OS tray failure")
        );
    }

    #[test]
    fn restoring_an_unavailable_tray_does_not_erase_the_disabled_reason() {
        let state = TrayState::default();
        state.mark_unavailable("native tray unavailable".into());
        let window = MockWindow::default();

        let status = restore_window(&window, &state).unwrap();

        assert!(!status.available);
        assert!(!status.stored);
        assert_eq!(status.reason.as_deref(), Some("native tray unavailable"));
    }

    #[test]
    fn successful_store_hides_the_native_window_and_marks_it_stored() {
        let state = TrayState::default();
        state.mark_available();
        let window = MockWindow::default();

        let status = store_window(&window, &state).unwrap();

        assert_eq!(*window.calls.lock().unwrap(), ["hide"]);
        assert!(status.available);
        assert!(status.stored);
        assert_eq!(status.reason, None);
    }

    #[test]
    fn hide_failure_keeps_the_window_out_of_stored_state() {
        let state = TrayState::default();
        state.mark_available();
        let window = MockWindow::failing("hide");

        assert!(store_window(&window, &state).is_err());
        assert!(state.status().available);
        assert!(!state.status().stored);
        assert!(state.status().reason.unwrap().contains("hide failed"));
    }

    #[test]
    fn restore_shows_unminimizes_and_focuses_in_order() {
        let state = TrayState::default();
        state.mark_available();
        state.mark_stored(true);
        let window = MockWindow::default();

        let status = restore_window(&window, &state).unwrap();

        assert_eq!(
            *window.calls.lock().unwrap(),
            ["show", "unminimize", "focus"]
        );
        assert!(!status.stored);
        assert_eq!(status.reason, None);
    }

    #[test]
    fn show_failure_preserves_stored_state_for_a_safe_retry() {
        let state = TrayState::default();
        state.mark_available();
        state.mark_stored(true);
        let window = MockWindow::failing("show");

        assert!(restore_window(&window, &state).is_err());
        assert!(state.status().stored);
        assert!(state.status().reason.unwrap().contains("show failed"));
    }

    #[test]
    fn focus_failure_reports_error_but_does_not_claim_the_visible_window_is_stored() {
        let state = TrayState::default();
        state.mark_available();
        state.mark_stored(true);
        let window = MockWindow::failing("focus");

        assert!(restore_window(&window, &state).is_err());
        assert!(!state.status().stored);
        assert_eq!(
            *window.calls.lock().unwrap(),
            ["show", "unminimize", "focus"]
        );
    }
}
