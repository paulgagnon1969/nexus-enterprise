import Foundation
import Vision
import CoreImage
import ARKit

// MARK: - Vision Analyzer

/// Runs Apple Vision framework analysis on AR frames captured during a RoomPlan session.
/// Samples frames at ~2s intervals to classify room type, detect fixtures (outlets, switches,
/// vents, etc.), read text (model numbers, labels), and suggest materials.
/// All processing is on-device — no network calls.
@available(iOS 16.0, *)
class VisionAnalyzer {

  // MARK: - Configuration

  /// Minimum interval between frame analyses (seconds).
  /// Balances thoroughness vs battery/CPU during scan.
  private let sampleInterval: TimeInterval = 2.0
  private var lastSampleTime: TimeInterval = 0

  /// Minimum confidence to keep a classification or detection.
  private let classificationThreshold: Float = 0.15
  private let rectangleThreshold: Float = 0.60
  private let textThreshold: Float = 0.50

  // MARK: - Accumulated Results

  /// Room type votes across frames — majority wins.
  private var roomTypeVotes: [String: Float] = [:]
  /// Scene attributes accumulated across frames.
  private var sceneAttributeVotes: [String: [Float]] = [:]
  /// Detected rectangles (potential outlets, switches, registers, panels).
  private var detectedRectangles: [DetectedRect] = []
  /// OCR text found across frames.
  private var detectedTexts: Set<String> = []
  /// Material observations for surfaces.
  private var flooringVotes: [String: [Float]] = [:]
  private var wallMaterialVotes: [String: [Float]] = [:]
  private var ceilingMaterialVotes: [String: [Float]] = [:]

  /// Serial queue for thread-safe accumulation.
  private let analysisQueue = DispatchQueue(label: "com.nexus.vision-analyzer", qos: .userInitiated)

  /// Track total frames analyzed.
  private(set) var framesAnalyzed: Int = 0

  // MARK: - Public API

  /// Call this on every AR frame update. Internally throttles to sampleInterval.
  func analyzeFrameIfNeeded(_ frame: ARFrame) {
    let now = frame.timestamp
    guard now - lastSampleTime >= sampleInterval else { return }
    lastSampleTime = now

    let pixelBuffer = frame.capturedImage

    analysisQueue.async { [weak self] in
      self?.runAnalysis(on: pixelBuffer)
    }
  }

  /// Returns the consolidated results after scanning is complete.
  func getResults() -> [String: Any] {
    return analysisQueue.sync {
      return buildResults()
    }
  }

  /// Reset all accumulated data (e.g. between scans).
  func reset() {
    analysisQueue.sync {
      roomTypeVotes.removeAll()
      sceneAttributeVotes.removeAll()
      detectedRectangles.removeAll()
      detectedTexts.removeAll()
      flooringVotes.removeAll()
      wallMaterialVotes.removeAll()
      ceilingMaterialVotes.removeAll()
      framesAnalyzed = 0
      lastSampleTime = 0
    }
  }

  // MARK: - Analysis Pipeline

  private func runAnalysis(on pixelBuffer: CVPixelBuffer) {
    framesAnalyzed += 1

    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .right, options: [:])

    // Build requests
    var requests: [VNRequest] = []

    // 1. Scene classification — room type + materials + attributes
    let classifyRequest = VNClassifyImageRequest()
    requests.append(classifyRequest)

    // 2. Rectangle detection — outlets, switches, registers, panels, mirrors
    let rectRequest = VNDetectRectanglesRequest()
    rectRequest.minimumAspectRatio = 0.3
    rectRequest.maximumAspectRatio = 1.0
    rectRequest.minimumSize = 0.01        // Small objects (outlets ~1% of frame)
    rectRequest.maximumObservations = 20
    rectRequest.minimumConfidence = rectangleThreshold
    requests.append(rectRequest)

    // 3. Text recognition — model numbers, labels, panel schedules
    let textRequest = VNRecognizeTextRequest()
    textRequest.recognitionLevel = .accurate
    textRequest.usesLanguageCorrection = true
    requests.append(textRequest)

    do {
      try handler.perform(requests)
    } catch {
      // Vision failed on this frame — skip, will retry on next sample
      return
    }

    // Process classification results
    if let observations = classifyRequest.results {
      processClassifications(observations)
    }

    // Process rectangle detections
    if let observations = rectRequest.results {
      processRectangles(observations)
    }

    // Process text results
    if let observations = textRequest.results {
      processText(observations)
    }
  }

  // MARK: - Classification Processing

  private func processClassifications(_ observations: [VNClassificationObservation]) {
    for obs in observations where obs.confidence >= classificationThreshold {
      let label = obs.identifier.lowercased()
      let conf = obs.confidence

      // Room type keywords
      if isRoomTypeLabel(label) {
        let normalized = normalizeRoomType(label)
        roomTypeVotes[normalized] = (roomTypeVotes[normalized] ?? 0) + conf
      }

      // Material keywords
      if isFlooringLabel(label) {
        flooringVotes[label, default: []].append(conf)
      }
      if isWallMaterialLabel(label) {
        wallMaterialVotes[label, default: []].append(conf)
      }
      if isCeilingLabel(label) {
        ceilingMaterialVotes[label, default: []].append(conf)
      }

      // Accumulate all scene attributes above threshold
      sceneAttributeVotes[label, default: []].append(conf)
    }
  }

  // MARK: - Rectangle Processing

  private func processRectangles(_ observations: [VNDetectedObjectObservation]) {
    for obs in observations {
      let bounds = obs.boundingBox
      let conf = obs.confidence

      // Classify rectangle by position, size, and aspect ratio
      let rect = DetectedRect(
        bounds: bounds,
        confidence: conf,
        frameRegion: classifyFrameRegion(bounds),
        aspectRatio: Float(bounds.width / bounds.height),
        relativeSize: Float(bounds.width * bounds.height)
      )

      // Deduplicate: skip if too close to an existing detection
      if !isDuplicate(rect) {
        detectedRectangles.append(rect)
      }
    }
  }

  // MARK: - Text Processing

  private func processText(_ observations: [VNRecognizedTextObservation]) {
    for obs in observations where obs.confidence >= textThreshold {
      guard let topCandidate = obs.topCandidates(1).first else { continue }
      let text = topCandidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
      // Filter noise: only keep strings with 3+ chars
      if text.count >= 3 {
        detectedTexts.insert(text)
      }
    }
  }

  // MARK: - Result Building

  private func buildResults() -> [String: Any] {
    // Room type: highest cumulative vote
    let roomType = roomTypeVotes.max(by: { $0.value < $1.value })
    let roomTypeConf = roomType.map { $0.value / Float(max(framesAnalyzed, 1)) } ?? 0

    // Scene attributes: top 10 by average confidence
    let topAttributes: [[String: Any]] = sceneAttributeVotes
      .map { (label, confs) -> (String, Float) in
        (label, confs.reduce(0, +) / Float(confs.count))
      }
      .sorted { $0.1 > $1.1 }
      .prefix(10)
      .map { ["label": $0.0, "confidence": $0.1] }

    // Materials: top vote for each surface
    let flooring = topMaterial(from: flooringVotes)
    let wallMat = topMaterial(from: wallMaterialVotes)
    let ceilingMat = topMaterial(from: ceilingMaterialVotes)

    // Rectangles → serialized
    let rects: [[String: Any]] = detectedRectangles.enumerated().map { (i, r) in
      [
        "id": "vrect_\(i)",
        "bounds": [
          "x": r.bounds.origin.x,
          "y": r.bounds.origin.y,
          "width": r.bounds.width,
          "height": r.bounds.height,
        ],
        "confidence": r.confidence,
        "frameRegion": r.frameRegion,
        "aspectRatio": r.aspectRatio,
        "relativeSize": r.relativeSize,
      ]
    }

    return [
      "roomType": roomType?.key ?? NSNull(),
      "roomTypeConfidence": roomTypeConf,
      "sceneAttributes": topAttributes,
      "materials": [
        "flooring": flooring as Any,
        "walls": wallMat as Any,
        "ceiling": ceilingMat as Any,
      ],
      "detectedText": Array(detectedTexts),
      "additionalRectangles": rects,
      "framesAnalyzed": framesAnalyzed,
    ]
  }

  // MARK: - Helpers

  private func topMaterial(from votes: [String: [Float]]) -> [String: Any]? {
    guard let top = votes
      .map({ (label, confs) -> (String, Float) in
        (label, confs.reduce(0, +) / Float(confs.count))
      })
      .max(by: { $0.1 < $1.1 })
    else { return nil }
    return ["type": top.0, "confidence": top.1]
  }

  /// Classify where in the frame a rectangle sits — helps infer what it is.
  /// Top 30% of frame → ceiling mount (smoke detector, light, vent).
  /// Bottom 20% → floor mount (floor register, baseboard outlet).
  /// Middle → wall mount (outlet, switch, thermostat, panel).
  private func classifyFrameRegion(_ bounds: CGRect) -> String {
    let centerY = bounds.origin.y + bounds.height / 2
    // Vision coordinates: (0,0) is bottom-left, (1,1) is top-right
    if centerY > 0.70 { return "ceiling" }
    if centerY < 0.20 { return "floor" }
    return "wall"
  }

  /// Deduplicate: if a new rect overlaps >50% with an existing one, skip it.
  private func isDuplicate(_ newRect: DetectedRect) -> Bool {
    for existing in detectedRectangles {
      let intersection = existing.bounds.intersection(newRect.bounds)
      if !intersection.isNull {
        let overlapArea = intersection.width * intersection.height
        let newArea = newRect.bounds.width * newRect.bounds.height
        if newArea > 0 && overlapArea / newArea > 0.5 {
          return true
        }
      }
    }
    return false
  }

  // MARK: - Label Classification

  private static let roomTypeKeywords: Set<String> = [
    "bathroom", "kitchen", "bedroom", "living_room", "living room",
    "dining_room", "dining room", "office", "laundry", "garage",
    "closet", "hallway", "basement", "attic", "utility",
    "foyer", "entry", "pantry", "mudroom",
  ]

  private func isRoomTypeLabel(_ label: String) -> Bool {
    return Self.roomTypeKeywords.contains(where: { label.contains($0) })
  }

  private func normalizeRoomType(_ label: String) -> String {
    // Map variations to canonical names
    if label.contains("bathroom") || label.contains("bath") { return "bathroom" }
    if label.contains("kitchen") { return "kitchen" }
    if label.contains("bedroom") { return "bedroom" }
    if label.contains("living") { return "living_room" }
    if label.contains("dining") { return "dining_room" }
    if label.contains("office") { return "office" }
    if label.contains("laundry") { return "laundry" }
    if label.contains("garage") { return "garage" }
    if label.contains("closet") { return "closet" }
    if label.contains("hallway") || label.contains("hall") { return "hallway" }
    if label.contains("basement") { return "basement" }
    if label.contains("attic") { return "attic" }
    if label.contains("utility") { return "utility" }
    if label.contains("foyer") || label.contains("entry") { return "foyer" }
    if label.contains("pantry") { return "pantry" }
    return label
  }

  private static let flooringKeywords: Set<String> = [
    "hardwood", "tile", "carpet", "laminate", "vinyl", "concrete",
    "marble", "stone", "linoleum", "bamboo", "cork", "terrazzo",
  ]

  private func isFlooringLabel(_ label: String) -> Bool {
    return Self.flooringKeywords.contains(where: { label.contains($0) })
  }

  private static let wallKeywords: Set<String> = [
    "drywall", "plaster", "wallpaper", "brick", "stone", "tile",
    "paneling", "wainscoting", "beadboard", "shiplap", "stucco",
  ]

  private func isWallMaterialLabel(_ label: String) -> Bool {
    return Self.wallKeywords.contains(where: { label.contains($0) })
  }

  private static let ceilingKeywords: Set<String> = [
    "popcorn", "textured", "smooth", "coffered", "tray", "vaulted",
    "drop_ceiling", "acoustic_tile", "exposed_beam", "tin",
  ]

  private func isCeilingLabel(_ label: String) -> Bool {
    return Self.ceilingKeywords.contains(where: { label.contains($0) })
  }
}

// MARK: - Internal Types

@available(iOS 16.0, *)
extension VisionAnalyzer {
  struct DetectedRect {
    let bounds: CGRect
    let confidence: Float
    let frameRegion: String   // "ceiling", "wall", "floor"
    let aspectRatio: Float
    let relativeSize: Float   // fraction of total frame area
  }
}
