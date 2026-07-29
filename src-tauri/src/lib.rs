pub mod api;
pub mod application;
pub mod catalog;
pub mod domain;
pub mod media;
pub mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(application::AppState::default())
        .register_uri_scheme_protocol("comic", |context, request| {
            let token = request.uri().path().trim_start_matches('/');
            let state = context.app_handle().state::<application::AppState>();
            let result = state
                .media
                .lock()
                .map_err(|_| "media state poisoned".to_string())
                .and_then(|mut registry| registry.read(token).map_err(|error| error.message));
            match result {
                Ok((grant, bytes)) => tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", grant.mime_type)
                    .header("Content-Length", bytes.len().to_string())
                    .header("X-Content-Type-Options", "nosniff")
                    .header("Access-Control-Allow-Origin", "http://tauri.localhost")
                    .header("Cache-Control", "private, max-age=300")
                    .body(bytes)
                    .expect("valid media response"),
                Err(message) => tauri::http::Response::builder()
                    .status(404)
                    .header("Content-Type", "text/plain; charset=utf-8")
                    .header("X-Content-Type-Options", "nosniff")
                    .body(message.into_bytes())
                    .expect("valid media error response"),
            }
        })
        .invoke_handler(tauri::generate_handler![
            application::get_library_root,
            application::set_library_root,
            application::list_folder,
            application::cancel_navigation,
            application::open_comic,
            application::save_reading_position
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Comic Explorer");
}
