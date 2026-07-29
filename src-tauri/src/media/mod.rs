use std::collections::HashMap;
use std::fs;
use std::hash::{BuildHasher, Hasher, RandomState};
use std::io::Read;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::http::{Method, Request, Response, StatusCode};

use crate::domain::{AppError, ErrorCode, PageId};

const PRODUCTION_ORIGIN: &str = "http://tauri.localhost";
const ALLOWED_ORIGINS: [&str; 3] = [
    PRODUCTION_ORIGIN,
    "tauri://localhost",
    "http://127.0.0.1:1420",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PageSource {
    File(PathBuf),
    ArchiveEntry { archive: PathBuf, entry: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaGrant {
    pub page_id: PageId,
    pub mime_type: &'static str,
    pub max_bytes: u64,
    pub source: PageSource,
}

pub struct MediaTokenRegistry {
    grants: HashMap<String, (Instant, MediaGrant)>,
    lifetime: Duration,
    counter: u64,
    random_state: RandomState,
}

impl MediaTokenRegistry {
    pub fn new(lifetime: Duration) -> Self {
        Self {
            grants: HashMap::new(),
            lifetime,
            counter: 0,
            random_state: RandomState::new(),
        }
    }

    pub fn issue(&mut self, grant: MediaGrant) -> String {
        self.counter = self.counter.wrapping_add(1);
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let mut first = self.random_state.build_hasher();
        first.write_u128(now);
        first.write_u64(self.counter);
        first.write(grant.page_id.as_str().as_bytes());
        let mut second = self.random_state.build_hasher();
        second.write_u64(first.finish());
        second.write_u128(now.rotate_left(31));
        let token = format!("{:016x}{:016x}", first.finish(), second.finish());
        self.grants
            .insert(token.clone(), (Instant::now() + self.lifetime, grant));
        token
    }

    pub fn resolve(&mut self, token: &str) -> Result<MediaGrant, AppError> {
        self.remove_expired();
        self.grants
            .get(token)
            .map(|(_, grant)| grant.clone())
            .ok_or_else(|| AppError {
                code: ErrorCode::AccessDenied,
                message: "Media token is invalid or expired.".into(),
                target: None,
                retryable: false,
            })
    }

    pub fn read(&mut self, token: &str) -> Result<(MediaGrant, Vec<u8>), AppError> {
        let grant = self.resolve(token)?;
        let bytes = match &grant.source {
            PageSource::File(path) => fs::read(path).map_err(media_io_error)?,
            PageSource::ArchiveEntry { archive, entry } => {
                let file = fs::File::open(archive).map_err(media_io_error)?;
                let mut archive = zip::ZipArchive::new(file).map_err(media_error)?;
                let entry = archive.by_name(entry).map_err(media_error)?;
                if entry.encrypted() || entry.size() > grant.max_bytes {
                    return Err(limit_error());
                }
                let mut bytes = Vec::with_capacity(
                    usize::try_from(entry.size().min(grant.max_bytes)).unwrap_or_default(),
                );
                entry
                    .take(grant.max_bytes.saturating_add(1))
                    .read_to_end(&mut bytes)
                    .map_err(media_io_error)?;
                bytes
            }
        };
        if bytes.len() as u64 > grant.max_bytes {
            return Err(limit_error());
        }
        let signature_valid = match grant.mime_type {
            "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
            "image/jpeg" => bytes.starts_with(&[0xff, 0xd8]),
            _ => false,
        };
        if !signature_valid {
            return Err(AppError {
                code: ErrorCode::CorruptImage,
                message: "Image signature does not match its media type.".into(),
                target: None,
                retryable: false,
            });
        }
        Ok((grant, bytes))
    }

    pub fn revoke_all(&mut self) {
        self.grants.clear();
    }

    fn remove_expired(&mut self) {
        let now = Instant::now();
        self.grants.retain(|_, (expiry, _)| *expiry > now);
    }
}

pub fn handle_protocol_request(
    registry: &mut MediaTokenRegistry,
    request: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let origin = match validated_origin(request) {
        Ok(origin) => origin,
        Err(()) => return safe_response(StatusCode::FORBIDDEN, None, b"Forbidden".to_vec(), None),
    };
    if request.method() != Method::GET {
        return safe_response(
            StatusCode::METHOD_NOT_ALLOWED,
            None,
            b"Method not allowed".to_vec(),
            origin,
        );
    }
    let uri = request.uri();
    if uri.query().is_some() {
        return safe_response(
            StatusCode::BAD_REQUEST,
            None,
            b"Invalid media URI".to_vec(),
            origin,
        );
    }
    let token = uri.path().strip_prefix('/').unwrap_or_default();
    if token.len() != 32 || !token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return safe_response(
            StatusCode::BAD_REQUEST,
            None,
            b"Invalid media token".to_vec(),
            origin,
        );
    }
    match registry.read(token) {
        Ok((grant, bytes)) => safe_response(StatusCode::OK, Some(grant.mime_type), bytes, origin),
        Err(error) => {
            let status = match error.code {
                ErrorCode::ResourceLimit => StatusCode::PAYLOAD_TOO_LARGE,
                ErrorCode::AccessDenied => StatusCode::FORBIDDEN,
                ErrorCode::NotFound => StatusCode::NOT_FOUND,
                _ => StatusCode::UNPROCESSABLE_ENTITY,
            };
            safe_response(status, None, b"Media unavailable".to_vec(), origin)
        }
    }
}

fn validated_origin(request: &Request<Vec<u8>>) -> Result<Option<&str>, ()> {
    let origin = request
        .headers()
        .get("Origin")
        .map(|value| value.to_str().map_err(|_| ()))
        .transpose()?;
    if origin.is_some_and(|value| !ALLOWED_ORIGINS.contains(&value)) {
        return Err(());
    }
    let referer = request
        .headers()
        .get("Referer")
        .map(|value| value.to_str().map_err(|_| ()))
        .transpose()?;
    if referer.is_some_and(|value| {
        !ALLOWED_ORIGINS
            .iter()
            .any(|allowed| value == *allowed || value.starts_with(&format!("{allowed}/")))
    }) {
        return Err(());
    }
    Ok(origin)
}

fn safe_response(
    status: StatusCode,
    media_type: Option<&str>,
    body: Vec<u8>,
    origin: Option<&str>,
) -> Response<Vec<u8>> {
    let mut builder = Response::builder()
        .status(status)
        .header(
            "Content-Type",
            media_type.unwrap_or("text/plain; charset=utf-8"),
        )
        .header("Content-Length", body.len().to_string())
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "private, max-age=0, no-store")
        .header("Vary", "Origin");
    if let Some(origin) = origin {
        builder = builder.header("Access-Control-Allow-Origin", origin);
    } else {
        builder = builder.header("Access-Control-Allow-Origin", PRODUCTION_ORIGIN);
    }
    builder
        .body(body)
        .expect("static protocol response headers")
}

fn limit_error() -> AppError {
    AppError {
        code: ErrorCode::ResourceLimit,
        message: "Page byte limit exceeded.".into(),
        target: None,
        retryable: false,
    }
}

fn media_io_error(error: impl std::fmt::Display) -> AppError {
    AppError {
        code: ErrorCode::NotFound,
        message: format!("Cannot read page source: {error}"),
        target: None,
        retryable: true,
    }
}

fn media_error(error: impl std::fmt::Display) -> AppError {
    AppError {
        code: ErrorCode::CorruptArchive,
        message: format!("Cannot read archive page: {error}"),
        target: None,
        retryable: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_are_opaque_scoped_and_revocable() {
        let mut registry = MediaTokenRegistry::new(Duration::from_secs(60));
        let token = registry.issue(MediaGrant {
            page_id: PageId::parse("page-1").unwrap(),
            mime_type: "image/png",
            max_bytes: 1024,
            source: PageSource::File(PathBuf::from("secret/page-1.png")),
        });
        assert!(!token.contains("page-1"));
        assert!(!token.contains("secret"));
        assert_eq!(registry.resolve(&token).unwrap().page_id.as_str(), "page-1");
        registry.revoke_all();
        assert_eq!(
            registry.resolve(&token).unwrap_err().code,
            ErrorCode::AccessDenied
        );
    }

    #[test]
    fn expired_tokens_are_rejected() {
        let mut registry = MediaTokenRegistry::new(Duration::ZERO);
        let token = registry.issue(MediaGrant {
            page_id: PageId::parse("page-2").unwrap(),
            mime_type: "image/jpeg",
            max_bytes: 1024,
            source: PageSource::File(PathBuf::from("page-2.jpg")),
        });
        assert_eq!(
            registry.resolve(&token).unwrap_err().code,
            ErrorCode::AccessDenied
        );
    }

    #[test]
    fn protocol_rejects_methods_queries_tokens_and_untrusted_origins() {
        let mut registry = MediaTokenRegistry::new(Duration::from_secs(60));
        for request in [
            Request::builder()
                .method(Method::POST)
                .uri("comic://localhost/0123456789abcdef0123456789abcdef")
                .body(Vec::new())
                .unwrap(),
            Request::builder()
                .uri("comic://localhost/0123456789abcdef0123456789abcdef?path=secret")
                .body(Vec::new())
                .unwrap(),
            Request::builder()
                .uri("comic://localhost/../secret")
                .body(Vec::new())
                .unwrap(),
            Request::builder()
                .uri("comic://localhost/0123456789abcdef0123456789abcdef")
                .header("Origin", "https://attacker.invalid")
                .body(Vec::new())
                .unwrap(),
        ] {
            let response = handle_protocol_request(&mut registry, &request);
            assert_ne!(response.status(), StatusCode::OK);
            assert_eq!(response.headers()["X-Content-Type-Options"], "nosniff");
            assert_eq!(
                response.headers()["Content-Length"],
                response.body().len().to_string()
            );
        }
    }

    #[test]
    fn protocol_returns_exact_mime_cors_and_length_for_a_scoped_token() {
        let path = std::env::temp_dir().join(format!(
            "comic-explorer-media-{}-{}.png",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let bytes = b"\x89PNG\r\n\x1a\npayload";
        fs::write(&path, bytes).unwrap();
        let mut registry = MediaTokenRegistry::new(Duration::from_secs(60));
        let token = registry.issue(MediaGrant {
            page_id: PageId::parse("page-protocol").unwrap(),
            mime_type: "image/png",
            max_bytes: 1024,
            source: PageSource::File(path.clone()),
        });
        let request = Request::builder()
            .uri(format!("comic://localhost/{token}"))
            .header("Origin", PRODUCTION_ORIGIN)
            .header("Referer", format!("{PRODUCTION_ORIGIN}/"))
            .body(Vec::new())
            .unwrap();

        let response = handle_protocol_request(&mut registry, &request);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["Content-Type"], "image/png");
        assert_eq!(
            response.headers()["Access-Control-Allow-Origin"],
            PRODUCTION_ORIGIN
        );
        assert_eq!(response.body(), bytes);
        fs::remove_file(path).unwrap();
    }
}
