import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

interface PricePoint {
  unitPrice: number;
  transactionDate?: string | null;
}

interface Props {
  data: PricePoint[];
  width?: number;
  height?: number;
  showLabels?: boolean;
}

export function PriceSparkline({ data, width = 120, height = 32, showLabels }: Props) {
  const { bars, min, max, avg } = useMemo(() => {
    if (data.length === 0) return { bars: [], min: 0, max: 0, avg: 0 };
    const prices = data.map((d) => d.unitPrice);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    const range = max - min || 1; // Prevent division by zero
    // Reverse so oldest is left, newest is right
    const reversed = [...data].reverse();
    const bars = reversed.map((d) => ({
      height: Math.max(2, ((d.unitPrice - min) / range) * (height - 4)),
      price: d.unitPrice,
      isLatest: d === data[0],
    }));
    return { bars, min, max, avg };
  }, [data, height]);

  if (bars.length === 0) return null;

  const barWidth = Math.max(3, Math.min(8, (width - bars.length) / bars.length));
  const gap = Math.max(1, Math.min(2, (width - barWidth * bars.length) / (bars.length - 1 || 1)));

  return (
    <View style={{ width }}>
      <View style={[s.chart, { height }]}>
        {bars.map((bar, idx) => (
          <View
            key={idx}
            style={[
              s.bar,
              {
                width: barWidth,
                height: bar.height,
                marginRight: idx < bars.length - 1 ? gap : 0,
                backgroundColor: bar.isLatest ? colors.primary : colors.secondaryLight,
                opacity: bar.isLatest ? 1 : 0.7,
              },
            ]}
          />
        ))}
      </View>
      {showLabels && (
        <View style={s.labels}>
          <Text style={s.labelText}>${min.toFixed(2)}</Text>
          <Text style={[s.labelText, { fontWeight: "700" }]}>avg ${avg.toFixed(2)}</Text>
          <Text style={s.labelText}>${max.toFixed(2)}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  bar: {
    borderRadius: 1.5,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  labelText: {
    fontSize: 8,
    color: colors.textMuted,
  },
});
