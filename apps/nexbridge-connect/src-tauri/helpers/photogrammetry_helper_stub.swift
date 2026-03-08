// photogrammetry_helper stub for Intel Macs
// PhotogrammetrySession requires Apple Silicon — this stub exits gracefully.
import Foundation

let dict: [String: Any] = [
    "stage": "error",
    "pct": -1,
    "message": "Photogrammetry requires Apple Silicon (M1 or later). This feature is not available on Intel Macs."
]
if let data = try? JSONSerialization.data(withJSONObject: dict),
   let str = String(data: data, encoding: .utf8) {
    print(str)
}
exit(1)
