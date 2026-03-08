// ---------------------------------------------------------------------------
// NexCAD — Precision Object Scanning & CAD Export Pipeline
// ---------------------------------------------------------------------------
// Tauri commands that orchestrate:
//   1. Image download from API → local SSD
//   2. Photogrammetry reconstruction via photogrammetry_helper sidecar
//   3. Format conversion via assimp CLI
//   4. SketchUp .skp generation via Ruby script
//   5. Mesh analysis via Python trimesh script
//   6. Result upload back to the API
//   7. Cleanup
//
// All heavy processing targets /Volumes/4T Data/precision-scans/{jobId}/
// ---------------------------------------------------------------------------

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tokio::process::Command;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCAN_ROOT: &str = "/Volumes/4T Data/precision-scans";

// Sidecar binary — resolved at runtime (dev vs. bundled)
fn photogrammetry_helper_path() -> String {
    // In dev, use the pre-compiled sidecar sitting next to src-tauri
    let dev_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/photogrammetry_helper-aarch64-apple-darwin"
    );
    if Path::new(dev_path).exists() {
        return dev_path.to_string();
    }
    // Bundled path (Tauri resolves this at runtime)
    "photogrammetry_helper".to_string()
}

fn assimp_path() -> String {
    for p in &[
        "/opt/homebrew/bin/assimp",
        "/usr/local/bin/assimp",
        "/usr/bin/assimp",
    ] {
        if Path::new(p).exists() {
            return p.to_string();
        }
    }
    "assimp".to_string()
}

fn python3_path() -> String {
    for p in &[
        "/Library/Frameworks/Python.framework/Versions/3.14/bin/python3",
        "/opt/homebrew/bin/python3",
        "/usr/local/bin/python3",
        "/usr/bin/python3",
    ] {
        if Path::new(p).exists() {
            return p.to_string();
        }
    }
    "python3".to_string()
}

fn sketchup_path() -> String {
    for version in &["2026", "2025", "2024"] {
        let p = format!(
            "/Applications/SketchUp {}/SketchUp.app/Contents/MacOS/SketchUp",
            version
        );
        if Path::new(&p).exists() {
            return p;
        }
    }
    "SketchUp".to_string()
}

fn analyze_mesh_script() -> String {
    let dev_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/scripts/analyze_mesh.py"
    );
    if Path::new(dev_path).exists() {
        return dev_path.to_string();
    }
    // Fallback for bundled resources
    "scripts/analyze_mesh.py".to_string()
}

fn sketchup_import_script() -> String {
    let dev_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/scripts/sketchup_import.rb"
    );
    if Path::new(dev_path).exists() {
        return dev_path.to_string();
    }
    "scripts/sketchup_import.rb".to_string()
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Job storage layout on the SSD.
fn job_dir(job_id: &str) -> PathBuf {
    PathBuf::from(SCAN_ROOT).join(job_id)
}
fn images_dir(job_id: &str) -> PathBuf {
    job_dir(job_id).join("images")
}
fn output_dir(job_id: &str) -> PathBuf {
    job_dir(job_id).join("output")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadResult {
    pub job_id: String,
    pub image_count: u32,
    pub images_dir: String,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotogrammetryResult {
    pub job_id: String,
    pub usdz_path: String,
    pub obj_path: String,
    pub detail_level: String,
    pub processing_secs: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConvertFormatResult {
    pub job_id: String,
    pub format: String,
    pub output_path: String,
    pub file_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SketchUpResult {
    pub job_id: String,
    pub skp_path: String,
    pub file_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshAnalysisResult {
    pub job_id: String,
    pub analysis_path: String,
    pub analysis: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadScanResult {
    pub job_id: String,
    pub uploaded_files: Vec<String>,
    pub api_response: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Tauri Commands
// ---------------------------------------------------------------------------

/// Download scan images from the API to local SSD storage.
///
/// Expects `image_urls` — a list of signed URLs (or API-relative paths).
/// If `api_url` and `token` are provided, relative paths are resolved against
/// the API. If the URLs are already absolute (e.g. pre-signed S3/MinIO), they
/// are fetched directly.
#[tauri::command]
pub async fn download_scan_images(
    app: tauri::AppHandle,
    job_id: String,
    image_urls: Vec<String>,
    api_url: Option<String>,
    token: Option<String>,
) -> Result<DownloadResult, String> {
    let img_dir = images_dir(&job_id);
    tokio::fs::create_dir_all(&img_dir)
        .await
        .map_err(|e| format!("Failed to create images dir: {}", e))?;

    let client = Client::new();
    let mut total_bytes: u64 = 0;
    let count = image_urls.len();

    for (i, url) in image_urls.iter().enumerate() {
        let pct = ((i as f64 / count as f64) * 100.0) as u32;
        let _ = app.emit(
            "nexcad-progress",
            serde_json::json!({
                "stage": "download",
                "pct": pct,
                "message": format!("Downloading image {}/{}", i + 1, count),
                "jobId": &job_id,
            }),
        );

        // Resolve URL — absolute or relative to API
        let full_url = if url.starts_with("http://") || url.starts_with("https://") {
            url.clone()
        } else {
            let base = api_url.as_deref().unwrap_or("http://localhost:8001");
            format!("{}/{}", base.trim_end_matches('/'), url.trim_start_matches('/'))
        };

        let mut req = client.get(&full_url);
        if let Some(ref t) = token {
            req = req.header("Authorization", format!("Bearer {}", t));
        }

        let resp = req
            .send()
            .await
            .map_err(|e| format!("Download failed for {}: {}", full_url, e))?;

        if !resp.status().is_success() {
            return Err(format!(
                "HTTP {} downloading {}",
                resp.status(),
                full_url
            ));
        }

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("Failed to read body: {}", e))?;

        // Determine extension from URL or default to .jpg
        let ext = Path::new(url)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpg");
        let filename = format!("img_{:04}.{}", i, ext);
        let dest = img_dir.join(&filename);

        tokio::fs::write(&dest, &bytes)
            .await
            .map_err(|e| format!("Failed to write {}: {}", filename, e))?;

        total_bytes += bytes.len() as u64;
    }

    let _ = app.emit(
        "nexcad-progress",
        serde_json::json!({
            "stage": "download",
            "pct": 100,
            "message": format!("Downloaded {} images ({:.1} MB)", count, total_bytes as f64 / 1_048_576.0),
            "jobId": &job_id,
        }),
    );

    Ok(DownloadResult {
        job_id,
        image_count: count as u32,
        images_dir: img_dir.to_string_lossy().to_string(),
        total_bytes,
    })
}

/// Run photogrammetry reconstruction via the Swift sidecar.
///
/// Produces a USDZ model at .full detail, then converts to OBJ via ModelIO.
/// Both files land in `output/`.
#[tauri::command]
pub async fn run_photogrammetry(
    app: tauri::AppHandle,
    job_id: String,
    detail: Option<String>,
) -> Result<PhotogrammetryResult, String> {
    let img_dir = images_dir(&job_id);
    let out_dir = output_dir(&job_id);
    tokio::fs::create_dir_all(&out_dir)
        .await
        .map_err(|e| format!("Failed to create output dir: {}", e))?;

    let usdz_path = out_dir.join("model.usdz");
    let detail_level = detail.unwrap_or_else(|| "full".to_string());

    let _ = app.emit(
        "nexcad-progress",
        serde_json::json!({
            "stage": "photogrammetry",
            "pct": 0,
            "message": "Starting photogrammetry reconstruction...",
            "jobId": &job_id,
        }),
    );

    let start = std::time::Instant::now();

    // Step 1: Reconstruct USDZ from images
    let output = Command::new(photogrammetry_helper_path())
        .args([
            "reconstruct",
            "--input",
            img_dir.to_str().unwrap(),
            "--output",
            usdz_path.to_str().unwrap(),
            "--detail",
            &detail_level,
        ])
        .output()
        .await
        .map_err(|e| format!("photogrammetry_helper failed to launch: {}", e))?;

    // Parse progress lines from stdout (JSON lines format)
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Ok(progress) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(pct) = progress.get("pct").and_then(|v| v.as_f64()) {
                let msg = progress
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Processing...");
                let _ = app.emit(
                    "nexcad-progress",
                    serde_json::json!({
                        "stage": "photogrammetry",
                        "pct": pct,
                        "message": msg,
                        "jobId": &job_id,
                    }),
                );
            }
        }
    }

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Photogrammetry failed: {}", stderr));
    }

    if !usdz_path.exists() {
        return Err("Photogrammetry completed but no USDZ output found".to_string());
    }

    // Step 2: Convert USDZ → OBJ via ModelIO
    let obj_path = out_dir.join("model.obj");
    let convert_output = Command::new(photogrammetry_helper_path())
        .args([
            "convert",
            "--input",
            usdz_path.to_str().unwrap(),
            "--output",
            obj_path.to_str().unwrap(),
        ])
        .output()
        .await
        .map_err(|e| format!("USDZ→OBJ conversion failed to launch: {}", e))?;

    if !convert_output.status.success() {
        let stderr = String::from_utf8_lossy(&convert_output.stderr);
        return Err(format!("USDZ→OBJ conversion failed: {}", stderr));
    }

    let elapsed = start.elapsed().as_secs_f64();

    let _ = app.emit(
        "nexcad-progress",
        serde_json::json!({
            "stage": "photogrammetry",
            "pct": 100,
            "message": format!("Reconstruction complete ({:.0}s)", elapsed),
            "jobId": &job_id,
        }),
    );

    Ok(PhotogrammetryResult {
        job_id,
        usdz_path: usdz_path.to_string_lossy().to_string(),
        obj_path: obj_path.to_string_lossy().to_string(),
        detail_level,
        processing_secs: elapsed,
    })
}

/// Convert OBJ model to additional formats via assimp.
///
/// Supported formats: dae (Collada), dxf, stl, gltf2, glb2
#[tauri::command]
pub async fn convert_model(
    app: tauri::AppHandle,
    job_id: String,
    format: String,
) -> Result<ConvertFormatResult, String> {
    let out_dir = output_dir(&job_id);
    let obj_path = out_dir.join("model.obj");

    if !obj_path.exists() {
        return Err("model.obj not found — run photogrammetry first".to_string());
    }

    // Map format names to assimp export format IDs and extensions
    let (assimp_format, ext) = match format.to_lowercase().as_str() {
        "dae" | "collada" => ("collada", "dae"),
        "dxf" => ("dxf", "dxf"),
        "stl" => ("stl", "stl"),
        "gltf" | "gltf2" => ("gltf2", "gltf"),
        "glb" | "glb2" => ("glb2", "glb"),
        "fbx" => ("fbx", "fbx"),
        "3ds" => ("3ds", "3ds"),
        "ply" => ("ply", "ply"),
        other => return Err(format!("Unsupported format: {}", other)),
    };

    let output_path = out_dir.join(format!("model.{}", ext));

    let _ = app.emit(
        "nexcad-progress",
        serde_json::json!({
            "stage": "convert",
            "pct": 0,
            "message": format!("Converting to {} via assimp...", format.to_uppercase()),
            "jobId": &job_id,
        }),
    );

    let output = Command::new(assimp_path())
        .args([
            "export",
            obj_path.to_str().unwrap(),
            output_path.to_str().unwrap(),
            "-f",
            assimp_format,
        ])
        .output()
        .await
        .map_err(|e| format!("assimp failed to launch: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("assimp conversion to {} failed: {}", format, stderr));
    }

    let file_size = tokio::fs::metadata(&output_path)
        .await
        .map(|m| m.len())
        .unwrap_or(0);

    let _ = app.emit(
        "nexcad-progress",
        serde_json::json!({
            "stage": "convert",
            "pct": 100,
            "message": format!("{} export complete ({:.1} MB)", format.to_uppercase(), file_size as f64 / 1_048_576.0),
            "jobId": &job_id,
        }),
    );

    Ok(ConvertFormatResult {
        job_id,
        format,
        output_path: output_path.to_string_lossy().to_string(),
        file_size_bytes: file_size,
    })
}

/// Generate a SketchUp .skp file from a DAE (Collada) model.
///
/// Requires SketchUp to be installed. Uses the Ruby API via -RubyStartup
/// with env vars NEXCAD_INPUT and NEXCAD_OUTPUT to pass paths.
#[tauri::command]
pub async fn generate_sketchup(
    app: tauri::AppHandle,
    job_id: String,
) -> Result<SketchUpResult, String> {
    let out_dir = output_dir(&job_id);
    let dae_path = out_dir.join("model.dae");
    let skp_path = out_dir.join("model.skp");

    // Ensure DAE exists — convert from OBJ if needed
    if !dae_path.exists() {
        let obj_path = out_dir.join("model.obj");
        if !obj_path.exists() {
            return Err("Neither model.dae nor model.obj found".to_string());
        }
        // Auto-convert OBJ → DAE
        let conv_output = Command::new(assimp_path())
            .args([
                "export",
                obj_path.to_str().unwrap(),
                dae_path.to_str().unwrap(),
                "-f",
                "collada",
            ])
            .output()
            .await
            .map_err(|e| format!("assimp OBJ→DAE failed: {}", e))?;

        if !conv_output.status.success() {
            return Err(format!(
                "OBJ→DAE conversion failed: {}",
                String::from_utf8_lossy(&conv_output.stderr)
            ));
        }
    }

    let _ = app.emit(
        "nexcad-progress",
        serde_json::json!({
            "stage": "sketchup",
            "pct": 0,
            "message": "Generating SketchUp .skp file...",
            "jobId": &job_id,
        }),
    );

    let script = sketchup_import_script();

    let output = Command::new(sketchup_path())
        .arg("-RubyStartup")
        .arg(&script)
        .env("NEXCAD_INPUT", dae_path.to_str().unwrap())
        .env("NEXCAD_OUTPUT", skp_path.to_str().unwrap())
        .output()
        .await
        .map_err(|e| format!("SketchUp failed to launch: {}", e))?;

    // SketchUp exits 0 even on Ruby errors — check if .skp was actually created
    if !skp_path.exists() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "SketchUp did not produce .skp\nstdout: {}\nstderr: {}",
            stdout, stderr
        ));
    }

    let file_size = tokio::fs::metadata(&skp_path)
        .await
        .map(|m| m.len())
        .unwrap_or(0);

    let _ = app.emit(
        "nexcad-progress",
        serde_json::json!({
            "stage": "sketchup",
            "pct": 100,
            "message": format!("SketchUp file generated ({:.1} MB)", file_size as f64 / 1_048_576.0),
            "jobId": &job_id,
        }),
    );

    Ok(SketchUpResult {
        job_id,
        skp_path: skp_path.to_string_lossy().to_string(),
        file_size_bytes: file_size,
    })
}

/// Analyze mesh geometry using the Python trimesh script.
///
/// Returns dimensions, bounding box, edge/plane detection, etc.
#[tauri::command]
pub async fn analyze_mesh(
    app: tauri::AppHandle,
    job_id: String,
    input_file: Option<String>,
) -> Result<MeshAnalysisResult, String> {
    let out_dir = output_dir(&job_id);

    // Default to model.obj if no specific file given
    let mesh_path = if let Some(ref f) = input_file {
        PathBuf::from(f)
    } else {
        out_dir.join("model.obj")
    };

    if !mesh_path.exists() {
        return Err(format!(
            "Mesh file not found: {}",
            mesh_path.to_string_lossy()
        ));
    }

    let analysis_path = out_dir.join("mesh_analysis.json");

    let _ = app.emit(
        "nexcad-progress",
        serde_json::json!({
            "stage": "analysis",
            "pct": 0,
            "message": "Analyzing mesh geometry...",
            "jobId": &job_id,
        }),
    );

    let output = Command::new(python3_path())
        .args([
            &analyze_mesh_script(),
            mesh_path.to_str().unwrap(),
            analysis_path.to_str().unwrap(),
        ])
        .output()
        .await
        .map_err(|e| format!("Python mesh analyzer failed to launch: {}", e))?;

    if !analysis_path.exists() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Mesh analysis produced no output: {}", stderr));
    }

    let json_str = tokio::fs::read_to_string(&analysis_path)
        .await
        .map_err(|e| format!("Failed to read analysis: {}", e))?;

    let analysis: serde_json::Value =
        serde_json::from_str(&json_str).map_err(|e| format!("Invalid analysis JSON: {}", e))?;

    // Check for errors in the analysis result
    if let Some(false) = analysis.get("success").and_then(|v| v.as_bool()) {
        let err_msg = analysis
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown analysis error");
        return Err(err_msg.to_string());
    }

    let _ = app.emit(
        "nexcad-progress",
        serde_json::json!({
            "stage": "analysis",
            "pct": 100,
            "message": "Mesh analysis complete",
            "jobId": &job_id,
        }),
    );

    Ok(MeshAnalysisResult {
        job_id,
        analysis_path: analysis_path.to_string_lossy().to_string(),
        analysis,
    })
}

/// Upload scan results (model files + analysis) back to the API.
#[tauri::command]
pub async fn upload_scan_results(
    app: tauri::AppHandle,
    job_id: String,
    api_url: String,
    token: String,
    formats: Option<Vec<String>>,
) -> Result<UploadScanResult, String> {
    let out_dir = output_dir(&job_id);
    let client = Client::new();

    // Determine which files to upload
    let target_formats = formats.unwrap_or_else(|| {
        vec![
            "usdz".to_string(),
            "obj".to_string(),
            "dae".to_string(),
            "skp".to_string(),
        ]
    });

    let mut uploaded_files = Vec::new();
    let mut form = reqwest::multipart::Form::new().text("jobId", job_id.clone());

    for fmt in &target_formats {
        let file_path = out_dir.join(format!("model.{}", fmt));
        if !file_path.exists() {
            continue;
        }

        let bytes = tokio::fs::read(&file_path)
            .await
            .map_err(|e| format!("Failed to read {}: {}", fmt, e))?;

        let filename = format!("model.{}", fmt);
        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name(filename.clone())
            .mime_str("application/octet-stream")
            .map_err(|e| format!("Multipart error: {}", e))?;

        form = form.part(format!("file_{}", fmt), part);
        uploaded_files.push(filename);

        let _ = app.emit(
            "nexcad-progress",
            serde_json::json!({
                "stage": "upload",
                "message": format!("Uploading model.{}", fmt),
                "jobId": &job_id,
            }),
        );
    }

    // Attach mesh analysis if it exists
    let analysis_path = out_dir.join("mesh_analysis.json");
    if analysis_path.exists() {
        let bytes = tokio::fs::read(&analysis_path)
            .await
            .map_err(|e| format!("Failed to read analysis: {}", e))?;
        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name("mesh_analysis.json")
            .mime_str("application/json")
            .map_err(|e| format!("Multipart error: {}", e))?;
        form = form.part("analysis", part);
        uploaded_files.push("mesh_analysis.json".to_string());
    }

    let url = format!(
        "{}/precision-scans/{}/results",
        api_url.trim_end_matches('/'),
        job_id
    );

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Upload request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Upload failed HTTP {}: {}", status, body));
    }

    let api_response: serde_json::Value = resp
        .json()
        .await
        .unwrap_or_else(|_| serde_json::json!({"status": "ok"}));

    let _ = app.emit(
        "nexcad-progress",
        serde_json::json!({
            "stage": "upload",
            "pct": 100,
            "message": format!("Uploaded {} files", uploaded_files.len()),
            "jobId": &job_id,
        }),
    );

    Ok(UploadScanResult {
        job_id,
        uploaded_files,
        api_response,
    })
}

/// Clean up all local files for a scan job.
#[tauri::command]
pub async fn cleanup_scan(job_id: String) -> Result<(), String> {
    let dir = job_dir(&job_id);
    if dir.exists() {
        tokio::fs::remove_dir_all(&dir)
            .await
            .map_err(|e| format!("Cleanup failed: {}", e))?;
    }
    Ok(())
}

/// List all scan jobs on the local SSD with basic info.
#[tauri::command]
pub async fn list_local_scans() -> Result<Vec<serde_json::Value>, String> {
    let root = Path::new(SCAN_ROOT);
    if !root.exists() {
        return Ok(vec![]);
    }

    let mut entries = tokio::fs::read_dir(root)
        .await
        .map_err(|e| format!("Failed to read scan root: {}", e))?;

    let mut scans = Vec::new();
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let job_id = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let out = path.join("output");
        let has_usdz = out.join("model.usdz").exists();
        let has_obj = out.join("model.obj").exists();
        let has_skp = out.join("model.skp").exists();
        let has_analysis = out.join("mesh_analysis.json").exists();

        // Count images
        let img_dir = path.join("images");
        let image_count = if img_dir.exists() {
            let mut count = 0u32;
            if let Ok(mut rd) = tokio::fs::read_dir(&img_dir).await {
                while let Ok(Some(_)) = rd.next_entry().await {
                    count += 1;
                }
            }
            count
        } else {
            0
        };

        scans.push(serde_json::json!({
            "jobId": job_id,
            "imageCount": image_count,
            "hasUsdz": has_usdz,
            "hasObj": has_obj,
            "hasSkp": has_skp,
            "hasAnalysis": has_analysis,
            "path": path.to_string_lossy(),
        }));
    }

    Ok(scans)
}
