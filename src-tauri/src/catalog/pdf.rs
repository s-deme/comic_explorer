use std::path::Path;

use crate::api::{MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MAX_PDF_BYTES, MAX_PDF_PAGES};
use crate::domain::{AppError, ErrorCode, RelativePath};

pub const PDF_PAGE_KEY_PREFIX: &str = "@comic-explorer-pdf-v1/";
const MAX_PDF_RENDER_EDGE: u32 = 16_384;

pub fn enumerate_pdf_pages(path: &Path) -> Result<Vec<RelativePath>, AppError> {
    #[cfg(target_os = "windows")]
    {
        return with_winrt(|| {
            let document = load_document(path)?;
            let page_count = document
                .PageCount()
                .map_err(|error| pdf_error("Could not read the PDF page count", error))?;
            validate_page_count(page_count)?;
            (0..page_count).map(pdf_page_key).collect()
        });
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err(unsupported_pdf_error())
    }
}

pub fn render_pdf_page(path: &Path, page: &RelativePath) -> Result<Vec<u8>, AppError> {
    let page_index = pdf_page_index(page)?;
    #[cfg(target_os = "windows")]
    {
        return with_winrt(|| {
            let document = load_document(path)?;
            let page_count = document
                .PageCount()
                .map_err(|error| pdf_error("Could not read the PDF page count", error))?;
            validate_page_count(page_count)?;
            if page_index >= page_count {
                return Err(AppError {
                    code: ErrorCode::NotFound,
                    message: "The requested PDF page does not exist.".into(),
                    target: Some(page.clone()),
                    retryable: false,
                });
            }
            let pdf_page = document
                .GetPage(page_index)
                .map_err(|error| pdf_error("Could not open the PDF page", error))?;
            let page_size = pdf_page
                .Size()
                .map_err(|error| pdf_error("Could not read the PDF page dimensions", error))?;
            let (render_width, render_height) =
                bounded_render_dimensions(page_size.Width, page_size.Height)?;
            let options = windows::Data::Pdf::PdfPageRenderOptions::new()
                .map_err(|error| pdf_error("Could not create PDF render options", error))?;
            options
                .SetDestinationWidth(render_width)
                .map_err(|error| pdf_error("Could not bound the PDF render width", error))?;
            options
                .SetDestinationHeight(render_height)
                .map_err(|error| pdf_error("Could not bound the PDF render height", error))?;
            let output = windows::Storage::Streams::InMemoryRandomAccessStream::new()
                .map_err(|error| pdf_error("Could not allocate the PDF render stream", error))?;
            pdf_page
                .RenderWithOptionsToStreamAsync(&output, &options)
                .map_err(|error| pdf_error("Could not start PDF page rendering", error))?
                .join()
                .map_err(|error| pdf_error("Could not render the PDF page", error))?;
            let size = output
                .Size()
                .map_err(|error| pdf_error("Could not read the rendered PDF page", error))?;
            if size == 0 {
                return Err(pdf_error_message(
                    ErrorCode::CorruptImage,
                    "The PDF page rendered to an empty image.",
                ));
            }
            if size > MAX_IMAGE_BYTES {
                return Err(pdf_error_message(
                    ErrorCode::ResourceLimit,
                    "The rendered PDF page exceeds the image byte limit.",
                ));
            }
            let size = u32::try_from(size).map_err(|_| {
                pdf_error_message(
                    ErrorCode::ResourceLimit,
                    "The rendered PDF page is too large to deliver.",
                )
            })?;
            let input = output
                .GetInputStreamAt(0)
                .map_err(|error| pdf_error("Could not read the rendered PDF page", error))?;
            let reader = windows::Storage::Streams::DataReader::CreateDataReader(&input)
                .map_err(|error| pdf_error("Could not prepare the PDF page reader", error))?;
            reader
                .LoadAsync(size)
                .map_err(|error| pdf_error("Could not load the rendered PDF page", error))?
                .join()
                .map_err(|error| pdf_error("Could not load the rendered PDF page", error))?;
            let mut bytes = vec![0; usize::try_from(size).unwrap_or_default()];
            reader
                .ReadBytes(&mut bytes)
                .map_err(|error| pdf_error("Could not read the rendered PDF page", error))?;
            if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
                return Err(pdf_error_message(
                    ErrorCode::CorruptImage,
                    "The PDF renderer returned a non-PNG image.",
                ));
            }
            super::inspect_image(&mut std::io::Cursor::new(&bytes), bytes.len() as u64)
                .map_err(|error| pdf_error_message(error.code, &error.message))?;
            Ok(bytes)
        });
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (path, page_index);
        Err(unsupported_pdf_error())
    }
}

pub fn pdf_page_index(page: &RelativePath) -> Result<u32, AppError> {
    let Some(encoded) = page.as_str().strip_prefix(PDF_PAGE_KEY_PREFIX) else {
        return Err(invalid_page_key_error());
    };
    if encoded.len() != 8 || !encoded.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(invalid_page_key_error());
    }
    u32::from_str_radix(encoded, 16).map_err(|_| invalid_page_key_error())
}

fn pdf_page_key(index: u32) -> Result<RelativePath, AppError> {
    RelativePath::parse(format!("{PDF_PAGE_KEY_PREFIX}{index:08x}"))
        .map_err(|_| invalid_page_key_error())
}

fn validate_page_count(page_count: u32) -> Result<(), AppError> {
    if page_count == 0 {
        return Err(pdf_error_message(
            ErrorCode::CorruptImage,
            "The PDF contains no pages.",
        ));
    }
    if page_count > MAX_PDF_PAGES {
        return Err(pdf_error_message(
            ErrorCode::ResourceLimit,
            "The PDF contains too many pages.",
        ));
    }
    Ok(())
}

fn bounded_render_dimensions(width: f32, height: f32) -> Result<(u32, u32), AppError> {
    let width = f64::from(width);
    let height = f64::from(height);
    if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
        return Err(pdf_error_message(
            ErrorCode::CorruptImage,
            "The PDF page dimensions are invalid.",
        ));
    }
    let edge_scale = (f64::from(MAX_PDF_RENDER_EDGE) / width.max(height)).min(1.0);
    let pixel_scale = (MAX_IMAGE_PIXELS as f64 / (width * height)).sqrt().min(1.0);
    let scale = edge_scale.min(pixel_scale);
    if !scale.is_finite() || scale <= 0.0 {
        return Err(pdf_error_message(
            ErrorCode::ResourceLimit,
            "The PDF page dimensions exceed the render limit.",
        ));
    }
    let render_width = (width * scale)
        .floor()
        .clamp(1.0, f64::from(MAX_PDF_RENDER_EDGE)) as u32;
    let render_height = (height * scale)
        .floor()
        .clamp(1.0, f64::from(MAX_PDF_RENDER_EDGE)) as u32;
    if u64::from(render_width) * u64::from(render_height) > MAX_IMAGE_PIXELS {
        return Err(pdf_error_message(
            ErrorCode::ResourceLimit,
            "The PDF page dimensions exceed the pixel limit.",
        ));
    }
    Ok((render_width, render_height))
}

fn invalid_page_key_error() -> AppError {
    AppError {
        code: ErrorCode::InvalidPath,
        message: "The PDF page key is invalid.".into(),
        target: None,
        retryable: false,
    }
}

#[cfg(not(target_os = "windows"))]
fn unsupported_pdf_error() -> AppError {
    AppError {
        code: ErrorCode::UnsupportedFormat,
        message: "PDF rendering requires Windows.".into(),
        target: None,
        retryable: false,
    }
}

fn pdf_error_message(code: ErrorCode, message: &str) -> AppError {
    AppError {
        code,
        message: message.into(),
        target: None,
        retryable: false,
    }
}

#[cfg(target_os = "windows")]
fn load_document(path: &Path) -> Result<windows::Data::Pdf::PdfDocument, AppError> {
    use windows::Data::Pdf::PdfDocument;
    use windows::Storage::StorageFile;
    use windows::core::HSTRING;

    validate_pdf_source(path)?;
    let path = HSTRING::from(path.to_string_lossy().as_ref());
    let file = StorageFile::GetFileFromPathAsync(&path)
        .map_err(|error| pdf_error("Could not open the PDF file", error))?
        .join()
        .map_err(|error| pdf_error("Could not open the PDF file", error))?;
    PdfDocument::LoadFromFileAsync(&file)
        .map_err(|error| pdf_error("Could not load the PDF document", error))?
        .join()
        .map_err(|error| pdf_error("Could not load the PDF document", error))
}

#[cfg(target_os = "windows")]
fn validate_pdf_source(path: &Path) -> Result<(), AppError> {
    let metadata = std::fs::metadata(path).map_err(|error| pdf_io_error(path, error))?;
    if !metadata.is_file() {
        return Err(pdf_error_message(
            ErrorCode::InvalidPath,
            "The PDF source is not a file.",
        ));
    }
    if metadata.len() > MAX_PDF_BYTES {
        return Err(pdf_error_message(
            ErrorCode::ResourceLimit,
            "The PDF exceeds the document byte limit.",
        ));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn with_winrt<T>(operation: impl FnOnce() -> Result<T, AppError>) -> Result<T, AppError> {
    use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize};

    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
        .map_err(|error| pdf_error("Could not initialize the PDF runtime", error))?;
    let result = operation();
    unsafe { RoUninitialize() };
    result
}

#[cfg(target_os = "windows")]
fn pdf_error(context: &str, error: windows::core::Error) -> AppError {
    let (code, retryable) = pdf_error_classification(error.code());
    AppError {
        code,
        message: format!("{context}: {error}"),
        target: None,
        retryable,
    }
}

#[cfg(target_os = "windows")]
fn pdf_error_classification(error: windows::core::HRESULT) -> (ErrorCode, bool) {
    match error.0 as u32 {
        0x8007_0002 | 0x8007_0003 => (ErrorCode::NotFound, true),
        0x8007_0005 | 0x8007_0020 => (ErrorCode::AccessDenied, true),
        0x8007_052b => (ErrorCode::UnsupportedFormat, false),
        _ => (ErrorCode::CorruptImage, false),
    }
}

#[cfg(target_os = "windows")]
fn pdf_io_error(path: &Path, error: std::io::Error) -> AppError {
    let (code, retryable) = match error.kind() {
        std::io::ErrorKind::NotFound => (ErrorCode::NotFound, true),
        std::io::ErrorKind::PermissionDenied => (ErrorCode::AccessDenied, true),
        _ => (ErrorCode::InvalidPath, false),
    };
    AppError {
        code,
        message: format!("Could not access PDF {}: {error}", path.display()),
        target: None,
        retryable,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "windows")]
    use std::fs;
    #[cfg(target_os = "windows")]
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn pdf_page_keys_are_opaque_but_round_trip_their_index() {
        for (index, expected) in [
            (0, "@comic-explorer-pdf-v1/00000000"),
            (42, "@comic-explorer-pdf-v1/0000002a"),
        ] {
            let key = pdf_page_key(index).unwrap();
            assert_eq!(key.as_str(), expected);
            assert_eq!(pdf_page_index(&key).unwrap(), index);
        }
    }

    #[test]
    fn invalid_pdf_page_keys_are_rejected() {
        for value in [
            "0.png",
            "@comic-explorer-pdf-v1/0",
            "@comic-explorer-pdf-v1/zzzzzzzz",
        ] {
            let key = RelativePath::parse(value).unwrap();
            assert_eq!(
                pdf_page_index(&key).unwrap_err().code,
                ErrorCode::InvalidPath
            );
        }
    }

    #[test]
    fn page_count_and_render_dimensions_enforce_pdf_limits_before_rendering() {
        assert_eq!(
            validate_page_count(0).unwrap_err().code,
            ErrorCode::CorruptImage
        );
        assert_eq!(
            validate_page_count(MAX_PDF_PAGES + 1).unwrap_err().code,
            ErrorCode::ResourceLimit
        );
        assert_eq!(bounded_render_dimensions(100.0, 200.0).unwrap(), (100, 200));
        let (width, height) = bounded_render_dimensions(1_000_000.0, 1_000_000.0).unwrap();
        assert!(width <= MAX_PDF_RENDER_EDGE);
        assert!(height <= MAX_PDF_RENDER_EDGE);
        assert!(u64::from(width) * u64::from(height) <= MAX_IMAGE_PIXELS);
        for dimensions in [(0.0, 1.0), (f32::NAN, 1.0), (1.0, f32::INFINITY)] {
            assert_eq!(
                bounded_render_dimensions(dimensions.0, dimensions.1)
                    .unwrap_err()
                    .code,
                ErrorCode::CorruptImage
            );
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn winrt_errors_keep_access_and_password_failures_distinct() {
        use windows::core::HRESULT;

        assert_eq!(
            pdf_error_classification(HRESULT(0x8007_0002_u32 as i32)),
            (ErrorCode::NotFound, true)
        );
        assert_eq!(
            pdf_error_classification(HRESULT(0x8007_0005_u32 as i32)),
            (ErrorCode::AccessDenied, true)
        );
        assert_eq!(
            pdf_error_classification(HRESULT(0x8007_052b_u32 as i32)),
            (ErrorCode::UnsupportedFormat, false)
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn minimal_pdf_enumerates_and_renders_to_bounded_png() {
        let path = std::env::temp_dir().join(format!(
            "comic-explorer-pdf-{}-{}.pdf",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::write(&path, minimal_pdf()).unwrap();

        let pages = enumerate_pdf_pages(&path).unwrap();
        assert_eq!(pages.len(), 1);
        let rendered = render_pdf_page(&path, &pages[0]).unwrap();
        assert!(rendered.starts_with(b"\x89PNG\r\n\x1a\n"));

        fs::remove_file(path).unwrap();
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn corrupt_and_oversized_pdf_sources_are_rejected_locally() {
        let corrupt = temporary_pdf_path("corrupt");
        fs::write(&corrupt, b"%PDF-1.7\nbroken").unwrap();
        assert_eq!(
            enumerate_pdf_pages(&corrupt).unwrap_err().code,
            ErrorCode::CorruptImage
        );
        fs::remove_file(corrupt).unwrap();

        let oversized = temporary_pdf_path("oversized");
        let file = fs::File::create(&oversized).unwrap();
        file.set_len(MAX_PDF_BYTES + 1).unwrap();
        drop(file);
        assert_eq!(
            enumerate_pdf_pages(&oversized).unwrap_err().code,
            ErrorCode::ResourceLimit
        );
        fs::remove_file(oversized).unwrap();
    }

    #[cfg(target_os = "windows")]
    fn temporary_pdf_path(label: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "comic-explorer-pdf-{label}-{}-{}.pdf",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[cfg(target_os = "windows")]
    fn minimal_pdf() -> Vec<u8> {
        let objects = [
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R /Resources << >> >>",
            "<< /Length 0 >>\nstream\n\nendstream",
        ];
        let mut bytes = b"%PDF-1.4\n%\xff\xff\xff\xff\n".to_vec();
        let mut offsets = vec![0_u64];
        for (index, object) in objects.iter().enumerate() {
            offsets.push(bytes.len() as u64);
            bytes
                .extend_from_slice(format!("{} 0 obj\n{}\nendobj\n", index + 1, object).as_bytes());
        }
        let xref = bytes.len();
        bytes.extend_from_slice(format!("xref\n0 {}\n", offsets.len()).as_bytes());
        bytes.extend_from_slice(b"0000000000 65535 f \n");
        for offset in offsets.iter().skip(1) {
            bytes.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
        }
        bytes.extend_from_slice(
            format!(
                "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
                offsets.len()
            )
            .as_bytes(),
        );
        bytes
    }
}
