import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { colors } from "../theme/colors";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { PriceSparkline } from "./PriceSparkline";
import type { FingerprintEnrichment } from "../api/procurement";

interface Props {
  visible: boolean;
  onClose: () => void;
  productTitle: string;
  supplierName: string;
  fingerprint: FingerprintEnrichment | null;
}

const SOURCE_LABELS: Record<string, string> = {
  RECEIPT_OCR: "Receipt Scan",
  HD_PRO_XTRA: "HD Pro Xtra Import",
  CBA_SCRAPE: "Web Scrape (CBA)",
  BANK_CONFIRM: "Bank Confirmation",
  MANUAL: "Manual Entry",
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ProductIntelligenceSheet({
  visible,
  onClose,
  productTitle,
  supplierName,
  fingerprint,
}: Props) {
  if (!fingerprint) return null;

  const prices = fingerprint.priceHistory ?? [];
  const latestPrice = prices[0]?.unitPrice;
  const avgPrice =
    prices.length > 0
      ? prices.reduce((s, p) => s + p.unitPrice, 0) / prices.length
      : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <View style={s.sheet}>
          {/* Handle */}
          <View style={s.handleRow}>
            <View style={s.handle} />
          </View>

          {/* Header */}
          <View style={s.header}>
            <Text style={s.title} numberOfLines={2}>
              {productTitle}
            </Text>
            <Text style={s.supplier}>{supplierName}</Text>
            <View style={s.badgeRow}>
              <ConfidenceBadge
                confidence={fingerprint.confidence}
                verificationCount={fingerprint.verificationCount}
              />
              {fingerprint.sku && (
                <Text style={s.skuTag}>SKU: {fingerprint.sku}</Text>
              )}
            </View>
          </View>

          <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
            {/* Price History Chart */}
            {prices.length > 1 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Price History</Text>
                <PriceSparkline
                  data={prices}
                  width={280}
                  height={48}
                  showLabels
                />
              </View>
            )}

            {/* Quick Stats */}
            <View style={s.statsGrid}>
              <View style={s.statBox}>
                <Text style={s.statLabel}>Latest Price</Text>
                <Text style={s.statValue}>
                  {latestPrice != null ? `$${latestPrice.toFixed(2)}` : "—"}
                </Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statLabel}>Avg Price</Text>
                <Text style={s.statValue}>
                  {avgPrice != null ? `$${avgPrice.toFixed(2)}` : "—"}
                </Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statLabel}>Observations</Text>
                <Text style={s.statValue}>{prices.length}</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statLabel}>Verifications</Text>
                <Text style={s.statValue}>
                  {fingerprint.verificationCount}
                </Text>
              </View>
            </View>

            {/* Coverage Info */}
            {fingerprint.coverageValue != null && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Coverage Intelligence</Text>
                <Text style={s.coverageValue}>
                  {fingerprint.coverageValue} {fingerprint.coverageUnit ?? ""}
                  {fingerprint.purchaseUnitLabel
                    ? ` per ${fingerprint.purchaseUnitLabel}`
                    : ""}
                </Text>
              </View>
            )}

            {/* Recent Transactions */}
            {prices.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Recent Transactions</Text>
                {prices.slice(0, 8).map((p, idx) => (
                  <View key={idx} style={s.txnRow}>
                    <Text style={s.txnDate}>
                      {fmtDate(p.transactionDate ?? p.createdAt)}
                    </Text>
                    <Text style={s.txnSource}>
                      {SOURCE_LABELS[p.source] ?? p.source}
                    </Text>
                    <Text style={s.txnPrice}>
                      ${p.unitPrice.toFixed(2)}
                      {p.quantity > 1 ? ` × ${p.quantity}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Last Verified */}
            <View style={s.section}>
              <Text style={s.metaText}>
                Last verified: {fmtDate(fingerprint.lastVerifiedAt)}
              </Text>
            </View>
          </ScrollView>

          {/* Close */}
          <Pressable style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
  },
  handleRow: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderMuted,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    lineHeight: 22,
  },
  supplier: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  skuTag: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 10,
    padding: 10,
  },
  statLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: "600",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
    marginTop: 2,
  },
  coverageValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderMuted,
  },
  txnDate: {
    fontSize: 11,
    color: colors.textMuted,
    width: 70,
  },
  txnSource: {
    fontSize: 11,
    color: colors.textSecondary,
    flex: 1,
  },
  txnPrice: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  metaText: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  closeBtn: {
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.backgroundSecondary,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
});
