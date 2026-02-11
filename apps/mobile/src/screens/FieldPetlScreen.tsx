import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  FlatList,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { apiJson } from "../api/client";
import { getCache, setCache } from "../offline/cache";
import { enqueueOutbox } from "../offline/outbox";
import { syncOnce } from "../offline/sync";
import { colors } from "../theme/colors";
import type { FieldPetlItem, ProjectListItem } from "../types/api";

// Data passed back when saving PETL changes
export type PetlSessionChanges = {
  changes: Array<{
    lineNo: number;
    description: string;
    type: "individual" | "bulk";
  }>;
  suggestedTitle: string;
  suggestedNotes: string;
};

interface Props {
  project: ProjectListItem;
  onBack: () => void;
  onSaveWithChanges?: (data: PetlSessionChanges) => void;
}

type FieldPetlEditState = {
  item: FieldPetlItem;
  incorrect: boolean;
  fieldQty: string;
  newPercent: string;
  note: string;
  saving: boolean;
  error: string | null;
};

type FilterType = "room" | "category" | "selection" | "orgGroup";

type BulkUpdateState = {
  newPercent: string;
  saving: boolean;
  error: string | null;
};

// Track changes made during this session
type SessionChange = {
  lineNo: number;
  sowItemId: string;
  type: "individual" | "bulk";
  description: string; // e.g., "→ 50%" or "Qty flagged"
  timestamp: number;
};

// Format line numbers into ranges (e.g., "1-5, 8, 10-12")
function formatLineNumbers(lineNos: number[]): string {
  if (lineNos.length === 0) return "";
  const sorted = [...new Set(lineNos)].sort((a, b) => a - b);
  if (sorted.length === 1) return `#${sorted[0]}`;
  
  const ranges: string[] = [];
  let rangeStart = sorted[0];
  let rangeEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === rangeEnd + 1) {
      rangeEnd = sorted[i];
    } else {
      ranges.push(rangeStart === rangeEnd ? `#${rangeStart}` : `#${rangeStart}-${rangeEnd}`);
      rangeStart = sorted[i];
      rangeEnd = sorted[i];
    }
  }
  ranges.push(rangeStart === rangeEnd ? `#${rangeStart}` : `#${rangeStart}-${rangeEnd}`);

  // If too many ranges, truncate
  if (ranges.length > 5) {
    return ranges.slice(0, 4).join(", ") + ` +${ranges.length - 4} more`;
  }
  return ranges.join(", ");
}

export function FieldPetlScreen({ project, onBack, onSaveWithChanges }: Props) {
  const [items, setItems] = useState<FieldPetlItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editItem, setEditItem] = useState<FieldPetlEditState | null>(null);

  // Multi-select filters
  const [roomFilters, setRoomFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [selectionFilters, setSelectionFilters] = useState<string[]>([]);
  const [orgGroupFilters, setOrgGroupFilters] = useState<string[]>([]);

  // Filter picker modal
  const [activeFilterPicker, setActiveFilterPicker] = useState<FilterType | null>(null);
  const [filterPickerSearch, setFilterPickerSearch] = useState("");

  // Bulk update modal
  const [bulkUpdate, setBulkUpdate] = useState<BulkUpdateState | null>(null);

  // Session changes tracking
  const [sessionChanges, setSessionChanges] = useState<SessionChange[]>([]);
  const [changesExpanded, setChangesExpanded] = useState(false);

  const cacheKey = `fieldPetl:${project.id}`;

  // Load data
  useEffect(() => {
    (async () => {
      // Load cached first
      const cached = await getCache<FieldPetlItem[]>(cacheKey);
      if (cached && cached.length > 0) {
        setItems(cached);
        setLoading(false);
      }

      // Fetch fresh
      try {
        const json = await apiJson<{ items: any[] }>(
          `/projects/${encodeURIComponent(project.id)}/petl-field`
        );
        const rawItems: any[] = Array.isArray(json?.items) ? json.items : [];
        const mapped: FieldPetlItem[] = rawItems.map((it) => ({
          sowItemId: String(it.id),
          lineNo: Number(it.lineNo ?? 0),
          roomParticleId: it.roomParticleId ?? null,
          roomName: it.roomName ?? null,
          categoryCode: it.categoryCode ?? null,
          selectionCode: it.selectionCode ?? null,
          activity: it.activity ?? null,
          description: it.description ?? null,
          unit: it.unit ?? null,
          originalQty:
            typeof it.originalQty === "number" ? it.originalQty : it.qty ?? null,
          qty: typeof it.qty === "number" ? it.qty : null,
          qtyFlaggedIncorrect: !!it.qtyFlaggedIncorrect,
          qtyFieldReported:
            typeof it.qtyFieldReported === "number" ? it.qtyFieldReported : null,
          qtyReviewStatus: it.qtyReviewStatus ?? null,
          orgGroupCode: it.orgGroupCode ?? null,
          percentComplete:
            typeof it.percentComplete === "number" ? it.percentComplete : undefined,
        }));

        setItems(mapped);
        await setCache(cacheKey, mapped);
        setError(null);
      } catch (e) {
        if (!cached || cached.length === 0) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [project.id]);

  // Extract unique filter values
  const filterOptions = useMemo(() => {
    const rooms = new Set<string>();
    const categories = new Set<string>();
    const selections = new Set<string>();
    const orgGroups = new Set<string>();

    for (const it of items) {
      if (it.roomName?.trim()) rooms.add(it.roomName.trim());
      if (it.categoryCode?.trim()) categories.add(it.categoryCode.trim());
      if (it.selectionCode?.trim()) selections.add(it.selectionCode.trim());
      if (it.orgGroupCode?.trim()) orgGroups.add(it.orgGroupCode.trim());
    }

    return {
      rooms: Array.from(rooms).sort(),
      categories: Array.from(categories).sort(),
      selections: Array.from(selections).sort(),
      orgGroups: Array.from(orgGroups).sort(),
    };
  }, [items]);

  // Filter sets for quick lookup
  const roomFilterSet = useMemo(() => new Set(roomFilters), [roomFilters]);
  const categoryFilterSet = useMemo(() => new Set(categoryFilters), [categoryFilters]);
  const selectionFilterSet = useMemo(() => new Set(selectionFilters), [selectionFilters]);
  const orgGroupFilterSet = useMemo(() => new Set(orgGroupFilters), [orgGroupFilters]);

  // Check if any filters are active
  const hasActiveFilters = roomFilters.length > 0 || categoryFilters.length > 0 || 
    selectionFilters.length > 0 || orgGroupFilters.length > 0;

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      // Room filter
      if (roomFilterSet.size > 0) {
        const room = (it.roomName ?? "").trim();
        if (!room || !roomFilterSet.has(room)) return false;
      }
      // Category filter
      if (categoryFilterSet.size > 0) {
        const cat = (it.categoryCode ?? "").trim();
        if (!cat || !categoryFilterSet.has(cat)) return false;
      }
      // Selection filter
      if (selectionFilterSet.size > 0) {
        const sel = (it.selectionCode ?? "").trim();
        if (!sel || !selectionFilterSet.has(sel)) return false;
      }
      // Org group filter
      if (orgGroupFilterSet.size > 0) {
        const org = (it.orgGroupCode ?? "").trim();
        if (!org || !orgGroupFilterSet.has(org)) return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const searchable = [
          it.description,
          it.roomName,
          it.activity,
          String(it.lineNo),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [items, roomFilterSet, categoryFilterSet, selectionFilterSet, orgGroupFilterSet, searchQuery]);

  // Get filter description for bulk update tracking
  const getFilterDescription = () => {
    const parts: string[] = [];
    if (roomFilters.length > 0) {
      parts.push(`Room: ${roomFilters.join(", ")}`);
    }
    if (categoryFilters.length > 0) {
      parts.push(`Cat: ${categoryFilters.join(", ")}`);
    }
    if (selectionFilters.length > 0) {
      parts.push(`Sel: ${selectionFilters.join(", ")}`);
    }
    if (orgGroupFilters.length > 0) {
      parts.push(`Org: ${orgGroupFilters.join(", ")}`);
    }
    return parts.length > 0 ? parts.join(" | ") : "All items";
  };

  // Clear all filters
  const clearAllFilters = () => {
    setRoomFilters([]);
    setCategoryFilters([]);
    setSelectionFilters([]);
    setOrgGroupFilters([]);
  };

  // Get active filter options based on type
  const getActiveFilterOptions = (type: FilterType): string[] => {
    switch (type) {
      case "room": return filterOptions.rooms;
      case "category": return filterOptions.categories;
      case "selection": return filterOptions.selections;
      case "orgGroup": return filterOptions.orgGroups;
    }
  };

  // Get active filter values based on type
  const getActiveFilterValues = (type: FilterType): string[] => {
    switch (type) {
      case "room": return roomFilters;
      case "category": return categoryFilters;
      case "selection": return selectionFilters;
      case "orgGroup": return orgGroupFilters;
    }
  };

  // Set filter values based on type
  const setFilterValues = (type: FilterType, values: string[]) => {
    switch (type) {
      case "room": setRoomFilters(values); break;
      case "category": setCategoryFilters(values); break;
      case "selection": setSelectionFilters(values); break;
      case "orgGroup": setOrgGroupFilters(values); break;
    }
  };

  // Toggle a filter value
  const toggleFilterValue = (type: FilterType, value: string) => {
    const current = getActiveFilterValues(type);
    if (current.includes(value)) {
      setFilterValues(type, current.filter((v) => v !== value));
    } else {
      setFilterValues(type, [...current, value]);
    }
  };

  // Get filter label
  const getFilterLabel = (type: FilterType): string => {
    switch (type) {
      case "room": return "Room";
      case "category": return "Category";
      case "selection": return "Selection";
      case "orgGroup": return "Org Group";
    }
  };

  // Get filtered options for picker (with search)
  const getFilteredPickerOptions = (type: FilterType): string[] => {
    const options = getActiveFilterOptions(type);
    if (!filterPickerSearch.trim()) return options;
    const q = filterPickerSearch.toLowerCase();
    return options.filter((opt) => opt.toLowerCase().includes(q));
  };

  // Reset search when closing picker
  const closeFilterPicker = () => {
    setActiveFilterPicker(null);
    setFilterPickerSearch("");
  };

  // Open bulk update modal
  const openBulkUpdate = () => {
    setBulkUpdate({
      newPercent: "",
      saving: false,
      error: null,
    });
  };

  // Submit bulk update
  const submitBulkUpdate = async () => {
    if (!bulkUpdate) return;

    const { newPercent } = bulkUpdate;
    if (!newPercent.trim()) {
      setBulkUpdate((prev) => prev ? { ...prev, error: "Enter a percentage." } : prev);
      return;
    }

    const parsedPercent = Number(newPercent);
    if (!Number.isFinite(parsedPercent) || parsedPercent < 0 || parsedPercent > 100) {
      setBulkUpdate((prev) => prev ? { ...prev, error: "Percent must be 0-100." } : prev);
      return;
    }

    setBulkUpdate((prev) => prev ? { ...prev, saving: true, error: null } : prev);

    try {
      // Gather previous percentages for tracking
      const previousPercents = filteredItems.map((it) => it.percentComplete ?? 0);
      const uniquePrevious = [...new Set(previousPercents)];
      const previousLabel = uniquePrevious.length === 1 
        ? `${uniquePrevious[0]}%` 
        : "mixed";

      // Enqueue bulk update
      await enqueueOutbox("fieldPetl.bulkUpdatePercent", {
        projectId: project.id,
        sowItemIds: filteredItems.map((it) => it.sowItemId),
        newPercent: parsedPercent,
        filterDescription: getFilterDescription(),
        itemCount: filteredItems.length,
        previousPercent: previousLabel,
      });

      // Optimistic update
      const filteredIds = new Set(filteredItems.map((it) => it.sowItemId));
      setItems((prev) =>
        prev.map((it) => {
          if (!filteredIds.has(it.sowItemId)) return it;
          return { ...it, percentComplete: parsedPercent };
        })
      );

      // Track bulk changes in session
      const bulkChanges: SessionChange[] = filteredItems.map((it) => ({
        lineNo: it.lineNo,
        sowItemId: it.sowItemId,
        type: "bulk",
        description: `→ ${parsedPercent}%`,
        timestamp: Date.now(),
      }));
      setSessionChanges((prev) => {
        // Remove any existing entries for these items, then add new
        const existingIds = new Set(bulkChanges.map((c) => c.sowItemId));
        return [...prev.filter((c) => !existingIds.has(c.sowItemId)), ...bulkChanges];
      });

      setBulkUpdate(null);

      // Trigger sync in background
      syncOnce().catch(() => {});
    } catch (err) {
      setBulkUpdate((prev) =>
        prev
          ? { ...prev, saving: false, error: err instanceof Error ? err.message : String(err) }
          : prev
      );
    }
  };

  const openEdit = (item: FieldPetlItem) => {
    setEditItem({
      item,
      incorrect: item.qtyFlaggedIncorrect,
      fieldQty:
        item.qtyFieldReported != null ? String(item.qtyFieldReported) : "",
      newPercent:
        typeof item.percentComplete === "number"
          ? String(item.percentComplete)
          : "",
      note: "",
      saving: false,
      error: null,
    });
  };

  const closeEdit = () => {
    if (editItem?.saving) return;
    setEditItem(null);
  };

  const submitEdit = async () => {
    if (!editItem) return;

    const { item, incorrect, fieldQty, newPercent, note } = editItem;

    let parsedFieldQty: number | null = null;
    if (incorrect) {
      if (!fieldQty.trim()) {
        setEditItem((prev) =>
          prev ? { ...prev, error: "Enter a field quantity." } : prev
        );
        return;
      }
      parsedFieldQty = Number(fieldQty);
      if (!Number.isFinite(parsedFieldQty) || parsedFieldQty < 0) {
        setEditItem((prev) =>
          prev ? { ...prev, error: "Field qty must be non-negative." } : prev
        );
        return;
      }
    }

    let parsedPercent: number | null = null;
    if (newPercent.trim()) {
      const n = Number(newPercent);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        setEditItem((prev) =>
          prev ? { ...prev, error: "Percent must be 0-100." } : prev
        );
        return;
      }
      parsedPercent = n;
    }

    setEditItem((prev) => (prev ? { ...prev, saving: true, error: null } : prev));

    try {
      await enqueueOutbox("fieldPetl.edit", {
        projectId: project.id,
        sowItemId: item.sowItemId,
        incorrect,
        fieldQty: parsedFieldQty,
        percent: parsedPercent,
        note: note || null,
      });

      // Optimistic update
      setItems((prev) =>
        prev.map((it) => {
          if (it.sowItemId !== item.sowItemId) return it;
          return {
            ...it,
            qtyFlaggedIncorrect: incorrect,
            qtyFieldReported: incorrect ? parsedFieldQty : null,
            qtyReviewStatus: incorrect ? "PENDING" : null,
            percentComplete: parsedPercent ?? it.percentComplete,
          };
        })
      );

      // Track individual change in session
      const changeDesc: string[] = [];
      if (incorrect) changeDesc.push(`Qty → ${parsedFieldQty}`);
      if (parsedPercent !== null) changeDesc.push(`${parsedPercent}%`);
      if (changeDesc.length === 0) changeDesc.push("Updated");

      setSessionChanges((prev) => {
        // Remove existing entry for this item, add new
        const newChange: SessionChange = {
          lineNo: item.lineNo,
          sowItemId: item.sowItemId,
          type: "individual",
          description: changeDesc.join(", "),
          timestamp: Date.now(),
        };
        return [...prev.filter((c) => c.sowItemId !== item.sowItemId), newChange];
      });

      setEditItem(null);

      // Trigger sync in background
      syncOnce().catch(() => {});
    } catch (err) {
      setEditItem((prev) =>
        prev
          ? {
              ...prev,
              saving: false,
              error: err instanceof Error ? err.message : String(err),
            }
          : prev
      );
    }
  };

  // Generate summary for daily log from session changes
  const generatePetlSummary = (): PetlSessionChanges => {
    const sorted = [...sessionChanges].sort((a, b) => a.lineNo - b.lineNo);
    
    // Group by type and percent value for summary
    const bulkChanges = sorted.filter((c) => c.type === "bulk");
    const individualChanges = sorted.filter((c) => c.type === "individual");
    
    // Build notes
    const noteLines: string[] = [];
    noteLines.push(`PETL Progress Update - ${sorted.length} line item(s) updated:`);
    noteLines.push("");
    
    if (bulkChanges.length > 0) {
      // Group bulk changes by description (same % update)
      const bulkByDesc = new Map<string, number[]>();
      for (const c of bulkChanges) {
        const existing = bulkByDesc.get(c.description) || [];
        existing.push(c.lineNo);
        bulkByDesc.set(c.description, existing);
      }
      
      for (const [desc, lineNos] of bulkByDesc) {
        noteLines.push(`• Bulk update ${desc}: ${formatLineNumbers(lineNos)} (${lineNos.length} items)`);
      }
    }
    
    if (individualChanges.length > 0) {
      noteLines.push("");
      noteLines.push("Individual updates:");
      for (const c of individualChanges) {
        noteLines.push(`• Line #${c.lineNo}: ${c.description}`);
      }
    }
    
    // Generate suggested title
    let suggestedTitle = "PETL Progress Update";
    if (bulkChanges.length > 0 && individualChanges.length === 0) {
      // All bulk - mention the % if consistent
      const descriptions = [...new Set(bulkChanges.map((c) => c.description))];
      if (descriptions.length === 1) {
        suggestedTitle = `PETL Bulk Update ${descriptions[0]}`;
      } else {
        suggestedTitle = `PETL Bulk Update (${bulkChanges.length} items)`;
      }
    } else if (individualChanges.length > 0 && bulkChanges.length === 0) {
      suggestedTitle = `PETL Update - ${individualChanges.length} item(s)`;
    } else {
      suggestedTitle = `PETL Update - ${sorted.length} item(s)`;
    }
    
    return {
      changes: sorted.map((c) => ({
        lineNo: c.lineNo,
        description: c.description,
        type: c.type,
      })),
      suggestedTitle,
      suggestedNotes: noteLines.join("\n"),
    };
  };

  // Handle Save & Close
  const handleSaveAndClose = () => {
    if (sessionChanges.length > 0 && onSaveWithChanges) {
      onSaveWithChanges(generatePetlSummary());
    } else {
      onBack();
    }
  };

  const getStatusLabel = (item: FieldPetlItem) => {
    if (item.qtyFlaggedIncorrect && item.qtyReviewStatus === "PENDING") {
      return item.qtyFieldReported != null
        ? `Pending (${item.qtyFieldReported})`
        : "Pending";
    }
    if (item.qtyReviewStatus === "ACCEPTED") return "Accepted";
    if (item.qtyReviewStatus === "REJECTED") return "Rejected";
    return "OK";
  };

  const getStatusColor = (item: FieldPetlItem) => {
    if (item.qtyReviewStatus === "PENDING") return colors.warning;
    if (item.qtyReviewStatus === "ACCEPTED") return colors.success;
    if (item.qtyReviewStatus === "REJECTED") return colors.error;
    return colors.textMuted;
  };

  const renderItem = ({ item }: { item: FieldPetlItem }) => {
    const pct = item.percentComplete;
    const qty = item.qty ?? 0;
    const unit = item.unit || "";
    const room = item.roomName || "";
    const activity = item.activity || "";
    const cat = item.categoryCode || "";
    const sel = item.selectionCode || "";
    const hasPending = item.qtyReviewStatus === "PENDING";

    return (
      <Pressable style={styles.itemRow} onPress={() => openEdit(item)}>
        {/* Line # */}
        <Text style={styles.rowLineNo}>{item.lineNo}</Text>

        {/* Room/Activity */}
        <Text style={styles.rowRoom} numberOfLines={1}>
          {room}{activity ? `/${activity}` : ""}
        </Text>

        {/* Description - main content, truncated */}
        <Text style={styles.rowDesc} numberOfLines={1}>
          {item.description || "—"}
        </Text>

        {/* Qty + Unit */}
        <Text style={styles.rowQty}>{qty}{unit ? ` ${unit}` : ""}</Text>

        {/* % */}
        <Text style={[styles.rowPct, typeof pct === "number" && pct > 0 && styles.rowPctActive]}>
          {typeof pct === "number" ? `${pct}%` : "—"}
        </Text>

        {/* Cat/Sel */}
        <Text style={styles.rowCatSel} numberOfLines={1}>
          {cat}{sel ? `/${sel}` : ""}
        </Text>

        {/* Status indicator */}
        {hasPending && <View style={styles.rowPendingDot} />}

        {/* Chevron */}
        <Text style={styles.rowChevron}>›</Text>
      </Pressable>
    );
  };

  if (loading && items.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack}>
            <Text style={styles.backLink}>← Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Field PETL</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading scope...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.backLink}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Field PETL</Text>
        <Text style={styles.itemCount}>{filteredItems.length} items</Text>
      </View>

      {/* Project Info Row with Save & Close */}
      <View style={styles.projectRow}>
        <View style={styles.projectInfo}>
          <Text style={styles.projectName}>{project.name}</Text>
          <Text style={styles.projectId}>ID: {project.id}</Text>
        </View>
        <Pressable
          style={[
            styles.saveCloseButton,
            sessionChanges.length > 0 && styles.saveCloseButtonActive,
          ]}
          onPress={handleSaveAndClose}
        >
          <Text style={[
            styles.saveCloseButtonText,
            sessionChanges.length > 0 && styles.saveCloseButtonTextActive,
          ]}>
            {sessionChanges.length > 0 ? `Save & Close (${sessionChanges.length})` : "Close"}
          </Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by description, room, line#..."
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Multi-select Filter Bar */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterBarContent}
        >
          {/* Room Filter */}
          <Pressable
            style={[styles.filterButton, roomFilters.length > 0 && styles.filterButtonActive]}
            onPress={() => setActiveFilterPicker("room")}
          >
            <Text style={[styles.filterButtonText, roomFilters.length > 0 && styles.filterButtonTextActive]}>
              Room {roomFilters.length > 0 ? `(${roomFilters.length})` : ""}
            </Text>
          </Pressable>

          {/* Category Filter */}
          <Pressable
            style={[styles.filterButton, categoryFilters.length > 0 && styles.filterButtonActive]}
            onPress={() => setActiveFilterPicker("category")}
          >
            <Text style={[styles.filterButtonText, categoryFilters.length > 0 && styles.filterButtonTextActive]}>
              Cat {categoryFilters.length > 0 ? `(${categoryFilters.length})` : ""}
            </Text>
          </Pressable>

          {/* Selection Filter */}
          <Pressable
            style={[styles.filterButton, selectionFilters.length > 0 && styles.filterButtonActive]}
            onPress={() => setActiveFilterPicker("selection")}
          >
            <Text style={[styles.filterButtonText, selectionFilters.length > 0 && styles.filterButtonTextActive]}>
              Sel {selectionFilters.length > 0 ? `(${selectionFilters.length})` : ""}
            </Text>
          </Pressable>

          {/* Org Group Filter */}
          <Pressable
            style={[styles.filterButton, orgGroupFilters.length > 0 && styles.filterButtonActive]}
            onPress={() => setActiveFilterPicker("orgGroup")}
          >
            <Text style={[styles.filterButtonText, orgGroupFilters.length > 0 && styles.filterButtonTextActive]}>
              Org {orgGroupFilters.length > 0 ? `(${orgGroupFilters.length})` : ""}
            </Text>
          </Pressable>

          {/* Clear All */}
          {hasActiveFilters && (
            <Pressable style={styles.clearFilterButton} onPress={clearAllFilters}>
              <Text style={styles.clearFilterButtonText}>Clear All</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>

      {/* Bulk Update Bar - shows when filters are active */}
      {filteredItems.length > 0 && (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkBarText}>
            {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
            {hasActiveFilters ? " match filters" : ""}
          </Text>
          <Pressable style={styles.bulkUpdateButton} onPress={openBulkUpdate}>
            <Text style={styles.bulkUpdateButtonText}>Bulk Update %</Text>
          </Pressable>
        </View>
      )}

      {/* Session Changes Queue */}
      {sessionChanges.length > 0 && (
        <View style={styles.changesQueue}>
          <Pressable
            style={styles.changesQueueHeader}
            onPress={() => setChangesExpanded(!changesExpanded)}
          >
            <View style={styles.changesQueueTitleRow}>
              <View style={styles.changesQueueBadge}>
                <Text style={styles.changesQueueBadgeText}>{sessionChanges.length}</Text>
              </View>
              <Text style={styles.changesQueueTitle}>
                Line items changed this session
              </Text>
            </View>
            <Text style={styles.changesQueueChevron}>
              {changesExpanded ? "▲" : "▼"}
            </Text>
          </Pressable>

          {changesExpanded && (
            <ScrollView style={styles.changesQueueList} nestedScrollEnabled>
              {sessionChanges
                .sort((a, b) => a.lineNo - b.lineNo)
                .map((change) => (
                  <View key={change.sowItemId} style={styles.changesQueueItem}>
                    <Text style={styles.changesQueueLineNo}>#{change.lineNo}</Text>
                    <Text style={styles.changesQueueDesc}>{change.description}</Text>
                    {change.type === "bulk" && (
                      <View style={styles.changesQueueBulkTag}>
                        <Text style={styles.changesQueueBulkTagText}>bulk</Text>
                      </View>
                    )}
                  </View>
                ))}
            </ScrollView>
          )}

          {!changesExpanded && (
            <Text style={styles.changesQueueSummary}>
              Lines: {formatLineNumbers(sessionChanges.map((c) => c.lineNo))}
            </Text>
          )}
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Item list */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.sowItemId}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery || hasActiveFilters
                ? "No items match your filters"
                : "No PETL scope items found"}
            </Text>
          </View>
        }
      />

      {/* Filter Picker Modal */}
      <Modal
        visible={!!activeFilterPicker}
        animationType="slide"
        transparent
        onRequestClose={closeFilterPicker}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {activeFilterPicker && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    Filter by {getFilterLabel(activeFilterPicker)}
                  </Text>
                  <Pressable onPress={closeFilterPicker}>
                    <Text style={styles.modalClose}>✕</Text>
                  </Pressable>
                </View>

                {/* Search box */}
                <View style={styles.filterPickerSearchContainer}>
                  <TextInput
                    style={styles.filterPickerSearchInput}
                    value={filterPickerSearch}
                    onChangeText={setFilterPickerSearch}
                    placeholder={`Search ${getFilterLabel(activeFilterPicker).toLowerCase()}...`}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                  />
                  {filterPickerSearch.length > 0 && (
                    <Pressable onPress={() => setFilterPickerSearch("")}>
                      <Text style={styles.filterPickerSearchClear}>✕</Text>
                    </Pressable>
                  )}
                </View>

                <View style={styles.filterPickerActions}>
                  <Pressable
                    style={styles.filterPickerAction}
                    onPress={() => setFilterValues(activeFilterPicker, getActiveFilterOptions(activeFilterPicker))}
                  >
                    <Text style={styles.filterPickerActionText}>Select All</Text>
                  </Pressable>
                  <Pressable
                    style={styles.filterPickerAction}
                    onPress={() => setFilterValues(activeFilterPicker, [])}
                  >
                    <Text style={styles.filterPickerActionText}>Clear</Text>
                  </Pressable>
                </View>

                <ScrollView style={styles.filterPickerList}>
                  {getFilteredPickerOptions(activeFilterPicker).map((option) => {
                    const selected = getActiveFilterValues(activeFilterPicker).includes(option);
                    return (
                      <Pressable
                        key={option}
                        style={styles.filterPickerItem}
                        onPress={() => toggleFilterValue(activeFilterPicker, option)}
                      >
                        <View style={[styles.filterPickerCheckbox, selected && styles.filterPickerCheckboxSelected]}>
                          {selected && <Text style={styles.filterPickerCheckmark}>✓</Text>}
                        </View>
                        <Text style={styles.filterPickerItemText}>{option}</Text>
                      </Pressable>
                    );
                  })}
                  {getFilteredPickerOptions(activeFilterPicker).length === 0 && (
                    <Text style={styles.filterPickerEmpty}>
                      {filterPickerSearch ? "No matches" : "No options available"}
                    </Text>
                  )}
                </ScrollView>

                <View style={styles.modalFooter}>
                  <Pressable
                    style={styles.modalSaveButton}
                    onPress={closeFilterPicker}
                  >
                    <Text style={styles.modalSaveText}>Done</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Bulk Update Modal */}
      <Modal
        visible={!!bulkUpdate}
        animationType="slide"
        transparent
        onRequestClose={() => setBulkUpdate(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {bulkUpdate && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Bulk Update %</Text>
                  <Pressable onPress={() => setBulkUpdate(null)}>
                    <Text style={styles.modalClose}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView style={styles.modalBody}>
                  <View style={styles.bulkUpdateInfo}>
                    <Text style={styles.bulkUpdateInfoLabel}>Items to update:</Text>
                    <Text style={styles.bulkUpdateInfoValue}>{filteredItems.length}</Text>
                  </View>

                  {hasActiveFilters && (
                    <View style={styles.bulkUpdateInfo}>
                      <Text style={styles.bulkUpdateInfoLabel}>Filter:</Text>
                      <Text style={styles.bulkUpdateInfoValue}>{getFilterDescription()}</Text>
                    </View>
                  )}

                  <Text style={styles.modalLabel}>New % Complete</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={bulkUpdate.newPercent}
                    onChangeText={(t) =>
                      setBulkUpdate((prev) => prev ? { ...prev, newPercent: t } : prev)
                    }
                    keyboardType="numeric"
                    placeholder="0-100"
                    autoFocus
                  />

                  {bulkUpdate.error && (
                    <Text style={styles.modalError}>{bulkUpdate.error}</Text>
                  )}
                </ScrollView>

                <View style={styles.modalFooter}>
                  <Pressable
                    style={styles.modalCancelButton}
                    onPress={() => setBulkUpdate(null)}
                    disabled={bulkUpdate.saving}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.modalSaveButton,
                      bulkUpdate.saving && styles.modalSaveButtonDisabled,
                    ]}
                    onPress={submitBulkUpdate}
                    disabled={bulkUpdate.saving}
                  >
                    <Text style={styles.modalSaveText}>
                      {bulkUpdate.saving ? "Updating..." : `Update ${filteredItems.length} Items`}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal
        visible={!!editItem}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeEdit}
      >
        <KeyboardAvoidingView
          style={styles.fullScreenModal}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.fullScreenModalContent}>
            {editItem && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Edit PETL Item</Text>
                  <Pressable onPress={closeEdit}>
                    <Text style={styles.modalClose}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                  {/* Item info header */}
                  <Text style={styles.modalItemLine}>
                    #{editItem.item.lineNo}
                    {editItem.item.roomName
                      ? ` · ${editItem.item.roomName}`
                      : ""}
                  </Text>
                  <Text style={styles.modalItemDesc}>
                    {editItem.item.description || "(no description)"}
                  </Text>

                  {/* Qty Row: Toggle + Current/Original Qty + Field Qty input */}
                  <View style={styles.qtySection}>
                    <View style={styles.qtyRowHeader}>
                      <Pressable
                        style={[
                          styles.qtyToggle,
                          editItem.incorrect && styles.qtyToggleActive,
                        ]}
                        onPress={() =>
                          setEditItem((prev) =>
                            prev ? { ...prev, incorrect: !prev.incorrect } : prev
                          )
                        }
                      >
                        <Text style={[
                          styles.qtyToggleText,
                          editItem.incorrect && styles.qtyToggleTextActive,
                        ]}>
                          {editItem.incorrect ? "✓ Incorrect" : "Qty Incorrect?"}
                        </Text>
                      </Pressable>
                    </View>

                    <View style={styles.qtyRow}>
                      {/* Original/Current Qty */}
                      <View style={styles.qtyBox}>
                        <Text style={styles.qtyBoxLabel}>
                          {editItem.incorrect ? "Original Qty" : "Current Qty"}
                        </Text>
                        <Text style={styles.qtyBoxValue}>
                          {editItem.item.qty ?? "—"}{editItem.item.unit ? ` ${editItem.item.unit}` : ""}
                        </Text>
                      </View>

                      {/* Field Qty input (when incorrect) */}
                      {editItem.incorrect && (
                        <View style={styles.qtyBox}>
                          <Text style={styles.qtyBoxLabel}>New Qty</Text>
                          <TextInput
                            style={styles.qtyInput}
                            value={editItem.fieldQty}
                            onChangeText={(t) =>
                              setEditItem((prev) =>
                                prev ? { ...prev, fieldQty: t } : prev
                              )
                            }
                            keyboardType="numeric"
                            placeholder="Enter"
                            placeholderTextColor={colors.textMuted}
                          />
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Percent Row: Current % + New % input */}
                  <View style={styles.pctSection}>
                    <View style={styles.pctRow}>
                      <View style={styles.pctBox}>
                        <Text style={styles.pctBoxLabel}>Current %</Text>
                        <Text style={styles.pctBoxValue}>
                          {typeof editItem.item.percentComplete === "number"
                            ? `${editItem.item.percentComplete}%`
                            : "—"}
                        </Text>
                      </View>

                      <View style={styles.pctBox}>
                        <Text style={styles.pctBoxLabel}>New % (optional)</Text>
                        <TextInput
                          style={styles.pctInput}
                          value={editItem.newPercent}
                          onChangeText={(t) =>
                            setEditItem((prev) =>
                              prev ? { ...prev, newPercent: t } : prev
                            )
                          }
                          keyboardType="numeric"
                          placeholder="0-100"
                          placeholderTextColor={colors.textMuted}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Note */}
                  <Text style={styles.modalLabel}>Note (optional)</Text>
                  <TextInput
                    style={[styles.modalInput, styles.modalInputMultiline]}
                    value={editItem.note}
                    onChangeText={(t) =>
                      setEditItem((prev) =>
                        prev ? { ...prev, note: t } : prev
                      )
                    }
                    placeholder="Add a note..."
                    multiline
                  />

                  {editItem.error && (
                    <Text style={styles.modalError}>{editItem.error}</Text>
                  )}
                </ScrollView>

                <View style={styles.modalFooter}>
                  <Pressable
                    style={styles.modalCancelButton}
                    onPress={closeEdit}
                    disabled={editItem.saving}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.modalSaveButton,
                      editItem.saving && styles.modalSaveButtonDisabled,
                    ]}
                    onPress={submitEdit}
                    disabled={editItem.saving}
                  >
                    <Text style={styles.modalSaveText}>
                      {editItem.saving ? "Saving..." : "Save"}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 38,
    paddingBottom: 8,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  backLink: {
    color: colors.primary,
    fontWeight: "600",
  },
  itemCount: {
    fontSize: 13,
    color: colors.textMuted,
  },
  saveCloseButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  saveCloseButtonActive: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  saveCloseButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  saveCloseButtonTextActive: {
    color: colors.textOnPrimary,
  },
  projectRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  projectInfo: {
    flex: 1,
    marginRight: 12,
  },
  projectName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  projectId: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: colors.textMuted,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  searchInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  // Filter Bar styles
  filterBar: {
    backgroundColor: colors.background,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  filterBarContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  filterButton: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  filterButtonTextActive: {
    color: colors.textOnPrimary,
  },
  clearFilterButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearFilterButtonText: {
    fontSize: 13,
    color: colors.error,
    fontWeight: "500",
  },
  // Bulk Update Bar styles
  bulkBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  bulkBarText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  bulkUpdateButton: {
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  bulkUpdateButtonText: {
    color: colors.textOnPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  // Filter Picker styles
  filterPickerSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  filterPickerSearchInput: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
  },
  filterPickerSearchClear: {
    color: colors.textMuted,
    fontSize: 16,
    paddingLeft: 12,
    paddingVertical: 8,
  },
  filterPickerActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  filterPickerAction: {
    paddingVertical: 4,
  },
  filterPickerActionText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "600",
  },
  filterPickerList: {
    maxHeight: 300,
  },
  filterPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  filterPickerCheckbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: colors.borderMuted,
    borderRadius: 4,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  filterPickerCheckboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPickerCheckmark: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  filterPickerItemText: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  filterPickerEmpty: {
    padding: 24,
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 14,
  },
  // Bulk Update Modal styles
  bulkUpdateInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  bulkUpdateInfoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  bulkUpdateInfoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    flex: 1,
    textAlign: "right",
  },
  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: colors.errorLight,
    borderRadius: 8,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
  },
  listContent: {
    paddingVertical: 4,
    paddingBottom: 40,
  },
  emptyContainer: {
    paddingTop: 40,
    alignItems: "center",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  // Compact row styles (like web table)
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardBackground,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  rowLineNo: {
    width: 32,
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  rowRoom: {
    width: 60,
    fontSize: 11,
    color: colors.textSecondary,
    marginRight: 6,
  },
  rowDesc: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
    marginRight: 8,
  },
  rowQty: {
    width: 44,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: "right",
    marginRight: 8,
  },
  rowPct: {
    width: 36,
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    textAlign: "right",
    marginRight: 8,
  },
  rowPctActive: {
    color: colors.success,
  },
  rowCatSel: {
    width: 48,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: "center",
  },
  rowPendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.warning,
    marginLeft: 4,
  },
  rowChevron: {
    fontSize: 18,
    color: colors.textMuted,
    marginLeft: 4,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "80%",
  },
  // Full screen modal styles (Edit PETL)
  fullScreenModal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fullScreenModalContent: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  modalClose: {
    fontSize: 20,
    color: colors.textMuted,
    padding: 4,
  },
  modalBody: {
    padding: 16,
  },
  modalItemLine: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
    marginBottom: 4,
  },
  modalItemDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 4,
    marginTop: 12,
  },
  modalValue: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },
  modalInputMultiline: {
    height: 80,
    textAlignVertical: "top",
  },
  // Qty Section styles
  qtySection: {
    marginBottom: 16,
  },
  qtyRowHeader: {
    marginBottom: 8,
  },
  qtyToggle: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.backgroundSecondary,
  },
  qtyToggleActive: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  qtyToggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  qtyToggleTextActive: {
    color: colors.textPrimary,
  },
  qtyRow: {
    flexDirection: "row",
    gap: 12,
  },
  qtyBox: {
    flex: 1,
  },
  qtyBoxLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  qtyBoxValue: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
  },
  qtyInput: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  // Percent Section styles
  pctSection: {
    marginBottom: 16,
  },
  pctRow: {
    flexDirection: "row",
    gap: 12,
  },
  pctBox: {
    flex: 1,
  },
  pctBoxLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  pctBoxValue: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.success,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
  },
  pctInput: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  modalError: {
    color: colors.error,
    fontSize: 12,
    marginTop: 8,
  },
  modalFooter: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 62,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    alignItems: "center",
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  modalSaveButtonDisabled: {
    backgroundColor: colors.textMuted,
  },
  modalSaveText: {
    color: colors.textOnPrimary,
    fontWeight: "600",
  },
  // Session Changes Queue styles
  changesQueue: {
    backgroundColor: colors.primaryLight ?? "#e8f4fd",
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
  },
  changesQueueHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  changesQueueTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  changesQueueBadge: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  changesQueueBadgeText: {
    color: colors.textOnPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  changesQueueTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
  changesQueueChevron: {
    fontSize: 12,
    color: colors.primary,
  },
  changesQueueSummary: {
    fontSize: 12,
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  changesQueueList: {
    maxHeight: 150,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  changesQueueItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    gap: 8,
  },
  changesQueueLineNo: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
    width: 40,
  },
  changesQueueDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  changesQueueBulkTag: {
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  changesQueueBulkTagText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: "500",
  },
});
