import { open } from "@tauri-apps/plugin-shell";
import { getCachedApiUrl } from "../lib/auth";

interface UpsellCardProps {
  moduleCode: string;
  moduleName: string;
  description: string;
  price: string;
}

/**
 * Inline upsell card shown when a user accesses a feature they don't
 * have enabled. Directs them to the NCC billing page to subscribe.
 */
export function UpsellCard({ moduleCode, moduleName, description, price }: UpsellCardProps) {
  const handleEnable = () => {
    const baseUrl = getCachedApiUrl().replace("/api", "").replace(":8000", ":3001").replace(":8001", ":3001");
    const settingsUrl = `${baseUrl}/settings/company?tab=membership&highlight=${moduleCode}`;
    open(settingsUrl).catch(() => {
      // Fallback: just open the base settings URL
      open(`${baseUrl}/settings/company`).catch(() => {});
    });
  };

  return (
    <div className="mx-auto max-w-md mt-16 text-center">
      <div className="rounded-xl border-2 border-dashed border-nexus-200 bg-white p-8 shadow-sm">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-lg font-semibold text-slate-900">{moduleName}</h2>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
        <p className="mt-3 text-2xl font-bold text-nexus-700">{price}</p>
        <p className="text-xs text-slate-400">per seat / month</p>
        <button
          onClick={handleEnable}
          className="mt-6 rounded-lg bg-nexus-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-nexus-700 transition-colors"
        >
          Enable Module
        </button>
        <p className="mt-3 text-xs text-slate-400">
          Opens NCC Settings → Membership in your browser
        </p>
      </div>
    </div>
  );
}

/** Module metadata for upsell cards. */
export const MODULE_INFO: Record<string, { name: string; description: string; price: string }> = {
  NEXBRIDGE_ASSESS: {
    name: "Video Assessment",
    description: "AI-powered property assessment from video. Extract frames, analyze damage with Gemini AI, and teach the model with Zoom & Teach.",
    price: "$29",
  },
  NEXBRIDGE_NEXPLAN: {
    name: "NexPLAN Selections",
    description: "AI-assisted material selections. Upload floor plans, browse vendor catalogs, generate professional selection sheets.",
    price: "$39",
  },
  NEXBRIDGE_AI: {
    name: "AI Features Pack",
    description: "Local AI inference for dimension extraction, product fitting, and enhanced vision analysis across all NexBRIDGE modules.",
    price: "$19",
  },
};
