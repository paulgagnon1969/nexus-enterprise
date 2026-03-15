import { useWindowDimensions } from "react-native";

/**
 * Minimum shortest-edge width (dp) to classify a device as a tablet.
 * iPad Mini portrait is ~744dp, most Android tablets start at ~600dp.
 */
const TABLET_BREAKPOINT = 600;

export type DeviceClass = "phone" | "tablet";

export interface DeviceLayout {
  /** "phone" or "tablet" */
  device: DeviceClass;
  /** Shorthand boolean */
  isTablet: boolean;
  /** Current window width (dp) */
  width: number;
  /** Current window height (dp) */
  height: number;
  /** Whether the device is currently in landscape orientation */
  isLandscape: boolean;
  /**
   * Suggested number of grid columns for card layouts.
   *  phone: 2
   *  tablet portrait: 3
   *  tablet landscape: 4
   */
  columns: number;
}

/**
 * Reactive hook that classifies the current device as phone or tablet and
 * provides responsive helpers. Updates automatically on rotation / resize
 * (e.g. iPad Split View).
 */
export function useDeviceLayout(): DeviceLayout {
  const { width, height } = useWindowDimensions();
  const shortestEdge = Math.min(width, height);
  const isTablet = shortestEdge >= TABLET_BREAKPOINT;
  const isLandscape = width > height;

  let columns = 2; // phone default
  if (isTablet) {
    columns = isLandscape ? 4 : 3;
  }

  return {
    device: isTablet ? "tablet" : "phone",
    isTablet,
    width,
    height,
    isLandscape,
    columns,
  };
}
