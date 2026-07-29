use std::cmp::Ordering;
use std::collections::BinaryHeap;

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

    #[test]
    fn visible_work_evicts_old_background_work_at_capacity() {
        let mut queue = BoundedPriorityQueue::new(2);
        assert!(queue.push(Priority::Background, "background-1").is_none());
        assert!(queue.push(Priority::Background, "background-2").is_none());
        let evicted = queue.push(Priority::Visible, "visible").unwrap();
        assert_eq!(evicted.value, "background-1");
        assert_eq!(queue.pop().unwrap().value, "visible");
    }
}
