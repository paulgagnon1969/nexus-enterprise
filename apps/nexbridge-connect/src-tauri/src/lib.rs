use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Emitter;
use tokio::process::Command;

/// Metadata extracted from a video file via FFmpeg.
#[derive(Debug, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub duration_secs: f64,
    pub width: u32,
    pub height: u32,
    pub codec: String,
    pub file_name: String,
    pub file_size_bytes: u64,
}

/// A single extracted frame ready for AI analysis.
#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractedFrame {
    pub index: usize,
    pub timestamp_secs: f64,
    pub path: String,
    pub base64: String,
    pub mime_type: String,
}

/// Result of the frame extraction pipeline.
#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractionResult {
    pub metadata: VideoMetadata,
    pub frames: Vec<ExtractedFrame>,
    pub temp_dir: String,
}

/// Get the path to FFmpeg. In dev, use system FFmpeg; in production, use bundled sidecar.
fn ffmpeg_path() -> String {
    // Try common system paths first, then fall back to "ffmpeg" on PATH
    for path in &["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"] {
        if std::path::Path::new(path).exists() {
            return path.to_string();
        }
    }
    "ffmpeg".to_string()
}

fn ffprobe_path() -> String {
    for path in &["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe", "/usr/bin/ffprobe"] {
        if std::path::Path::new(path).exists() {
            return path.to_string();
        }
    }
    "ffprobe".to_string()
}

/// Extract video metadata using ffprobe.
#[tauri::command]
async fn get_video_metadata(video_path: String) -> Result<VideoMetadata, String> {
    let path = PathBuf::from(&video_path);
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let file_size_bytes = tokio::fs::metadata(&video_path)
        .await
        .map(|m| m.len())
        .unwrap_or(0);

    let output = Command::new(ffprobe_path())
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            &video_path,
        ])
        .output()
        .await
        .map_err(|e| format!("ffprobe failed: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe error: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("Parse error: {}", e))?;

    // Find video stream
    let streams = json["streams"].as_array().ok_or("No streams found")?;
    let video_stream = streams
        .iter()
        .find(|s| s["codec_type"].as_str() == Some("video"))
        .ok_or("No video stream found")?;

    let width = video_stream["width"].as_u64().unwrap_or(0) as u32;
    let height = video_stream["height"].as_u64().unwrap_or(0) as u32;
    let codec = video_stream["codec_name"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    let duration_secs = json["format"]["duration"]
        .as_str()
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);

    Ok(VideoMetadata {
        duration_secs,
        width,
        height,
        codec,
        file_name,
        file_size_bytes,
    })
}

/// Extract key frames from a video using FFmpeg.
/// Downscales to 1024x1024, samples every `interval_secs` seconds.
/// Returns base64-encoded frames ready for the Gemini API.
#[tauri::command]
async fn extract_frames(
    app: tauri::AppHandle,
    video_path: String,
    interval_secs: Option<f64>,
    max_frames: Option<usize>,
    use_scene_detection: Option<bool>,
) -> Result<ExtractionResult, String> {
    let interval = interval_secs.unwrap_or(10.0);
    let max = max_frames.unwrap_or(120);
    let scene_detect = use_scene_detection.unwrap_or(false);

    // Get metadata first
    let metadata = get_video_metadata(video_path.clone()).await?;

    // Create temp directory for frames
    let temp_dir = std::env::temp_dir().join(format!("nexbridge-{}", uuid_v4()));
    tokio::fs::create_dir_all(&temp_dir)
        .await
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let output_pattern = temp_dir.join("frame_%04d.jpg");

    // Build FFmpeg filter
    let vf = if scene_detect {
        format!(
            "select='gt(scene\\,0.3)',scale=1024:1024:force_original_aspect_ratio=decrease,pad=1024:1024:(ow-iw)/2:(oh-ih)/2",
        )
    } else {
        format!(
            "fps=1/{},scale=1024:1024:force_original_aspect_ratio=decrease,pad=1024:1024:(ow-iw)/2:(oh-ih)/2",
            interval
        )
    };

    // Emit progress
    let _ = app.emit("extraction-progress", serde_json::json!({
        "stage": "extracting",
        "message": format!("Extracting frames from {} ({:.0}s video)...", metadata.file_name, metadata.duration_secs),
    }));

    let output = Command::new(ffmpeg_path())
        .args([
            "-i",
            &video_path,
            "-vf",
            &vf,
            "-vsync",
            "vfn",
            "-q:v",
            "2", // High quality JPEG
            output_pattern.to_str().unwrap(),
        ])
        .output()
        .await
        .map_err(|e| format!("FFmpeg failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // FFmpeg often writes info to stderr even on success; check for actual errors
        if !stderr.contains("frame=") && !stderr.contains("Output") {
            return Err(format!("FFmpeg error: {}", stderr));
        }
    }

    // Read extracted frames, convert to base64
    let mut frames: Vec<ExtractedFrame> = Vec::new();
    let mut frame_paths: Vec<PathBuf> = Vec::new();
    let mut dir = tokio::fs::read_dir(&temp_dir)
        .await
        .map_err(|e| format!("Failed to read temp dir: {}", e))?;

    while let Ok(Some(entry)) = dir.next_entry().await {
        let path = entry.path();
        if path.extension().map(|e| e == "jpg").unwrap_or(false) {
            frame_paths.push(path);
        }
    }

    frame_paths.sort();

    // Limit to max frames
    if frame_paths.len() > max {
        // Sample evenly
        let step = frame_paths.len() as f64 / max as f64;
        let sampled: Vec<PathBuf> = (0..max)
            .map(|i| frame_paths[(i as f64 * step) as usize].clone())
            .collect();
        frame_paths = sampled;
    }

    let _ = app.emit("extraction-progress", serde_json::json!({
        "stage": "encoding",
        "message": format!("Encoding {} frames for analysis...", frame_paths.len()),
    }));

    for (i, frame_path) in frame_paths.iter().enumerate() {
        let data = tokio::fs::read(frame_path)
            .await
            .map_err(|e| format!("Failed to read frame: {}", e))?;

        let b64 = STANDARD.encode(&data);
        let timestamp = i as f64 * interval;

        frames.push(ExtractedFrame {
            index: i,
            timestamp_secs: timestamp,
            path: frame_path.to_string_lossy().to_string(),
            base64: b64,
            mime_type: "image/jpeg".to_string(),
        });
    }

    let _ = app.emit("extraction-progress", serde_json::json!({
        "stage": "complete",
        "message": format!("Extracted {} frames", frames.len()),
        "frameCount": frames.len(),
    }));

    Ok(ExtractionResult {
        metadata,
        frames,
        temp_dir: temp_dir.to_string_lossy().to_string(),
    })
}

/// Clean up temporary frame files after processing.
#[tauri::command]
async fn cleanup_frames(temp_dir: String) -> Result<(), String> {
    tokio::fs::remove_dir_all(&temp_dir)
        .await
        .map_err(|e| format!("Cleanup failed: {}", e))?;
    Ok(())
}

/// Simple UUID v4 generator (no external dep needed).
fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{:032x}", nanos)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            get_video_metadata,
            extract_frames,
            cleanup_frames,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NexBRIDGE Connect");
}
