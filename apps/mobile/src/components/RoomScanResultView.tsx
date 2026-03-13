import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
} from "react-native";
import { colors } from "../theme/colors";
import type { ScanNEXRoomResult, ScanNEXFixture } from "../scannex/types";

export function RoomScanResultView({
  scan,
  onSave,
  onNewScan,
  onClose,
  onMaterialWalk,
}: {
  scan: ScanNEXRoomResult;
  onSave: (updated: ScanNEXRoomResult) => void;
  onNewScan: () => void;
  onClose: () => void;
  onMaterialWalk?: () => void;
}) {
  const [roomName, setRoomName] = useState(scan.roomName);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave({ ...scan, roomName });
    setSaved(true);
  };

  // Group fixtures by category group for display
  const fixtureGroups = groupFixtures(scan.fixtures);
  const { infrastructure, visionDetections } = scan;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Room Name */}
      <View style={styles.roomNameRow}>
        <TextInput
          style={styles.roomNameInput}
          value={roomName}
          onChangeText={setRoomName}
          placeholder="Room Name (e.g. Primary Bedroom)"
          placeholderTextColor={colors.textMuted}
        />
        {visionDetections.roomType && (
          <Text style={styles.roomTypeBadge}>
            AI: {visionDetections.roomType} ({Math.round(visionDetections.roomTypeConfidence * 100)}%)
          </Text>
        )}
      </View>

      {/* SF / LF Summary Badges */}
      <View style={styles.badgesGrid}>
        <Badge label="Floor SF" value={fmt(scan.floorSF)} />
        <Badge label="Ceiling SF" value={fmt(scan.ceilingSF)} />
        <Badge label="Gross Wall SF" value={fmt(scan.grossWallSF)} />
        <Badge label="Net Wall SF" value={fmt(scan.netWallSF)} />
        <Badge label="Perimeter LF" value={fmt(scan.perimeterLF)} />
        <Badge label="Ceiling Ht" value={`${fmt(scan.ceilingHeight)} ft`} />
        <Badge label="Baseboard LF" value={fmt(scan.totalBaseboardLF)} />
        <Badge label="Door Trim LF" value={fmt(scan.totalDoorTrimLF)} />
        <Badge label="Window Trim LF" value={fmt(scan.totalWindowTrimLF)} />
        <Badge label="Window Sill LF" value={fmt(scan.totalWindowSillLF)} />
      </View>

      {/* Per-Wall Breakdown */}
      <Card title={`Walls (${scan.walls.length})`}>
        {scan.walls.map((w) => (
          <View key={w.wallId} style={styles.wallRow}>
            <Text style={styles.wallLabel}>{w.label}</Text>
            <Text style={styles.wallDim}>
              {fmt(w.lengthLF)}′ × {fmt(w.heightFT)}′
            </Text>
            <Text style={styles.wallSF}>
              Gross {fmt(w.grossSF)} SF · Net {fmt(w.netSF)} SF
            </Text>
            <Text style={styles.wallDetail}>
              BB {fmt(w.baseboardLF)} LF
              {w.windowDeductionSF > 0 ? ` · Win −${fmt(w.windowDeductionSF)} SF` : ""}
              {w.doorDeductionSF > 0 ? ` · Door −${fmt(w.doorDeductionSF)} SF` : ""}
            </Text>
          </View>
        ))}
      </Card>

      {/* Doors */}
      {scan.doors.length > 0 && (
        <Card title={`Doors (${scan.doors.length})`}>
          {scan.doors.map((d) => (
            <View key={d.doorId} style={styles.itemRow}>
              <Text style={styles.itemLabel}>
                {d.widthFT}′ × {d.heightFT}′ · Trim {fmt(d.trimLF)} LF
                {d.singleSidedCasing ? " (1-side)" : " (2-side)"}
              </Text>
            </View>
          ))}
        </Card>
      )}

      {/* Windows */}
      {scan.windows.length > 0 && (
        <Card title={`Windows (${scan.windows.length})`}>
          {scan.windows.map((w) => (
            <View key={w.windowId} style={styles.itemRow}>
              <Text style={styles.itemLabel}>
                {w.widthFT}′ × {w.heightFT}′ · Trim {fmt(w.trimLF)} LF
                {w.sillPresent ? ` · Sill ${fmt(w.sillLF)} LF` : ""}
              </Text>
            </View>
          ))}
        </Card>
      )}

      {/* Fixtures by Group */}
      {fixtureGroups.map((group) => (
        <Card key={group.title} title={`${group.title} (${group.items.length})`}>
          {group.items.map((f) => (
            <View key={f.fixtureId} style={styles.itemRow}>
              <View style={styles.fixtureRow}>
                <Text style={styles.fixtureName}>{f.label}</Text>
                <Text style={styles.fixtureSource}>
                  {f.detectionSource === "roomplan" ? "LiDAR" : "AI"}
                  {f.detectionConfidence < 1 ? ` ${Math.round(f.detectionConfidence * 100)}%` : ""}
                </Text>
              </View>
              {(f.widthFT || f.heightFT) && (
                <Text style={styles.fixtureDim}>
                  {[f.widthFT && `${f.widthFT}′w`, f.heightFT && `${f.heightFT}′h`, f.depthFT && `${f.depthFT}′d`]
                    .filter(Boolean)
                    .join(" × ")}
                </Text>
              )}
            </View>
          ))}
        </Card>
      ))}

      {/* Materials */}
      {(visionDetections.materials.flooring ||
        visionDetections.materials.walls ||
        visionDetections.materials.ceiling) && (
        <Card title="Material Suggestions">
          {visionDetections.materials.flooring && (
            <MaterialRow label="Flooring" material={visionDetections.materials.flooring} />
          )}
          {visionDetections.materials.walls && (
            <MaterialRow label="Walls" material={visionDetections.materials.walls} />
          )}
          {visionDetections.materials.ceiling && (
            <MaterialRow label="Ceiling" material={visionDetections.materials.ceiling} />
          )}
          <Text style={styles.materialNote}>
            AI suggestions — field tech can override
          </Text>
        </Card>
      )}

      {/* Infrastructure BOM Summary */}
      {(infrastructure.electrical.wireRuns.length > 0 ||
        infrastructure.hvac.ductRuns.length > 0) && (
        <Card title="Inferred Infrastructure (BOM)">
          {infrastructure.hvac.totalDuctLF > 0 && (
            <View style={styles.itemRow}>
              <Text style={styles.bomLabel}>
                HVAC Ductwork: ~{fmt(infrastructure.hvac.totalDuctLF)} LF
              </Text>
              <Text style={styles.bomDetail}>
                {infrastructure.hvac.registers.length} registers · {infrastructure.hvac.returns.length} returns
              </Text>
            </View>
          )}
          {Object.entries(infrastructure.electrical.wireTotalsByGauge).map(([gauge, lf]) => (
            <View key={gauge} style={styles.itemRow}>
              <Text style={styles.bomLabel}>
                {gauge} Wire: ~{fmt(lf as number)} LF
              </Text>
            </View>
          ))}
          {infrastructure.electrical.estimatedCircuitCount > 0 && (
            <Text style={styles.bomDetail}>
              ~{infrastructure.electrical.estimatedCircuitCount} circuits estimated
            </Text>
          )}
          {infrastructure.plumbing.wetWallIds.length > 0 && (
            <View style={styles.itemRow}>
              <Text style={styles.bomLabel}>
                Supply: ~{fmt(infrastructure.plumbing.estimatedSupplyLF)} LF · Drain: ~{fmt(infrastructure.plumbing.estimatedDrainLF)} LF
              </Text>
              <Text style={styles.bomDetail}>
                {infrastructure.plumbing.wetWallIds.length} wet wall(s)
              </Text>
            </View>
          )}
        </Card>
      )}

      {/* OCR Text */}
      {visionDetections.detectedText.length > 0 && (
        <Card title="Detected Text">
          {visionDetections.detectedText.map((t, i) => (
            <Text key={i} style={styles.detectedText}>"{t}"</Text>
          ))}
        </Card>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, saved && styles.actionBtnSaved]}
          onPress={handleSave}
        >
          <Text style={styles.actionBtnText}>
            {saved ? "✓ Saved to Project" : "Save Room Scan"}
          </Text>
        </Pressable>

        {/* Material Walk CTA */}
        {onMaterialWalk && (
          <Pressable
            style={[styles.actionBtn, styles.materialWalkBtn]}
            onPress={onMaterialWalk}
          >
            <Text style={styles.actionBtnText}>
              {scan.roomProfiles.length > 0
                ? `Material Walk (${scan.roomProfiles.length} captured)`
                : "Start Material Walk →"}
            </Text>
          </Pressable>
        )}

        <View style={styles.secondaryActions}>
          <Pressable style={styles.actionBtnSecondary} onPress={onNewScan}>
            <Text style={styles.actionBtnSecondaryText}>Scan Another Room</Text>
          </Pressable>
          <Pressable style={styles.actionBtnSecondary} onPress={onClose}>
            <Text style={styles.actionBtnSecondaryText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

// ── Sub-components ───────────────────────────────────────────

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeValue}>{value}</Text>
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MaterialRow({ label, material }: { label: string; material: { type: string; confidence: number } }) {
  return (
    <View style={styles.itemRow}>
      <Text style={styles.materialLabel}>{label}</Text>
      <Text style={styles.materialValue}>
        {material.type} ({Math.round(material.confidence * 100)}%)
      </Text>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

interface FixtureGroup {
  title: string;
  items: ScanNEXFixture[];
}

function groupFixtures(fixtures: ScanNEXFixture[]): FixtureGroup[] {
  const groupMap: Record<string, { title: string; items: ScanNEXFixture[] }> = {};

  const categoryGroupMap: Record<string, string> = {
    sink: "Plumbing", faucet: "Plumbing", toilet: "Plumbing", bathtub: "Plumbing",
    shower: "Plumbing", "tub-shower-combo": "Plumbing", "bath-sink": "Plumbing",
    "bath-faucet": "Plumbing", "shower-head": "Plumbing", "shower-valve": "Plumbing",
    "tub-faucet": "Plumbing", "tub-drain": "Plumbing", bidet: "Plumbing",
    stove: "Kitchen", oven: "Kitchen", refrigerator: "Kitchen",
    dishwasher: "Kitchen", microwave: "Kitchen", "range-hood": "Kitchen",
    "garbage-disposal": "Kitchen",
    washer: "Laundry", dryer: "Laundry",
    "outlet-standard": "Electrical", "outlet-gfci": "Electrical",
    "outlet-usb": "Electrical", "outlet-240v": "Electrical",
    "switch-single": "Electrical", "switch-double": "Electrical",
    "switch-triple": "Electrical", "switch-dimmer": "Electrical",
    "electrical-panel": "Electrical", "sub-panel": "Electrical",
    "junction-box": "Electrical", disconnect: "Electrical",
    "light-ceiling": "Lighting", "light-recessed": "Lighting",
    "light-pendant": "Lighting", "light-track": "Lighting",
    "light-sconce": "Lighting", "light-vanity": "Lighting",
    "light-under-cabinet": "Lighting", "light-chandelier": "Lighting",
    "fan-only": "Lighting", "fan-with-light": "Lighting",
    "exhaust-fan": "Ventilation", "exhaust-fan-with-light": "Ventilation",
    "exhaust-fan-with-heater": "Ventilation",
    "hvac-unit": "HVAC", "hvac-condenser": "HVAC", "hvac-air-handler": "HVAC",
    "hvac-register": "HVAC", "hvac-return": "HVAC",
    "hvac-register-floor": "HVAC", "hvac-register-ceiling": "HVAC",
    thermostat: "HVAC", "thermostat-smart": "HVAC",
    "smoke-detector": "Safety", "co-detector": "Safety", "smoke-co-combo": "Safety",
    "towel-bar": "Bath Accessories", "towel-ring": "Bath Accessories",
    "towel-hook": "Bath Accessories", "toilet-paper-holder": "Bath Accessories",
    "robe-hook": "Bath Accessories", "soap-dish": "Bath Accessories",
    "soap-dispenser": "Bath Accessories", "shower-caddy": "Bath Accessories",
    "grab-bar": "Bath Accessories", "shower-door": "Bath Accessories",
    "shower-curtain-rod": "Bath Accessories",
    "mirror-fixed": "Mirrors", "mirror-medicine-cabinet": "Mirrors",
    "mirror-vanity": "Mirrors",
    "data-ethernet": "Low Voltage", "data-coax": "Low Voltage",
    "data-phone": "Low Voltage", "data-combo": "Low Voltage",
  };

  for (const f of fixtures) {
    const group = categoryGroupMap[f.category] ?? "Other";
    if (!groupMap[group]) groupMap[group] = { title: group, items: [] };
    groupMap[group].items.push(f);
  }

  // Sort groups by item count descending
  return Object.values(groupMap).sort((a, b) => b.items.length - a.items.length);
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 40 },

  // Room name
  roomNameRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  roomNameInput: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
    paddingBottom: 6,
  },
  roomTypeBadge: {
    alignSelf: "flex-start",
    fontSize: 12,
    color: colors.info,
    backgroundColor: colors.infoLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
    marginTop: 6,
  },

  // Badges grid
  badgesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.backgroundSecondary,
    marginTop: 8,
  },
  badge: {
    width: "20%",
    alignItems: "center",
    paddingVertical: 6,
  },
  badgeValue: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  badgeLabel: { fontSize: 10, color: colors.textMuted, marginTop: 1, textAlign: "center" },

  // Cards
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    padding: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 8,
  },

  // Wall rows
  wallRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  wallLabel: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  wallDim: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  wallSF: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  wallDetail: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  // Item rows
  itemRow: {
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  itemLabel: { fontSize: 13, color: colors.textSecondary },

  // Fixtures
  fixtureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fixtureName: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  fixtureSource: { fontSize: 11, color: colors.textMuted },
  fixtureDim: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  // Materials
  materialLabel: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  materialValue: { fontSize: 13, color: colors.textSecondary },
  materialNote: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: "italic",
    marginTop: 6,
  },

  // BOM
  bomLabel: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  bomDetail: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  // Detected text
  detectedText: {
    fontSize: 13,
    color: colors.textSecondary,
    paddingVertical: 2,
  },

  // Actions
  actions: { paddingHorizontal: 16, paddingTop: 20 },
  actionBtn: {
    backgroundColor: colors.buttonPrimary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  actionBtnSaved: { backgroundColor: colors.success },
  materialWalkBtn: {
    backgroundColor: colors.info,
    marginTop: 10,
  },
  actionBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 12,
  },
  actionBtnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.buttonSecondaryBorder,
    alignItems: "center",
  },
  actionBtnSecondaryText: {
    color: colors.buttonSecondaryText,
    fontSize: 14,
    fontWeight: "600",
  },
});
