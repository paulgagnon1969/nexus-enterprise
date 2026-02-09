use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadRequest {
    pub document_id: String,
    pub html_content: String,
    pub title: String,
    pub category: String,
    pub original_format: String,
    pub word_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadResult {
    pub success: bool,
    pub document_id: String,
    pub nexus_doc_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadProgress {
    pub total: u32,
    pub completed: u32,
    pub failed: u32,
    pub current_file: Option<String>,
    pub is_paused: bool,
}

pub struct UploadQueue {
    client: Client,
    pub paused: Arc<AtomicBool>,
    pub total: Arc<AtomicU32>,
    pub completed: Arc<AtomicU32>,
    pub failed: Arc<AtomicU32>,
}

impl UploadQueue {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            paused: Arc::new(AtomicBool::new(false)),
            total: Arc::new(AtomicU32::new(0)),
            completed: Arc::new(AtomicU32::new(0)),
            failed: Arc::new(AtomicU32::new(0)),
        }
    }

    pub fn get_progress(&self) -> UploadProgress {
        UploadProgress {
            total: self.total.load(Ordering::SeqCst),
            completed: self.completed.load(Ordering::SeqCst),
            failed: self.failed.load(Ordering::SeqCst),
            current_file: None,
            is_paused: self.paused.load(Ordering::SeqCst),
        }
    }

    pub fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
    }

    pub fn resume(&self) {
        self.paused.store(false, Ordering::SeqCst);
    }

    pub fn reset(&self) {
        self.total.store(0, Ordering::SeqCst);
        self.completed.store(0, Ordering::SeqCst);
        self.failed.store(0, Ordering::SeqCst);
    }

    /// Upload a single document to Nexus API
    pub async fn upload_document(
        &self,
        api_url: &str,
        token: &str,
        request: UploadRequest,
    ) -> UploadResult {
        // Check if paused
        if self.paused.load(Ordering::SeqCst) {
            return UploadResult {
                success: false,
                document_id: request.document_id,
                nexus_doc_id: None,
                error: Some("Upload paused".to_string()),
            };
        }

        let url = format!("{}/document-import/upload-html", api_url);
        
        #[derive(Serialize)]
        struct ApiPayload {
            html_content: String,
            title: String,
            category: String,
            original_format: String,
            word_count: u32,
        }

        let payload = ApiPayload {
            html_content: request.html_content,
            title: request.title,
            category: request.category,
            original_format: request.original_format,
            word_count: request.word_count,
        };

        match self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    #[derive(Deserialize)]
                    struct ApiResponse {
                        id: Option<String>,
                        #[serde(rename = "documentId")]
                        document_id: Option<String>,
                    }

                    match response.json::<ApiResponse>().await {
                        Ok(api_response) => {
                            self.completed.fetch_add(1, Ordering::SeqCst);
                            UploadResult {
                                success: true,
                                document_id: request.document_id,
                                nexus_doc_id: api_response.id.or(api_response.document_id),
                                error: None,
                            }
                        }
                        Err(e) => {
                            // Response was success but couldn't parse - still count as success
                            self.completed.fetch_add(1, Ordering::SeqCst);
                            UploadResult {
                                success: true,
                                document_id: request.document_id,
                                nexus_doc_id: None,
                                error: Some(format!("Response parse warning: {}", e)),
                            }
                        }
                    }
                } else {
                    let status = response.status();
                    let error_text = response.text().await.unwrap_or_default();
                    self.failed.fetch_add(1, Ordering::SeqCst);
                    UploadResult {
                        success: false,
                        document_id: request.document_id,
                        nexus_doc_id: None,
                        error: Some(format!("HTTP {}: {}", status, error_text)),
                    }
                }
            }
            Err(e) => {
                self.failed.fetch_add(1, Ordering::SeqCst);
                UploadResult {
                    success: false,
                    document_id: request.document_id,
                    nexus_doc_id: None,
                    error: Some(format!("Request failed: {}", e)),
                }
            }
        }
    }
}

impl Default for UploadQueue {
    fn default() -> Self {
        Self::new()
    }
}
