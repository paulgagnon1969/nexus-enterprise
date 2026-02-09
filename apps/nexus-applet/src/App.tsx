import { useState, useEffect } from "react";
import { LoginForm } from "./components/LoginForm";
import { ContactList } from "./components/ContactList";
import { getStoredToken, clearToken } from "./lib/auth";

type Tab = "contacts";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("contacts");

  useEffect(() => {
    // Check for existing token on mount
    const token = getStoredToken();
    setIsAuthenticated(!!token);
    setIsLoading(false);
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    clearToken();
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nexus-600"></div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "contacts", label: "Contacts", icon: "👥" },
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-nexus-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <h1 className="font-semibold text-slate-900">Nexus Utilities</h1>
          </div>
          {isAuthenticated && (
            <button
              onClick={handleLogout}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Sign out
            </button>
          )}
        </div>
        
        {/* Tabs */}
        {isAuthenticated && (
          <div className="px-4 flex gap-1 border-t border-slate-100">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-nexus-600 text-nexus-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-4">
        {!isAuthenticated ? (
          <LoginForm onSuccess={handleLoginSuccess} />
        ) : (
          <>
            {activeTab === "contacts" && <ContactList />}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
