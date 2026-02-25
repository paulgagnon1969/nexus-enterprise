import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  Animated,
  Dimensions,
  ActivityIndicator,
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from "react-native";
import { colors } from "../theme/colors";
import { getSheetImageUrl } from "../api/planSheets";
import type { PlanSheetItem, ImageTier } from "../types/api";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const HD_ZOOM_THRESHOLD = 1.8;
const DOUBLE_TAP_DELAY = 300;

interface Props {
  projectId: string;
  uploadId: string;
  sheets: PlanSheetItem[];
  initialIndex: number;
  onBack: () => void;
}

export function PlanSheetViewerScreen({
  projectId,
  uploadId,
  sheets,
  initialIndex,
  onBack,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [currentTier, setCurrentTier] = useState<ImageTier>("standard");
  const [loading, setLoading] = useState(true);
  const [hdLoaded, setHdLoaded] = useState(false);

  // Zoom/pan state using Animated values
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // Tracking values for gesture math
  const scaleValue = useRef(1);
  const translateXValue = useRef(0);
  const translateYValue = useRef(0);
  const lastTapTime = useRef(0);
  const initialPinchDistance = useRef(0);
  const initialPinchScale = useRef(1);

  // Keep refs in sync
  useEffect(() => {
    const listenerId = scale.addListener(({ value }) => {
      scaleValue.current = value;
    });
    return () => scale.removeListener(listenerId);
  }, []);

  useEffect(() => {
    const lx = translateX.addListener(({ value }) => {
      translateXValue.current = value;
    });
    const ly = translateY.addListener(({ value }) => {
      translateYValue.current = value;
    });
    return () => {
      translateX.removeListener(lx);
      translateY.removeListener(ly);
    };
  }, []);

  const sheet = sheets[currentIndex];

  // ── Load image URL for current sheet ────────────────────────────────────

  const loadImage = useCallback(
    async (tier: ImageTier) => {
      try {
        setLoading(true);
        const res = await getSheetImageUrl(
          projectId,
          uploadId,
          sheet.id,
          tier,
        );
        setImageUrl(res.url);
        setCurrentTier(tier);
      } catch {
        // Keep existing image if HD upgrade fails
      } finally {
        setLoading(false);
      }
    },
    [projectId, uploadId, sheet.id],
  );

  // Load standard on mount / page change
  useEffect(() => {
    setHdLoaded(false);
    setImageUrl(null);
    loadImage("standard");
    resetTransform();
  }, [currentIndex]);

  // ── Progressive HD: load master when zoomed past threshold ──────────────

  useEffect(() => {
    if (scaleValue.current >= HD_ZOOM_THRESHOLD && !hdLoaded && currentTier !== "master") {
      setHdLoaded(true);
      loadImage("master");
    }
  }, [hdLoaded, currentTier]);

  const checkHdUpgrade = useCallback(() => {
    if (scaleValue.current >= HD_ZOOM_THRESHOLD && !hdLoaded && currentTier !== "master") {
      setHdLoaded(true);
      loadImage("master");
    }
  }, [hdLoaded, currentTier, loadImage]);

  // ── Transform helpers ───────────────────────────────────────────────────

  const resetTransform = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
    scaleValue.current = 1;
    translateXValue.current = 0;
    translateYValue.current = 0;
  }, []);

  const clampTranslate = useCallback(
    (x: number, y: number, s: number) => {
      const maxX = ((s - 1) * SCREEN_W) / 2;
      const maxY = ((s - 1) * SCREEN_H) / 2;
      return {
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y)),
      };
    },
    [],
  );

  // ── Gesture: pinch distance helper ──────────────────────────────────────

  const getDistance = (
    touches: GestureResponderEvent["nativeEvent"]["touches"],
  ) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // ── PanResponder for pinch + drag ───────────────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => {
        // Respond to pinch (2+ touches) or drag when zoomed
        return (
          gs.numberActiveTouches >= 2 ||
          (scaleValue.current > 1 &&
            (Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2))
        );
      },

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          initialPinchDistance.current = getDistance(touches);
          initialPinchScale.current = scaleValue.current;
        }
      },

      onPanResponderMove: (evt, gs: PanResponderGestureState) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          // Pinch zoom
          const dist = getDistance(touches);
          if (initialPinchDistance.current > 0) {
            const newScale = Math.max(
              MIN_ZOOM,
              Math.min(
                MAX_ZOOM,
                initialPinchScale.current *
                  (dist / initialPinchDistance.current),
              ),
            );
            scale.setValue(newScale);
          }
        } else if (scaleValue.current > 1) {
          // Pan when zoomed
          const newX = translateXValue.current + gs.dx * 0.5;
          const newY = translateYValue.current + gs.dy * 0.5;
          const clamped = clampTranslate(newX, newY, scaleValue.current);
          translateX.setValue(clamped.x);
          translateY.setValue(clamped.y);
        }
      },

      onPanResponderRelease: (_evt, gs: PanResponderGestureState) => {
        // Snap back to 1 if barely zoomed
        if (scaleValue.current < 1.1) {
          resetTransform();
        } else {
          // Clamp translate
          const clamped = clampTranslate(
            translateXValue.current,
            translateYValue.current,
            scaleValue.current,
          );
          translateX.setValue(clamped.x);
          translateY.setValue(clamped.y);
          translateXValue.current = clamped.x;
          translateYValue.current = clamped.y;
        }

        // Check HD upgrade after zoom settles
        checkHdUpgrade();

        // Swipe to navigate (only when not zoomed)
        if (scaleValue.current <= 1.1) {
          if (gs.dx < -80 && currentIndex < sheets.length - 1) {
            setCurrentIndex((i) => i + 1);
          } else if (gs.dx > 80 && currentIndex > 0) {
            setCurrentIndex((i) => i - 1);
          }
        }
      },
    }),
  ).current;

  // ── Double-tap to toggle zoom ───────────────────────────────────────────

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapTime.current < DOUBLE_TAP_DELAY) {
      // Double tap
      if (scaleValue.current > 1.1) {
        resetTransform();
      } else {
        Animated.parallel([
          Animated.spring(scale, { toValue: 2.5, useNativeDriver: true }),
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
        ]).start(() => checkHdUpgrade());
        scaleValue.current = 2.5;
      }
    }
    lastTapTime.current = now;
  }, [checkHdUpgrade, resetTransform]);

  // ── Page navigation ─────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (currentIndex < sheets.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, sheets.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  // ── Render ──────────────────────────────────────────────────────────────

  const pageLabel =
    sheet.sheetId || sheet.title || `Page ${sheet.pageNo}`;

  return (
    <View style={styles.container}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.toolbarLink}>✕ Close</Text>
        </Pressable>
        <Text style={styles.toolbarTitle} numberOfLines={1}>
          {pageLabel}
        </Text>
        <Text style={styles.pageIndicator}>
          {currentIndex + 1}/{sheets.length}
        </Text>
      </View>

      {/* Image area */}
      <View style={styles.imageArea} {...panResponder.panHandlers}>
        <Pressable style={styles.imagePress} onPress={handleTap}>
          {imageUrl ? (
            <Animated.Image
              source={{ uri: imageUrl }}
              style={[
                styles.image,
                {
                  transform: [
                    { translateX },
                    { translateY },
                    { scale },
                  ],
                },
              ]}
              resizeMode="contain"
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
            />
          ) : (
            <View style={styles.imagePlaceholder} />
          )}
        </Pressable>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primaryLight} />
          </View>
        )}
      </View>

      {/* Bottom nav */}
      <View style={styles.bottomBar}>
        <Pressable
          onPress={goPrev}
          disabled={currentIndex === 0}
          style={[
            styles.navButton,
            currentIndex === 0 && styles.navButtonDisabled,
          ]}
        >
          <Text
            style={[
              styles.navButtonText,
              currentIndex === 0 && styles.navButtonTextDisabled,
            ]}
          >
            ‹ Prev
          </Text>
        </Pressable>

        <View style={styles.tierBadge}>
          <Text style={styles.tierText}>
            {currentTier === "master" ? "HD" : "SD"}
          </Text>
        </View>

        <Pressable onPress={resetTransform} style={styles.resetButton}>
          <Text style={styles.resetButtonText}>Reset</Text>
        </Pressable>

        <Pressable
          onPress={goNext}
          disabled={currentIndex === sheets.length - 1}
          style={[
            styles.navButton,
            currentIndex === sheets.length - 1 && styles.navButtonDisabled,
          ]}
        >
          <Text
            style={[
              styles.navButtonText,
              currentIndex === sheets.length - 1 && styles.navButtonTextDisabled,
            ]}
          >
            Next ›
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
  },

  // Toolbar
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#1a1a2e",
  },
  toolbarLink: {
    color: "#93c5fd",
    fontSize: 15,
    fontWeight: "600",
  },
  toolbarTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 12,
  },
  pageIndicator: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "500",
  },

  // Image area
  imageArea: {
    flex: 1,
    overflow: "hidden",
  },
  imagePress: {
    flex: 1,
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H - 120, // subtract toolbar + bottom bar
  },
  imagePlaceholder: {
    flex: 1,
    backgroundColor: "#111",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },

  // Bottom bar
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#1a1a2e",
  },
  navButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#334155",
    minWidth: 72,
    alignItems: "center",
  },
  navButtonDisabled: {
    opacity: 0.35,
  },
  navButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  navButtonTextDisabled: {
    color: "#64748b",
  },
  tierBadge: {
    backgroundColor: "#059669",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  tierText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  resetButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#334155",
  },
  resetButtonText: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "500",
  },
});
