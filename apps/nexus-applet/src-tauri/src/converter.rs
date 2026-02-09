use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use pulldown_cmark::{html, Options, Parser};
use serde::{Deserialize, Serialize};
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

/// Convert DOCX to HTML
fn convert_docx(path: &Path, title: &str) -> Result<ConversionResult, String> {
    // Read file to bytes (docx-rs requires &[u8])
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    
    let docx = docx_rs::read_docx(&bytes).map_err(|e| format!("Failed to parse DOCX: {}", e))?;
    
    let mut html = String::new();
    let mut word_count = 0u32;
    let mut image_count = 0u32;
    
    html.push_str("<!DOCTYPE html>\n<html>\n<head>\n");
    html.push_str(&format!("<title>{}</title>\n", escape_html(title)));
    html.push_str("<meta charset=\"UTF-8\">\n");
    html.push_str("<style>\n");
    html.push_str("body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }\n");
    html.push_str("img { max-width: 100%; height: auto; }\n");
    html.push_str("table { border-collapse: collapse; width: 100%; }\n");
    html.push_str("td, th { border: 1px solid #ddd; padding: 8px; }\n");
    html.push_str("</style>\n</head>\n<body>\n");

    // Extract text content from DOCX
    // Note: docx-rs provides document structure, we iterate through paragraphs
    for child in docx.document.children {
        match child {
            docx_rs::DocumentChild::Paragraph(para) => {
                let mut para_text = String::new();
                let mut is_heading = false;
                let mut heading_level = 0u8;

                // Check for heading style
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
                                    para_text.push_str(&text.text);
                                }
                                docx_rs::RunChild::Drawing(_) => {
                                    // Image placeholder - actual image extraction is complex
                                    image_count += 1;
                                    para_text.push_str("[Image]");
                                }
                                _ => {}
                            }
                        }
                    }
                }

                if !para_text.trim().is_empty() {
                    word_count += para_text.split_whitespace().count() as u32;
                    
                    if is_heading && heading_level > 0 && heading_level <= 6 {
                        html.push_str(&format!("<h{}>{}</h{}>\n", heading_level, escape_html(&para_text), heading_level));
                    } else {
                        html.push_str(&format!("<p>{}</p>\n", escape_html(&para_text)));
                    }
                }
            }
            docx_rs::DocumentChild::Table(table) => {
                html.push_str("<table>\n");
                for row in &table.rows {
                    if let docx_rs::TableChild::TableRow(tr) = row {
                        html.push_str("<tr>\n");
                        for cell in &tr.cells {
                            if let docx_rs::TableRowChild::TableCell(tc) = cell {
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
                        }
                        html.push_str("</tr>\n");
                    }
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

/// Convert PDF to HTML (text extraction)
fn convert_pdf(path: &Path, title: &str) -> Result<ConversionResult, String> {
    let text = pdf_extract::extract_text(path)
        .map_err(|e| format!("Failed to extract PDF text: {}", e))?;

    let word_count = text.split_whitespace().count() as u32;
    
    let mut html = String::new();
    html.push_str("<!DOCTYPE html>\n<html>\n<head>\n");
    html.push_str(&format!("<title>{}</title>\n", escape_html(title)));
    html.push_str("<meta charset=\"UTF-8\">\n");
    html.push_str("<style>\n");
    html.push_str("body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }\n");
    html.push_str("p { margin-bottom: 1em; }\n");
    html.push_str("</style>\n</head>\n<body>\n");

    // Split text into paragraphs
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
        has_images: false, // PDF image extraction is complex, skipping for now
        image_count: 0,
        original_format: "pdf".to_string(),
        error: None,
    })
}

/// Convert Markdown to HTML
fn convert_markdown(path: &Path, title: &str) -> Result<ConversionResult, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let word_count = content.split_whitespace().count() as u32;

    // Parse markdown with all options enabled
    let options = Options::all();
    let parser = Parser::new_ext(&content, options);
    
    let mut html_body = String::new();
    html::push_html(&mut html_body, parser);

    // Count images in markdown
    let image_count = content.matches("![").count() as u32;

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

/// Pass through HTML files with minimal wrapping
fn convert_html_passthrough(path: &Path, title: &str) -> Result<ConversionResult, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let word_count = content.split_whitespace().count() as u32;
    
    // Count img tags
    let image_count = content.matches("<img").count() as u32;

    Ok(ConversionResult {
        html: content,
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
