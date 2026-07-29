pub mod api;
pub mod application;
pub mod catalog;
pub mod domain;
pub mod media;
pub mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(application::AppState::default())
        .invoke_handler(tauri::generate_handler![
            application::set_library_root,
            application::list_folder,
            application::cancel_navigation
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Comic Explorer");
}
