import { useState, useEffect } from "react";
import { LoginForm } from "./components/LoginForm";
import { ContactList } from "./components/contacts/ContactList";
import { DocumentsTab } from "./components/documents/DocumentsTab";
import { TabNav, type TabId } from "./components/shared/TabNav";
import { getStoredToken, clearToken } from "./lib/auth";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("contacts");

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

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-nexus-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <h1 className="font-semibold text-slate-900">NEXUS Applet</h1>
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
      </header>

      {/* Tab Navigation - only show when authenticated */}
      {isAuthenticated && (
        <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-hidden p-4">
        {!isAuthenticated ? (
          <LoginForm onSuccess={handleLoginSuccess} />
        ) : activeTab === "contacts" ? (
          <ContactList />
        ) : (
          <DocumentsTab />
        )}
      </main>
    </div>
  );
}

export default App;
