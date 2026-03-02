use rusqlite::{Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

/// Construction-related domain patterns (case-insensitive)
const CONSTRUCTION_DOMAINS: &[&str] = &[
    "buildertrend.com",
    "procore.com",
    "plangrid.com",
    "bluebeam.com",
    "autodesk.com",
    "trimble.com",
    "sage.com",
    "viewpoint.com",
];

/// Domain keywords that suggest construction industry
const DOMAIN_KEYWORDS: &[&str] = &[
    "construction",
    "builders",
    "building",
    "contractor",
    "plumbing",
    "plumber",
    "electric",
    "electrical",
    "hvac",
    "heating",
    "cooling",
    "roofing",
    "roofer",
    "concrete",
    "masonry",
    "framing",
    "drywall",
    "flooring",
    "painting",
    "painter",
    "landscape",
    "excavat",
    "demolition",
    "remodel",
    "renovation",
    "carpentry",
    "carpenter",
    "architect",
    "engineer",
    "surveyor",
    "inspect",
];

/// Subject line keywords that suggest construction correspondence
const SUBJECT_KEYWORDS: &[&str] = &[
    // Bidding & Estimates
    "bid",
    "estimate",
    "quote",
    "proposal",
    "rfp",
    "rfi",
    "rfq",
    // Project Management
    "change order",
    "punch list",
    "submittal",
    "schedule",
    "timeline",
    "milestone",
    // Job Site
    "job site",
    "jobsite",
    "project",
    "phase",
    "site visit",
    // Compliance
    "permit",
    "inspection",
    "code",
    "compliance",
    "osha",
    "safety",
    // Financial
    "invoice",
    "payment",
    "draw",
    "retainage",
    "lien",
    // Documents
    "plans",
    "specs",
    "blueprint",
    "drawing",
    "contract",
    "agreement",
    // Trades
    "subcontractor",
    "sub",
    "trade",
    "crew",
    "install",
    "repair",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailContact {
    pub email: String,
    pub display_name: Option<String>,
    pub message_count: u32,
    pub construction_score: u32, // 0-100
    pub domain_signals: Vec<String>,
    pub keyword_signals: Vec<String>,
    pub last_seen: Option<i64>, // Unix timestamp
    pub sample_subjects: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailAnalysisResult {
    pub contacts_analyzed: u32,
    pub construction_contacts: u32,
    pub emails_scanned: u32,
    pub contacts: Vec<MailContact>,
}

/// Raw data from Mail.app database
struct RawMailContact {
    email: String,
    display_name: Option<String>,
    message_count: u32,
    subjects: Vec<String>,
    last_date: Option<i64>,
}

/// Get the path to Mail.app's Envelope Index
fn get_mail_db_path() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    
    // Try V10 first (macOS Ventura+), then V9, V8, etc.
    for version in &["V10", "V9", "V8", "V7"] {
        let path = home
            .join("Library")
            .join("Mail")
            .join(version)
            .join("MailData")
            .join("Envelope Index");
        if path.exists() {
            return Some(path);
        }
    }
    None
}

/// Calculate construction score for a contact
fn calculate_construction_score(contact: &RawMailContact) -> (u32, Vec<String>, Vec<String>) {
    let mut domain_signals = Vec::new();
    let mut keyword_signals = HashSet::new();
    
    let email_lower = contact.email.to_lowercase();
    let domain = email_lower.split('@').nth(1).unwrap_or("");
    
    // Check for known construction software domains (high signal)
    for &construction_domain in CONSTRUCTION_DOMAINS {
        if domain.contains(construction_domain) {
            domain_signals.push(format!("Known construction platform: {}", construction_domain));
        }
    }
    
    // Check for construction keywords in domain
    for &keyword in DOMAIN_KEYWORDS {
        if domain.contains(keyword) {
            domain_signals.push(format!("Domain contains: {}", keyword));
        }
    }
    
    // Check display name for construction keywords
    if let Some(ref name) = contact.display_name {
        let name_lower = name.to_lowercase();
        for &keyword in DOMAIN_KEYWORDS {
            if name_lower.contains(keyword) {
                domain_signals.push(format!("Name contains: {}", keyword));
            }
        }
    }
    
    // Check subjects for construction keywords
    for subject in &contact.subjects {
        let subject_lower = subject.to_lowercase();
        for &keyword in SUBJECT_KEYWORDS {
            if subject_lower.contains(keyword) {
                keyword_signals.insert(keyword.to_string());
            }
        }
    }
    
    // Calculate score components
    let domain_score = if !domain_signals.is_empty() {
        // Known construction domains get high score
        if domain_signals.iter().any(|s| s.contains("Known construction platform")) {
            90
        } else {
            (domain_signals.len() as u32 * 25).min(80)
        }
    } else {
        0
    };
    
    let keyword_score = (keyword_signals.len() as u32 * 10).min(60);
    
    // Frequency bonus (more emails = more likely a real contact)
    let frequency_score = match contact.message_count {
        0..=2 => 0,
        3..=10 => 5,
        11..=50 => 10,
        51..=200 => 15,
        _ => 20,
    };
    
    // Combined score (weighted)
    let raw_score = (domain_score * 50 + keyword_score * 35 + frequency_score * 15) / 100;
    let final_score = raw_score.min(100);
    
    (final_score, domain_signals, keyword_signals.into_iter().collect())
}

/// Analyze Mail.app database and return scored contacts
pub fn analyze_mail() -> Result<MailAnalysisResult, String> {
    let db_path = get_mail_db_path()
        .ok_or_else(|| "Mail.app database not found. Make sure you have Mail.app set up.".to_string())?;
    
    eprintln!("[mail_index] Opening Mail database at: {:?}", db_path);
    
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open Mail database: {}. You may need to grant Full Disk Access.", e))?;
    
    // Query to get contacts with their email counts and recent subjects
    let query = r#"
        SELECT 
            a.address,
            a.comment as display_name,
            COUNT(DISTINCT m.ROWID) as message_count,
            MAX(m.date_received) as last_date,
            GROUP_CONCAT(DISTINCT s.subject, '|||') as subjects
        FROM messages m
        JOIN addresses a ON m.sender = a.ROWID
        LEFT JOIN subjects s ON m.subject = s.ROWID
        WHERE m.date_received > strftime('%s', 'now', '-2 years')
        GROUP BY a.address
        HAVING message_count >= 2
        ORDER BY message_count DESC
        LIMIT 5000
    "#;
    
    let mut stmt = conn.prepare(query)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;
    
    let mut raw_contacts: Vec<RawMailContact> = Vec::new();
    let mut total_emails = 0u32;
    
    let rows = stmt.query_map([], |row| {
        let subjects_str: Option<String> = row.get(4)?;
        let subjects: Vec<String> = subjects_str
            .map(|s| s.split("|||").map(|x| x.to_string()).take(20).collect())
            .unwrap_or_default();
        
        Ok(RawMailContact {
            email: row.get(0)?,
            display_name: row.get(1)?,
            message_count: row.get(2)?,
            last_date: row.get(3)?,
            subjects,
        })
    }).map_err(|e| format!("Failed to execute query: {}", e))?;
    
    for row in rows {
        match row {
            Ok(contact) => {
                total_emails += contact.message_count;
                raw_contacts.push(contact);
            }
            Err(e) => {
                eprintln!("[mail_index] Error reading row: {}", e);
            }
        }
    }
    
    eprintln!("[mail_index] Found {} contacts from {} emails", raw_contacts.len(), total_emails);
    
    // Score all contacts
    let mut scored_contacts: Vec<MailContact> = raw_contacts
        .into_iter()
        .map(|raw| {
            let (score, domain_signals, keyword_signals) = calculate_construction_score(&raw);
            MailContact {
                email: raw.email,
                display_name: raw.display_name,
                message_count: raw.message_count,
                construction_score: score,
                domain_signals,
                keyword_signals,
                last_seen: raw.last_date,
                sample_subjects: raw.subjects.into_iter().take(5).collect(),
            }
        })
        .collect();
    
    // Sort by construction score descending
    scored_contacts.sort_by(|a, b| b.construction_score.cmp(&a.construction_score));
    
    let construction_count = scored_contacts
        .iter()
        .filter(|c| c.construction_score >= 20)
        .count() as u32;
    
    eprintln!(
        "[mail_index] Analysis complete: {} likely construction contacts",
        construction_count
    );
    
    Ok(MailAnalysisResult {
        contacts_analyzed: scored_contacts.len() as u32,
        construction_contacts: construction_count,
        emails_scanned: total_emails,
        contacts: scored_contacts,
    })
}

/// Get construction score for a specific email address
pub fn get_contact_score(email: &str) -> Option<u32> {
    let db_path = get_mail_db_path()?;
    let conn = Connection::open(&db_path).ok()?;
    
    let query = r#"
        SELECT 
            a.address,
            a.comment,
            COUNT(DISTINCT m.ROWID) as message_count,
            GROUP_CONCAT(DISTINCT s.subject, '|||') as subjects
        FROM messages m
        JOIN addresses a ON m.sender = a.ROWID
        LEFT JOIN subjects s ON m.subject = s.ROWID
        WHERE LOWER(a.address) = LOWER(?)
        GROUP BY a.address
    "#;
    
    let mut stmt = conn.prepare(query).ok()?;
    let result = stmt.query_row([email], |row| {
        let subjects_str: Option<String> = row.get(3)?;
        let subjects: Vec<String> = subjects_str
            .map(|s| s.split("|||").map(|x| x.to_string()).take(20).collect())
            .unwrap_or_default();
        
        Ok(RawMailContact {
            email: row.get(0)?,
            display_name: row.get(1)?,
            message_count: row.get(2)?,
            last_date: None,
            subjects,
        })
    }).ok()?;
    
    let (score, _, _) = calculate_construction_score(&result);
    Some(score)
}
