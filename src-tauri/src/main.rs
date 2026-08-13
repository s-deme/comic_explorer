#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|argument| argument == "--shutdown-process-harness") {
        match comic_explorer_lib::application::run_shutdown_process_harness() {
            Ok(result) => {
                println!("{result}");
                return;
            }
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
    }
    comic_explorer_lib::run();
}
