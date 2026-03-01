import * as Print from "expo-print";
import * as SecureStore from "expo-secure-store";
import { Platform, Alert } from "react-native";
import { generateLabelHtml } from "./placard-label";

const PRINTER_KEY = "nexplac_printer_url";

/**
 * Print a Nex-Plac label to the Brother PT-P710BT (or any AirPrint-compatible printer).
 *
 * On first use the iOS printer picker appears — the user selects the Brother.
 * The printer URL is cached so subsequent prints skip the picker.
 */
export async function printPlacardLabel(params: {
  qrDataUrl: string;
  placardCode: string;
  assetName: string;
  manufacturer?: string | null;
  model?: string | null;
}): Promise<boolean> {
  const html = generateLabelHtml(params);

  try {
    let printerUrl: string | null = null;

    // Try to use the cached printer (iOS only)
    if (Platform.OS === "ios") {
      printerUrl = await SecureStore.getItemAsync(PRINTER_KEY);
    }

    if (printerUrl) {
      // Print directly to cached printer
      await Print.printAsync({ html, printerUrl });
    } else if (Platform.OS === "ios") {
      // Show printer picker — user selects the Brother PT-P710BT
      const printer = await Print.selectPrinterAsync();
      if (printer?.url) {
        await SecureStore.setItemAsync(PRINTER_KEY, printer.url);
        await Print.printAsync({ html, printerUrl: printer.url });
      } else {
        // User cancelled printer selection
        return false;
      }
    } else {
      // Android — use system print dialog
      await Print.printAsync({ html });
    }

    return true;
  } catch (err: any) {
    console.warn("[PlacardPrint] Print failed:", err?.message);

    // If cached printer is stale (e.g. disconnected), clear cache and retry once
    if (printerUrlLikelyStale(err)) {
      await SecureStore.deleteItemAsync(PRINTER_KEY);
      Alert.alert(
        "Printer Not Found",
        "The previously selected printer is unavailable. Please select it again.",
      );
    } else {
      Alert.alert("Print Failed", err?.message || "Could not print the placard label.");
    }
    return false;
  }
}

/** Clear the cached printer so the next print shows the picker. */
export async function clearCachedPrinter(): Promise<void> {
  await SecureStore.deleteItemAsync(PRINTER_KEY);
}

function printerUrlLikelyStale(err: any): boolean {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("printer") ||
    msg.includes("unavailable") ||
    msg.includes("not found") ||
    msg.includes("connection")
  );
}
