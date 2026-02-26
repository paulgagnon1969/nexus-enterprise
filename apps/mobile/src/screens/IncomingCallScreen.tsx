import React, { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";

const { width: SCREEN_W } = Dimensions.get("window");
const ringtoneSource = require("../../assets/sounds/nexus_ring.wav");

export type IncomingCallData = {
  roomId: string;
  projectId?: string | null;
  callerName: string;
  projectName?: string;
};

type Props = {
  call: IncomingCallData;
  onAccept: () => void;
  onDecline: () => void;
};

/**
 * Full-screen incoming call overlay.
 * Plays the Nexus ringtone on loop at max volume and vibrates aggressively
 * until the user accepts or declines.
 */
export function IncomingCallScreen({ call, onAccept, onDecline }: Props) {
  const player = useAudioPlayer(ringtoneSource);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Start ringing + vibration on mount ────────────────────────────
  useEffect(() => {
    const startRinging = async () => {
      try {
        // Configure audio for loud playback — even in silent mode on iOS
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: "doNotMix",
        });
      } catch (err) {
        console.warn("[IncomingCall] Failed to set audio mode:", err);
      }

      // Play the ringtone on loop at max volume
      try {
        player.loop = true;
        player.volume = 1.0;
        player.play();
      } catch (err) {
        console.warn("[IncomingCall] Failed to play ringtone:", err);
      }
    };

    startRinging();

    // Aggressive vibration pattern: 800ms buzz, 200ms pause, repeat
    // The `true` flag makes it repeat indefinitely
    const VIBRATION_PATTERN = [0, 800, 200, 800, 200, 600, 400, 800];
    Vibration.vibrate(VIBRATION_PATTERN, true);

    return () => {
      Vibration.cancel();
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  // ── Pulsing ring animation ────────────────────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.25,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // ── Stop ringing helper ───────────────────────────────────────────
  const stopRinging = useCallback(() => {
    Vibration.cancel();
    try {
      player.pause();
    } catch {}
  }, [player]);

  const handleAccept = useCallback(() => {
    stopRinging();
    onAccept();
  }, [stopRinging, onAccept]);

  const handleDecline = useCallback(() => {
    stopRinging();
    onDecline();
  }, [stopRinging, onDecline]);

  return (
    <View style={styles.overlay}>
      {/* Pulsing ring indicator */}
      <Animated.View
        style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]}
      />

      {/* Caller avatar placeholder */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {call.callerName.charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Caller info */}
      <Text style={styles.callerName}>{call.callerName}</Text>
      <Text style={styles.callType}>
        {call.projectName
          ? `Video Call — ${call.projectName}`
          : "Incoming Video Call"}
      </Text>

      {/* Ringing indicator */}
      <Text style={styles.ringingText}>Ringing…</Text>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.declineBtn}
          onPress={handleDecline}
          activeOpacity={0.7}
        >
          <Text style={styles.btnIcon}>✕</Text>
          <Text style={styles.btnLabel}>Decline</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.acceptBtn}
          onPress={handleAccept}
          activeOpacity={0.7}
        >
          <Text style={styles.btnIcon}>📞</Text>
          <Text style={styles.btnLabel}>Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 60,
  },
  pulseRing: {
    position: "absolute",
    top: "28%",
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: "rgba(34, 197, 94, 0.4)",
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#16a34a",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  avatarText: {
    color: "#fff",
    fontSize: 48,
    fontWeight: "700",
  },
  callerName: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  callType: {
    color: "#94a3b8",
    fontSize: 16,
    marginBottom: 12,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  ringingText: {
    color: "#22c55e",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 80,
  },
  actions: {
    position: "absolute",
    bottom: 80,
    flexDirection: "row",
    justifyContent: "space-evenly",
    width: SCREEN_W,
    paddingHorizontal: 40,
  },
  declineBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#dc2626",
    justifyContent: "center",
    alignItems: "center",
  },
  acceptBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#16a34a",
    justifyContent: "center",
    alignItems: "center",
  },
  btnIcon: {
    fontSize: 28,
    color: "#fff",
  },
  btnLabel: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },
});
