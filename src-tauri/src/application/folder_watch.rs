use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

pub const COALESCE_INTERVAL: Duration = Duration::from_millis(250);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatchSignal {
    Changed,
    Error(String),
}

enum RawSignal {
    Changed,
    Error(String),
}

pub struct FolderWatch {
    watcher: Option<RecommendedWatcher>,
    worker: Option<JoinHandle<()>>,
}

impl FolderWatch {
    pub fn start<F>(directory: &Path, callback: F) -> Result<Self, String>
    where
        F: FnMut(WatchSignal) + Send + 'static,
    {
        let (sender, receiver) = mpsc::channel();
        let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
            let signal = match result {
                Ok(event) if !matches!(event.kind, EventKind::Access(_)) => RawSignal::Changed,
                Ok(_) => return,
                Err(error) => RawSignal::Error(error.to_string()),
            };
            let _ = sender.send(signal);
        })
        .map_err(|error| format!("Cannot create the folder watcher: {error}"))?;
        watcher
            .watch(directory, RecursiveMode::NonRecursive)
            .map_err(|error| format!("Cannot watch the current folder: {error}"))?;
        let worker = thread::Builder::new()
            .name("comic-explorer-folder-watch".into())
            .spawn(move || run_signal_loop(receiver, callback, COALESCE_INTERVAL))
            .map_err(|error| format!("Cannot start the folder watcher worker: {error}"))?;
        Ok(Self {
            watcher: Some(watcher),
            worker: Some(worker),
        })
    }
}

impl Drop for FolderWatch {
    fn drop(&mut self) {
        self.watcher.take();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn run_signal_loop<F>(receiver: Receiver<RawSignal>, mut callback: F, coalesce_interval: Duration)
where
    F: FnMut(WatchSignal),
{
    loop {
        match receiver.recv() {
            Ok(RawSignal::Error(error)) => callback(WatchSignal::Error(error)),
            Ok(RawSignal::Changed) => {
                let deadline = Instant::now() + coalesce_interval;
                loop {
                    let remaining = deadline.saturating_duration_since(Instant::now());
                    match receiver.recv_timeout(remaining) {
                        Ok(RawSignal::Changed) => {}
                        Ok(RawSignal::Error(error)) => callback(WatchSignal::Error(error)),
                        Err(RecvTimeoutError::Timeout) => {
                            callback(WatchSignal::Changed);
                            break;
                        }
                        Err(RecvTimeoutError::Disconnected) => return,
                    }
                }
            }
            Err(_) => return,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn req_ley_p3_005_coalesces_bursts_and_drop_stops_delivery() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-folder-watch-{}-{}",
            std::process::id(),
            crate::application::unix_millis()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let (delivered_tx, delivered_rx) = mpsc::channel();
        let watcher = FolderWatch::start(&root, move |signal| {
            delivered_tx.send(signal).unwrap();
        })
        .unwrap();

        for index in 0..100 {
            std::fs::write(root.join(format!("burst-{index}.tmp")), b"change").unwrap();
        }
        assert_eq!(
            delivered_rx.recv_timeout(Duration::from_secs(5)).unwrap(),
            WatchSignal::Changed
        );
        assert!(matches!(
            delivered_rx.recv_timeout(Duration::from_millis(150)),
            Err(RecvTimeoutError::Timeout)
        ));

        std::fs::rename(root.join("burst-0.tmp"), root.join("renamed.tmp")).unwrap();
        assert_eq!(
            delivered_rx.recv_timeout(Duration::from_secs(5)).unwrap(),
            WatchSignal::Changed
        );
        std::fs::remove_file(root.join("renamed.tmp")).unwrap();
        assert_eq!(
            delivered_rx.recv_timeout(Duration::from_secs(5)).unwrap(),
            WatchSignal::Changed
        );

        drop(watcher);
        std::fs::write(root.join("after-drop.tmp"), b"ignored").unwrap();
        assert!(matches!(
            delivered_rx.recv_timeout(Duration::from_millis(500)),
            Err(RecvTimeoutError::Disconnected)
        ));
        std::fs::remove_dir_all(root).unwrap();
    }
}
