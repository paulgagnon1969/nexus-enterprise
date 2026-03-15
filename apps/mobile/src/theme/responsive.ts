import { useDeviceLayout, type DeviceLayout } from "../hooks/useDeviceLayout";

/** Layout constants that adapt to device class and orientation. */
export interface ResponsiveValues {
  /** Max width for main content (undefined = full width on phone). */
  contentMaxWidth: number | undefined;
  /** Number of grid columns for card grids. */
  gridColumns: number;
  /** Width of the tablet sidebar (0 on phone). */
  sidebarWidth: number;
  /** Gap between cards in a grid. */
  cardGap: number;
  /** Horizontal padding for screen sections. */
  sectionPadding: number;
  /** The underlying device layout info. */
  layout: DeviceLayout;
}

const SIDEBAR_WIDTH = 240;

/**
 * Reactive hook that returns spacing / sizing values appropriate for the
 * current device class and orientation.
 */
export function useResponsive(): ResponsiveValues {
  const layout = useDeviceLayout();

  if (layout.isTablet) {
    return {
      contentMaxWidth: 960,
      gridColumns: layout.columns,
      sidebarWidth: SIDEBAR_WIDTH,
      cardGap: 16,
      sectionPadding: 24,
      layout,
    };
  }

  return {
    contentMaxWidth: undefined, // full width
    gridColumns: layout.columns,
    sidebarWidth: 0,
    cardGap: 10,
    sectionPadding: 16,
    layout,
  };
}

export { SIDEBAR_WIDTH };
