import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import VideoAssessment from "./pages/VideoAssessment";
import { ContactList } from "./components/contacts/ContactList";
import { DocumentsTab } from "./components/documents/DocumentsTab";
import Settings from "./pages/Settings";

const NAV_ITEMS = [
  { to: "/", label: "Assessments", icon: "\uD83C\uDFAF" },
  { to: "/contacts", label: "Contacts", icon: "\uD83D\uDC65" },
  { to: "/documents", label: "Documents", icon: "\uD83D\uDCC4" },
  { to: "/settings", label: "Settings", icon: "\u2699\uFE0F" },
];

export default function App() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-nexus-200 border-t-nexus-600" />
        <div className="text-nexus-700 text-lg font-bold tracking-tight">
          NexBRIDGE Connect
        </div>
        <div className="text-sm text-gray-400">Initializing\u2026</div>
      </div>
    );
  }

  if (!auth.authenticated) {
    return <Login onLogin={auth.login} />;
  }

  // Hide sidebar on the /assess route (full-screen video assessment)
  const isAssessRoute = location.pathname === "/assess";

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      {!isAssessRoute && (
        <aside className="flex w-56 flex-col border-r border-slate-200 bg-white">
          {/* Brand */}
          <div className="flex items-center gap-2 px-4 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-nexus-600">
              <span className="text-sm font-bold text-white">N</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">NexBRIDGE Connect</h1>
              <span className="text-[10px] text-slate-400">v1.0.0</span>
            </div>
          </div>

          {/* Nav links */}
          <nav className="flex-1 space-y-1 px-2 py-2">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-nexus-50 text-nexus-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`
                }
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* User footer */}
          <div className="border-t border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-xs text-slate-600">{auth.userEmail}</p>
                {auth.companyName && (
                  <p className="truncate text-[10px] text-slate-400">{auth.companyName}</p>
                )}
              </div>
              <button
                onClick={auth.logout}
                className="shrink-0 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                Sign out
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {isAssessRoute && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-2">
            <NavLink to="/" className="text-sm text-nexus-600 hover:text-nexus-700">
              \u2190 Back
            </NavLink>
            <span className="text-xs text-slate-400">{auth.userEmail}</span>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/assess" element={<VideoAssessment />} />
          <Route path="/contacts" element={<div className="p-4 h-full"><ContactList /></div>} />
          <Route path="/documents" element={<div className="p-4 h-full"><DocumentsTab /></div>} />
          <Route path="/settings" element={<div className="p-4"><Settings /></div>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
