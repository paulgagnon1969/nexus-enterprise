import { useState } from "react";
import { login } from "../lib/api";
import { setStoredToken, setApiUrl, getApiUrl } from "../lib/auth";

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiUrl, setApiUrlState] = useState(getApiUrl());
  const [showApiUrl, setShowApiUrl] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Save API URL first
      setApiUrl(apiUrl);
      
      const result = await login(email, password);
      setStoredToken(result.token);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-nexus-600 flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-2xl">N</span>
        </div>
        <h2 className="text-xl font-semibold text-slate-900">
          Sign in to Nexus
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Use your Nexus account to sync contacts
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-nexus-500 focus:border-transparent"
            placeholder="you@company.com"
            required
            autoFocus
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-nexus-500 focus:border-transparent"
            placeholder="••••••••"
            required
          />
        </div>

        {showApiUrl && (
          <div>
            <label
              htmlFor="apiUrl"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              API URL
            </label>
            <input
              id="apiUrl"
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrlState(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-nexus-500 focus:border-transparent text-sm"
              placeholder="https://api.nexus-enterprise.com"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-nexus-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-nexus-700 focus:outline-none focus:ring-2 focus:ring-nexus-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Signing in..." : "Sign in"}
        </button>

        <button
          type="button"
          onClick={() => setShowApiUrl(!showApiUrl)}
          className="w-full text-sm text-slate-500 hover:text-slate-700"
        >
          {showApiUrl ? "Hide advanced options" : "Advanced options"}
        </button>
      </form>
    </div>
  );
}
