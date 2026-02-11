/**
 * NEXUS Color Palette
 * Primary: Dark Blue
 * Secondary: Light Blue
 * Base: White
 */

export const colors = {
  // Primary - Dark Blue
  primary: "#1e3a8a",
  primaryLight: "#2563eb",
  primaryDark: "#1e40af",

  // Secondary - Light Blue
  secondary: "#3b82f6",
  secondaryLight: "#60a5fa",
  secondaryDark: "#2563eb",

  // Backgrounds
  background: "#ffffff",
  backgroundSecondary: "#f0f9ff", // Light blue tint
  backgroundTertiary: "#e0f2fe", // Slightly darker blue tint

  // Text
  textPrimary: "#1e3a8a", // Dark blue
  textSecondary: "#475569", // Slate gray
  textMuted: "#64748b", // Lighter slate
  textOnPrimary: "#ffffff", // White text on dark blue
  textOnSecondary: "#1e3a8a", // Dark blue text on light blue

  // Borders
  border: "#1e3a8a", // Dark blue border
  borderLight: "#bfdbfe", // Light blue border
  borderMuted: "#e2e8f0", // Light gray border

  // Status colors
  success: "#059669",
  successLight: "#d1fae5",
  warning: "#d97706",
  warningLight: "#fef3c7",
  error: "#dc2626",
  errorLight: "#fee2e2",
  info: "#3b82f6",
  infoLight: "#dbeafe",

  // Button variants
  buttonPrimary: "#1e3a8a",
  buttonPrimaryText: "#ffffff",
  buttonSecondary: "#ffffff",
  buttonSecondaryText: "#1e3a8a",
  buttonSecondaryBorder: "#1e3a8a",

  // Card
  cardBackground: "#ffffff",
  cardBorder: "#bfdbfe",

  // Tab bar
  tabActive: "#1e3a8a",
  tabInactive: "#94a3b8",
  tabBackground: "#ffffff",
  tabBorder: "#e2e8f0",

  // Chips/badges
  chipBackground: "#ffffff",
  chipBackgroundSelected: "#1e3a8a",
  chipText: "#1e3a8a",
  chipTextSelected: "#ffffff",
  chipBorder: "#1e3a8a",
} as const;

export type ColorName = keyof typeof colors;
