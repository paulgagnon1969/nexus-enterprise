import ExpoModulesCore
import UIKit
import Vision

// MARK: - NEXI: Nexus Enhanced eXtraction Identifier
//
// Uses Apple Vision's VNGenerateImageFeaturePrintRequest to produce
// a compact visual fingerprint (~8 KB) from any image. Fingerprints
// can be compared on-device to identify objects without network calls
// or model training — new objects are instantly recognizable after
// a single enrollment scan.

public class NexusNexiModule: Module {

  public func definition() -> ModuleDefinition {
    Name("NexusNexi")

    // ── Extract a single feature print from an image ──────────────
    // Returns { data: base64, elementCount: Int, elementType: Int }
    AsyncFunction("extractFeaturePrint") { (imageUri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard let image = Self.loadCGImage(from: imageUri) else {
          promise.reject("LOAD_ERROR", "Could not load image from URI: \(imageUri)")
          return
        }

        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        let request = VNGenerateImageFeaturePrintRequest()

        do {
          try handler.perform([request])
        } catch {
          promise.reject("VISION_ERROR", "Feature print extraction failed: \(error.localizedDescription)")
          return
        }

        guard let observation = request.results?.first as? VNFeaturePrintObservation else {
          promise.reject("NO_RESULT", "No feature print produced for image")
          return
        }

        let base64 = observation.data.base64EncodedString()
        promise.resolve([
          "data": base64,
          "elementCount": observation.elementCount,
          "elementType": observation.elementType.rawValue,
        ])
      }
    }

    // ── Batch-extract feature prints from multiple images ─────────
    // Used during enrollment: capture 5-10 photos, extract all at once.
    AsyncFunction("extractMultipleFeaturePrints") { (imageUris: [String], promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        var results: [[String: Any]] = []
        var errors: [String] = []

        for (i, uri) in imageUris.enumerated() {
          guard let image = Self.loadCGImage(from: uri) else {
            errors.append("Failed to load image \(i): \(uri)")
            continue
          }

          let handler = VNImageRequestHandler(cgImage: image, options: [:])
          let request = VNGenerateImageFeaturePrintRequest()

          do {
            try handler.perform([request])
          } catch {
            errors.append("Vision failed on image \(i): \(error.localizedDescription)")
            continue
          }

          guard let observation = request.results?.first as? VNFeaturePrintObservation else {
            errors.append("No feature print for image \(i)")
            continue
          }

          results.append([
            "data": observation.data.base64EncodedString(),
            "elementCount": observation.elementCount,
            "elementType": observation.elementType.rawValue,
          ])
        }

        promise.resolve([
          "prints": results,
          "errors": errors,
          "totalRequested": imageUris.count,
          "totalExtracted": results.count,
        ])
      }
    }

    // ── Compare two feature prints ────────────────────────────────
    // Returns { distance: Float } — lower = more similar.
    // Typical thresholds: < 5.0 strong match, 5-10 likely, > 15 no match.
    AsyncFunction("compareFeaturePrints") { (aBase64: String, bBase64: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard let obsA = Self.featurePrint(fromBase64: aBase64),
              let obsB = Self.featurePrint(fromBase64: bBase64)
        else {
          promise.reject("DECODE_ERROR", "Could not decode feature print data")
          return
        }

        var distance: Float = 0
        do {
          try obsA.computeDistance(&distance, to: obsB)
        } catch {
          promise.reject("COMPARE_ERROR", "Distance computation failed: \(error.localizedDescription)")
          return
        }

        promise.resolve(["distance": distance])
      }
    }

    // ── Find best match from a catalog of prints ──────────────────
    // queryPrint: base64 feature print of the unknown object.
    // catalogPrints: array of base64 feature prints from stored catalog entries.
    //                Each entry may have multiple prints — caller should pass the
    //                "representative" (first) print per entry, or flatten all and
    //                map indices back on the JS side.
    // Returns { bestIndex: Int, distance: Float, distances: [Float] }
    AsyncFunction("findBestMatch") { (queryBase64: String, catalogBase64s: [String], promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard let queryObs = Self.featurePrint(fromBase64: queryBase64) else {
          promise.reject("DECODE_ERROR", "Could not decode query feature print")
          return
        }

        var bestIndex = -1
        var bestDistance: Float = .greatestFiniteMagnitude
        var allDistances: [Float] = []

        for (i, catalogB64) in catalogBase64s.enumerated() {
          guard let catalogObs = Self.featurePrint(fromBase64: catalogB64) else {
            allDistances.append(-1) // sentinel for decode failure
            continue
          }

          var distance: Float = 0
          do {
            try queryObs.computeDistance(&distance, to: catalogObs)
          } catch {
            allDistances.append(-1)
            continue
          }

          allDistances.append(distance)
          if distance < bestDistance {
            bestDistance = distance
            bestIndex = i
          }
        }

        promise.resolve([
          "bestIndex": bestIndex,
          "distance": bestIndex >= 0 ? bestDistance : -1,
          "distances": allDistances,
        ])
      }
    }

    // ── Quick identify: extract print from image + match in one call ─
    // Convenience method to avoid JS round-trip between extract and match.
    AsyncFunction("identifyFromImage") { (imageUri: String, catalogBase64s: [String], promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard let image = Self.loadCGImage(from: imageUri) else {
          promise.reject("LOAD_ERROR", "Could not load image from URI: \(imageUri)")
          return
        }

        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        let request = VNGenerateImageFeaturePrintRequest()

        do {
          try handler.perform([request])
        } catch {
          promise.reject("VISION_ERROR", "Feature print extraction failed: \(error.localizedDescription)")
          return
        }

        guard let queryObs = request.results?.first as? VNFeaturePrintObservation else {
          promise.reject("NO_RESULT", "No feature print produced")
          return
        }

        var bestIndex = -1
        var bestDistance: Float = .greatestFiniteMagnitude

        for (i, catalogB64) in catalogBase64s.enumerated() {
          guard let catalogObs = Self.featurePrint(fromBase64: catalogB64) else { continue }

          var distance: Float = 0
          do {
            try queryObs.computeDistance(&distance, to: catalogObs)
          } catch {
            continue
          }

          if distance < bestDistance {
            bestDistance = distance
            bestIndex = i
          }
        }

        promise.resolve([
          "bestIndex": bestIndex,
          "distance": bestIndex >= 0 ? bestDistance : -1,
          "queryPrint": queryObs.data.base64EncodedString(),
        ])
      }
    }
  }

  // MARK: - Helpers

  /// Load a CGImage from a file:// URI or absolute path.
  private static func loadCGImage(from uri: String) -> CGImage? {
    var path = uri
    if path.hasPrefix("file://") {
      path = String(path.dropFirst(7))
    }
    // URL-decode percent-encoded paths (e.g. spaces → %20)
    path = path.removingPercentEncoding ?? path

    guard let data = FileManager.default.contents(atPath: path),
          let source = CGImageSourceCreateWithData(data as CFData, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else {
      return nil
    }
    return image
  }

  /// Reconstruct a VNFeaturePrintObservation from base64-encoded raw data.
  /// Uses the internal data layout: elementType (UInt32) + elementCount (UInt32) + raw floats.
  /// Since VNFeaturePrintObservation doesn't expose an init from raw data,
  /// we create a dummy observation via a white image and overwrite its data.
  ///
  /// Alternate (more robust) approach: store observations as keyed archives.
  /// But the base64-of-data approach is simpler and cross-compatible.
  private static func featurePrint(fromBase64 base64: String) -> VNFeaturePrintObservation? {
    guard let data = Data(base64Encoded: base64) else { return nil }

    // Generate a dummy feature print to get a real observation object,
    // then use setValue to inject our stored data.
    // This works because VNFeaturePrintObservation.data is the full payload.
    let dummyImage = createWhiteImage()
    let handler = VNImageRequestHandler(cgImage: dummyImage, options: [:])
    let request = VNGenerateImageFeaturePrintRequest()

    do {
      try handler.perform([request])
    } catch {
      return nil
    }

    guard let observation = request.results?.first as? VNFeaturePrintObservation else {
      return nil
    }

    // Replace the observation's data with our stored data.
    // VNFeaturePrintObservation.data is read-only in the public API,
    // but we can use key-value coding to set it.
    observation.setValue(data, forKey: "data")
    return observation
  }

  /// Tiny 1x1 white CGImage used to bootstrap dummy feature print observations.
  private static var cachedWhiteImage: CGImage?

  private static func createWhiteImage() -> CGImage {
    if let cached = cachedWhiteImage { return cached }

    let size = 64 // Small but large enough for Vision to process
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let context = CGContext(
      data: nil, width: size, height: size,
      bitsPerComponent: 8, bytesPerRow: size * 4,
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    context.setFillColor(UIColor.white.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: size, height: size))
    let image = context.makeImage()!
    cachedWhiteImage = image
    return image
  }
}
