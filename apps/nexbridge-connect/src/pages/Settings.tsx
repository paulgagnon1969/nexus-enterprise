import { useSettings } from "../hooks/useSettings";
import { SettingsPanel } from "../components/SettingsPanel";
import { EnvironmentSelector } from "../components/EnvironmentSelector";

export default function Settings() {
  const {
    settings,
    isLoading,
    setAutoSync,
    setSyncInterval,
    setLaunchAtStartup,
  } = useSettings();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-nexus-200 border-t-nexus-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h2 className="text-lg font-semibold text-slate-900">Settings</h2>

      <EnvironmentSelector />

      <SettingsPanel
        settings={settings}
        onAutoSyncChange={setAutoSync}
        onIntervalChange={setSyncInterval}
        onLaunchAtStartupChange={setLaunchAtStartup}
        selectedCount={settings.selectedContactIds.length}
      />
    </div>
  );
}
