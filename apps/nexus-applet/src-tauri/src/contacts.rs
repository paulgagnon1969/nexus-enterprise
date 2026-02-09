use serde::{Deserialize, Serialize};
use std::process::Command;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    pub id: String,
    pub display_name: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,       // Primary email
    pub phone: Option<String>,       // Primary phone
    pub all_emails: Vec<String>,     // All emails from device
    pub all_phones: Vec<String>,     // All phones from device
    // Address fields
    pub street: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub zip: Option<String>,
    pub country: Option<String>,
    // Organization
    pub company: Option<String>,
    pub job_title: Option<String>,
}

/// Contact structure from native helpers (Swift/PowerShell)
/// Uses camelCase to match JSON output from helpers
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeContact {
    id: String,
    display_name: Option<String>,
    first_name: Option<String>,
    last_name: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    #[serde(default)]
    all_emails: Vec<String>,
    #[serde(default)]
    all_phones: Vec<String>,
    // Address fields
    street: Option<String>,
    city: Option<String>,
    state: Option<String>,
    zip: Option<String>,
    country: Option<String>,
    // Organization
    company: Option<String>,
    job_title: Option<String>,
}

/// Get the path to the macOS Swift helper
#[cfg(target_os = "macos")]
fn get_macos_helper_path() -> Option<PathBuf> {
    // Use absolute path for development
    let dev_path = PathBuf::from("/Users/pg/nexus-enterprise/apps/nexus-applet/src-tauri/contacts_helper");
    if dev_path.exists() {
        return Some(dev_path);
    }
    
    // Check relative to executable for production
    if let Ok(exe) = std::env::current_exe() {
        let mut path = exe;
        path.pop();
        let helper = path.join("contacts_helper");
        if helper.exists() {
            return Some(helper);
        }
    }
    
    None
}

/// Get the path to the Windows PowerShell helper
#[cfg(target_os = "windows")]
fn get_windows_helper_path() -> Option<PathBuf> {
    // Check relative to executable for production
    if let Ok(exe) = std::env::current_exe() {
        let mut path = exe;
        path.pop();
        
        // Check for .ps1 script
        let helper = path.join("contacts_windows.ps1");
        if helper.exists() {
            return Some(helper);
        }
        
        // Also check in src directory during development
        let dev_helper = path.join("src").join("contacts_windows.ps1");
        if dev_helper.exists() {
            return Some(dev_helper);
        }
    }
    
    // Development path
    let dev_path = PathBuf::from("src/contacts_windows.ps1");
    if dev_path.exists() {
        return Some(dev_path);
    }
    
    None
}

/// Get contacts from macOS using Swift helper
#[cfg(target_os = "macos")]
pub fn get_system_contacts() -> Result<Vec<Contact>, String> {
    let helper_path = match get_macos_helper_path() {
        Some(p) => p,
        None => {
            eprintln!("[contacts] macOS helper not found, using demo contacts");
            return Ok(get_demo_contacts());
        }
    };
    
    eprintln!("[contacts] Using macOS helper at: {:?}", helper_path);
    
    let output = Command::new(&helper_path)
        .arg("fetch")
        .output();
    
    match output {
        Ok(result) => {
            if !result.status.success() {
                let stderr = String::from_utf8_lossy(&result.stderr);
                eprintln!("[contacts] Helper stderr: {}", stderr);
                
                if stderr.contains("denied") || stderr.contains("authorized") {
                    return Err("Contacts access denied. Please grant permission in System Settings > Privacy & Security > Contacts.".to_string());
                }
                
                return Err(format!("Failed to fetch contacts: {}", stderr));
            }
            
            let stdout = String::from_utf8_lossy(&result.stdout);
            eprintln!("[contacts] Got {} bytes from helper", stdout.len());
            
            parse_native_contacts(&stdout)
        }
        Err(e) => {
            eprintln!("[contacts] Failed to run helper: {}", e);
            Ok(get_demo_contacts())
        }
    }
}

/// Get contacts from Windows using PowerShell helper
#[cfg(target_os = "windows")]
pub fn get_system_contacts() -> Result<Vec<Contact>, String> {
    let helper_path = match get_windows_helper_path() {
        Some(p) => p,
        None => {
            eprintln!("[contacts] Windows helper not found, using demo contacts");
            return Ok(get_demo_contacts());
        }
    };
    
    eprintln!("[contacts] Using Windows helper at: {:?}", helper_path);
    
    // Run PowerShell with the script
    let output = Command::new("powershell")
        .args([
            "-ExecutionPolicy", "Bypass",
            "-NoProfile",
            "-File", helper_path.to_str().unwrap_or(""),
            "-Action", "fetch"
        ])
        .output();
    
    match output {
        Ok(result) => {
            if !result.status.success() {
                let stderr = String::from_utf8_lossy(&result.stderr);
                eprintln!("[contacts] PowerShell stderr: {}", stderr);
                return Err(format!("Failed to fetch contacts: {}", stderr));
            }
            
            let stdout = String::from_utf8_lossy(&result.stdout);
            eprintln!("[contacts] Got {} bytes from PowerShell", stdout.len());
            
            // PowerShell may output empty array as nothing, handle that
            let json = stdout.trim();
            if json.is_empty() || json == "null" {
                eprintln!("[contacts] No contacts returned from Windows");
                return Ok(vec![]);
            }
            
            parse_native_contacts(json)
        }
        Err(e) => {
            eprintln!("[contacts] Failed to run PowerShell: {}", e);
            Ok(get_demo_contacts())
        }
    }
}

/// Fallback for other platforms (Linux, etc.)
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn get_system_contacts() -> Result<Vec<Contact>, String> {
    eprintln!("[contacts] Platform not supported, using demo contacts");
    Ok(get_demo_contacts())
}

/// Parse JSON from native helper into Contact structs
fn parse_native_contacts(json: &str) -> Result<Vec<Contact>, String> {
    match serde_json::from_str::<Vec<NativeContact>>(json) {
        Ok(native_contacts) => {
            eprintln!("[contacts] Parsed {} contacts", native_contacts.len());
            let contacts = native_contacts.into_iter().map(|c| Contact {
                id: c.id,
                display_name: c.display_name,
                first_name: c.first_name,
                last_name: c.last_name,
                email: c.email,
                phone: c.phone,
                all_emails: c.all_emails,
                all_phones: c.all_phones,
                street: c.street,
                city: c.city,
                state: c.state,
                zip: c.zip,
                country: c.country,
                company: c.company,
                job_title: c.job_title,
            }).collect();
            Ok(contacts)
        }
        Err(e) => {
            eprintln!("[contacts] JSON parse error: {}", e);
            eprintln!("[contacts] JSON preview: {}", &json[..json.len().min(500)]);
            Err(format!("Failed to parse contacts: {}", e))
        }
    }
}

fn get_demo_contacts() -> Vec<Contact> {
    vec![
        Contact {
            id: "demo-1".to_string(),
            display_name: Some("Demo Contact".to_string()),
            first_name: Some("Demo".to_string()),
            last_name: Some("Contact".to_string()),
            email: Some("demo@example.com".to_string()),
            phone: Some("555-0001".to_string()),
            all_emails: vec!["demo@example.com".to_string(), "demo.alt@example.com".to_string()],
            all_phones: vec!["555-0001".to_string()],
            street: Some("123 Demo St".to_string()),
            city: Some("San Francisco".to_string()),
            state: Some("CA".to_string()),
            zip: Some("94102".to_string()),
            country: Some("USA".to_string()),
            company: Some("Demo Corp".to_string()),
            job_title: Some("Engineer".to_string()),
        },
    ]
}

/// Response from the normalize operation
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NormalizeResponse {
    updated: u32,
    total: u32,
}

/// Result struct for normalize operation (matches lib.rs NormalizeResult)
#[derive(Debug, Clone, Serialize)]
pub struct NormalizeResult {
    pub updated: u32,
    pub total: u32,
}

/// Normalize state values in Apple Contacts (macOS only)
#[cfg(target_os = "macos")]
pub fn normalize_contacts() -> Result<NormalizeResult, String> {
    let helper_path = match get_macos_helper_path() {
        Some(p) => p,
        None => {
            return Err("macOS contacts helper not found".to_string());
        }
    };
    
    eprintln!("[contacts] Normalizing states using helper at: {:?}", helper_path);
    
    let output = Command::new(&helper_path)
        .arg("normalize")
        .output();
    
    match output {
        Ok(result) => {
            if !result.status.success() {
                let stderr = String::from_utf8_lossy(&result.stderr);
                eprintln!("[contacts] Normalize stderr: {}", stderr);
                
                if stderr.contains("denied") || stderr.contains("authorized") {
                    return Err("Contacts access denied. Please grant permission in System Settings > Privacy & Security > Contacts.".to_string());
                }
                
                return Err(format!("Failed to normalize contacts: {}", stderr));
            }
            
            let stdout = String::from_utf8_lossy(&result.stdout);
            eprintln!("[contacts] Normalize output: {}", stdout);
            
            // Parse the JSON response
            match serde_json::from_str::<NormalizeResponse>(&stdout) {
                Ok(resp) => Ok(NormalizeResult {
                    updated: resp.updated,
                    total: resp.total,
                }),
                Err(e) => {
                    eprintln!("[contacts] Failed to parse normalize response: {}", e);
                    Err(format!("Failed to parse normalize response: {}", e))
                }
            }
        }
        Err(e) => {
            eprintln!("[contacts] Failed to run normalize: {}", e);
            Err(format!("Failed to run normalize: {}", e))
        }
    }
}

/// Normalize contacts - stub for non-macOS platforms
#[cfg(not(target_os = "macos"))]
pub fn normalize_contacts() -> Result<NormalizeResult, String> {
    Err("Contact normalization is only supported on macOS".to_string())
}
