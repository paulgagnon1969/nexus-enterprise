import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";

// ── Confidence Level Styling ─────────────────────────────────────────────────

const BADGE_CONFIG: Record<string, { label: string; bg: string; fg: string; icon: string }> = {
  VERIFIED:       { label: "Verified",       bg: "#059669", fg: "#fff",    icon: "✓✓" },
  BANK_CONFIRMED: { label: "Bank Confirmed", bg: "#0284c7", fg: "#fff",    icon: "✓$" },
  RECEIPT:        { label: "Receipt",        bg: "#7c3aed", fg: "#fff",    icon: "🧾" },
  HD_PRO_XTRA:    { label: "HD Pro",         bg: "#ea580c", fg: "#fff",    icon: "🏠" },
  HIGH:           { label: "High",           bg: "#16a34a", fg: "#fff",    icon: "↑"  },
  MEDIUM:         { label: "Medium",         bg: "#d97706", fg: "#fff",    icon: "~"  },
  LOW:            { label: "Low",            bg: "#94a3b8", fg: "#fff",    icon: "?"  },
};

interface Props {
  confidence: string;
  verificationCount?: number;
  compact?: boolean;
  onPress?: () => void;
}

export function ConfidenceBadge({ confidence, verificationCount, compact, onPress }: Props) {
  const config = BADGE_CONFIG[confidence] ?? BADGE_CONFIG.LOW;

  const badge = (
    <View style={[s.badge, { backgroundColor: config.bg }]}>
      {!compact && <Text style={[s.icon, { color: config.fg }]}>{config.icon}</Text>}
      <Text style={[s.label, { color: config.fg }]} numberOfLines={1}>
        {compact ? config.icon : config.label}
      </Text>
      {verificationCount != null && verificationCount > 1 && !compact && (
        <View style={s.countBubble}>
          <Text style={s.countText}>×{verificationCount}</Text>
        </View>
      )}
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{badge}</Pressable>;
  }
  return badge;
}

const s = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 3,
  },
  icon: {
    fontSize: 9,
    fontWeight: "700",
  },
  label: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  countBubble: {
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 6,
    paddingHorizontal: 3,
    paddingVertical: 0,
    marginLeft: 1,
  },
  countText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#fff",
  },
});
