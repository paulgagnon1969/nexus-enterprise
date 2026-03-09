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
pub async fn get_video_metadata(video_path: String) -> Result<VideoMetadata, String> {
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

/// Extraction mode for frame selection strategy.
/// - "fixed"    — capture every `interval_secs` seconds (simple, predictable).
/// - "adaptive" — hybrid: guaranteed baseline + extra frames on scene changes.
///                Never faster than `min_interval`, never slower than `max_interval`.
///                Best for drone footage where the camera moves at varying speeds.
/// - "scene"    — pure scene-change detection (no guaranteed interval).

const SCALE_FILTER: &str = "scale=1024:1024:force_original_aspect_ratio=decrease,pad=1024:1024:(ow-iw)/2:(oh-ih)/2";

/// Extract key frames from a video using FFmpeg.
///
/// Supports three extraction modes:
///   fixed    — every `interval_secs` seconds (default 10)
///   adaptive — motion-aware: guaranteed every `max_interval` secs, with extra
///              frames when scene changes, minimum `min_interval` apart
///   scene    — pure scene-change detection
///
/// The `showinfo` filter is used in adaptive/scene modes to capture actual
/// presentation timestamps from FFmpeg, so frame times are accurate.
#[tauri::command]
pub async fn extract_frames(
    app: tauri::AppHandle,
    video_path: String,
    // Fixed mode params
    interval_secs: Option<f64>,
    max_frames: Option<usize>,
    // Extraction mode: "fixed" (default), "adaptive", "scene"
    mode: Option<String>,
    // Adaptive mode params
    min_interval: Option<f64>,
    max_interval: Option<f64>,
    scene_threshold: Option<f64>,
    // Legacy compat — treated as mode="scene" when true
    use_scene_detection: Option<bool>,
    // Time range selection — extract only a portion of the video
    start_secs: Option<f64>,
    end_secs: Option<f64>,
) -> Result<ExtractionResult, String> {
    let max = max_frames.unwrap_or(120);
    let metadata = get_video_metadata(video_path.clone()).await?;

    // Resolve extraction mode
    let extraction_mode = if let Some(ref m) = mode {
        m.as_str()
    } else if use_scene_detection.unwrap_or(false) {
        "scene"
    } else {
        "fixed"
    };

    let temp_dir = std::env::temp_dir().join(format!("nexbridge-{}", uuid_v4()));
    tokio::fs::create_dir_all(&temp_dir)
        .await
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let output_pattern = temp_dir.join("frame_%04d.jpg");
    let showinfo_log = temp_dir.join("showinfo.txt");

    // Build the FFmpeg -vf filter chain based on mode
    let (vf, uses_showinfo) = match extraction_mode {
        "adaptive" => {
            // Hybrid extraction: baseline interval + scene-change bonus frames
            //
            // Logic: select a frame when ANY of:
            //   1. It's the first frame (isnan(prev_selected_t))
            //   2. Enough time has passed AND (max interval exceeded OR scene changed):
            //      gte(t-prev_selected_t, min) * (gte(t-prev_selected_t, max) + gt(scene, thresh))
            let min_i = min_interval.unwrap_or(2.0);
            let max_i = max_interval.unwrap_or(8.0);
            let thresh = scene_threshold.unwrap_or(0.15);

            let select_expr = format!(
                "select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,{min_i})*(gte(t-prev_selected_t\\,{max_i})+gt(scene\\,{thresh}))',showinfo,{SCALE_FILTER}",
            );
            (select_expr, true)
        }
        "scene" => {
            let thresh = scene_threshold.unwrap_or(0.3);
            let select_expr = format!(
                "select='gt(scene\\,{thresh})',showinfo,{SCALE_FILTER}"
            );
            (select_expr, true)
        }
        _ => {
            // Fixed interval (original behavior)
            let interval = interval_secs.unwrap_or(10.0);
            let vf_str = format!("fps=1/{interval},{SCALE_FILTER}");
            (vf_str, false)
        }
    };

    let mode_desc = match extraction_mode {
        "adaptive" => format!(
            "adaptive (min={}s, max={}s, scene>{:.2})",
            min_interval.unwrap_or(2.0),
            max_interval.unwrap_or(8.0),
            scene_threshold.unwrap_or(0.15),
        ),
        "scene" => format!("scene detection (threshold={:.2})", scene_threshold.unwrap_or(0.3)),
        _ => format!("fixed interval ({}s)", interval_secs.unwrap_or(10.0)),
    };

    // Clamp time range to video bounds
    let effective_start = start_secs.unwrap_or(0.0).max(0.0);
    let effective_end = end_secs.unwrap_or(metadata.duration_secs).min(metadata.duration_secs);
    let effective_duration = effective_end - effective_start;

    let range_desc = if start_secs.is_some() || end_secs.is_some() {
        format!(" [{:.0}s–{:.0}s]", effective_start, effective_end)
    } else {
        String::new()
    };

    let _ = app.emit("extraction-progress", serde_json::json!({
        "stage": "extracting",
        "message": format!("Extracting frames from {} ({:.0}s, {}{})...", metadata.file_name, effective_duration, mode_desc, range_desc),
    }));

    let mut ffmpeg_args: Vec<String> = Vec::new();

    // Seek to start position (before -i for fast seeking)
    if effective_start > 0.0 {
        ffmpeg_args.extend(["-ss".to_string(), format!("{:.3}", effective_start)]);
    }

    ffmpeg_args.extend(["-i".to_string(), video_path.clone()]);

    // Limit duration if end was specified
    if end_secs.is_some() || start_secs.is_some() {
        ffmpeg_args.extend(["-t".to_string(), format!("{:.3}", effective_duration)]);
    }

    ffmpeg_args.extend([
        "-vf".to_string(), vf.clone(),
        "-fps_mode".to_string(), "vfr".to_string(),
        "-q:v".to_string(), "2".to_string(),
        output_pattern.to_str().unwrap().to_string(),
    ]);

    let output = Command::new(ffmpeg_path())
        .args(&ffmpeg_args)
        .output()
        .await
        .map_err(|e| format!("FFmpeg failed: {}", e))?;

    // Parse timestamps from showinfo output in stderr (adaptive/scene modes)
    let mut showinfo_timestamps: Vec<f64> = Vec::new();
    if uses_showinfo {
        let stderr = String::from_utf8_lossy(&output.stderr);
        for line in stderr.lines() {
            if line.contains("showinfo") {
                // Lines look like: [Parsed_showinfo_1 ...] n:0 pts:12345 pts_time:1.234 ...
                if let Some(pts_pos) = line.find("pts_time:") {
                    let after = &line[pts_pos + 9..];
                    let ts_str: String = after.chars().take_while(|c| *c != ' ' && *c != '\n').collect();
                    if let Ok(ts) = ts_str.parse::<f64>() {
                        showinfo_timestamps.push(ts);
                    }
                }
            }
        }
    }

    if !output.status.success() && !uses_showinfo {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if !stderr.contains("frame=") && !stderr.contains("Output") {
            return Err(format!("FFmpeg error: {}", stderr));
        }
    }

    // Collect output frames
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

    // Downsample if we got more frames than max
    if frame_paths.len() > max {
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

    let interval_fallback = interval_secs.unwrap_or(10.0);
    let mut frames: Vec<ExtractedFrame> = Vec::new();

    for (i, frame_path) in frame_paths.iter().enumerate() {
        let data = tokio::fs::read(frame_path)
            .await
            .map_err(|e| format!("Failed to read frame: {}", e))?;

        let b64 = STANDARD.encode(&data);

        // Use actual timestamp from showinfo if available, otherwise estimate.
        // Add effective_start so timestamps are absolute (relative to full video).
        let timestamp = if i < showinfo_timestamps.len() {
            showinfo_timestamps[i] + effective_start
        } else {
            effective_start + (i as f64 * interval_fallback)
        };

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
        "message": format!("Extracted {} frames ({})", frames.len(), mode_desc),
        "frameCount": frames.len(),
    }));

    Ok(ExtractionResult {
        metadata,
        frames,
        temp_dir: temp_dir.to_string_lossy().to_string(),
    })
}

// ---------------------------------------------------------------------------
// Burst extraction — full-resolution frames for photogrammetry
// ---------------------------------------------------------------------------

/// A single burst frame at full source resolution (no base64 — stays on disk).
#[derive(Debug, Serialize, Deserialize)]
pub struct BurstFrame {
    pub index: usize,
    pub timestamp_secs: f64,
    pub path: String,
    pub width: u32,
    pub height: u32,
}

/// Result of a burst extraction around a specific timestamp.
#[derive(Debug, Serialize, Deserialize)]
pub struct BurstExtractionResult {
    pub frames: Vec<BurstFrame>,
    pub temp_dir: String,
    pub source_width: u32,
    pub source_height: u32,
    pub center_timestamp: f64,
    pub window_secs: f64,
}

/// Extract a burst of full-resolution frames around a given timestamp.
///
/// Unlike `extract_frames`, this does NOT downscale — frames are saved at
/// the video's native resolution for photogrammetry reconstruction. Frames
/// stay on disk (no base64) because full-res images can be 5-15 MB each.
///
/// Designed for the Enhanced Video Assessment pipeline:
///   AI identifies damage at timestamp T → burst extract T±window at high fps
///   → overlapping frames feed into NexCAD photogrammetry → real measurements.
#[tauri::command]
pub async fn extract_burst_frames(
    app: tauri::AppHandle,
    video_path: String,
    center_timestamp_secs: f64,
    window_secs: Option<f64>,
    fps: Option<f64>,
    max_frames: Option<usize>,
) -> Result<BurstExtractionResult, String> {
    let window = window_secs.unwrap_or(2.0);
    let target_fps = fps.unwrap_or(4.0);
    let max = max_frames.unwrap_or(32);

    let metadata = get_video_metadata(video_path.clone()).await?;

    // Clamp time window to video bounds
    let start_ts = (center_timestamp_secs - window).max(0.0);
    let end_ts = (center_timestamp_secs + window).min(metadata.duration_secs);
    let duration = end_ts - start_ts;

    if duration < 0.5 {
        return Err("Burst window too small (video may be shorter than requested window)".to_string());
    }

    let temp_dir = std::env::temp_dir().join(format!("nexbridge-burst-{}", uuid_v4()));
    tokio::fs::create_dir_all(&temp_dir)
        .await
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let output_pattern = temp_dir.join("burst_%04d.jpg");

    let _ = app.emit("extraction-progress", serde_json::json!({
        "stage": "burst-extracting",
        "message": format!(
            "Extracting full-res burst: {:.1}s–{:.1}s at {} fps from {}",
            start_ts, end_ts, target_fps, metadata.file_name
        ),
    }));

    // Extract at full resolution — no scale filter, showinfo for accurate timestamps
    let vf = format!("fps={target_fps},showinfo");

    let output = Command::new(ffmpeg_path())
        .args([
            "-ss",
            &format!("{:.3}", start_ts),
            "-i",
            &video_path,
            "-t",
            &format!("{:.3}", duration),
            "-vf",
            &vf,
            "-fps_mode",
            "vfr",
            "-q:v",
            "1",  // highest JPEG quality for photogrammetry
            output_pattern.to_str().unwrap(),
        ])
        .output()
        .await
        .map_err(|e| format!("FFmpeg burst extraction failed: {}", e))?;

    // Parse actual timestamps from showinfo
    let stderr = String::from_utf8_lossy(&output.stderr);
    let mut showinfo_timestamps: Vec<f64> = Vec::new();
    for line in stderr.lines() {
        if line.contains("showinfo") {
            if let Some(pts_pos) = line.find("pts_time:") {
                let after = &line[pts_pos + 9..];
                let ts_str: String = after.chars().take_while(|c| *c != ' ' && *c != '\n').collect();
                if let Ok(ts) = ts_str.parse::<f64>() {
                    // pts_time is relative to -ss, so add start_ts back
                    showinfo_timestamps.push(start_ts + ts);
                }
            }
        }
    }

    // Collect output frames
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

    // Cap at max_frames
    if frame_paths.len() > max {
        let step = frame_paths.len() as f64 / max as f64;
        let sampled: Vec<PathBuf> = (0..max)
            .map(|i| frame_paths[(i as f64 * step) as usize].clone())
            .collect();
        frame_paths = sampled;
    }

    let mut frames: Vec<BurstFrame> = Vec::new();
    let interval_fallback = 1.0 / target_fps;

    for (i, frame_path) in frame_paths.iter().enumerate() {
        let timestamp = if i < showinfo_timestamps.len() {
            showinfo_timestamps[i]
        } else {
            start_ts + (i as f64 * interval_fallback)
        };

        frames.push(BurstFrame {
            index: i,
            timestamp_secs: timestamp,
            path: frame_path.to_string_lossy().to_string(),
            width: metadata.width,
            height: metadata.height,
        });
    }

    let _ = app.emit("extraction-progress", serde_json::json!({
        "stage": "burst-complete",
        "message": format!("Extracted {} full-res frames ({:.1}s window)", frames.len(), duration),
        "frameCount": frames.len(),
    }));

    Ok(BurstExtractionResult {
        frames,
        temp_dir: temp_dir.to_string_lossy().to_string(),
        source_width: metadata.width,
        source_height: metadata.height,
        center_timestamp: center_timestamp_secs,
        window_secs: window,
    })
}

/// Clean up temporary frame files after processing.
#[tauri::command]
pub async fn cleanup_frames(temp_dir: String) -> Result<(), String> {
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
