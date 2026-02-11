import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Linking,
  ActivityIndicator,
  Alert,
} from "react-native";
import { fetchDailyLogDetail, delayPublishLog, publishLog, fetchRevisions } from "../api/dailyLog";
import { getCache, setCache } from "../offline/cache";
import type { DailyLogDetail, DailyLogListItem, DailyLogRevision } from "../types/api";

interface Props {
  log: DailyLogListItem;
  onBack: () => void;
  onEdit?: (log: DailyLogDetail) => void;
  currentUserId?: string;
  currentUserProfileCode?: string;
}

// Check if user is PM+ level
const isPmOrAbove = (profileCode?: string) => {
  return profileCode === "PM" || profileCode === "EXECUTIVE";
};

// Check if user can delay publish
const canDelayPublish = (profileCode?: string) => {
  return profileCode === "FOREMAN" || profileCode === "SUPERINTENDENT";
};

export function DailyLogDetailScreen({
  log,
  onBack,
  onEdit,
  currentUserId,
  currentUserProfileCode,
}: Props) {
  const [detail, setDetail] = useState<DailyLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<DailyLogRevision[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  const cacheKey = `dailyLogDetail:${log.id}`;

  useEffect(() => {
    (async () => {
      // Try cache first
      const cached = await getCache<DailyLogDetail>(cacheKey);
      if (cached) {
        setDetail(cached);
        setLoading(false);
      }

      // Fetch fresh
      try {
        const [fresh, revs] = await Promise.all([
          fetchDailyLogDetail(log.id),
          fetchRevisions(log.id).catch(() => []),
        ]);
        setDetail(fresh);
        setRevisions(revs);
        await setCache(cacheKey, fresh);
        setError(null);
      } catch (e) {
        if (!cached) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [log.id]);

  // Check if current user can edit this log
  const canEdit = () => {
    if (!detail) return false;
    // Creator can edit
    if (currentUserId && detail.createdById === currentUserId) return true;
    // PM+ can edit
    return isPmOrAbove(currentUserProfileCode);
  };

  // Check if current user can flag for delay
  const canFlagDelay = () => {
    return canDelayPublish(currentUserProfileCode) || isPmOrAbove(currentUserProfileCode);
  };

  // Check if current user can publish
  const canPublish = () => {
    return isPmOrAbove(currentUserProfileCode);
  };

  const handleDelayPublish = async () => {
    Alert.alert(
      "Delay Publication",
      "This will hide the log from other users until a PM publishes it. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delay",
          style: "destructive",
          onPress: async () => {
            setActionLoading(true);
            try {
              await delayPublishLog(log.id);
              // Refresh
              const fresh = await fetchDailyLogDetail(log.id);
              setDetail(fresh);
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : String(e));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handlePublish = async () => {
    setActionLoading(true);
    try {
      await publishLog(log.id);
      // Refresh
      const fresh = await fetchDailyLogDetail(log.id);
      setDetail(fresh);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const openAttachment = (url: string) => {
    void Linking.openURL(url);
  };

  const renderField = (label: string, value: string | null | undefined) => {
    if (!value) return null;
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value}</Text>
      </View>
    );
  };

  if (loading && !detail) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack}>
            <Text style={styles.backLink}>← Back</Text>
          </Pressable>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      </View>
    );
  }

  if (error && !detail) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack}>
            <Text style={styles.backLink}>← Back</Text>
          </Pressable>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  const data = detail || log;
  const fullDetail = detail as DailyLogDetail | null;
  const createdByName = data.createdByUser
    ? [data.createdByUser.firstName, data.createdByUser.lastName]
        .filter(Boolean)
        .join(" ") || data.createdByUser.email
    : "Unknown";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.backLink}>← Back</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Delayed publish banner */}
        {data.isDelayedPublish && (
          <View style={styles.delayedBanner}>
            <Text style={styles.delayedBannerText}>
              ⚠️ This log is delayed and hidden from most users
            </Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          {canEdit() && onEdit && fullDetail && (
            <Pressable
              style={styles.actionButton}
              onPress={() => onEdit(fullDetail)}
              disabled={actionLoading}
            >
              <Text style={styles.actionButtonText}>✏️ Edit</Text>
            </Pressable>
          )}
          {!data.isDelayedPublish && canFlagDelay() && (
            <Pressable
              style={[styles.actionButton, styles.delayButton]}
              onPress={handleDelayPublish}
              disabled={actionLoading}
            >
              <Text style={styles.actionButtonText}>
                {actionLoading ? "..." : "⏸️ Delay Publish"}
              </Text>
            </Pressable>
          )}
          {data.isDelayedPublish && canPublish() && (
            <Pressable
              style={[styles.actionButton, styles.publishButton]}
              onPress={handlePublish}
              disabled={actionLoading}
            >
              <Text style={[styles.actionButtonText, { color: "#fff" }]}>
                {actionLoading ? "..." : "✓ Publish"}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Header section */}
        <View style={styles.headerSection}>
          <Text style={styles.projectName}>{data.projectName}</Text>
          <Text style={styles.date}>{formatDate(data.logDate)}</Text>
          <Text style={styles.title}>{data.title || "(No title)"}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>By {createdByName}</Text>
            <View style={[styles.statusBadge, getStatusStyle(data.status)]}>
              <Text style={styles.statusText}>{data.status}</Text>
            </View>
          </View>
        </View>

        {/* Content fields */}
        <View style={styles.section}>
          {renderField("Weather", fullDetail?.weatherSummary)}
          {renderField("Crew on Site", fullDetail?.crewOnSite)}
          {renderField("Manpower Onsite", fullDetail?.manpowerOnsite)}
          {renderField("Person Onsite", fullDetail?.personOnsite)}
        </View>

        {data.workPerformed && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Work Performed</Text>
            <Text style={styles.sectionContent}>{data.workPerformed}</Text>
          </View>
        )}

        {data.issues && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Issues</Text>
            <Text style={styles.sectionContent}>{data.issues}</Text>
          </View>
        )}

        {fullDetail?.safetyIncidents && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Safety Incidents</Text>
            <Text style={styles.sectionContent}>{fullDetail.safetyIncidents}</Text>
          </View>
        )}

        {fullDetail?.confidentialNotes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Confidential Notes</Text>
            <Text style={[styles.sectionContent, { fontStyle: "italic" }]}>
              {fullDetail.confidentialNotes}
            </Text>
          </View>
        )}

        {/* Location context */}
        {(fullDetail?.building || fullDetail?.unit || fullDetail?.roomParticle) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Location</Text>
            {fullDetail.building && (
              <Text style={styles.locationItem}>
                Building: {fullDetail.building.name}
                {fullDetail.building.code ? ` (${fullDetail.building.code})` : ""}
              </Text>
            )}
            {fullDetail.unit && (
              <Text style={styles.locationItem}>
                Unit: {fullDetail.unit.label}
                {fullDetail.unit.floor ? ` - Floor ${fullDetail.unit.floor}` : ""}
              </Text>
            )}
            {fullDetail.roomParticle && (
              <Text style={styles.locationItem}>
                Room: {fullDetail.roomParticle.fullLabel || fullDetail.roomParticle.name}
              </Text>
            )}
          </View>
        )}

        {/* Attachments */}
        {data.attachments && data.attachments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Attachments ({data.attachments.length})
            </Text>
            {data.attachments.map((att) => (
              <Pressable
                key={att.id}
                style={styles.attachmentRow}
                onPress={() => att.fileUrl && openAttachment(att.fileUrl)}
              >
                <Text style={styles.attachmentIcon}>📎</Text>
                <Text style={styles.attachmentName} numberOfLines={1}>
                  {att.fileName || "Attachment"}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Sharing info */}
        {fullDetail && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Visibility</Text>
            <View style={styles.sharingRow}>
              {fullDetail.shareInternal && (
                <View style={styles.sharingBadge}>
                  <Text style={styles.sharingBadgeText}>Internal</Text>
                </View>
              )}
              {fullDetail.shareSubs && (
                <View style={styles.sharingBadge}>
                  <Text style={styles.sharingBadgeText}>Subs</Text>
                </View>
              )}
              {fullDetail.shareClient && (
                <View style={styles.sharingBadge}>
                  <Text style={styles.sharingBadgeText}>Client</Text>
                </View>
              )}
              {fullDetail.sharePrivate && (
                <View style={[styles.sharingBadge, { backgroundColor: "#fef3c7" }]}>
                  <Text style={[styles.sharingBadgeText, { color: "#92400e" }]}>
                    Private
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Revision history */}
        {revisions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Revision History ({revisions.length})
            </Text>
            {revisions.map((rev) => {
              const editorName = rev.editedBy
                ? [rev.editedBy.firstName, rev.editedBy.lastName]
                    .filter(Boolean)
                    .join(" ") || rev.editedBy.email
                : "Unknown";
              const changedFields = Object.keys(rev.changes).join(", ");
              return (
                <View key={rev.id} style={styles.revisionItem}>
                  <Text style={styles.revisionMeta}>
                    Rev {rev.revisionNumber} · {new Date(rev.editedAt).toLocaleDateString()}
                  </Text>
                  <Text style={styles.revisionEditor}>By {editorName}</Text>
                  <Text style={styles.revisionChanges}>Changed: {changedFields}</Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function getStatusStyle(status: string) {
  switch (status?.toUpperCase()) {
    case "APPROVED":
      return { backgroundColor: "#d1fae5" };
    case "REJECTED":
      return { backgroundColor: "#fee2e2" };
    case "SUBMITTED":
    default:
      return { backgroundColor: "#e0e7ff" };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backLink: {
    color: "#2563eb",
    fontWeight: "600",
    fontSize: 15,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    color: "#b91c1c",
    textAlign: "center",
  },
  headerSection: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  projectName: {
    fontSize: 12,
    color: "#2563eb",
    fontWeight: "600",
    marginBottom: 4,
  },
  date: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  meta: {
    fontSize: 12,
    color: "#6b7280",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
  },
  sectionContent: {
    fontSize: 14,
    color: "#111827",
    lineHeight: 20,
  },
  field: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "600",
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 14,
    color: "#111827",
  },
  locationItem: {
    fontSize: 13,
    color: "#4b5563",
    marginBottom: 4,
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  attachmentIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  attachmentName: {
    fontSize: 14,
    color: "#2563eb",
    flex: 1,
  },
  sharingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sharingBadge: {
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sharingBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#3730a3",
  },
  delayedBanner: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  delayedBannerText: {
    fontSize: 13,
    color: "#92400e",
    fontWeight: "500",
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  actionButton: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#ffffff",
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  delayButton: {
    borderColor: "#fcd34d",
    backgroundColor: "#fffbeb",
  },
  publishButton: {
    borderColor: "#059669",
    backgroundColor: "#059669",
  },
  revisionItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    paddingVertical: 10,
  },
  revisionMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  revisionEditor: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
  },
  revisionChanges: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 2,
  },
});
