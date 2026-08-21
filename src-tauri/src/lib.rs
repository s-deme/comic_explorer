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
    let startup_arguments = std::env::args_os().skip(1).collect::<Vec<_>>();
    let startup_cwd = std::env::current_dir().unwrap_or_default();
    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            application::cli_launch::focus_main_window(app);
            application::cli_launch::accept_arguments(
                app.clone(),
                args.into_iter().skip(1).map(Into::into).collect(),
                cwd.into(),
            );
        }));
    }
    let app = builder
        .manage(application::AppState::default())
        .manage(tray::TrayState::default())
        .setup(move |app| {
            tray::initialize(app);
            application::cli_launch::accept_arguments(
                app.handle().clone(),
                startup_arguments.clone(),
                startup_cwd.clone(),
            );
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
            application::set_fullscreen_display_awake,
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
            application::list_named_settings_profiles,
            application::save_named_settings_profile,
            application::preview_named_settings_profile_switch,
            application::execute_named_settings_profile_switch,
            application::delete_named_settings_profile,
            application::csv_export::list_csv_export_presets,
            application::csv_export::save_csv_export_preset,
            application::csv_export::delete_csv_export_preset,
            application::csv_export::export_catalog_csv,
            application::cli_launch::take_cli_launch_request,
            application::shelves::list_shelves,
            application::shelves::create_shelf,
            application::shelves::update_shelf,
            application::shelves::delete_shelf,
            application::shelves::set_startup_shelf,
            application::shelves::create_shelf_folder,
            application::shelves::add_shelf_items,
            application::shelves::migrate_legacy_shelf,
            application::shelves::update_shelf_node,
            application::shelves::delete_shelf_nodes,
            application::shelves::preview_shelf_node_delete,
            application::shelves::execute_shelf_node_delete,
            application::shelves::reorder_shelves,
            application::shelves::reorder_shelf_nodes,
            application::shelves::preview_shelf_cleanup,
            application::shelves::execute_shelf_cleanup,
            application::shelves::open_shelf_item,
            application::shelves::export_shelves_text,
            application::shelves::preview_shelves_import,
            application::shelves::execute_shelves_import,
            application::pick_library_root,
            application::pick_search_source,
            application::pick_library_file,
            application::set_library_root,
            application::list_folder,
            application::watch_library_folder,
            application::stop_library_folder_watch,
            application::file_operations::rename_file_item,
            application::file_operations::get_rename_preferences,
            application::file_operations::save_rename_preferences,
            application::file_operations::preview_batch_rename,
            application::file_operations::execute_batch_rename,
            application::file_operations::create_file_folder,
            application::file_operations::copy_file_items_to_folder,
            application::file_operations::move_file_items_to_folder,
            application::file_operations::move_file_items_to_destination,
            application::file_operations::copy_file_items_to_destination,
            application::file_operations::preview_native_file_drop,
            application::file_operations::copy_native_file_drop,
            application::file_operations::start_native_file_drag,
            application::file_operations::delete_file_items,
            application::file_operations::set_file_clipboard,
            application::file_operations::file_clipboard_status,
            application::file_operations::paste_file_items,
            application::file_operations::reveal_file_item,
            application::file_operations::open_file_item_default,
            application::file_operations::open_file_item_with,
            application::file_operations::list_external_apps,
            application::file_operations::register_external_app,
            application::file_operations::update_external_app,
            application::file_operations::delete_external_app,
            application::file_operations::preview_external_app_launch,
            application::file_operations::launch_external_app,
            application::file_operations::list_external_app_history,
            application::search_library,
            application::evaluate_catalog_mask,
            application::list_catalog_masks,
            application::save_catalog_mask,
            application::delete_catalog_mask,
            application::diagnose_library,
            application::get_thumbnail,
            application::generate_recursive_thumbnails,
            application::list_tree_children,
            application::resolve_catalog_activation,
            application::resolve_viewer_rectangle_zoom,
            application::cancel_navigation,
            application::cancel_library_diagnostics,
            application::cancel_recursive_thumbnail_generation,
            application::open_comic,
            application::load_page,
            application::copy_viewer_page_to_clipboard,
            application::save_reading_position,
            tray::get_tray_status,
            tray::store_main_window_in_tray,
            tray::restore_main_window_from_tray,
            tray::quit_application
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Comic Explorer");
    app.run(|app_handle, event| {
        if let tauri::RunEvent::WindowEvent { label, event, .. } = &event {
            tray::handle_main_window_event(app_handle, label, event);
        }
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            app_handle.state::<application::AppState>().shutdown();
        }
    });
}
