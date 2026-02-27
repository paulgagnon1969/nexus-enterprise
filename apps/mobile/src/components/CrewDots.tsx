import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Mapbox from "@rnmapbox/maps";

export interface CrewPosition {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  timestamp: string;
  role?: string | null;
}

interface CrewDotsProps {
  crew: CrewPosition[];
  /** Current user id — excluded from dots (shown as LocationPuck instead) */
  currentUserId?: string;
}

function getInitials(first?: string | null, last?: string | null): string {
  const f = first?.[0]?.toUpperCase() ?? "";
  const l = last?.[0]?.toUpperCase() ?? "";
  return f + l || "?";
}

function timeSince(isoString: string): string {
  const secs = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 120) return "1 min ago";
  return `${Math.floor(secs / 60)} min ago`;
}

/**
 * Renders PointAnnotations for each crew member (except the current user).
 * Must be a child of <Mapbox.MapView>.
 */
export function CrewDots({ crew, currentUserId }: CrewDotsProps) {
  const others = crew.filter((c) => c.userId !== currentUserId);

  return (
    <>
      {others.map((member) => (
        <Mapbox.PointAnnotation
          key={member.userId}
          id={`crew-${member.userId}`}
          coordinate={[member.longitude, member.latitude]}
          title={
            [member.firstName, member.lastName].filter(Boolean).join(" ") ||
            "Team member"
          }
          snippet={`${member.role ?? "Member"} · ${timeSince(member.timestamp)}`}
        >
          <View style={styles.dot}>
            <Text style={styles.initials}>
              {getInitials(member.firstName, member.lastName)}
            </Text>
          </View>
        </Mapbox.PointAnnotation>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  initials: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
});
