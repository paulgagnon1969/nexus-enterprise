mod contacts;
mod contact_groups;
mod converter;
mod documents;
mod index;
mod tray;
mod uploader;
mod video;

use contacts::{Contact, NormalizeResult};
use contact_groups::{ContactGroupIndex, ContactGroup};
use converter::ConversionResult;
use index::{DocumentIndex, DocumentStatus, DocumentStats, IndexedDocument};
use uploader::{UploadQueue, UploadProgress, UploadRequest, UploadResult};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};

/// Install a global panic hook that logs panic info to a file in the app data dir.
/// This is critical for diagnosing crashes in release builds.
fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        // Build a panic log message
        let location = info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column())).unwrap_or_else(|| "unknown".to_string());
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "<unknown panic payload>".to_string()
        };
        let thread = std::thread::current();
        let thread_name = thread.name().unwrap_or("<unnamed>");
        let timestamp = chrono::Utc::now().to_rfc3339();
        let msg = format!(
            "[{}] PANIC on thread '{}' at {}:\n  {}\n\n",
            timestamp, thread_name, location, payload
        );

        // Write to app data dir
        if let Some(data_dir) = dirs_next::data_dir() {
            let app_dir = data_dir.join("com.nexus.nexbridge-connect");
            let _ = std::fs::create_dir_all(&app_dir);
            let log_path = app_dir.join("panic.log");
            use std::io::Write;
            if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
                let _ = f.write_all(msg.as_bytes());
            }
        }

        // Also print to stderr
        eprintln!("{}", msg);

        // Run the default hook (prints the standard panic message)
        default_hook(info);
    }));
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SyncSettings {
    pub auto_sync_enabled: bool,
    pub sync_interval_minutes: u32,
    pub selected_contact_ids: Vec<String>,
    pub launch_at_startup: bool,
    pub last_sync_at: Option<String>,
}

pub struct AppState {
    pub settings: Mutex<SyncSettings>,
    pub document_index: DocumentIndex,
    pub upload_queue: UploadQueue,
    pub contact_groups: ContactGroupIndex,
    pub converted_dir: std::path::PathBuf,
}


#[tauri::command]
fn get_contacts() -> Result<Vec<Contact>, String> {
    contacts::get_system_contacts()
}

#[tauri::command]
fn normalize_apple_contacts() -> Result<NormalizeResult, String> {
    contacts::normalize_contacts()
}

#[tauri::command]
fn get_sync_settings(state: State<AppState>) -> SyncSettings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn update_sync_settings(state: State<AppState>, settings: SyncSettings) -> Result<(), String> {
    let mut current = state.settings.lock().unwrap();
    *current = settings;
    Ok(())
}

#[tauri::command]
fn set_auto_sync(state: State<AppState>, enabled: bool) -> Result<SyncSettings, String> {
    let mut settings = state.settings.lock().unwrap();
    settings.auto_sync_enabled = enabled;
    Ok(settings.clone())
}

#[tauri::command]
fn set_selected_contacts(state: State<AppState>, ids: Vec<String>) -> Result<(), String> {
    let mut settings = state.settings.lock().unwrap();
    settings.selected_contact_ids = ids;
    Ok(())
}

#[tauri::command]
fn record_sync(state: State<AppState>) -> Result<(), String> {
    let mut settings = state.settings.lock().unwrap();
    settings.last_sync_at = Some(chrono::Utc::now().to_rfc3339());
    Ok(())
}

// ============ Contact Group Commands ============

#[tauri::command]
fn create_contact_group(
    state: State<AppState>,
    name: String,
    description: Option<String>,
    color: Option<String>,
) -> Result<ContactGroup, String> {
    state.contact_groups
        .create_group(&name, description.as_deref(), color.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_contact_group(
    state: State<AppState>,
    id: String,
    name: String,
    description: Option<String>,
    color: Option<String>,
) -> Result<(), String> {
    state.contact_groups
        .update_group(&id, &name, description.as_deref(), color.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_contact_group(state: State<AppState>, id: String) -> Result<(), String> {
    state.contact_groups
        .delete_group(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_contact_groups(state: State<AppState>) -> Result<Vec<ContactGroup>, String> {
    state.contact_groups
        .list_groups()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn add_contacts_to_group(
    state: State<AppState>,
    contact_ids: Vec<String>,
    group_id: String,
) -> Result<u32, String> {
    state.contact_groups
        .add_contacts_to_group(&contact_ids, &group_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_contacts_from_group(
    state: State<AppState>,
    contact_ids: Vec<String>,
    group_id: String,
) -> Result<u32, String> {
    state.contact_groups
        .remove_contacts_from_group(&contact_ids, &group_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_contacts_in_group(state: State<AppState>, group_id: String) -> Result<Vec<String>, String> {
    state.contact_groups
        .get_contacts_in_group(&group_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_groups_for_contact(state: State<AppState>, contact_id: String) -> Result<Vec<ContactGroup>, String> {
    state.contact_groups
        .get_groups_for_contact(&contact_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn ignore_contacts(state: State<AppState>, contact_ids: Vec<String>) -> Result<u32, String> {
    state.contact_groups
        .ignore_contacts(&contact_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn unignore_contacts(state: State<AppState>, contact_ids: Vec<String>) -> Result<u32, String> {
    state.contact_groups
        .unignore_contacts(&contact_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_ignored_contacts(state: State<AppState>) -> Result<Vec<String>, String> {
    state.contact_groups
        .get_ignored_contacts()
        .map_err(|e| e.to_string())
}

// ============ Document Commands ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanFolderResult {
    pub documents_found: u32,
    pub documents_new: u32,
    pub documents_updated: u32,
}

#[tauri::command]
fn scan_folder(state: State<AppState>, path: String) -> Result<ScanFolderResult, String> {
    let result = documents::scan_directory(&path, &state.document_index)?;
    Ok(ScanFolderResult {
        documents_found: result.documents_found,
        documents_new: result.documents_new,
        documents_updated: result.documents_updated,
    })
}

#[tauri::command]
fn get_indexed_documents(state: State<AppState>) -> Result<Vec<IndexedDocument>, String> {
    state.document_index
        .get_all_documents()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_documents_by_status(state: State<AppState>, status: String) -> Result<Vec<IndexedDocument>, String> {
    let doc_status = DocumentStatus::from_str(&status);
    state.document_index
        .get_documents_by_status(doc_status)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_document_stats(state: State<AppState>) -> Result<DocumentStats, String> {
    state.document_index
        .get_stats()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_document_status(
    state: State<AppState>,
    id: String,
    status: String,
    error_message: Option<String>,
) -> Result<(), String> {
    let doc_status = DocumentStatus::from_str(&status);
    state.document_index
        .update_status(&id, doc_status, error_message.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn ignore_folder(
    state: State<AppState>,
    folder_path: String,
) -> Result<u32, String> {
    println!("[DEBUG] ignore_folder called with path: {}", folder_path);
    state.document_index
        .ignore_documents_in_folder(&folder_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn import_folder(
    state: State<AppState>,
    folder_path: String,
) -> Result<u32, String> {
    println!("[DEBUG] import_folder called with path: {}", folder_path);
    state.document_index
        .import_documents_in_folder(&folder_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn bulk_update_document_status(
    state: State<AppState>,
    ids: Vec<String>,
    status: String,
) -> Result<u32, String> {
    println!("[DEBUG] bulk_update_document_status called with ids: {:?}, status: {}", ids, status);
    let doc_status = DocumentStatus::from_str(&status);
    println!("[DEBUG] Converted to DocumentStatus: {:?}, as_str: {}", doc_status, doc_status.as_str());
    let mut updated = 0;
    let mut errors: Vec<String> = vec![];
    for id in &ids {
        match state.document_index.update_status(id, doc_status.clone(), None) {
            Ok(_) => {
                println!("[DEBUG] Successfully updated document: {}", id);
                updated += 1;
            }
            Err(e) => {
                println!("[DEBUG] Failed to update document {}: {}", id, e);
                errors.push(format!("{}: {}", id, e));
            }
        }
    }
    println!("[DEBUG] Updated {} documents, {} errors", updated, errors.len());
    if !errors.is_empty() {
        return Err(format!("Some updates failed: {}", errors.join(", ")));
    }
    Ok(updated)
}

// ============ Conversion Commands ============

#[tauri::command]
fn convert_document(file_path: String) -> Result<ConversionResult, String> {
    converter::convert_to_html(&file_path)
}

#[tauri::command]
fn get_supported_formats() -> Vec<&'static str> {
    converter::supported_formats()
}

/// Convert a document and cache the HTML to disk. Returns conversion metadata.
/// The cached HTML is stored at app_data/converted/{document_id}.html
#[tauri::command]
fn convert_and_cache(
    state: State<AppState>,
    document_id: String,
    file_path: String,
) -> Result<ConversionResult, String> {
    let result = converter::convert_to_html(&file_path)?;

    // Save HTML to disk
    let cache_path = state.converted_dir.join(format!("{}.html", document_id));
    std::fs::write(&cache_path, &result.html)
        .map_err(|e| format!("Failed to cache converted HTML: {}", e))?;

    // Update status to CONVERTED
    state.document_index
        .update_status(&document_id, DocumentStatus::Converted, None)
        .map_err(|e| e.to_string())?;

    Ok(result)
}

/// Read cached HTML for a previously converted document.
#[tauri::command]
fn get_cached_conversion(
    state: State<AppState>,
    document_id: String,
) -> Result<String, String> {
    let cache_path = state.converted_dir.join(format!("{}.html", document_id));
    std::fs::read_to_string(&cache_path)
        .map_err(|_| format!("No cached conversion found for document {}", document_id))
}

// ============ Upload Commands ============

#[tauri::command]
async fn upload_document(
    state: State<'_, AppState>,
    api_url: String,
    token: String,
    document_id: String,
    html_content: String,
    title: String,
    category: String,
    original_format: String,
    word_count: u32,
    folder_name: String,
    breadcrumb: Vec<String>,
) -> Result<UploadResult, String> {
    let request = UploadRequest {
        document_id,
        html_content,
        title,
        category,
        original_format,
        word_count,
        folder_name,
        breadcrumb,
    };
    
    Ok(state.upload_queue.upload_document(&api_url, &token, request).await)
}

#[tauri::command]
fn get_upload_progress(state: State<AppState>) -> UploadProgress {
    state.upload_queue.get_progress()
}

#[tauri::command]
fn pause_upload(state: State<AppState>) {
    state.upload_queue.pause();
}

#[tauri::command]
fn resume_upload(state: State<AppState>) {
    state.upload_queue.resume();
}

#[tauri::command]
fn reset_upload_queue(state: State<AppState>) {
    state.upload_queue.reset();
}

#[tauri::command]
fn set_upload_total(state: State<AppState>, total: u32) {
    state.upload_queue.total.store(total, std::sync::atomic::Ordering::SeqCst);
}

#[tauri::command]
fn open_file_native(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_hook();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // Initialize document index in app data directory
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&app_data_dir).ok();
            
            let db_path = app_data_dir.join("documents.db");
            let document_index = DocumentIndex::new(&db_path)
                .expect("Failed to initialize document index");
            
            let groups_db_path = app_data_dir.join("contact_groups.db");
            let contact_groups = ContactGroupIndex::new(&groups_db_path)
                .expect("Failed to initialize contact groups");

            // Create converted HTML cache directory
            let converted_dir = app_data_dir.join("converted");
            std::fs::create_dir_all(&converted_dir).ok();

            let app_state = AppState {
                settings: Mutex::new(SyncSettings {
                    auto_sync_enabled: false,
                    sync_interval_minutes: 15,
                    selected_contact_ids: vec![],
                    launch_at_startup: false,
                    last_sync_at: None,
                }),
                document_index,
                upload_queue: UploadQueue::new(),
                contact_groups,
                converted_dir,
            };
            
            app.manage(app_state);
            
            // Create system tray
            tray::create_tray(app.handle())?;
            
            // Handle window close - hide instead of quit
            let window = app.get_webview_window("main").unwrap();
            
            // Resize window to 80% of screen height, centered
            if let Some(monitor) = window.primary_monitor().ok().flatten() {
                let screen_size = monitor.size();
                let scale = monitor.scale_factor();
                
                // Calculate dimensions (768 width already set, 80% of screen height)
                let width = 768.0;
                let height = (screen_size.height as f64 / scale) * 0.8;
                
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));
                let _ = window.center();
            }
            
            // Show window after positioning
            let _ = window.show();
            
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // Prevent the window from closing, just hide it
                    api.prevent_close();
                    let _ = window_clone.hide();
                }
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Contact commands
            get_contacts,
            normalize_apple_contacts,
            get_sync_settings,
            update_sync_settings,
            set_auto_sync,
            set_selected_contacts,
            record_sync,
            // Contact group commands
            create_contact_group,
            update_contact_group,
            delete_contact_group,
            list_contact_groups,
            add_contacts_to_group,
            remove_contacts_from_group,
            get_contacts_in_group,
            get_groups_for_contact,
            ignore_contacts,
            unignore_contacts,
            get_ignored_contacts,
            // Document commands
            scan_folder,
            get_indexed_documents,
            get_documents_by_status,
            get_document_stats,
            update_document_status,
            bulk_update_document_status,
            // Conversion commands
            convert_document,
            get_supported_formats,
            convert_and_cache,
            get_cached_conversion,
            // Upload commands
            upload_document,
            get_upload_progress,
            pause_upload,
            resume_upload,
            reset_upload_queue,
            set_upload_total,
            // File commands
            open_file_native,
            ignore_folder,
            import_folder,
            // Video assessment commands
            video::get_video_metadata,
            video::extract_frames,
            video::cleanup_frames
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
