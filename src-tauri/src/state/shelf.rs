use std::collections::HashSet;

use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::domain::{AppError, ErrorCode};

use super::StateStore;

const MAX_SHELVES: i64 = 64;
const MAX_NODES_PER_SHELF: i64 = 10_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfRecord {
    pub id: i64,
    pub name: String,
    pub icon: String,
    pub sort_order: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfNodeRecord {
    pub id: i64,
    pub shelf_id: i64,
    pub parent_id: Option<i64>,
    pub node_type: String,
    pub name: String,
    pub target_path: Option<String>,
    pub target_kind: Option<String>,
    pub icon: String,
    pub sort_order: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfSnapshotRecord {
    pub shelves: Vec<ShelfRecord>,
    pub nodes: Vec<ShelfNodeRecord>,
    pub startup_shelf_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewShelfNodeRecord {
    pub name: String,
    pub target_path: String,
    pub target_kind: String,
    pub icon: String,
}

fn database_error(source: rusqlite::Error) -> AppError {
    AppError {
        code: ErrorCode::Internal,
        message: format!("Local shelf database operation failed: {source}"),
        target: None,
        retryable: true,
    }
}

fn not_found(message: &str) -> AppError {
    AppError {
        code: ErrorCode::NotFound,
        message: message.into(),
        target: None,
        retryable: false,
    }
}

fn conflict(message: &str) -> AppError {
    AppError {
        code: ErrorCode::Conflict,
        message: message.into(),
        target: None,
        retryable: false,
    }
}

impl StateStore {
    pub fn shelf_snapshot(&self) -> Result<ShelfSnapshotRecord, AppError> {
        let connection = self.connection();
        let mut shelf_statement = connection
            .prepare(
                "SELECT id, name, icon, sort_order
                 FROM virtual_shelves ORDER BY sort_order, id",
            )
            .map_err(database_error)?;
        let shelves = shelf_statement
            .query_map([], |row| {
                Ok(ShelfRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    icon: row.get(2)?,
                    sort_order: row.get::<_, i64>(3)?.max(0) as u32,
                })
            })
            .map_err(database_error)?
            .map(|row| row.map_err(database_error))
            .collect::<Result<Vec<_>, _>>()?;
        let mut node_statement = connection
            .prepare(
                "SELECT id, shelf_id, parent_id, node_type, name, target_path,
                        target_kind, icon, sort_order
                 FROM virtual_shelf_nodes
                 ORDER BY shelf_id, parent_id, sort_order, id",
            )
            .map_err(database_error)?;
        let nodes = node_statement
            .query_map([], |row| {
                Ok(ShelfNodeRecord {
                    id: row.get(0)?,
                    shelf_id: row.get(1)?,
                    parent_id: row.get(2)?,
                    node_type: row.get(3)?,
                    name: row.get(4)?,
                    target_path: row.get(5)?,
                    target_kind: row.get(6)?,
                    icon: row.get(7)?,
                    sort_order: row.get::<_, i64>(8)?.max(0) as u32,
                })
            })
            .map_err(database_error)?
            .map(|row| row.map_err(database_error))
            .collect::<Result<Vec<_>, _>>()?;
        let startup_shelf_id = connection
            .query_row(
                "SELECT startup_shelf_id FROM virtual_shelf_preferences WHERE singleton=1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error)?
            .flatten();
        Ok(ShelfSnapshotRecord {
            shelves,
            nodes,
            startup_shelf_id,
        })
    }

    pub fn create_shelf(&self, name: &str, icon: &str, now_ms: i64) -> Result<i64, AppError> {
        let connection = self.connection();
        let count = connection
            .query_row("SELECT COUNT(*) FROM virtual_shelves", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(database_error)?;
        if count >= MAX_SHELVES {
            return Err(AppError {
                code: ErrorCode::ResourceLimit,
                message: "Named shelves are limited to 64.".into(),
                target: None,
                retryable: false,
            });
        }
        let sort_order = connection
            .query_row(
                "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM virtual_shelves",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map_err(database_error)?;
        connection
            .execute(
                "INSERT INTO virtual_shelves(name, icon, sort_order, created_at_ms, updated_at_ms)
                 VALUES(?1, ?2, ?3, ?4, ?4)",
                params![name, icon, sort_order, now_ms],
            )
            .map_err(|error| match error {
                rusqlite::Error::SqliteFailure(_, _) => {
                    conflict("A shelf with that name already exists.")
                }
                other => database_error(other),
            })?;
        Ok(connection.last_insert_rowid())
    }

    pub fn update_shelf(
        &self,
        shelf_id: i64,
        name: &str,
        icon: &str,
        now_ms: i64,
    ) -> Result<(), AppError> {
        let changed = self
            .connection()
            .execute(
                "UPDATE virtual_shelves SET name=?1, icon=?2, updated_at_ms=?3 WHERE id=?4",
                params![name, icon, now_ms, shelf_id],
            )
            .map_err(|error| match error {
                rusqlite::Error::SqliteFailure(_, _) => {
                    conflict("A shelf with that name already exists.")
                }
                other => database_error(other),
            })?;
        if changed == 0 {
            return Err(not_found("Shelf was not found."));
        }
        Ok(())
    }

    pub fn delete_shelf(&self, shelf_id: i64) -> Result<(), AppError> {
        let transaction = self
            .connection()
            .unchecked_transaction()
            .map_err(database_error)?;
        let changed = transaction
            .execute("DELETE FROM virtual_shelves WHERE id=?1", [shelf_id])
            .map_err(database_error)?;
        if changed == 0 {
            return Err(not_found("Shelf was not found."));
        }
        normalize_shelf_order(&transaction)?;
        transaction.commit().map_err(database_error)
    }

    pub fn set_startup_shelf(&self, shelf_id: Option<i64>) -> Result<(), AppError> {
        if let Some(id) = shelf_id {
            let exists = self
                .connection()
                .query_row("SELECT 1 FROM virtual_shelves WHERE id=?1", [id], |_row| {
                    Ok(())
                })
                .optional()
                .map_err(database_error)?
                .is_some();
            if !exists {
                return Err(not_found("Startup shelf was not found."));
            }
        }
        self.connection()
            .execute(
                "UPDATE virtual_shelf_preferences SET startup_shelf_id=?1 WHERE singleton=1",
                [shelf_id],
            )
            .map_err(database_error)?;
        Ok(())
    }

    pub fn create_shelf_folder(
        &self,
        shelf_id: i64,
        parent_id: Option<i64>,
        name: &str,
        icon: &str,
        now_ms: i64,
    ) -> Result<i64, AppError> {
        self.ensure_parent(shelf_id, parent_id)?;
        self.ensure_node_capacity(shelf_id, 1)?;
        self.ensure_unique_node_name(shelf_id, parent_id, name, None)?;
        let sort_order = self.next_node_order(shelf_id, parent_id)?;
        self.connection()
            .execute(
                "INSERT INTO virtual_shelf_nodes(
                    shelf_id, parent_id, node_type, name, target_path, target_kind,
                    icon, sort_order, created_at_ms, updated_at_ms
                 ) VALUES(?1, ?2, 'folder', ?3, NULL, NULL, ?4, ?5, ?6, ?6)",
                params![shelf_id, parent_id, name, icon, sort_order, now_ms],
            )
            .map_err(database_error)?;
        Ok(self.connection().last_insert_rowid())
    }

    pub fn add_shelf_items(
        &self,
        shelf_id: i64,
        parent_id: Option<i64>,
        items: &[NewShelfNodeRecord],
        now_ms: i64,
    ) -> Result<usize, AppError> {
        self.ensure_parent(shelf_id, parent_id)?;
        self.ensure_node_capacity(shelf_id, items.len() as i64)?;
        let transaction = self
            .connection()
            .unchecked_transaction()
            .map_err(database_error)?;
        let mut next_order = transaction
            .query_row(
                "SELECT COALESCE(MAX(sort_order) + 1, 0)
                 FROM virtual_shelf_nodes
                 WHERE shelf_id=?1 AND parent_id IS ?2",
                params![shelf_id, parent_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(database_error)?;
        let mut added = 0;
        for item in items {
            let exists = transaction
                .query_row(
                    "SELECT 1 FROM virtual_shelf_nodes
                     WHERE shelf_id=?1 AND parent_id IS ?2 AND node_type='item'
                       AND target_path=?3 COLLATE NOCASE",
                    params![shelf_id, parent_id, item.target_path],
                    |_row| Ok(()),
                )
                .optional()
                .map_err(database_error)?
                .is_some();
            if exists {
                continue;
            }
            let mut candidate = item.name.clone();
            let mut suffix = 2;
            while node_name_exists(&transaction, shelf_id, parent_id, &candidate, None)? {
                candidate = format!("{} ({suffix})", item.name);
                suffix += 1;
            }
            transaction
                .execute(
                    "INSERT INTO virtual_shelf_nodes(
                        shelf_id, parent_id, node_type, name, target_path, target_kind,
                        icon, sort_order, created_at_ms, updated_at_ms
                     ) VALUES(?1, ?2, 'item', ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
                    params![
                        shelf_id,
                        parent_id,
                        candidate,
                        item.target_path,
                        item.target_kind,
                        item.icon,
                        next_order,
                        now_ms
                    ],
                )
                .map_err(database_error)?;
            next_order += 1;
            added += 1;
        }
        transaction.commit().map_err(database_error)?;
        Ok(added)
    }

    pub fn update_shelf_node(
        &self,
        node_id: i64,
        parent_id: Option<i64>,
        name: &str,
        icon: &str,
        now_ms: i64,
    ) -> Result<(), AppError> {
        let (shelf_id, node_type) = self
            .connection()
            .query_row(
                "SELECT shelf_id, node_type FROM virtual_shelf_nodes WHERE id=?1",
                [node_id],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(database_error)?
            .ok_or_else(|| not_found("Shelf node was not found."))?;
        self.ensure_parent(shelf_id, parent_id)?;
        if parent_id == Some(node_id) || self.node_is_descendant(node_id, parent_id)? {
            return Err(conflict(
                "A shelf folder cannot be moved into itself or its descendant.",
            ));
        }
        self.ensure_unique_node_name(shelf_id, parent_id, name, Some(node_id))?;
        let transaction = self
            .connection()
            .unchecked_transaction()
            .map_err(database_error)?;
        let old_parent = transaction
            .query_row(
                "SELECT parent_id FROM virtual_shelf_nodes WHERE id=?1",
                [node_id],
                |row| row.get::<_, Option<i64>>(0),
            )
            .map_err(database_error)?;
        let order = if old_parent == parent_id {
            transaction
                .query_row(
                    "SELECT sort_order FROM virtual_shelf_nodes WHERE id=?1",
                    [node_id],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(database_error)?
        } else {
            transaction
                .query_row(
                    "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM virtual_shelf_nodes
                     WHERE shelf_id=?1 AND parent_id IS ?2",
                    params![shelf_id, parent_id],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(database_error)?
        };
        transaction
            .execute(
                "UPDATE virtual_shelf_nodes
                 SET parent_id=?1, name=?2, icon=?3, sort_order=?4, updated_at_ms=?5
                 WHERE id=?6",
                params![parent_id, name, icon, order, now_ms, node_id],
            )
            .map_err(database_error)?;
        normalize_node_order(&transaction, shelf_id, old_parent)?;
        if old_parent != parent_id {
            normalize_node_order(&transaction, shelf_id, parent_id)?;
        }
        debug_assert!(node_type == "folder" || node_type == "item");
        transaction.commit().map_err(database_error)
    }

    pub fn delete_shelf_nodes(&self, node_ids: &[i64]) -> Result<usize, AppError> {
        let transaction = self
            .connection()
            .unchecked_transaction()
            .map_err(database_error)?;
        let mut deleted = 0;
        let mut affected = HashSet::new();
        for node_id in node_ids {
            if let Some((shelf_id, parent_id)) = transaction
                .query_row(
                    "SELECT shelf_id, parent_id FROM virtual_shelf_nodes WHERE id=?1",
                    [node_id],
                    |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<i64>>(1)?)),
                )
                .optional()
                .map_err(database_error)?
            {
                deleted += transaction
                    .execute("DELETE FROM virtual_shelf_nodes WHERE id=?1", [node_id])
                    .map_err(database_error)?;
                affected.insert((shelf_id, parent_id));
            }
        }
        for (shelf_id, parent_id) in affected {
            normalize_node_order(&transaction, shelf_id, parent_id)?;
        }
        transaction.commit().map_err(database_error)?;
        Ok(deleted)
    }

    pub fn reorder_shelves(&self, ordered_ids: &[i64]) -> Result<(), AppError> {
        let transaction = self
            .connection()
            .unchecked_transaction()
            .map_err(database_error)?;
        let current = query_ids(
            &transaction,
            "SELECT id FROM virtual_shelves ORDER BY sort_order, id",
            [],
        )?;
        if current.len() != ordered_ids.len()
            || current.iter().copied().collect::<HashSet<_>>()
                != ordered_ids.iter().copied().collect::<HashSet<_>>()
        {
            return Err(conflict(
                "Shelf order no longer matches the stored shelves.",
            ));
        }
        transaction
            .execute(
                "UPDATE virtual_shelves SET sort_order=sort_order+1000000",
                [],
            )
            .map_err(database_error)?;
        for (order, id) in ordered_ids.iter().enumerate() {
            transaction
                .execute(
                    "UPDATE virtual_shelves SET sort_order=?1 WHERE id=?2",
                    params![order as i64, id],
                )
                .map_err(database_error)?;
        }
        transaction.commit().map_err(database_error)
    }

    pub fn reorder_shelf_nodes(
        &self,
        shelf_id: i64,
        parent_id: Option<i64>,
        ordered_ids: &[i64],
    ) -> Result<(), AppError> {
        let transaction = self
            .connection()
            .unchecked_transaction()
            .map_err(database_error)?;
        let mut statement = transaction
            .prepare(
                "SELECT id FROM virtual_shelf_nodes
                 WHERE shelf_id=?1 AND parent_id IS ?2 ORDER BY sort_order, id",
            )
            .map_err(database_error)?;
        let current = statement
            .query_map(params![shelf_id, parent_id], |row| row.get::<_, i64>(0))
            .map_err(database_error)?
            .map(|value| value.map_err(database_error))
            .collect::<Result<Vec<_>, _>>()?;
        drop(statement);
        if current.len() != ordered_ids.len()
            || current.iter().copied().collect::<HashSet<_>>()
                != ordered_ids.iter().copied().collect::<HashSet<_>>()
        {
            return Err(conflict(
                "Shelf node order no longer matches the stored folder.",
            ));
        }
        transaction
            .execute(
                "UPDATE virtual_shelf_nodes SET sort_order=sort_order+1000000
                 WHERE shelf_id=?1 AND parent_id IS ?2",
                params![shelf_id, parent_id],
            )
            .map_err(database_error)?;
        for (order, id) in ordered_ids.iter().enumerate() {
            transaction
                .execute(
                    "UPDATE virtual_shelf_nodes SET sort_order=?1 WHERE id=?2",
                    params![order as i64, id],
                )
                .map_err(database_error)?;
        }
        transaction.commit().map_err(database_error)
    }

    fn ensure_node_capacity(&self, shelf_id: i64, adding: i64) -> Result<(), AppError> {
        let count = self
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM virtual_shelf_nodes WHERE shelf_id=?1",
                [shelf_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(database_error)?;
        if count + adding > MAX_NODES_PER_SHELF {
            return Err(AppError {
                code: ErrorCode::ResourceLimit,
                message: "A named shelf is limited to 10,000 nodes.".into(),
                target: None,
                retryable: false,
            });
        }
        Ok(())
    }

    fn ensure_parent(&self, shelf_id: i64, parent_id: Option<i64>) -> Result<(), AppError> {
        let shelf_exists = self
            .connection()
            .query_row(
                "SELECT 1 FROM virtual_shelves WHERE id=?1",
                [shelf_id],
                |_row| Ok(()),
            )
            .optional()
            .map_err(database_error)?
            .is_some();
        if !shelf_exists {
            return Err(not_found("Shelf was not found."));
        }
        if let Some(parent_id) = parent_id {
            let valid = self
                .connection()
                .query_row(
                    "SELECT 1 FROM virtual_shelf_nodes
                     WHERE id=?1 AND shelf_id=?2 AND node_type='folder'",
                    params![parent_id, shelf_id],
                    |_row| Ok(()),
                )
                .optional()
                .map_err(database_error)?
                .is_some();
            if !valid {
                return Err(conflict("Shelf parent must be a folder in the same shelf."));
            }
        }
        Ok(())
    }

    fn ensure_unique_node_name(
        &self,
        shelf_id: i64,
        parent_id: Option<i64>,
        name: &str,
        excluding: Option<i64>,
    ) -> Result<(), AppError> {
        if node_name_exists(self.connection(), shelf_id, parent_id, name, excluding)? {
            return Err(conflict(
                "A node with that name already exists in this shelf folder.",
            ));
        }
        Ok(())
    }

    fn next_node_order(&self, shelf_id: i64, parent_id: Option<i64>) -> Result<i64, AppError> {
        self.connection()
            .query_row(
                "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM virtual_shelf_nodes
                 WHERE shelf_id=?1 AND parent_id IS ?2",
                params![shelf_id, parent_id],
                |row| row.get(0),
            )
            .map_err(database_error)
    }

    fn node_is_descendant(&self, node_id: i64, candidate: Option<i64>) -> Result<bool, AppError> {
        let Some(candidate) = candidate else {
            return Ok(false);
        };
        self.connection()
            .query_row(
                "WITH RECURSIVE descendants(id) AS (
                    SELECT id FROM virtual_shelf_nodes WHERE parent_id=?1
                    UNION ALL
                    SELECT child.id FROM virtual_shelf_nodes child
                      JOIN descendants parent ON child.parent_id=parent.id
                 ) SELECT EXISTS(SELECT 1 FROM descendants WHERE id=?2)",
                params![node_id, candidate],
                |row| row.get::<_, bool>(0),
            )
            .map_err(database_error)
    }
}

fn node_name_exists(
    connection: &rusqlite::Connection,
    shelf_id: i64,
    parent_id: Option<i64>,
    name: &str,
    excluding: Option<i64>,
) -> Result<bool, AppError> {
    connection
        .query_row(
            "SELECT 1 FROM virtual_shelf_nodes
             WHERE shelf_id=?1 AND parent_id IS ?2 AND name=?3 COLLATE NOCASE
               AND (?4 IS NULL OR id<>?4)",
            params![shelf_id, parent_id, name, excluding],
            |_row| Ok(()),
        )
        .optional()
        .map(|value| value.is_some())
        .map_err(database_error)
}

fn normalize_shelf_order(transaction: &rusqlite::Transaction<'_>) -> Result<(), AppError> {
    let ids = query_ids(
        transaction,
        "SELECT id FROM virtual_shelves ORDER BY sort_order, id",
        [],
    )?;
    transaction
        .execute(
            "UPDATE virtual_shelves SET sort_order=sort_order+1000000",
            [],
        )
        .map_err(database_error)?;
    for (order, id) in ids.iter().enumerate() {
        transaction
            .execute(
                "UPDATE virtual_shelves SET sort_order=?1 WHERE id=?2",
                params![order as i64, id],
            )
            .map_err(database_error)?;
    }
    Ok(())
}

fn normalize_node_order(
    transaction: &rusqlite::Transaction<'_>,
    shelf_id: i64,
    parent_id: Option<i64>,
) -> Result<(), AppError> {
    let mut statement = transaction
        .prepare(
            "SELECT id FROM virtual_shelf_nodes
             WHERE shelf_id=?1 AND parent_id IS ?2 ORDER BY sort_order, id",
        )
        .map_err(database_error)?;
    let ids = statement
        .query_map(params![shelf_id, parent_id], |row| row.get::<_, i64>(0))
        .map_err(database_error)?
        .map(|value| value.map_err(database_error))
        .collect::<Result<Vec<_>, _>>()?;
    drop(statement);
    transaction
        .execute(
            "UPDATE virtual_shelf_nodes SET sort_order=sort_order+1000000
             WHERE shelf_id=?1 AND parent_id IS ?2",
            params![shelf_id, parent_id],
        )
        .map_err(database_error)?;
    for (order, id) in ids.iter().enumerate() {
        transaction
            .execute(
                "UPDATE virtual_shelf_nodes SET sort_order=?1 WHERE id=?2",
                params![order as i64, id],
            )
            .map_err(database_error)?;
    }
    Ok(())
}

fn query_ids<P: rusqlite::Params>(
    connection: &rusqlite::Connection,
    sql: &str,
    params: P,
) -> Result<Vec<i64>, AppError> {
    let mut statement = connection.prepare(sql).map_err(database_error)?;
    statement
        .query_map(params, |row| row.get::<_, i64>(0))
        .map_err(database_error)?
        .map(|value| value.map_err(database_error))
        .collect()
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{Instant, SystemTime, UNIX_EPOCH};

    use super::*;
    use crate::state::AppPaths;

    fn test_store(name: &str) -> (StateStore, AppPaths) {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let paths = AppPaths::under(std::env::temp_dir().join(format!(
            "comic-explorer-{name}-{}-{unique}",
            std::process::id()
        )));
        let (store, _) = StateStore::open(&paths).unwrap();
        (store, paths)
    }

    #[test]
    fn req_ley_p4_001_named_shelf_crud_hierarchy_order_and_startup_are_durable() {
        let (store, paths) = test_store("p4-shelf-crud");
        let first = store.create_shelf("読む本", "books", 1).unwrap();
        let second = store.create_shelf("あとで", "star", 2).unwrap();
        assert_eq!(
            store.create_shelf("読む本", "books", 3).unwrap_err().code,
            ErrorCode::Conflict
        );
        let folder = store
            .create_shelf_folder(first, None, "SF", "folder", 4)
            .unwrap();
        let added = store
            .add_shelf_items(
                first,
                Some(folder),
                &[
                    NewShelfNodeRecord {
                        name: "one.cbz".into(),
                        target_path: r"C:\Comics\one.cbz".into(),
                        target_kind: "archive".into(),
                        icon: "archive".into(),
                    },
                    NewShelfNodeRecord {
                        name: "two.cbz".into(),
                        target_path: r"C:\Comics\two.cbz".into(),
                        target_kind: "archive".into(),
                        icon: "archive".into(),
                    },
                ],
                5,
            )
            .unwrap();
        assert_eq!(added, 2);
        assert_eq!(
            store
                .add_shelf_items(
                    first,
                    Some(folder),
                    &[NewShelfNodeRecord {
                        name: "duplicate".into(),
                        target_path: r"c:\comics\ONE.cbz".into(),
                        target_kind: "archive".into(),
                        icon: "archive".into(),
                    }],
                    6,
                )
                .unwrap(),
            0
        );
        store.set_startup_shelf(Some(first)).unwrap();
        store.reorder_shelves(&[second, first]).unwrap();
        let snapshot = store.shelf_snapshot().unwrap();
        assert_eq!(snapshot.startup_shelf_id, Some(first));
        assert_eq!(
            snapshot
                .shelves
                .iter()
                .map(|shelf| shelf.id)
                .collect::<Vec<_>>(),
            [second, first]
        );
        let item_ids = snapshot
            .nodes
            .iter()
            .filter(|node| node.parent_id == Some(folder))
            .map(|node| node.id)
            .collect::<Vec<_>>();
        store
            .reorder_shelf_nodes(first, Some(folder), &[item_ids[1], item_ids[0]])
            .unwrap();
        assert_eq!(
            store
                .shelf_snapshot()
                .unwrap()
                .nodes
                .iter()
                .filter(|node| node.parent_id == Some(folder))
                .map(|node| node.id)
                .collect::<Vec<_>>(),
            [item_ids[1], item_ids[0]]
        );
        drop(store);
        let (reopened, _) = StateStore::open(&paths).unwrap();
        assert_eq!(
            reopened.shelf_snapshot().unwrap().startup_shelf_id,
            Some(first)
        );
        reopened.delete_shelf(first).unwrap();
        assert!(reopened.shelf_snapshot().unwrap().nodes.is_empty());
        drop(reopened);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn req_ley_p4_001_rejects_cross_shelf_parent_and_cycles() {
        let (store, paths) = test_store("p4-shelf-cycle");
        let first = store.create_shelf("first", "books", 1).unwrap();
        let second = store.create_shelf("second", "books", 2).unwrap();
        let parent = store
            .create_shelf_folder(first, None, "parent", "folder", 3)
            .unwrap();
        let child = store
            .create_shelf_folder(first, Some(parent), "child", "folder", 4)
            .unwrap();
        let other = store
            .create_shelf_folder(second, None, "other", "folder", 5)
            .unwrap();
        assert_eq!(
            store
                .update_shelf_node(parent, Some(child), "parent", "folder", 6)
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        assert_eq!(
            store
                .update_shelf_node(child, Some(other), "child", "folder", 7)
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn req_ley_p4_001_ten_thousand_node_snapshot_is_bounded() {
        let (store, paths) = test_store("p4-shelf-performance");
        let shelf = store.create_shelf("large", "books", 1).unwrap();
        let transaction = store.connection().unchecked_transaction().unwrap();
        for index in 0..10_000i64 {
            transaction
                .execute(
                    "INSERT INTO virtual_shelf_nodes(
                        shelf_id, parent_id, node_type, name, target_path, target_kind,
                        icon, sort_order, created_at_ms, updated_at_ms
                     ) VALUES(?1, NULL, 'item', ?2, ?3, 'archive', 'archive', ?4, 1, 1)",
                    params![
                        shelf,
                        format!("book-{index}"),
                        format!(r"C:\Books\{index}.cbz"),
                        index
                    ],
                )
                .unwrap();
        }
        transaction.commit().unwrap();
        let started = Instant::now();
        let snapshot = store.shelf_snapshot().unwrap();
        let elapsed = started.elapsed();
        assert_eq!(snapshot.nodes.len(), 10_000);
        assert!(
            elapsed.as_secs_f32() < 2.0,
            "10,000 shelf nodes took {elapsed:?}"
        );
        eprintln!("REQ-LEY-P4-001 10,000-node snapshot: {elapsed:?}");
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }
}
