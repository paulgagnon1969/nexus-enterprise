/**
 * NexCard Color Palette
 * Primary: Slate/Dark (professional finance)
 * Accent: Emerald Green (money, growth)
 * Base: White
 */

export const colors = {
  // Primary - Dark Slate
  primary: "#0f172a",
  primaryLight: "#1e293b",
  primaryDark: "#020617",

  // Accent - Emerald Green
  accent: "#10b981",
  accentLight: "#34d399",
  accentDark: "#059669",

  // Backgrounds
  background: "#ffffff",
  backgroundSecondary: "#f8fafc",
  backgroundTertiary: "#f1f5f9",

  // Text
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#94a3b8",
  textOnPrimary: "#ffffff",
  textOnAccent: "#ffffff",

  // Borders
  border: "#e2e8f0",
  borderLight: "#f1f5f9",
  borderMuted: "#cbd5e1",

  // Status colors
  success: "#10b981",
  successLight: "#d1fae5",
  warning: "#f59e0b",
  warningLight: "#fef3c7",
  error: "#ef4444",
  errorLight: "#fee2e2",
  info: "#3b82f6",
  infoLight: "#dbeafe",

  // Financial
  positive: "#10b981", // income / credit
  negative: "#ef4444", // expense / debit
  pending: "#f59e0b",  // pending transactions

  // Button variants
  buttonPrimary: "#0f172a",
  buttonPrimaryText: "#ffffff",
  buttonAccent: "#10b981",
  buttonAccentText: "#ffffff",
  buttonSecondary: "#ffffff",
  buttonSecondaryText: "#0f172a",
  buttonSecondaryBorder: "#e2e8f0",

  // Card
  cardBackground: "#ffffff",
  cardBorder: "#e2e8f0",

  // Tab bar
  tabActive: "#10b981",
  tabInactive: "#94a3b8",
  tabBackground: "#ffffff",
  tabBorder: "#e2e8f0",
} as const;

export type ColorName = keyof typeof colors;
