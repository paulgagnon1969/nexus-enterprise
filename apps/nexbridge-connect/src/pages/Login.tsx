import { useState, type FormEvent } from "react";
import type { LoginResponse } from "../lib/api";

const DEFAULT_API_URL = "https://nexus-api-wswbn2e6ta-uc.a.run.app";

interface Props {
  onLogin: (apiUrl: string, email: string, password: string) => Promise<LoginResponse>;
}

export default function Login({ onLogin }: Props) {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin(apiUrl, email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

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
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded border px-3 py-2 text-sm focus:border-nexus-500 focus:outline-none focus:ring-1 focus:ring-nexus-500"
            />
          </div>

          {error && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-nexus-600 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-700 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
