import { useState, useEffect, type FormEvent } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { Store } from "@tauri-apps/plugin-store";
import type { LoginResponse } from "../lib/api";

const DEFAULT_API_URL = "https://nexus-api-wswbn2e6ta-uc.a.run.app";
const CREDS_STORE = "nexbridge-saved-creds.json";

interface Props {
  onLogin: (apiUrl: string, email: string, password: string) => Promise<LoginResponse>;
}

type ApiStatus = "checking" | "online" | "offline" | "error";

export default function Login({ onLogin }: Props) {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Load saved credentials on mount
  useEffect(() => {
    (async () => {
      try {
        const store = await Store.load(CREDS_STORE);
        const saved = await store.get<{ email: string; password: string; apiUrl: string }>("creds");
        if (saved) {
          setEmail(saved.email);
          setPassword(saved.password);
          if (saved.apiUrl) setApiUrl(saved.apiUrl);
        }
      } catch {
        // No saved creds — that's fine
      }
    })();
  }, []);

  // Check API health whenever apiUrl changes
  useEffect(() => {
    let cancelled = false;
    async function checkHealth() {
      setApiStatus("checking");
      setApiLatency(null);
      setApiError(null);
      const url = apiUrl.replace(/\/$/, "");
      try {
        const start = Date.now();
        const res = await tauriFetch(`${url}/health`, { method: "GET" });
        const ms = Date.now() - start;
        if (cancelled) return;
        if (res.ok) {
          setApiStatus("online");
          setApiLatency(ms);
          setApiError(null);
        } else {
          setApiStatus("error");
          setApiError(`HTTP ${res.status}`);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setApiStatus("offline");
          setApiError(msg);
        }
      }
    }
    const timer = setTimeout(checkHealth, 300); // debounce
    return () => { cancelled = true; clearTimeout(timer); };
  }, [apiUrl]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin(apiUrl, email, password);
      // Save creds on success if remember-me is checked
      if (rememberMe) {
        const store = await Store.load(CREDS_STORE);
        await store.set("creds", { email, password, apiUrl });
        await store.save();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  const statusDot = {
    checking: "bg-yellow-400 animate-pulse",
    online: "bg-green-500",
    offline: "bg-red-500",
    error: "bg-red-500",
  }[apiStatus];

  const statusLabel = {
    checking: "Checking…",
    online: `Online${apiLatency ? ` (${apiLatency}ms)` : ""}`,
    offline: `Unreachable${apiError ? `: ${apiError}` : ""}`,
    error: `Error${apiError ? `: ${apiError}` : ""}`,
  }[apiStatus];

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md">
        <h1 className="text-nexus-700 mb-1 text-2xl font-bold">NexBRIDGE Connect</h1>
        <p className="mb-6 text-sm text-gray-500">
          Sign in with your NCC credentials
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              API URL
            </label>
            <input
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm focus:border-nexus-500 focus:outline-none focus:ring-1 focus:ring-nexus-500"
              placeholder="https://nexus-api-xxx.a.run.app"
            />
            <div className="mt-1 flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full ${statusDot}`} />
              <span className="text-xs text-gray-500">{statusLabel}</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full rounded border px-3 py-2 text-sm focus:border-nexus-500 focus:outline-none focus:ring-1 focus:ring-nexus-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded border px-3 py-2 pr-10 text-sm focus:border-nexus-500 focus:outline-none focus:ring-1 focus:ring-nexus-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded border-gray-300"
            />
            Remember me
          </label>

          {error && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || apiStatus === "offline"}
            className="w-full rounded bg-nexus-600 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-700 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
