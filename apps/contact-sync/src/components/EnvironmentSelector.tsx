import { useState, useEffect } from "react";
import { getApiUrl, setApiUrl } from "../lib/auth";

interface Environment {
  id: string;
  name: string;
  url: string;
  color: string;
}

const ENVIRONMENTS: Environment[] = [
  {
    id: "prod",
    name: "Production",
    url: "https://api.nexus-enterprise.com",
    color: "bg-green-500",
  },
  {
    id: "dev",
    name: "Development",
    url: "http://localhost:3001",
    color: "bg-amber-500",
  },
  {
    id: "custom",
    name: "Custom",
    url: "",
    color: "bg-purple-500",
  },
];

interface EnvironmentSelectorProps {
  onEnvironmentChange?: (env: Environment) => void;
}

export function EnvironmentSelector({ onEnvironmentChange }: EnvironmentSelectorProps) {
  const [currentUrl, setCurrentUrl] = useState(getApiUrl());
  const [isExpanded, setIsExpanded] = useState(false);
  const [customUrl, setCustomUrl] = useState("");

  const currentEnv =
    ENVIRONMENTS.find((e) => e.url === currentUrl && e.id !== "custom") ||
    ENVIRONMENTS.find((e) => e.id === "custom")!;

  useEffect(() => {
    if (currentEnv.id === "custom") {
      setCustomUrl(currentUrl);
    }
  }, [currentEnv, currentUrl]);

  const selectEnvironment = (env: Environment) => {
    if (env.id === "custom") {
      // Don't close, let them enter URL
      return;
    }
    setApiUrl(env.url);
    setCurrentUrl(env.url);
    setIsExpanded(false);
    onEnvironmentChange?.(env);
  };

  const saveCustomUrl = () => {
    if (customUrl.trim()) {
      setApiUrl(customUrl.trim());
      setCurrentUrl(customUrl.trim());
      setIsExpanded(false);
      onEnvironmentChange?.(ENVIRONMENTS.find((e) => e.id === "custom")!);
    }
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${currentEnv.color}`} />
          <span className="text-sm font-medium text-slate-700">
            {currentEnv.name}
          </span>
          {currentEnv.id === "dev" && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              DEV
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
          <p className="text-xs text-slate-500 mb-2">Sync contacts to:</p>
          
          {ENVIRONMENTS.filter((e) => e.id !== "custom").map((env) => (
            <button
              key={env.id}
              onClick={() => selectEnvironment(env)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                currentEnv.id === env.id
                  ? "bg-nexus-50 text-nexus-700"
                  : "hover:bg-slate-50 text-slate-700"
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${env.color}`} />
              <div className="flex-1">
                <span className="font-medium">{env.name}</span>
                <span className="text-xs text-slate-400 ml-2">{env.url}</span>
              </div>
              {currentEnv.id === env.id && (
                <svg
                  className="w-4 h-4 text-nexus-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}

          {/* Custom URL */}
          <div className="pt-2 border-t border-slate-100">
            <label className="block text-xs text-slate-500 mb-1">
              Custom API URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://your-api.example.com"
                className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500"
              />
              <button
                onClick={saveCustomUrl}
                disabled={!customUrl.trim()}
                className="px-3 py-1.5 bg-nexus-600 text-white text-sm rounded-lg hover:bg-nexus-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Use
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
