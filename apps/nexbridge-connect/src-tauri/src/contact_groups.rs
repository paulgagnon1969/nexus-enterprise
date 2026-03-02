use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContactGroup {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContactGroupMembership {
    pub contact_id: String,
    pub group_id: String,
    pub added_at: String,
}

pub struct ContactGroupIndex {
    conn: Mutex<Connection>,
}

impl ContactGroupIndex {
    pub fn new(db_path: &PathBuf) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(db_path)?;
        
        // Create groups table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS contact_groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                color TEXT,
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        // Create contact-group membership table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS contact_group_members (
                contact_id TEXT NOT NULL,
                group_id TEXT NOT NULL,
                added_at TEXT NOT NULL,
                PRIMARY KEY (contact_id, group_id),
                FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Create indexes
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_group_members_contact ON contact_group_members(contact_id)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_group_members_group ON contact_group_members(group_id)",
            [],
        )?;

        // Create ignored contacts table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS ignored_contacts (
                contact_id TEXT PRIMARY KEY,
                ignored_at TEXT NOT NULL
            )",
            [],
        )?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    // ============ Group CRUD ============

    pub fn create_group(&self, name: &str, description: Option<&str>, color: Option<&str>) -> Result<ContactGroup, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO contact_groups (id, name, description, color, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, name, description, color, now],
        )?;

        Ok(ContactGroup {
            id,
            name: name.to_string(),
            description: description.map(|s| s.to_string()),
            color: color.map(|s| s.to_string()),
            created_at: now,
        })
    }

    pub fn update_group(&self, id: &str, name: &str, description: Option<&str>, color: Option<&str>) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE contact_groups SET name = ?1, description = ?2, color = ?3 WHERE id = ?4",
            params![name, description, color, id],
        )?;
        Ok(())
    }

    pub fn delete_group(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        // Members are deleted via CASCADE
        conn.execute("DELETE FROM contact_groups WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn list_groups(&self) -> Result<Vec<ContactGroup>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, color, created_at FROM contact_groups ORDER BY name"
        )?;

        let groups = stmt.query_map([], |row| {
            Ok(ContactGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;

        groups.collect()
    }

    pub fn get_group(&self, id: &str) -> Result<Option<ContactGroup>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, color, created_at FROM contact_groups WHERE id = ?1"
        )?;

        let mut rows = stmt.query([id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(ContactGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
            }))
        } else {
            Ok(None)
        }
    }

    // ============ Membership Operations ============

    pub fn add_contacts_to_group(&self, contact_ids: &[String], group_id: &str) -> Result<u32, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        let mut added = 0;

        for contact_id in contact_ids {
            let result = conn.execute(
                "INSERT OR IGNORE INTO contact_group_members (contact_id, group_id, added_at) VALUES (?1, ?2, ?3)",
                params![contact_id, group_id, now],
            );
            if let Ok(n) = result {
                added += n as u32;
            }
        }

        Ok(added)
    }

    pub fn remove_contacts_from_group(&self, contact_ids: &[String], group_id: &str) -> Result<u32, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut removed = 0;

        for contact_id in contact_ids {
            let result = conn.execute(
                "DELETE FROM contact_group_members WHERE contact_id = ?1 AND group_id = ?2",
                params![contact_id, group_id],
            );
            if let Ok(n) = result {
                removed += n as u32;
            }
        }

        Ok(removed)
    }

    pub fn get_contacts_in_group(&self, group_id: &str) -> Result<Vec<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT contact_id FROM contact_group_members WHERE group_id = ?1"
        )?;

        let ids = stmt.query_map([group_id], |row| row.get(0))?;
        ids.collect()
    }

    pub fn get_groups_for_contact(&self, contact_id: &str) -> Result<Vec<ContactGroup>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT g.id, g.name, g.description, g.color, g.created_at 
             FROM contact_groups g
             INNER JOIN contact_group_members m ON g.id = m.group_id
             WHERE m.contact_id = ?1
             ORDER BY g.name"
        )?;

        let groups = stmt.query_map([contact_id], |row| {
            Ok(ContactGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;

        groups.collect()
    }

    pub fn get_group_member_counts(&self) -> Result<Vec<(String, u32)>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT group_id, COUNT(*) as count FROM contact_group_members GROUP BY group_id"
        )?;

        let counts = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?))
        })?;

        counts.collect()
    }

    // ============ Ignored Contacts ============

    pub fn ignore_contacts(&self, contact_ids: &[String]) -> Result<u32, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        let mut ignored = 0;

        for contact_id in contact_ids {
            let result = conn.execute(
                "INSERT OR IGNORE INTO ignored_contacts (contact_id, ignored_at) VALUES (?1, ?2)",
                params![contact_id, now],
            );
            if let Ok(n) = result {
                ignored += n as u32;
            }
        }

        Ok(ignored)
    }

    pub fn unignore_contacts(&self, contact_ids: &[String]) -> Result<u32, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut unignored = 0;

        for contact_id in contact_ids {
            let result = conn.execute(
                "DELETE FROM ignored_contacts WHERE contact_id = ?1",
                params![contact_id],
            );
            if let Ok(n) = result {
                unignored += n as u32;
            }
        }

        Ok(unignored)
    }

    pub fn get_ignored_contacts(&self) -> Result<Vec<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT contact_id FROM ignored_contacts")?;
        let ids = stmt.query_map([], |row| row.get(0))?;
        ids.collect()
    }

    pub fn is_contact_ignored(&self, contact_id: &str) -> Result<bool, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM ignored_contacts WHERE contact_id = ?1",
            [contact_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }
}
