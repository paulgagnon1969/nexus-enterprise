import type { SyncSettings } from "../hooks/useSettings";

interface SettingsPanelProps {
  settings: SyncSettings;
  onAutoSyncChange: (enabled: boolean) => void;
  onIntervalChange: (minutes: number) => void;
  onLaunchAtStartupChange: (enabled: boolean) => void;
  selectedCount: number;
}

export function SettingsPanel({
  settings,
  onAutoSyncChange,
  onIntervalChange,
  onLaunchAtStartupChange,
  selectedCount,
}: SettingsPanelProps) {
  const formatLastSync = (isoString: string | null) => {
    if (!isoString) return "Never";
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 space-y-4">
      <h3 className="font-semibold text-slate-900">Sync Settings</h3>

      {/* Auto-sync toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-800">Auto-sync</p>
          <p className="text-sm text-slate-500">
            Automatically sync selected contacts
          </p>
        </div>
        <button
          onClick={() => onAutoSyncChange(!settings.autoSyncEnabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.autoSyncEnabled ? "bg-nexus-600" : "bg-slate-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.autoSyncEnabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Sync interval (only shown when auto-sync is on) */}
      {settings.autoSyncEnabled && (
        <div className="pl-4 border-l-2 border-nexus-100 space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Sync every
            </label>
            <select
              value={settings.syncIntervalMinutes}
              onChange={(e) => onIntervalChange(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500"
            >
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={240}>4 hours</option>
              <option value={1440}>Daily</option>
            </select>
          </div>

          {/* Launch at startup */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-700">Launch at startup</p>
            <button
              onClick={() => onLaunchAtStartupChange(!settings.launchAtStartup)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                settings.launchAtStartup ? "bg-nexus-600" : "bg-slate-200"
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  settings.launchAtStartup ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Status */}
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Selected contacts:</span>
              <span className="font-medium">{selectedCount}</span>
            </div>
            <div className="flex justify-between text-slate-600 mt-1">
              <span>Last synced:</span>
              <span className="font-medium">
                {formatLastSync(settings.lastSyncAt)}
              </span>
            </div>
            {settings.autoSyncEnabled && selectedCount === 0 && (
              <p className="text-amber-600 mt-2 text-xs">
                Select contacts below to enable auto-sync
              </p>
            )}
          </div>
        </div>
      )}

      {/* Manual mode indicator */}
      {!settings.autoSyncEnabled && (
        <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3">
          Manual mode: Select contacts and click "Sync" to upload them.
        </p>
      )}
    </div>
  );
}
