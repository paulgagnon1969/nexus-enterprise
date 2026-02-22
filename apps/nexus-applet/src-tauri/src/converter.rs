use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use pulldown_cmark::{html, Options, Parser};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversionResult {
    pub html: String,
    pub title: String,
    pub word_count: u32,
    pub has_images: bool,
    pub image_count: u32,
    pub original_format: String,
    pub error: Option<String>,
}

/// Convert a document to HTML with embedded base64 images
pub fn convert_to_html(file_path: &str) -> Result<ConversionResult, String> {
    let path = Path::new(file_path);
    
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let file_name = path
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("Untitled")
        .to_string();

    match extension.as_str() {
        "docx" => convert_docx(path, &file_name),
        "doc" => Err("Legacy .doc format not supported. Please convert to .docx".to_string()),
        "pdf" => convert_pdf(path, &file_name),
        "md" | "markdown" => convert_markdown(path, &file_name),
        "txt" => convert_text(path, &file_name),
        "html" | "htm" => convert_html_passthrough(path, &file_name),
        "rtf" => Err("RTF format not yet supported".to_string()),
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" => convert_image(path, &file_name, &extension),
        _ => Err(format!("Unsupported format: .{}", extension)),
    }
}

/// Extract images from a DOCX ZIP archive into a map of filename -> base64 data URI.
/// DOCX files store images in word/media/image1.png, word/media/image2.jpeg, etc.
fn extract_docx_images(path: &Path) -> HashMap<String, String> {
    let mut images = HashMap::new();
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return images,
    };
    let mut archive = match zip::ZipArchive::new(file) {
        Ok(a) => a,
        Err(_) => return images,
    };

    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.name().to_string();
        if !name.starts_with("word/media/") {
            continue;
        }
        // Determine MIME from extension
        let mime = match name.rsplit('.').next().map(|e| e.to_lowercase()).as_deref() {
            Some("png") => "image/png",
            Some("jpg") | Some("jpeg") => "image/jpeg",
            Some("gif") => "image/gif",
            Some("webp") => "image/webp",
            Some("bmp") => "image/bmp",
            Some("emf") => "image/x-emf",
            Some("wmf") => "image/x-wmf",
            Some("svg") => "image/svg+xml",
            _ => continue, // skip unknown
        };
        let mut buf = Vec::new();
        if entry.read_to_end(&mut buf).is_ok() && !buf.is_empty() {
            let b64 = BASE64.encode(&buf);
            let data_uri = format!("data:{};base64,{}", mime, b64);
            // Key by the bare filename (e.g. "image1.png")
            if let Some(fname) = name.rsplit('/').next() {
                images.insert(fname.to_string(), data_uri);
            }
        }
    }
    images
}

/// Convert DOCX to HTML with embedded images
fn convert_docx(path: &Path, title: &str) -> Result<ConversionResult, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let docx = docx_rs::read_docx(&bytes).map_err(|e| format!("Failed to parse DOCX: {}", e))?;

    // Pre-extract all images from the DOCX ZIP
    let images = extract_docx_images(path);
    let mut image_index = 0usize;
    // Build ordered list of image filenames for sequential matching
    let mut image_keys: Vec<String> = images.keys().cloned().collect();
    image_keys.sort(); // image1.png, image2.png, ...

    let mut html = String::new();
    let mut word_count = 0u32;
    let mut image_count = 0u32;

    html.push_str("<!DOCTYPE html>\n<html>\n<head>\n");
    html.push_str(&format!("<title>{}</title>\n", escape_html(title)));
    html.push_str("<meta charset=\"UTF-8\">\n");
    html.push_str("<style>\n");
    html.push_str("body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }\n");
    html.push_str("img { max-width: 100%; height: auto; margin: 8px 0; }\n");
    html.push_str("table { border-collapse: collapse; width: 100%; }\n");
    html.push_str("td, th { border: 1px solid #ddd; padding: 8px; }\n");
    html.push_str("</style>\n</head>\n<body>\n");

    for child in docx.document.children {
        match child {
            docx_rs::DocumentChild::Paragraph(para) => {
                let mut para_html = String::new();
                let mut para_text_only = String::new();
                let mut is_heading = false;
                let mut heading_level = 0u8;

                if let Some(style) = &para.property.style {
                    if style.val.starts_with("Heading") {
                        is_heading = true;
                        heading_level = style.val.chars().last()
                            .and_then(|c| c.to_digit(10))
                            .unwrap_or(1) as u8;
                    }
                }

                for run in &para.children {
                    if let docx_rs::ParagraphChild::Run(run) = run {
                        for child in &run.children {
                            match child {
                                docx_rs::RunChild::Text(text) => {
                                    para_html.push_str(&escape_html(&text.text));
                                    para_text_only.push_str(&text.text);
                                }
                                docx_rs::RunChild::Drawing(_) => {
                                    image_count += 1;
                                    // Try to match to the next extracted image
                                    if image_index < image_keys.len() {
                                        let key = &image_keys[image_index];
                                        if let Some(data_uri) = images.get(key) {
                                            para_html.push_str(&format!(
                                                "<img src=\"{}\" alt=\"{}\">",
                                                data_uri, escape_html(key)
                                            ));
                                        }
                                        image_index += 1;
                                    } else {
                                        para_html.push_str("<!-- image not extracted -->");
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                }

                let has_content = !para_text_only.trim().is_empty() || para_html.contains("<img");
                if has_content {
                    word_count += para_text_only.split_whitespace().count() as u32;
                    if is_heading && heading_level > 0 && heading_level <= 6 {
                        html.push_str(&format!("<h{}>{}</h{}>\n", heading_level, para_html, heading_level));
                    } else {
                        html.push_str(&format!("<p>{}</p>\n", para_html));
                    }
                }
            }
            docx_rs::DocumentChild::Table(table) => {
                html.push_str("<table>\n");
                for row in &table.rows {
                    let docx_rs::TableChild::TableRow(tr) = row;
                    html.push_str("<tr>\n");
                    for cell in &tr.cells {
                        let docx_rs::TableRowChild::TableCell(tc) = cell;
                        html.push_str("<td>");
                        for child in &tc.children {
                            if let docx_rs::TableCellContent::Paragraph(para) = child {
                                for run in &para.children {
                                    if let docx_rs::ParagraphChild::Run(r) = run {
                                        for c in &r.children {
                                            if let docx_rs::RunChild::Text(text) = c {
                                                html.push_str(&escape_html(&text.text));
                                                word_count += text.text.split_whitespace().count() as u32;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        html.push_str("</td>\n");
                    }
                    html.push_str("</tr>\n");
                }
                html.push_str("</table>\n");
            }
            _ => {}
        }
    }

    html.push_str("</body>\n</html>");

    Ok(ConversionResult {
        html,
        title: title.to_string(),
        word_count,
        has_images: image_count > 0,
        image_count,
        original_format: "docx".to_string(),
        error: None,
    })
}

/// Extract JPEG images from a PDF using lopdf.
/// DCTDecode streams are raw JPEG data — we can embed them directly.
/// Other image filters (FlateDecode, CCITTFax, JBIG2) are flagged but not extracted.
fn extract_pdf_images(path: &Path) -> (Vec<String>, u32) {
    let mut data_uris: Vec<String> = Vec::new();
    let mut unextracted = 0u32;

    let doc = match lopdf::Document::load(path) {
        Ok(d) => d,
        Err(_) => return (data_uris, 0),
    };

    for (_, obj_id) in &doc.objects {
        // Look for stream objects that are Image XObjects
        if let Ok(stream) = obj_id.as_stream() {
            let dict = &stream.dict;
            let is_image = dict
                .get(b"Subtype")
                .ok()
                .and_then(|v| v.as_name().ok())
                .map(|n: &[u8]| n == b"Image")
                .unwrap_or(false);

            if !is_image {
                continue;
            }

            // Check the filter to determine encoding
            let filter: &[u8] = dict
                .get(b"Filter")
                .ok()
                .and_then(|v| v.as_name().ok())
                .unwrap_or(&[]);

            if filter == b"DCTDecode" {
                // DCTDecode = raw JPEG bytes
                let b64 = BASE64.encode(&stream.content);
                data_uris.push(format!("data:image/jpeg;base64,{}", b64));
            } else if filter == b"JPXDecode" {
                // JPEG 2000
                let b64 = BASE64.encode(&stream.content);
                data_uris.push(format!("data:image/jp2;base64,{}", b64));
            } else {
                // FlateDecode, CCITTFaxDecode, JBIG2, etc. — can't easily embed
                unextracted += 1;
            }
        }
    }
    (data_uris, unextracted)
}

/// Convert PDF to HTML with text and embedded JPEG images
fn convert_pdf(path: &Path, title: &str) -> Result<ConversionResult, String> {
    let text = pdf_extract::extract_text(path)
        .map_err(|e| format!("Failed to extract PDF text: {}", e))?;

    let (images, unextracted_count) = extract_pdf_images(path);
    let extracted_count = images.len() as u32;
    let total_images = extracted_count + unextracted_count;

    let word_count = text.split_whitespace().count() as u32;

    let mut html = String::new();
    html.push_str("<!DOCTYPE html>\n<html>\n<head>\n");
    html.push_str(&format!("<title>{}</title>\n", escape_html(title)));
    html.push_str("<meta charset=\"UTF-8\">\n");
    html.push_str("<style>\n");
    html.push_str("body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }\n");
    html.push_str("p { margin-bottom: 1em; }\n");
    html.push_str("img { max-width: 100%; height: auto; margin: 8px 0; }\n");
    html.push_str(".pdf-notice { background: #fffbeb; border: 1px solid #f59e0b; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 0.9em; color: #92400e; }\n");
    html.push_str("</style>\n</head>\n<body>\n");

    // Warning banner if some images couldn't be extracted
    if unextracted_count > 0 {
        html.push_str(&format!(
            "<div class=\"pdf-notice\">\u{26a0} This PDF contains {} image(s) in a format that could not be embedded ({} of {} extracted). Original file should be kept as reference.</div>\n",
            unextracted_count, extracted_count, total_images
        ));
    }

    // Embed extracted images at the top (before text)
    if !images.is_empty() {
        for (i, data_uri) in images.iter().enumerate() {
            html.push_str(&format!(
                "<img src=\"{}\" alt=\"PDF image {}\">\n",
                data_uri, i + 1
            ));
        }
        html.push_str("<hr>\n");
    }

    // Text content
    for paragraph in text.split("\n\n") {
        let trimmed = paragraph.trim();
        if !trimmed.is_empty() {
            html.push_str(&format!("<p>{}</p>\n", escape_html(trimmed).replace('\n', "<br>")));
        }
    }

    html.push_str("</body>\n</html>");

    Ok(ConversionResult {
        html,
        title: title.to_string(),
        word_count,
        has_images: total_images > 0,
        image_count: total_images,
        original_format: "pdf".to_string(),
        error: if unextracted_count > 0 {
            Some(format!("{} of {} images could not be extracted (non-JPEG encoding)", unextracted_count, total_images))
        } else {
            None
        },
    })
}

/// Convert Markdown to HTML, inlining local image references as base64
fn convert_markdown(path: &Path, title: &str) -> Result<ConversionResult, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let word_count = content.split_whitespace().count() as u32;

    let options = Options::all();
    let parser = Parser::new_ext(&content, options);

    let mut html_body = String::new();
    html::push_html(&mut html_body, parser);

    let image_count = content.matches("![").count() as u32;

    // Inline local image references
    let parent = path.parent().unwrap_or(Path::new("."));
    html_body = inline_local_images(&html_body, parent);

    let mut html = String::new();
    html.push_str("<!DOCTYPE html>\n<html>\n<head>\n");
    html.push_str(&format!("<title>{}</title>\n", escape_html(title)));
    html.push_str("<meta charset=\"UTF-8\">\n");
    html.push_str("<style>\n");
    html.push_str("body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }\n");
    html.push_str("img { max-width: 100%; height: auto; }\n");
    html.push_str("pre { background: #f4f4f4; padding: 1em; overflow-x: auto; }\n");
    html.push_str("code { background: #f4f4f4; padding: 2px 4px; }\n");
    html.push_str("blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 1em; color: #666; }\n");
    html.push_str("</style>\n</head>\n<body>\n");
    html.push_str(&html_body);
    html.push_str("</body>\n</html>");

    Ok(ConversionResult {
        html,
        title: title.to_string(),
        word_count,
        has_images: image_count > 0,
        image_count,
        original_format: "markdown".to_string(),
        error: None,
    })
}

/// Convert plain text to HTML
fn convert_text(path: &Path, title: &str) -> Result<ConversionResult, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let word_count = content.split_whitespace().count() as u32;

    let mut html = String::new();
    html.push_str("<!DOCTYPE html>\n<html>\n<head>\n");
    html.push_str(&format!("<title>{}</title>\n", escape_html(title)));
    html.push_str("<meta charset=\"UTF-8\">\n");
    html.push_str("<style>\n");
    html.push_str("body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }\n");
    html.push_str("pre { white-space: pre-wrap; word-wrap: break-word; }\n");
    html.push_str("</style>\n</head>\n<body>\n");
    html.push_str("<pre>");
    html.push_str(&escape_html(&content));
    html.push_str("</pre>\n");
    html.push_str("</body>\n</html>");

    Ok(ConversionResult {
        html,
        title: title.to_string(),
        word_count,
        has_images: false,
        image_count: 0,
        original_format: "text".to_string(),
        error: None,
    })
}

/// Pass through HTML files, inlining local image references as base64
fn convert_html_passthrough(path: &Path, title: &str) -> Result<ConversionResult, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let word_count = content.split_whitespace().count() as u32;
    let image_count = content.matches("<img").count() as u32;

    // Inline local image references
    let parent = path.parent().unwrap_or(Path::new("."));
    let inlined = inline_local_images(&content, parent);

    Ok(ConversionResult {
        html: inlined,
        title: title.to_string(),
        word_count,
        has_images: image_count > 0,
        image_count,
        original_format: "html".to_string(),
        error: None,
    })
}

/// Convert image to HTML with base64 embedded
fn convert_image(path: &Path, title: &str, extension: &str) -> Result<ConversionResult, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

    let mime_type = match extension {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    };

    let base64_data = BASE64.encode(&buffer);
    let data_uri = format!("data:{};base64,{}", mime_type, base64_data);

    let mut html = String::new();
    html.push_str("<!DOCTYPE html>\n<html>\n<head>\n");
    html.push_str(&format!("<title>{}</title>\n", escape_html(title)));
    html.push_str("<meta charset=\"UTF-8\">\n");
    html.push_str("<style>\n");
    html.push_str("body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 20px; }\n");
    html.push_str("img { max-width: 100%; height: auto; }\n");
    html.push_str("</style>\n</head>\n<body>\n");
    html.push_str(&format!("<img src=\"{}\" alt=\"{}\">\n", data_uri, escape_html(title)));
    html.push_str("</body>\n</html>");

    Ok(ConversionResult {
        html,
        title: title.to_string(),
        word_count: 0,
        has_images: true,
        image_count: 1,
        original_format: extension.to_string(),
        error: None,
    })
}

/// Scan HTML for <img src="..."> tags with local paths and replace with base64 data URIs.
/// Skips URLs that start with http://, https://, or data:.
fn inline_local_images(html: &str, base_dir: &Path) -> String {
    let mut result = html.to_string();
    let img_pattern = "src=\"";
    let mut search_start = 0;

    while let Some(pos) = result[search_start..].find(img_pattern) {
        let abs_pos = search_start + pos + img_pattern.len();
        if let Some(end) = result[abs_pos..].find('"') {
            let src = result[abs_pos..abs_pos + end].to_string();

            // Skip remote URLs and already-embedded data URIs
            if src.starts_with("http://") || src.starts_with("https://") || src.starts_with("data:") {
                search_start = abs_pos + end;
                continue;
            }

            // Resolve relative to the source file's directory
            let img_path = base_dir.join(&src);
            if img_path.exists() {
                if let Ok(bytes) = fs::read(&img_path) {
                    let ext = img_path.extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e.to_lowercase())
                        .unwrap_or_default();
                    let mime = match ext.as_str() {
                        "png" => "image/png",
                        "jpg" | "jpeg" => "image/jpeg",
                        "gif" => "image/gif",
                        "webp" => "image/webp",
                        "svg" => "image/svg+xml",
                        "bmp" => "image/bmp",
                        _ => "application/octet-stream",
                    };
                    let b64 = BASE64.encode(&bytes);
                    let data_uri = format!("data:{};base64,{}", mime, b64);
                    result = format!("{}{}{}", &result[..abs_pos], data_uri, &result[abs_pos + end..]);
                    search_start = abs_pos + data_uri.len();
                    continue;
                }
            }
            // Couldn't inline — skip
            search_start = abs_pos + end;
        } else {
            break;
        }
    }
    result
}

/// Escape HTML special characters
fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// Get supported formats for conversion
pub fn supported_formats() -> Vec<&'static str> {
    vec![
        "docx", "pdf", "md", "markdown", "txt", "html", "htm",
        "jpg", "jpeg", "png", "gif", "webp", "bmp",
    ]
}
