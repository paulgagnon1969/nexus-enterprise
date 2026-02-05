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
}

#[derive(Debug, Deserialize)]
struct SwiftContact {
    id: String,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    #[serde(rename = "firstName")]
    first_name: Option<String>,
    #[serde(rename = "lastName")]
    last_name: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    #[serde(rename = "allEmails", default)]
    all_emails: Vec<String>,
    #[serde(rename = "allPhones", default)]
    all_phones: Vec<String>,
}

fn get_helper_path() -> Option<PathBuf> {
    // Use absolute path for development
    let dev_path = PathBuf::from("/Users/pg/nexus-enterprise/apps/contact-sync/src-tauri/contacts_helper");
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

/// Get contacts from macOS using Swift helper
pub fn get_system_contacts() -> Result<Vec<Contact>, String> {
    let helper_path = match get_helper_path() {
        Some(p) => p,
        None => {
            eprintln!("[contacts] Helper not found, using demo contacts");
            return Ok(get_demo_contacts());
        }
    };
    
    eprintln!("[contacts] Using helper at: {:?}", helper_path);
    
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
            
            match serde_json::from_str::<Vec<SwiftContact>>(&stdout) {
                Ok(swift_contacts) => {
                    eprintln!("[contacts] Parsed {} contacts", swift_contacts.len());
                    let contacts = swift_contacts.into_iter().map(|c| Contact {
                        id: c.id,
                        display_name: c.display_name,
                        first_name: c.first_name,
                        last_name: c.last_name,
                        email: c.email,
                        phone: c.phone,
                        all_emails: c.all_emails,
                        all_phones: c.all_phones,
                    }).collect();
                    Ok(contacts)
                }
                Err(e) => {
                    eprintln!("[contacts] JSON parse error: {}", e);
                    Err(format!("Failed to parse contacts: {}", e))
                }
            }
        }
        Err(e) => {
            eprintln!("[contacts] Failed to run helper: {}", e);
            Ok(get_demo_contacts())
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
        },
    ]
}
