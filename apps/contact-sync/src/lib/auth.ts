const TOKEN_KEY = "nexus_auth_token";
const API_URL_KEY = "nexus_api_url";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getApiUrl(): string {
  return localStorage.getItem(API_URL_KEY) || "https://nexus-api-979156454944.us-central1.run.app";
}

export function getStoredApiUrls(): string[] {
  const stored = localStorage.getItem("nexus_api_urls_history");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }
  return [];
}

export function addApiUrlToHistory(url: string): void {
  const history = getStoredApiUrls();
  // Remove if exists, add to front
  const filtered = history.filter(u => u !== url);
  filtered.unshift(url);
  // Keep max 5
  localStorage.setItem("nexus_api_urls_history", JSON.stringify(filtered.slice(0, 5)));
}

export function setApiUrl(url: string): void {
  localStorage.setItem(API_URL_KEY, url);
}
