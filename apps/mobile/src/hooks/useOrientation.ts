import { useWindowDimensions } from "react-native";

/**
 * Returns current device orientation derived from window dimensions.
 * Updates automatically when the device rotates.
 */
export function useOrientation() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  return { isLandscape, isPortrait: !isLandscape, width, height };
}
