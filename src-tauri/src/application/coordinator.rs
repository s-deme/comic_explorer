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
}
