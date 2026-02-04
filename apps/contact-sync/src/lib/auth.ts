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
  return localStorage.getItem(API_URL_KEY) || "https://api.nexus-enterprise.com";
}

export function setApiUrl(url: string): void {
  localStorage.setItem(API_URL_KEY, url);
}
