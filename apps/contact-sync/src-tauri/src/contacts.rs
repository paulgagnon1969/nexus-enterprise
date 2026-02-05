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

/// Returns demo contacts for testing.
/// Real macOS contacts access requires Swift/ObjC Contacts framework integration.
pub fn get_system_contacts() -> Result<Vec<Contact>, String> {
    Ok(vec![
        Contact {
            id: "demo-1".to_string(),
            display_name: Some("Demo Contact 1".to_string()),
            first_name: Some("Demo".to_string()),
            last_name: Some("Contact 1".to_string()),
            email: Some("demo1@example.com".to_string()),
            phone: Some("555-0001".to_string()),
        },
        Contact {
            id: "demo-2".to_string(),
            display_name: Some("Demo Contact 2".to_string()),
            first_name: Some("Demo".to_string()),
            last_name: Some("Contact 2".to_string()),
            email: Some("demo2@example.com".to_string()),
            phone: Some("555-0002".to_string()),
        },
        Contact {
            id: "demo-3".to_string(),
            display_name: Some("Test User".to_string()),
            first_name: Some("Test".to_string()),
            last_name: Some("User".to_string()),
            email: Some("test@example.com".to_string()),
            phone: None,
        },
    ])
}
