pub mod api;
pub mod application;
pub mod catalog;
pub mod diagnostics;
pub mod domain;
pub mod media;
pub mod state;
pub mod tray;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(application::AppState::default())
        .manage(tray::TrayState::default())
        .setup(|app| {
            tray::initialize(app);
            Ok(())
        })
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
            application::list_windows_drives,
            application::list_windows_known_folders,
            application::get_catalog_settings,
            application::get_item_metadata,
            application::get_item_tags,
            application::save_item_memo,
            application::set_item_rating,
            application::list_page_bookmarks,
            application::save_page_bookmark,
            application::delete_page_bookmark,
            application::list_reading_history,
            application::clear_reading_history,
            application::list_tags,
            application::query_tags,
            application::assign_tag,
            application::remove_tag,
            application::rename_tag,
            application::list_favorites,
            application::add_favorite,
            application::remove_favorite,
            application::resolve_favorite,
            application::take_recovery_notice,
            application::set_catalog_sort,
            application::set_end_of_volume_policy,
            application::set_catalog_view_mode,
            application::set_shortcut_bindings,
            application::set_viewer_settings,
            application::set_settings_profile,
            application::pick_library_root,
            application::pick_library_file,
            application::set_library_root,
            application::list_folder,
            application::file_operations::rename_file_item,
            application::file_operations::create_file_folder,
            application::file_operations::copy_file_items_to_folder,
            application::file_operations::move_file_items_to_folder,
            application::file_operations::move_file_items_to_destination,
            application::file_operations::delete_file_items,
            application::file_operations::set_file_clipboard,
            application::file_operations::file_clipboard_status,
            application::file_operations::paste_file_items,
            application::file_operations::reveal_file_item,
            application::file_operations::open_file_item_default,
            application::file_operations::open_file_item_with,
            application::search_library,
            application::diagnose_library,
            application::get_thumbnail,
            application::list_tree_children,
            application::cancel_navigation,
            application::cancel_library_diagnostics,
            application::open_comic,
            application::load_page,
            application::save_reading_position,
            tray::get_tray_status,
            tray::store_main_window_in_tray,
            tray::restore_main_window_from_tray,
            tray::quit_application
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Comic Explorer");
    app.run(|app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            app_handle.state::<application::AppState>().shutdown();
        }
    });
}
