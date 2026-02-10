export function getApiBaseUrl(): string {
  // Expo supports EXPO_PUBLIC_* env vars that are inlined at build time.
  const v = process.env.EXPO_PUBLIC_API_BASE_URL;

  // Repo default (.env) runs the API on 8001 in development.
  return (v && v.trim()) || "http://localhost:8001";
}
