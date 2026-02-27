import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, Platform } from "react-native";
import Mapbox from "@rnmapbox/maps";
import { GeofenceCircle } from "./GeofenceCircle";
import { CrewDots, type CrewPosition } from "./CrewDots";
import { colors } from "../theme/colors";

interface JobSiteMapProps {
  latitude: number;
  longitude: number;
  projectName: string;
  projectId: string;
  isInsideGeofence?: boolean;
  crew?: CrewPosition[];
  currentUserId?: string;
}

/**
 * Compact satellite map showing a single job site.
 * Tappable → expands to full-screen interactive modal.
 */
export function JobSiteMap({
  latitude,
  longitude,
  projectName,
  projectId,
  isInsideGeofence,
  crew,
  currentUserId,
}: JobSiteMapProps) {
  const [expanded, setExpanded] = useState(false);

  const mapContent = (interactive: boolean) => (
    <Mapbox.MapView
      style={interactive ? styles.fullMap : styles.compactMap}
      styleURL={Mapbox.StyleURL.SatelliteStreet}
      logoEnabled={false}
      attributionEnabled={false}
      scaleBarEnabled={false}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={interactive}
      pitchEnabled={interactive}
    >
      <Mapbox.Camera
        centerCoordinate={[longitude, latitude]}
        zoomLevel={interactive ? 17 : 16}
        animationDuration={400}
      />

      <Mapbox.LocationPuck puckBearingEnabled pulsing={{ isEnabled: true }} />

      <GeofenceCircle
        id={projectId}
        longitude={longitude}
        latitude={latitude}
        isInside={isInsideGeofence}
      />

      <Mapbox.PointAnnotation
        id={`site-${projectId}`}
        coordinate={[longitude, latitude]}
      >
        <View style={styles.sitePin}>
          <View style={styles.sitePinInner} />
        </View>
      </Mapbox.PointAnnotation>

      {crew && crew.length > 0 && (
        <CrewDots crew={crew} currentUserId={currentUserId} />
      )}
    </Mapbox.MapView>
  );

  return (
    <>
      {/* Compact inline map */}
      <Pressable onPress={() => setExpanded(true)} style={styles.compactContainer}>
        {mapContent(false)}
        <View style={styles.expandHint}>
          <Text style={styles.expandHintText}>⛶ Tap to expand</Text>
        </View>
      </Pressable>

      {/* Full-screen modal */}
      <Modal visible={expanded} animationType="slide" presentationStyle="fullScreen">
        <View style={styles.fullContainer}>
          {mapContent(true)}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>{projectName}</Text>
            <Pressable onPress={() => setExpanded(false)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  compactContainer: {
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    marginHorizontal: 16,
    marginBottom: 12,
  },
  compactMap: {
    flex: 1,
  },
  expandHint: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  expandHintText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
  },
  fullContainer: {
    flex: 1,
  },
  fullMap: {
    flex: 1,
  },
  modalHeader: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  closeBtn: {
    marginLeft: 12,
    padding: 4,
  },
  closeBtnText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "600",
  },
  sitePin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#ffffff",
  },
  sitePinInner: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#ffffff",
  },
});
