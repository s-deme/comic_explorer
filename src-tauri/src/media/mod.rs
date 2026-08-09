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
    Memory(Vec<u8>),
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
        let bytes = read_grant_bytes(&grant)?;
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

pub fn media_uri(token: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("http://comic.localhost/{token}")
    } else {
        format!("comic://localhost/{token}")
    }
}

pub fn read_grant_bytes(grant: &MediaGrant) -> Result<Vec<u8>, AppError> {
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
        PageSource::Memory(bytes) => bytes.clone(),
    };
    if bytes.len() as u64 > grant.max_bytes {
        return Err(limit_error());
    }
    let signature_valid = match grant.mime_type {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => bytes.starts_with(&[0xff, 0xd8]),
        "image/webp" => {
            bytes.starts_with(b"RIFF") && bytes.get(8..12).is_some_and(|format| format == b"WEBP")
        }
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
    Ok(bytes)
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
    let registered_authority = matches!(
        (
            uri.scheme_str(),
            uri.authority().map(|value| value.as_str())
        ),
        (Some("comic"), Some("localhost")) | (Some("http"), Some("comic.localhost"))
    );
    if !registered_authority || uri.query().is_some() {
        return safe_response(
            StatusCode::BAD_REQUEST,
            None,
            b"Invalid media URI".to_vec(),
            origin,
        );
    }
    let token = uri.path().strip_prefix('/').unwrap_or_default();
    if uri.path().matches('/').count() != 1
        || token.len() != 32
        || !token.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
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
    let origin_values = request.headers().get_all("Origin");
    if origin_values.iter().count() > 1 {
        return Err(());
    }
    let origin = origin_values
        .iter()
        .next()
        .map(|value| value.to_str().map_err(|_| ()))
        .transpose()?;
    if origin.is_some_and(|value| !ALLOWED_ORIGINS.contains(&value)) {
        return Err(());
    }
    let referer_values = request.headers().get_all("Referer");
    if referer_values.iter().count() > 1 {
        return Err(());
    }
    let referer = referer_values
        .iter()
        .next()
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
    use tauri::http::HeaderValue;

    fn assert_safe_error(request: Request<Vec<u8>>) {
        let mut registry = MediaTokenRegistry::new(Duration::from_secs(60));
        let response = handle_protocol_request(&mut registry, &request);
        assert_ne!(response.status(), StatusCode::OK, "request: {request:?}");
        assert_eq!(response.headers()["X-Content-Type-Options"], "nosniff");
        assert_eq!(
            response.headers()["Cache-Control"],
            "private, max-age=0, no-store"
        );
        assert_eq!(response.headers()["Vary"], "Origin");
        assert_eq!(
            response.headers()["Content-Length"],
            response.body().len().to_string()
        );
        assert_eq!(
            response.headers()["Content-Type"],
            "text/plain; charset=utf-8"
        );
        let body = String::from_utf8(response.body().clone()).unwrap();
        assert!(!body.contains('\\'));
        assert!(!body.contains("secret"));
        assert!(!body.contains(".zip"));
    }

    #[test]
    fn fr_b08_webp_media_grants_require_the_riff_webp_signature() {
        let grant = MediaGrant {
            page_id: PageId::parse("webp-page").unwrap(),
            mime_type: "image/webp",
            max_bytes: 1024,
            source: PageSource::Memory(b"RIFF\0\0\0\0WEBPpayload".to_vec()),
        };
        assert!(read_grant_bytes(&grant).is_ok());

        let invalid = MediaGrant {
            source: PageSource::Memory(b"RIFF\0\0\0\0WAVEpayload".to_vec()),
            ..grant
        };
        assert_eq!(
            read_grant_bytes(&invalid).unwrap_err().code,
            ErrorCode::CorruptImage
        );
    }

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
            assert_safe_error(request);
        }
    }

    #[test]
    fn protocol_rejects_ambiguous_headers_and_malformed_uri_corpus() {
        let token = "0123456789abcdef0123456789abcdef";
        let invalid_uris = [
            format!("http://localhost/{token}"),
            format!("comic://other/{token}"),
            format!("comic://localhost/{token}/extra"),
            "comic://localhost/..%2fsecret".into(),
            "comic://localhost/%2e%2e%5csecret".into(),
            "comic://localhost/C:%5csecret".into(),
            "comic://localhost/%5c%5cserver%5cshare".into(),
            "comic://localhost/archive.zip%23page.jpg".into(),
            format!("comic://localhost/{token}?entry=page.jpg"),
        ];
        for uri in invalid_uris {
            assert_safe_error(Request::builder().uri(uri).body(Vec::new()).unwrap());
        }

        let mut duplicate_origin = Request::builder()
            .uri(format!("comic://localhost/{token}"))
            .body(Vec::new())
            .unwrap();
        duplicate_origin
            .headers_mut()
            .append("Origin", HeaderValue::from_static(PRODUCTION_ORIGIN));
        duplicate_origin
            .headers_mut()
            .append("Origin", HeaderValue::from_static("tauri://localhost"));
        assert_safe_error(duplicate_origin);

        let mut duplicate_referer = Request::builder()
            .uri(format!("comic://localhost/{token}"))
            .body(Vec::new())
            .unwrap();
        duplicate_referer
            .headers_mut()
            .append("Referer", HeaderValue::from_static(PRODUCTION_ORIGIN));
        duplicate_referer
            .headers_mut()
            .append("Referer", HeaderValue::from_static("tauri://localhost"));
        assert_safe_error(duplicate_referer);

        let mut invalid_utf8 = Request::builder()
            .uri(format!("comic://localhost/{token}"))
            .body(Vec::new())
            .unwrap();
        invalid_utf8.headers_mut().insert(
            "Origin",
            HeaderValue::from_bytes(b"http://tauri.localhost\xff").unwrap(),
        );
        assert_safe_error(invalid_utf8);
    }

    #[test]
    fn tokens_are_registry_and_source_scoped() {
        let grant = |page: &str, source: &str| MediaGrant {
            page_id: PageId::parse(page).unwrap(),
            mime_type: "image/png",
            max_bytes: 1024,
            source: PageSource::File(PathBuf::from(source)),
        };
        let mut first = MediaTokenRegistry::new(Duration::from_secs(60));
        let mut second = MediaTokenRegistry::new(Duration::from_secs(60));
        let first_token = first.issue(grant("page-a", "source-a.png"));
        let second_token = first.issue(grant("page-b", "source-b.png"));

        assert_eq!(
            first.resolve(&first_token).unwrap().page_id.as_str(),
            "page-a"
        );
        assert_eq!(
            first.resolve(&second_token).unwrap().page_id.as_str(),
            "page-b"
        );
        assert_eq!(
            second.resolve(&first_token).unwrap_err().code,
            ErrorCode::AccessDenied
        );
        first.revoke_all();
        assert!(first.resolve(&first_token).is_err());
        assert!(first.resolve(&second_token).is_err());
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
            .uri(media_uri(&token))
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
