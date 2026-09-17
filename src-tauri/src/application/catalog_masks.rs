use super::search_query::{matches_search_query, parse_catalog_mask};
use super::{
    AppState, CatalogMaskCandidate, CatalogMaskOptions, SavedCatalogMask, error_response,
    port_response, request_error, unix_millis, validate_request,
};
use crate::api::{RequestContext, Response};
use crate::domain::{AppError, ErrorCode, ItemKind};
use crate::state::{CatalogMaskRecord, StateStore};

const MAX_CATALOG_MASK_BASENAMES: usize = 100_000;
const MAX_CATALOG_MASK_BASENAME_CHARS: usize = 1_024;

#[tauri::command]
pub async fn evaluate_catalog_mask(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    mask: String,
    candidates: Vec<CatalogMaskCandidate>,
    options: Option<CatalogMaskOptions>,
) -> Result<Response<Vec<bool>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let options = options.unwrap_or_default();
    let result = tauri::async_runtime::spawn_blocking(move || {
        evaluate_catalog_mask_port(&mask, &candidates, &options)
    })
    .await
    .map_err(|error| format!("catalog mask worker failed: {error}"))?;
    Ok(port_response(context, result, true))
}

fn validate_catalog_mask_options(options: &CatalogMaskOptions) -> Result<(), AppError> {
    if !options.include_folders && !options.include_files {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Catalog mask must include folders, files, or both.",
        ));
    }
    if options
        .min_size_bytes
        .zip(options.max_size_bytes)
        .is_some_and(|(minimum, maximum)| minimum > maximum)
        || options
            .modified_after_ms
            .zip(options.modified_before_ms)
            .is_some_and(|(after, before)| after >= before)
    {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Catalog mask range is invalid.",
        ));
    }
    Ok(())
}

fn catalog_mask_candidate_matches_options(
    candidate: &CatalogMaskCandidate,
    options: &CatalogMaskOptions,
) -> bool {
    let folder = matches!(candidate.kind, ItemKind::Folder | ItemKind::ComicFolder);
    if (folder && !options.include_folders) || (!folder && !options.include_files) {
        return false;
    }
    if options
        .min_size_bytes
        .is_some_and(|minimum| candidate.byte_size.is_none_or(|value| value < minimum))
    {
        return false;
    }
    if options
        .max_size_bytes
        .is_some_and(|maximum| candidate.byte_size.is_none_or(|value| value > maximum))
    {
        return false;
    }
    if options
        .modified_after_ms
        .is_some_and(|after| candidate.modified_ms.is_none_or(|value| value < after))
    {
        return false;
    }
    if options
        .modified_before_ms
        .is_some_and(|before| candidate.modified_ms.is_none_or(|value| value >= before))
    {
        return false;
    }
    true
}

fn evaluate_catalog_mask_port(
    mask: &str,
    candidates: &[CatalogMaskCandidate],
    options: &CatalogMaskOptions,
) -> Result<Vec<bool>, AppError> {
    if candidates.len() > MAX_CATALOG_MASK_BASENAMES {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Catalog mask accepts at most 100000 basenames.",
        ));
    }
    if candidates.iter().any(|candidate| {
        candidate.basename.chars().count() > MAX_CATALOG_MASK_BASENAME_CHARS
            || candidate.basename.contains(['/', '\\', '\0'])
    }) {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Catalog mask received an invalid basename.",
        ));
    }
    validate_catalog_mask_options(options)?;
    let expression = parse_catalog_mask(mask)
        .map_err(|error| request_error(ErrorCode::InvalidRequest, error.0))?;
    Ok(candidates
        .iter()
        .map(|candidate| {
            catalog_mask_candidate_matches_options(candidate, options)
                && expression
                    .as_ref()
                    .is_none_or(|expression| matches_search_query(expression, &candidate.basename))
        })
        .collect())
}

fn saved_catalog_mask(record: CatalogMaskRecord) -> SavedCatalogMask {
    SavedCatalogMask {
        name: record.name,
        expression: record.expression,
        options: CatalogMaskOptions {
            include_folders: record.include_folders,
            include_files: record.include_files,
            min_size_bytes: record.min_size_bytes,
            max_size_bytes: record.max_size_bytes,
            modified_after_ms: record.modified_after_ms,
            modified_before_ms: record.modified_before_ms,
        },
        updated_at_ms: record.updated_at_ms,
    }
}

fn load_catalog_masks(store: &StateStore) -> Result<Vec<SavedCatalogMask>, String> {
    Ok(store
        .list_catalog_masks()
        .map_err(|error| error.message)?
        .into_iter()
        .map(saved_catalog_mask)
        .collect())
}

fn validate_catalog_mask_name(name: &str) -> Result<&str, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 64 || trimmed.chars().any(char::is_control) {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Saved catalog mask name must contain 1 to 64 visible characters.",
        ));
    }
    Ok(trimmed)
}

fn catalog_mask_record(
    name: &str,
    expression: String,
    options: CatalogMaskOptions,
) -> Result<CatalogMaskRecord, AppError> {
    let name = validate_catalog_mask_name(name)?.to_owned();
    parse_catalog_mask(&expression)
        .map_err(|error| request_error(ErrorCode::InvalidRequest, error.0))?;
    validate_catalog_mask_options(&options)?;
    Ok(CatalogMaskRecord {
        name,
        expression,
        include_folders: options.include_folders,
        include_files: options.include_files,
        min_size_bytes: options.min_size_bytes,
        max_size_bytes: options.max_size_bytes,
        modified_after_ms: options.modified_after_ms,
        modified_before_ms: options.modified_before_ms,
        updated_at_ms: unix_millis().max(0) as u64,
    })
}

#[tauri::command]
pub fn list_catalog_masks(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<Vec<SavedCatalogMask>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    let data = load_catalog_masks(store)?;
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

#[tauri::command]
pub fn save_catalog_mask(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    name: String,
    expression: String,
    options: CatalogMaskOptions,
) -> Result<Response<Vec<SavedCatalogMask>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let record = match catalog_mask_record(&name, expression, options) {
        Ok(record) => record,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let mut stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_mut() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    if let Err(error) = store.save_catalog_mask(&record) {
        return Ok(error_response(&context, error));
    }
    let data = load_catalog_masks(store)?;
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

#[tauri::command]
pub fn delete_catalog_mask(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    name: String,
) -> Result<Response<Vec<SavedCatalogMask>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let name = match validate_catalog_mask_name(&name) {
        Ok(name) => name,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    if let Err(error) = store.delete_catalog_mask(name) {
        return Ok(error_response(&context, error));
    }
    let data = load_catalog_masks(store)?;
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_mask_response_reflects_saved_and_deleted_records() {
        let paths = crate::state::AppPaths::under(std::env::temp_dir().join(format!(
            "comic-explorer-mask-response-{}-{}",
            std::process::id(),
            unix_millis()
        )));
        let (mut store, _) = StateStore::open(&paths).unwrap();
        let record = catalog_mask_record(
            " Comics ",
            "*.cbz".into(),
            CatalogMaskOptions {
                min_size_bytes: Some(100),
                ..CatalogMaskOptions::default()
            },
        )
        .unwrap();
        store.save_catalog_mask(&record).unwrap();
        let masks = load_catalog_masks(&store).unwrap();
        assert_eq!(masks.len(), 1);
        assert_eq!(masks[0].name, "Comics");
        assert_eq!(masks[0].expression, "*.cbz");
        assert_eq!(masks[0].options.min_size_bytes, Some(100));
        assert_eq!(masks[0].updated_at_ms, record.updated_at_ms);
        store.delete_catalog_mask("Comics").unwrap();
        assert!(load_catalog_masks(&store).unwrap().is_empty());
        drop(store);
        std::fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn req_ley_p3_002_catalog_mask_port_is_bounded_and_evaluates_10000_basenames() {
        let candidates = (0..10_000)
            .map(|index| {
                let extension = if index % 2 == 0 { "cbz" } else { "jpg" };
                CatalogMaskCandidate {
                    basename: format!("volume-{index:05}.{extension}"),
                    kind: if index % 2 == 0 {
                        ItemKind::Archive
                    } else {
                        ItemKind::Page
                    },
                    byte_size: Some(index),
                    modified_ms: Some(index),
                }
            })
            .collect::<Vec<_>>();
        let started = std::time::Instant::now();
        let matches =
            evaluate_catalog_mask_port("*.cbz;*.pdf", &candidates, &CatalogMaskOptions::default())
                .unwrap();
        let elapsed = started.elapsed();
        eprintln!("REQ-LEY-P3-002 synthetic 10,000 basename evaluation: {elapsed:?}");
        assert_eq!(matches.iter().filter(|matched| **matched).count(), 5_000);
        assert!(
            elapsed < std::time::Duration::from_secs(2),
            "elapsed: {elapsed:?}"
        );

        assert!(
            evaluate_catalog_mask_port("*.cbz AND", &candidates, &CatalogMaskOptions::default())
                .is_err()
        );
        assert!(
            evaluate_catalog_mask_port("", &candidates, &CatalogMaskOptions::default())
                .unwrap()
                .into_iter()
                .all(|matched| matched)
        );
        let too_many = vec![
            CatalogMaskCandidate {
                basename: "x.cbz".to_owned(),
                kind: ItemKind::Archive,
                byte_size: None,
                modified_ms: None,
            };
            MAX_CATALOG_MASK_BASENAMES + 1
        ];
        assert_eq!(
            evaluate_catalog_mask_port("*.cbz", &too_many, &CatalogMaskOptions::default())
                .unwrap_err()
                .code,
            ErrorCode::InvalidRequest
        );
        assert!(
            evaluate_catalog_mask_port(
                "*.cbz",
                &[CatalogMaskCandidate {
                    basename: "dir/file.cbz".to_owned(),
                    kind: ItemKind::Archive,
                    byte_size: None,
                    modified_ms: None,
                }],
                &CatalogMaskOptions::default()
            )
            .is_err()
        );
    }

    #[test]
    fn req_ley_p3_003_catalog_mask_combines_kind_size_and_half_open_date_ranges() {
        let candidates = vec![
            CatalogMaskCandidate {
                basename: "folder".to_owned(),
                kind: ItemKind::Folder,
                byte_size: None,
                modified_ms: Some(1_500),
            },
            CatalogMaskCandidate {
                basename: "small.cbz".to_owned(),
                kind: ItemKind::Archive,
                byte_size: Some(99),
                modified_ms: Some(1_500),
            },
            CatalogMaskCandidate {
                basename: "match.cbz".to_owned(),
                kind: ItemKind::Archive,
                byte_size: Some(150),
                modified_ms: Some(1_500),
            },
            CatalogMaskCandidate {
                basename: "end.cbz".to_owned(),
                kind: ItemKind::Archive,
                byte_size: Some(150),
                modified_ms: Some(2_000),
            },
        ];
        let options = CatalogMaskOptions {
            include_folders: false,
            include_files: true,
            min_size_bytes: Some(100),
            max_size_bytes: Some(200),
            modified_after_ms: Some(1_000),
            modified_before_ms: Some(2_000),
        };
        assert_eq!(
            evaluate_catalog_mask_port("*.cbz", &candidates, &options).unwrap(),
            [false, false, true, false]
        );
        let mut invalid = options.clone();
        invalid.include_files = false;
        assert!(evaluate_catalog_mask_port("", &candidates, &invalid).is_err());
        invalid.include_files = true;
        invalid.min_size_bytes = Some(201);
        assert!(evaluate_catalog_mask_port("", &candidates, &invalid).is_err());

        let candidates = (0..10_000)
            .map(|index| CatalogMaskCandidate {
                basename: format!(
                    "volume-{index:05}-{}.cbz",
                    if index % 2 == 0 { "draft" } else { "final" }
                ),
                kind: ItemKind::Archive,
                byte_size: Some(index),
                modified_ms: Some(index),
            })
            .collect::<Vec<_>>();
        let options = CatalogMaskOptions {
            include_folders: false,
            include_files: true,
            min_size_bytes: Some(1_000),
            max_size_bytes: Some(9_000),
            modified_after_ms: Some(1_000),
            modified_before_ms: Some(9_000),
        };
        let started = std::time::Instant::now();
        let matches =
            evaluate_catalog_mask_port("volume-*.cbz AND NOT *draft*", &candidates, &options)
                .unwrap();
        let elapsed = started.elapsed();
        eprintln!("REQ-LEY-P3-003 synthetic 10,000 detailed mask evaluation: {elapsed:?}");
        assert_eq!(
            matches.into_iter().filter(|matched| *matched).count(),
            4_000
        );
        assert!(
            elapsed < std::time::Duration::from_secs(2),
            "elapsed: {elapsed:?}"
        );

        assert!(catalog_mask_record("", "*.cbz".into(), options.clone()).is_err());
        assert!(catalog_mask_record("valid", "*.cbz AND".into(), options).is_err());
    }
}
