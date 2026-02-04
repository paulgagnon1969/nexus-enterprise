use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contact {
    pub id: String,
    pub display_name: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
}

#[cfg(target_os = "macos")]
pub fn get_system_contacts() -> Result<Vec<Contact>, String> {
    use std::process::Command;
    
    // Use AppleScript to access Contacts (requires user permission)
    // This is a simplified approach - production would use CNContactStore directly
    let script = r#"
        tell application "Contacts"
            set contactList to {}
            repeat with p in people
                set contactInfo to {id of p, first name of p, last name of p}
                try
                    set contactInfo to contactInfo & {value of first email of p}
                on error
                    set contactInfo to contactInfo & {""}
                end try
                try
                    set contactInfo to contactInfo & {value of first phone of p}
                on error
                    set contactInfo to contactInfo & {""}
                end try
                set end of contactList to contactInfo
            end repeat
            return contactList
        end tell
    "#;
    
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("Failed to execute osascript: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Check if it's a permission error
        if stderr.contains("not allowed") || stderr.contains("permission") {
            return Err("Contacts permission required. Please grant access in System Settings > Privacy & Security > Contacts.".to_string());
        }
        return Err(format!("AppleScript error: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_applescript_contacts(&stdout)
}

#[cfg(target_os = "macos")]
fn parse_applescript_contacts(output: &str) -> Result<Vec<Contact>, String> {
    // Parse AppleScript list output format: {{id, first, last, email, phone}, ...}
    let mut contacts = Vec::new();
    
    // Simple parsing - in production, use proper AppleScript output format
    let trimmed = output.trim().trim_start_matches('{').trim_end_matches('}');
    
    for entry in trimmed.split("}, {") {
        let entry = entry.trim_start_matches('{').trim_end_matches('}');
        let parts: Vec<&str> = entry.split(", ").collect();
        
        if parts.len() >= 5 {
            let clean = |s: &str| -> Option<String> {
                let cleaned = s.trim().trim_matches('"').to_string();
                if cleaned.is_empty() || cleaned == "missing value" {
                    None
                } else {
                    Some(cleaned)
                }
            };
            
            let first_name = clean(parts.get(1).unwrap_or(&""));
            let last_name = clean(parts.get(2).unwrap_or(&""));
            let display_name = match (&first_name, &last_name) {
                (Some(f), Some(l)) => Some(format!("{} {}", f, l)),
                (Some(f), None) => Some(f.clone()),
                (None, Some(l)) => Some(l.clone()),
                _ => None,
            };
            
            contacts.push(Contact {
                id: clean(parts.get(0).unwrap_or(&"")).unwrap_or_default(),
                display_name,
                first_name,
                last_name,
                email: clean(parts.get(3).unwrap_or(&"")),
                phone: clean(parts.get(4).unwrap_or(&"")),
            });
        }
    }
    
    Ok(contacts)
}

#[cfg(target_os = "windows")]
pub fn get_system_contacts() -> Result<Vec<Contact>, String> {
    // Windows implementation using Windows.ApplicationModel.Contacts
    // This requires UWP APIs - simplified stub for now
    // In production, use windows-rs crate with proper contact store access
    
    Err("Windows contacts access requires additional setup. Please check documentation.".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn get_system_contacts() -> Result<Vec<Contact>, String> {
    Err("Contact sync is not supported on this platform.".to_string())
}
