use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::sync::{Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};

use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Priority {
    Background = 0,
    Near = 1,
    Visible = 2,
}

#[derive(Debug)]
pub struct QueueItem<T> {
    pub priority: Priority,
    pub sequence: u64,
    pub value: T,
}

impl<T> PartialEq for QueueItem<T> {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority && self.sequence == other.sequence
    }
}

impl<T> Eq for QueueItem<T> {}

impl<T> PartialOrd for QueueItem<T> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<T> Ord for QueueItem<T> {
    fn cmp(&self, other: &Self) -> Ordering {
        self.priority
            .cmp(&other.priority)
            .then_with(|| other.sequence.cmp(&self.sequence))
    }
}

pub struct BoundedPriorityQueue<T> {
    capacity: usize,
    sequence: u64,
    heap: BinaryHeap<QueueItem<T>>,
}

type Work = Box<dyn FnOnce() + Send + 'static>;

struct ScheduledWork {
    cancellation: CancellationToken,
    run: Work,
}

struct PoolState {
    accepting: bool,
    queue: BoundedPriorityQueue<ScheduledWork>,
}

struct SharedPool {
    state: Mutex<PoolState>,
    ready: Condvar,
    shutdown: CancellationToken,
}

/// Fixed-size blocking worker pool backed by the same bounded priority queue used by the
/// application contract. Dropping an evicted or cancelled closure closes its result channel.
pub struct PriorityTaskPool {
    shared: Arc<SharedPool>,
    workers: Mutex<Vec<JoinHandle<()>>>,
}

impl PriorityTaskPool {
    pub fn new(worker_count: usize, queue_capacity: usize) -> Self {
        assert!(worker_count > 0, "a task pool requires at least one worker");
        let shared = Arc::new(SharedPool {
            state: Mutex::new(PoolState {
                accepting: true,
                queue: BoundedPriorityQueue::new(queue_capacity),
            }),
            ready: Condvar::new(),
            shutdown: CancellationToken::new(),
        });
        let workers = (0..worker_count)
            .map(|index| {
                let shared = shared.clone();
                thread::Builder::new()
                    .name(format!("thumbnail-worker-{index}"))
                    .spawn(move || worker_loop(&shared))
                    .expect("thumbnail worker thread must start")
            })
            .collect();
        Self {
            shared,
            workers: Mutex::new(workers),
        }
    }

    pub fn submit(
        &self,
        priority: Priority,
        cancellation: CancellationToken,
        run: impl FnOnce() + Send + 'static,
    ) -> Result<(), ()> {
        if cancellation.is_cancelled() {
            return Err(());
        }
        let mut state = self.shared.state.lock().map_err(|_| ())?;
        if !state.accepting || self.shared.shutdown.is_cancelled() {
            return Err(());
        }
        state.queue.push(
            priority,
            ScheduledWork {
                cancellation,
                run: Box::new(run),
            },
        );
        self.shared.ready.notify_one();
        Ok(())
    }

    pub fn shutdown(&self) {
        self.shared.shutdown.cancel();
        if let Ok(mut state) = self.shared.state.lock() {
            state.accepting = false;
            while state.queue.pop().is_some() {}
        }
        self.shared.ready.notify_all();
        if let Ok(mut workers) = self.workers.lock() {
            for worker in workers.drain(..) {
                let _ = worker.join();
            }
        }
    }
}

impl Drop for PriorityTaskPool {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn worker_loop(shared: &SharedPool) {
    loop {
        let work = {
            let mut state = match shared.state.lock() {
                Ok(state) => state,
                Err(_) => return,
            };
            while state.queue.is_empty() && state.accepting && !shared.shutdown.is_cancelled() {
                state = match shared.ready.wait(state) {
                    Ok(state) => state,
                    Err(_) => return,
                };
            }
            if shared.shutdown.is_cancelled() {
                return;
            }
            state.queue.pop().map(|item| item.value)
        };
        let Some(work) = work else {
            return;
        };
        if !work.cancellation.is_cancelled() && !shared.shutdown.is_cancelled() {
            (work.run)();
        }
    }
}

impl<T> BoundedPriorityQueue<T> {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity,
            sequence: 0,
            heap: BinaryHeap::with_capacity(capacity),
        }
    }

    pub fn push(&mut self, priority: Priority, value: T) -> Option<QueueItem<T>> {
        let item = QueueItem {
            priority,
            sequence: self.sequence,
            value,
        };
        self.sequence = self.sequence.wrapping_add(1);
        if self.capacity == 0 {
            return Some(item);
        }
        self.heap.push(item);
        if self.heap.len() <= self.capacity {
            return None;
        }
        let lowest_index = self
            .heap
            .iter()
            .enumerate()
            .min_by_key(|(_, queued)| (queued.priority, queued.sequence))
            .map(|(index, _)| index)
            .unwrap();
        let mut values = self.heap.drain().collect::<Vec<_>>();
        let evicted = values.swap_remove(lowest_index);
        self.heap.extend(values);
        Some(evicted)
    }

    pub fn pop(&mut self) -> Option<QueueItem<T>> {
        self.heap.pop()
    }

    pub fn len(&self) -> usize {
        self.heap.len()
    }

    pub fn is_empty(&self) -> bool {
        self.heap.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn visible_work_evicts_old_background_work_at_capacity() {
        let mut queue = BoundedPriorityQueue::new(2);
        assert!(queue.push(Priority::Background, "background-1").is_none());
        assert!(queue.push(Priority::Background, "background-2").is_none());
        let evicted = queue.push(Priority::Visible, "visible").unwrap();
        assert_eq!(evicted.value, "background-1");
        assert_eq!(queue.pop().unwrap().value, "visible");
    }

    #[test]
    fn connected_pool_enforces_worker_limit_priority_cancel_capacity_and_shutdown_join() {
        let pool = PriorityTaskPool::new(1, 2);
        let blocker = Arc::new((Mutex::new(false), Condvar::new()));
        let (started_tx, started_rx) = mpsc::channel();
        let blocker_for_task = blocker.clone();
        pool.submit(Priority::Visible, CancellationToken::new(), move || {
            started_tx.send("running").unwrap();
            let (lock, ready) = &*blocker_for_task;
            let mut released = lock.lock().unwrap();
            while !*released {
                released = ready.wait(released).unwrap();
            }
        })
        .unwrap();
        assert_eq!(
            started_rx.recv_timeout(Duration::from_secs(2)).unwrap(),
            "running"
        );

        let (result_tx, result_rx) = mpsc::channel();
        pool.submit(Priority::Background, CancellationToken::new(), {
            let result_tx = result_tx.clone();
            move || result_tx.send("evicted-ran").unwrap()
        })
        .unwrap();
        let cancelled = CancellationToken::new();
        pool.submit(Priority::Near, cancelled.clone(), {
            let result_tx = result_tx.clone();
            move || result_tx.send("cancelled-ran").unwrap()
        })
        .unwrap();
        cancelled.cancel();
        pool.submit(Priority::Visible, CancellationToken::new(), {
            let result_tx = result_tx.clone();
            move || result_tx.send("visible").unwrap()
        })
        .unwrap();

        let (lock, ready) = &*blocker;
        *lock.lock().unwrap() = true;
        ready.notify_all();
        assert_eq!(
            result_rx.recv_timeout(Duration::from_secs(2)).unwrap(),
            "visible"
        );
        drop(result_tx);
        match result_rx.recv_timeout(Duration::from_secs(2)) {
            Err(mpsc::RecvTimeoutError::Disconnected) => {}
            Ok(value) => panic!("cancelled work produced an unexpected result: {value}"),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                panic!("cancelled work did not drain within the test deadline")
            }
        }
        pool.shutdown();
        assert!(
            pool.submit(Priority::Visible, CancellationToken::new(), || {})
                .is_err()
        );
    }
}
