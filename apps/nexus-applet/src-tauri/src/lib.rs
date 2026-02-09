mod contacts;
mod mail_index;

use contacts::Contact;
use mail_index::{MailAnalysisResult, MailContact};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

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
}

#[tauri::command]
fn get_contacts() -> Result<Vec<Contact>, String> {
    contacts::get_system_contacts()
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

// ============ Mail Analysis Commands ============

#[tauri::command]
fn analyze_mail() -> Result<MailAnalysisResult, String> {
    mail_index::analyze_mail()
}

#[tauri::command]
fn get_contact_mail_score(email: String) -> Option<u32> {
    mail_index::get_contact_score(&email)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        settings: Mutex::new(SyncSettings {
            auto_sync_enabled: false,
            sync_interval_minutes: 15,
            selected_contact_ids: vec![],
            launch_at_startup: false,
            last_sync_at: None,
        }),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_contacts,
            get_sync_settings,
            update_sync_settings,
            set_auto_sync,
            set_selected_contacts,
            record_sync,
            // Mail analysis
            analyze_mail,
            get_contact_mail_score
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
