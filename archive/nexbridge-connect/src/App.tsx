import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import VideoAssessment from "./pages/VideoAssessment";

export default function App() {
  const auth = useAuth();

  if (auth.loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-nexus-200 border-t-nexus-600" />
        <div className="text-nexus-700 text-lg font-bold tracking-tight">NexBRIDGE Connect</div>
        <div className="text-sm text-gray-400">Initializing…</div>
      </div>
    );
  }

  if (!auth.authenticated) {
    return <Login onLogin={auth.login} />;
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-nexus-700 text-lg font-bold tracking-tight">
            NexBRIDGE Connect
          </span>
          {auth.companyName && (
            <span className="rounded bg-nexus-50 px-2 py-0.5 text-xs text-nexus-600">
              {auth.companyName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{auth.userEmail}</span>
          <button
            onClick={auth.logout}
            className="rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/assess" element={<VideoAssessment />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
