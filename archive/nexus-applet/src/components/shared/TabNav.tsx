type TabId = "contacts" | "documents";

interface TabNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: "contacts", label: "Contacts", icon: "👥" },
  { id: "documents", label: "Documents", icon: "📄" },
];

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <nav className="flex border-b border-slate-200 bg-white">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`
            flex-1 px-4 py-3 text-sm font-medium transition-colors
            flex items-center justify-center gap-2
            ${
              activeTab === tab.id
                ? "text-nexus-600 border-b-2 border-nexus-600 bg-nexus-50"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }
          `}
        >
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

export type { TabId };
