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
            let state = context.app_handle().state::<application::AppState>();
            state
                .media
                .lock()
                .map(|mut registry| media::handle_protocol_request(&mut registry, &request))
                .unwrap_or_else(|_| {
                    tauri::http::Response::builder()
                        .status(500)
                        .header("Content-Type", "text/plain; charset=utf-8")
                        .header("Content-Length", "17")
                        .header("X-Content-Type-Options", "nosniff")
                        .body(b"Media unavailable".to_vec())
                        .expect("static media error response")
                })
        })
        .invoke_handler(tauri::generate_handler![
            application::get_library_root,
            application::get_catalog_settings,
            application::set_catalog_sort,
            application::pick_library_root,
            application::set_library_root,
            application::list_folder,
            application::list_tree_children,
            application::cancel_navigation,
            application::open_comic,
            application::save_reading_position
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Comic Explorer");
}
