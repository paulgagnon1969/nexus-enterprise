use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "UPPERCASE")]
pub enum DocumentStatus {
    Pending,
    Import,
    Ignore,
    Uploaded,
    Failed,
}

impl DocumentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            DocumentStatus::Pending => "PENDING",
            DocumentStatus::Import => "IMPORT",
            DocumentStatus::Ignore => "IGNORE",
            DocumentStatus::Uploaded => "UPLOADED",
            DocumentStatus::Failed => "FAILED",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "IMPORT" => DocumentStatus::Import,
            "IGNORE" => DocumentStatus::Ignore,
            "UPLOADED" => DocumentStatus::Uploaded,
            "FAILED" => DocumentStatus::Failed,
            _ => DocumentStatus::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexedDocument {
    pub id: String,
    pub file_path: String,
    pub file_name: String,
    pub file_type: Option<String>,
    pub file_size: i64,
    pub file_hash: Option<String>,
    pub breadcrumb: Vec<String>,
    pub status: DocumentStatus,
    pub error_message: Option<String>,
    pub scanned_at: String,
    pub updated_at: String,
    pub uploaded_at: Option<String>,
    pub nexus_doc_id: Option<String>,
}

pub struct DocumentIndex {
    conn: Mutex<Connection>,
}

impl DocumentIndex {
    pub fn new(db_path: &PathBuf) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(db_path)?;
        
        // Create tables if they don't exist
        conn.execute(
            "CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                file_path TEXT NOT NULL UNIQUE,
                file_name TEXT NOT NULL,
                file_type TEXT,
                file_size INTEGER,
                file_hash TEXT,
                breadcrumb TEXT,
                status TEXT DEFAULT 'PENDING',
                error_message TEXT,
                scanned_at TEXT,
                updated_at TEXT,
                uploaded_at TEXT,
                nexus_doc_id TEXT
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_status ON documents(status)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_file_path ON documents(file_path)",
            [],
        )?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn upsert_document(&self, doc: &IndexedDocument) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let breadcrumb_json = serde_json::to_string(&doc.breadcrumb).unwrap_or_default();
        
        conn.execute(
            "INSERT INTO documents (id, file_path, file_name, file_type, file_size, file_hash, breadcrumb, status, error_message, scanned_at, updated_at, uploaded_at, nexus_doc_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
             ON CONFLICT(file_path) DO UPDATE SET
                file_name = excluded.file_name,
                file_type = excluded.file_type,
                file_size = excluded.file_size,
                file_hash = excluded.file_hash,
                breadcrumb = excluded.breadcrumb,
                updated_at = excluded.updated_at",
            params![
                doc.id,
                doc.file_path,
                doc.file_name,
                doc.file_type,
                doc.file_size,
                doc.file_hash,
                breadcrumb_json,
                doc.status.as_str(),
                doc.error_message,
                doc.scanned_at,
                doc.updated_at,
                doc.uploaded_at,
                doc.nexus_doc_id,
            ],
        )?;
        Ok(())
    }

    pub fn update_status(&self, id: &str, status: DocumentStatus, error_message: Option<&str>) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        
        conn.execute(
            "UPDATE documents SET status = ?1, error_message = ?2, updated_at = ?3 WHERE id = ?4",
            params![status.as_str(), error_message, now, id],
        )?;
        Ok(())
    }

    pub fn mark_uploaded(&self, id: &str, nexus_doc_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        
        conn.execute(
            "UPDATE documents SET status = 'UPLOADED', nexus_doc_id = ?1, uploaded_at = ?2, updated_at = ?2 WHERE id = ?3",
            params![nexus_doc_id, now, id],
        )?;
        Ok(())
    }

    pub fn get_all_documents(&self) -> Result<Vec<IndexedDocument>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, file_path, file_name, file_type, file_size, file_hash, breadcrumb, status, error_message, scanned_at, updated_at, uploaded_at, nexus_doc_id
             FROM documents ORDER BY file_path"
        )?;

        let docs = stmt.query_map([], |row| {
            let breadcrumb_json: String = row.get(6)?;
            let breadcrumb: Vec<String> = serde_json::from_str(&breadcrumb_json).unwrap_or_default();
            let status_str: String = row.get(7)?;
            
            Ok(IndexedDocument {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_name: row.get(2)?,
                file_type: row.get(3)?,
                file_size: row.get(4)?,
                file_hash: row.get(5)?,
                breadcrumb,
                status: DocumentStatus::from_str(&status_str),
                error_message: row.get(8)?,
                scanned_at: row.get(9)?,
                updated_at: row.get(10)?,
                uploaded_at: row.get(11)?,
                nexus_doc_id: row.get(12)?,
            })
        })?;

        docs.collect()
    }

    pub fn get_documents_by_status(&self, status: DocumentStatus) -> Result<Vec<IndexedDocument>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, file_path, file_name, file_type, file_size, file_hash, breadcrumb, status, error_message, scanned_at, updated_at, uploaded_at, nexus_doc_id
             FROM documents WHERE status = ?1 ORDER BY file_path"
        )?;

        let docs = stmt.query_map([status.as_str()], |row| {
            let breadcrumb_json: String = row.get(6)?;
            let breadcrumb: Vec<String> = serde_json::from_str(&breadcrumb_json).unwrap_or_default();
            let status_str: String = row.get(7)?;
            
            Ok(IndexedDocument {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_name: row.get(2)?,
                file_type: row.get(3)?,
                file_size: row.get(4)?,
                file_hash: row.get(5)?,
                breadcrumb,
                status: DocumentStatus::from_str(&status_str),
                error_message: row.get(8)?,
                scanned_at: row.get(9)?,
                updated_at: row.get(10)?,
                uploaded_at: row.get(11)?,
                nexus_doc_id: row.get(12)?,
            })
        })?;

        docs.collect()
    }

    pub fn get_stats(&self) -> Result<DocumentStats, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        
        let total: i64 = conn.query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))?;
        let pending: i64 = conn.query_row("SELECT COUNT(*) FROM documents WHERE status = 'PENDING'", [], |row| row.get(0))?;
        let import: i64 = conn.query_row("SELECT COUNT(*) FROM documents WHERE status = 'IMPORT'", [], |row| row.get(0))?;
        let ignore: i64 = conn.query_row("SELECT COUNT(*) FROM documents WHERE status = 'IGNORE'", [], |row| row.get(0))?;
        let uploaded: i64 = conn.query_row("SELECT COUNT(*) FROM documents WHERE status = 'UPLOADED'", [], |row| row.get(0))?;
        let failed: i64 = conn.query_row("SELECT COUNT(*) FROM documents WHERE status = 'FAILED'", [], |row| row.get(0))?;

        Ok(DocumentStats {
            total: total as u32,
            pending: pending as u32,
            import: import as u32,
            ignore: ignore as u32,
            uploaded: uploaded as u32,
            failed: failed as u32,
        })
    }

    pub fn delete_document(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM documents WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn ignore_documents_in_folder(&self, folder_path: &str) -> Result<u32, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        // Use LIKE to match all files in folder and subfolders
        let pattern = format!("{}%", folder_path);
        let updated = conn.execute(
            "UPDATE documents SET status = 'IGNORE', updated_at = ?1 WHERE file_path LIKE ?2 AND status != 'UPLOADED'",
            params![now, pattern],
        )?;
        Ok(updated as u32)
    }

    pub fn import_documents_in_folder(&self, folder_path: &str) -> Result<u32, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        // Use LIKE to match all files in folder and subfolders
        let pattern = format!("{}%", folder_path);
        let updated = conn.execute(
            "UPDATE documents SET status = 'IMPORT', updated_at = ?1 WHERE file_path LIKE ?2 AND status NOT IN ('UPLOADED', 'IGNORE')",
            params![now, pattern],
        )?;
        Ok(updated as u32)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentStats {
    pub total: u32,
    pub pending: u32,
    pub import: u32,
    pub ignore: u32,
    pub uploaded: u32,
    pub failed: u32,
}
