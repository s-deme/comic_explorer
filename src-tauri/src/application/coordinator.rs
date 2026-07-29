use tokio_util::sync::CancellationToken;

use crate::api::Generation;

pub struct NavigationCoordinator {
    current: Generation,
    cancellation: CancellationToken,
    shutting_down: bool,
}

impl Default for NavigationCoordinator {
    fn default() -> Self {
        Self {
            current: Generation(0),
            cancellation: CancellationToken::new(),
            shutting_down: false,
        }
    }
}

impl NavigationCoordinator {
    pub fn begin(&mut self, generation: Generation) -> CancellationToken {
        self.cancellation.cancel();
        self.current = generation;
        self.cancellation = CancellationToken::new();
        if self.shutting_down {
            self.cancellation.cancel();
        }
        self.cancellation.clone()
    }

    pub fn is_current(&self, generation: Generation) -> bool {
        !self.shutting_down && self.current == generation
    }

    pub fn cancellation_for(&self, generation: Generation) -> CancellationToken {
        if self.is_current(generation) {
            self.cancellation.clone()
        } else {
            let cancelled = CancellationToken::new();
            cancelled.cancel();
            cancelled
        }
    }

    pub fn cancel(&mut self, generation: Generation) {
        if self.current == generation {
            self.cancellation.cancel();
        }
    }

    pub fn shutdown(&mut self) {
        self.shutting_down = true;
        self.cancellation.cancel();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tokio::sync::Barrier;

    #[test]
    fn new_generation_cancels_old_work_and_gates_late_results() {
        let mut coordinator = NavigationCoordinator::default();
        let old = coordinator.begin(Generation(1));
        let current = coordinator.begin(Generation(2));
        assert!(old.is_cancelled());
        assert!(!current.is_cancelled());
        assert!(!coordinator.is_current(Generation(1)));
        assert!(coordinator.is_current(Generation(2)));
    }

    #[test]
    fn shutdown_rejects_new_work() {
        let mut coordinator = NavigationCoordinator::default();
        coordinator.shutdown();
        assert!(coordinator.begin(Generation(1)).is_cancelled());
        assert!(!coordinator.is_current(Generation(1)));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn one_hundred_navigation_tasks_commit_only_the_latest_generation() {
        let coordinator = Arc::new(Mutex::new(NavigationCoordinator::default()));
        let barrier = Arc::new(Barrier::new(101));
        let commits = Arc::new(Mutex::new(Vec::new()));
        let mut tasks = Vec::new();

        for value in 1..=100 {
            let generation = Generation(value);
            let cancellation = coordinator.lock().unwrap().begin(generation);
            let coordinator = coordinator.clone();
            let barrier = barrier.clone();
            let commits = commits.clone();
            tasks.push(tokio::spawn(async move {
                barrier.wait().await;
                tokio::task::yield_now().await;
                if !cancellation.is_cancelled()
                    && coordinator.lock().unwrap().is_current(generation)
                {
                    commits.lock().unwrap().push(generation);
                }
            }));
        }

        barrier.wait().await;
        for task in tasks {
            task.await.unwrap();
        }
        assert_eq!(*commits.lock().unwrap(), [Generation(100)]);
    }
}
