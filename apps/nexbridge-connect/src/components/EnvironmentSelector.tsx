import { useState } from "react";
import { getCachedApiUrl } from "../lib/auth";

interface Environment {
  id: string;
  name: string;
  url: string;
  color: string;
}

const DEFAULT_ENVIRONMENTS: Environment[] = [
  {
    id: "prod",
    name: "Production",
    url: "https://staging-api.nfsgrp.com",
    color: "bg-green-500",
  },
  {
    id: "dev",
    name: "Development",
    url: "http://localhost:3001",
    color: "bg-amber-500",
  },
];

interface EnvironmentSelectorProps {
  onEnvironmentChange?: (env: Environment) => void;
}

export function EnvironmentSelector({ onEnvironmentChange }: EnvironmentSelectorProps) {
  const [currentUrl] = useState(getCachedApiUrl());
  const [isExpanded, setIsExpanded] = useState(false);

  // Find matching environment or mark as custom
  const currentEnv = DEFAULT_ENVIRONMENTS.find((e) => e.url === currentUrl) || {
    id: "custom",
    name: "Custom",
    url: currentUrl,
    color: "bg-purple-500",
  };

  const selectEnvironment = (env: Environment) => {
    // URL is now managed by the Login page — this is display-only
    setIsExpanded(false);
    onEnvironmentChange?.(env);
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
          
          {DEFAULT_ENVIRONMENTS.map((env) => (
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

          {/* Tip */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-400">API URL is set during login. Sign out to change it.</p>
          </div>
        </div>
      )}
    </div>
  );
}
