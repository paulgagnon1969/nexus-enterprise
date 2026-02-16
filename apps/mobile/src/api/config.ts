// API Configuration
// PRODUCTION URL - hardcoded for release builds
// For local dev, run: EXPO_PUBLIC_API_BASE_URL=http://localhost:8001 npx expo start

const PRODUCTION_API = "https://nexus-api-979156454944.us-central1.run.app";

export function getApiBaseUrl(): string {
  // Allow override via env var for local development
  if (__DEV__ && process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }

  // Always use production for release builds
  return PRODUCTION_API;
}
