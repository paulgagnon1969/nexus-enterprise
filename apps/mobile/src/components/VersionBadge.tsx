import React from "react";
import { Text, StyleSheet, View } from "react-native";
import { version } from "../../package.json";

export function VersionBadge() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>v{version}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 9999,
  },
  text: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
});
