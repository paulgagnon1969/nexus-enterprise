/**
 * ReceiptCard.tsx
 *
 * Compact card for a single receipt in the capture list.
 * Shows image thumbnail, vendor, amount, date, and status.
 * Action buttons for approve / reject / edit / delete.
 */

import React from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import type { LocalReceipt, ReceiptStatus } from "../receipts/receiptStore";

const STATUS_CONFIG: Record<ReceiptStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: "Pending", bg: colors.warningLight, fg: colors.warning },
  approved: { label: "Approved", bg: colors.successLight, fg: colors.success },
  rejected: { label: "Rejected", bg: colors.errorLight, fg: colors.error },
};

interface Props {
  receipt: LocalReceipt;
  onApprove?: () => void;
  onReject?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function ReceiptCard({ receipt, onApprove, onReject, onEdit, onDelete }: Props) {
  const badge = STATUS_CONFIG[receipt.status];
  const amount = receipt.amount != null ? `$${receipt.amount.toFixed(2)}` : "—";
  const vendor = receipt.vendor || "Unknown Vendor";
  const date = receipt.receiptDate || "No date";
  const confidence = receipt.ocrConfidence != null ? `${Math.round(receipt.ocrConfidence * 100)}%` : null;

  return (
    <View style={styles.card}>
      {/* Thumbnail */}
      <Image source={{ uri: receipt.imageUri }} style={styles.thumb} />

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.topRow}>
          <Text style={styles.vendor} numberOfLines={1}>{vendor}</Text>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.amount}>{amount}</Text>
          <Text style={styles.date}>{date}</Text>
          {confidence && <Text style={styles.confidence}>{confidence}</Text>}
        </View>

        {receipt.paymentMethod && (
          <Text style={styles.meta}>{receipt.paymentMethod}</Text>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {receipt.status === "pending" && onApprove && (
            <Pressable style={styles.approveBtn} onPress={onApprove}>
              <Text style={styles.approveBtnText}>✓ Approve</Text>
            </Pressable>
          )}
          {receipt.status === "pending" && onReject && (
            <Pressable style={styles.rejectBtn} onPress={onReject}>
              <Text style={styles.rejectBtnText}>✗</Text>
            </Pressable>
          )}
          {onEdit && (
            <Pressable style={styles.editBtn} onPress={onEdit}>
              <Text style={styles.editBtnText}>Edit</Text>
            </Pressable>
          )}
          {onDelete && (
            <Pressable style={styles.deleteBtn} onPress={onDelete}>
              <Text style={styles.deleteBtnText}>🗑</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    marginBottom: 10,
    overflow: "hidden",
  },
  thumb: {
    width: 80,
    height: 100,
    backgroundColor: colors.backgroundSecondary,
  },
  info: {
    flex: 1,
    padding: 10,
    justifyContent: "space-between",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  vendor: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 2,
  },
  amount: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
  },
  date: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  confidence: {
    fontSize: 11,
    color: colors.textMuted,
  },
  meta: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  approveBtn: {
    backgroundColor: colors.success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  approveBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  rejectBtn: {
    borderWidth: 1,
    borderColor: colors.error,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rejectBtnText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: "700",
  },
  editBtn: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  editBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  deleteBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  deleteBtnText: {
    fontSize: 14,
  },
});
