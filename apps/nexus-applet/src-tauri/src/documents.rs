use crate::index::{DocumentIndex, DocumentStatus, IndexedDocument};
use sha2::{Sha256, Digest};
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use walkdir::WalkDir;

// Supported file extensions for document scanning
const SUPPORTED_EXTENSIONS: &[&str] = &[
    // Documents
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "odt", "ods", "odp", "rtf", "txt", "csv",
    // Markdown & text
    "md", "markdown", "json", "xml", "yaml", "yml", "html", "htm",
    // Images (for procedures with inline images)
    "jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp", "svg",
];

pub struct ScanResult {
    pub documents_found: u32,
    pub documents_new: u32,
    pub documents_updated: u32,
}

/// Scan a directory and add all supported documents to the index
pub fn scan_directory(
    root_path: &str,
    index: &DocumentIndex,
) -> Result<ScanResult, String> {
    let root = Path::new(root_path);
    
    if !root.exists() {
        return Err(format!("Path does not exist: {}", root_path));
    }
    
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", root_path));
    }

    let root_name = root.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Root")
        .to_string();

    let mut result = ScanResult {
        documents_found: 0,
        documents_new: 0,
        documents_updated: 0,
    };

    let now = chrono::Utc::now().to_rfc3339();

    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        
        // Skip directories and hidden files
        if path.is_dir() {
            continue;
        }
        
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }
        }

        // Check extension
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());
        
        let ext_str = match &ext {
            Some(e) if SUPPORTED_EXTENSIONS.contains(&e.as_str()) => e.clone(),
            _ => continue,
        };

        result.documents_found += 1;

        // Build breadcrumb path
        let breadcrumb = build_breadcrumb(root, path, &root_name);

        // Get file metadata
        let metadata = match fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        // Calculate file hash (for change detection)
        let file_hash = calculate_file_hash(path).ok();

        let file_path_str = path.to_string_lossy().to_string();
        let file_name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let doc = IndexedDocument {
            id: uuid::Uuid::new_v4().to_string(),
            file_path: file_path_str,
            file_name,
            file_type: Some(ext_str),
            file_size: metadata.len() as i64,
            file_hash,
            breadcrumb,
            status: DocumentStatus::Pending,
            error_message: None,
            scanned_at: now.clone(),
            updated_at: now.clone(),
            uploaded_at: None,
            nexus_doc_id: None,
        };

        match index.upsert_document(&doc) {
            Ok(_) => result.documents_new += 1,
            Err(e) => {
                eprintln!("Failed to index document: {}", e);
            }
        }
    }

    Ok(result)
}

/// Build breadcrumb path from root to file
fn build_breadcrumb(root: &Path, file_path: &Path, root_name: &str) -> Vec<String> {
    let mut breadcrumb = vec![root_name.to_string()];
    
    if let Ok(relative) = file_path.strip_prefix(root) {
        for component in relative.components() {
            if let std::path::Component::Normal(name) = component {
                if let Some(name_str) = name.to_str() {
                    breadcrumb.push(name_str.to_string());
                }
            }
        }
    }
    
    breadcrumb
}

/// Calculate SHA-256 hash of a file
fn calculate_file_hash(path: &Path) -> Result<String, std::io::Error> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];
    
    loop {
        let bytes_read = file.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }
    
    Ok(hex::encode(hasher.finalize()))
}

/// Get file size in human-readable format
pub fn format_file_size(bytes: i64) -> String {
    const KB: i64 = 1024;
    const MB: i64 = KB * 1024;
    const GB: i64 = MB * 1024;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}
