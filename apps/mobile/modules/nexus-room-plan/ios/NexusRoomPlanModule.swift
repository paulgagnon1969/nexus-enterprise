import ExpoModulesCore
import UIKit

// RoomPlan is available on iOS 16+ with LiDAR
#if canImport(RoomPlan)
import RoomPlan
#endif

public class NexusRoomPlanModule: Module {
  // Strong reference keeps coordinator alive during capture session.
  // Without this, ARC deallocates it immediately after start() returns,
  // causing a black screen (session never starts).
  #if canImport(RoomPlan)
  private var activeCoordinator: AnyObject?
  #endif

  public func definition() -> ModuleDefinition {
    Name("NexusRoomPlan")

    /// Check if device supports RoomPlan (LiDAR + iOS 16+)
    AsyncFunction("isSupported") { () -> Bool in
      #if canImport(RoomPlan)
      if #available(iOS 16.0, *) {
        return RoomCaptureSession.isSupported
      }
      #endif
      return false
    }

    /// Launch full-screen RoomPlan capture and return structured room data
    AsyncFunction("startCapture") { (promise: Promise) in
      #if canImport(RoomPlan)
      if #available(iOS 16.0, *) {
        guard RoomCaptureSession.isSupported else {
          promise.reject("UNSUPPORTED", "Device does not support RoomPlan (no LiDAR)")
          return
        }

        DispatchQueue.main.async { [weak self] in
          let coordinator = RoomCaptureCoordinator(promise: promise) { [weak self] in
            // Release coordinator when capture completes
            self?.activeCoordinator = nil
          }
          self?.activeCoordinator = coordinator
          coordinator.start()
        }
        return
      }
      #endif
      promise.reject("UNSUPPORTED", "RoomPlan requires iOS 16+ with LiDAR")
    }
  }
}

// MARK: - RoomPlan Capture Coordinator

#if canImport(RoomPlan)
@objc(NexusRoomCaptureCoordinator)
@available(iOS 16.0, *)
class RoomCaptureCoordinator: NSObject, NSCoding, RoomCaptureViewDelegate, RoomCaptureSessionDelegate {
  private let promise: Promise
  private let onCleanup: () -> Void
  private var captureView: RoomCaptureView?
  private var viewController: UIViewController?
  private var finalRoom: CapturedRoom?
  /// Vision AI analyzer — samples AR frames during capture for room classification,
  /// fixture detection (outlets, switches, vents), text recognition, and materials.
  private let visionAnalyzer = VisionAnalyzer()

  init(promise: Promise, onCleanup: @escaping () -> Void) {
    self.promise = promise
    self.onCleanup = onCleanup
    super.init()
  }

  // NSCoding stubs — never used, but required for @objc NSObject in archive builds
  @objc required init?(coder: NSCoder) { return nil }
  func encode(with coder: NSCoder) {}

  func start() {
    let vc = UIViewController()
    let captureView = RoomCaptureView(frame: vc.view.bounds)
    captureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    captureView.delegate = self
    captureView.captureSession.delegate = self

    vc.view.addSubview(captureView)

    // Add a done button overlay
    let doneButton = UIButton(type: .system)
    doneButton.setTitle("Done Scanning", for: .normal)
    doneButton.titleLabel?.font = UIFont.boldSystemFont(ofSize: 18)
    doneButton.backgroundColor = UIColor.systemGreen
    doneButton.setTitleColor(.white, for: .normal)
    doneButton.layer.cornerRadius = 12
    doneButton.translatesAutoresizingMaskIntoConstraints = false
    doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
    vc.view.addSubview(doneButton)

    NSLayoutConstraint.activate([
      doneButton.bottomAnchor.constraint(equalTo: vc.view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
      doneButton.centerXAnchor.constraint(equalTo: vc.view.centerXAnchor),
      doneButton.widthAnchor.constraint(equalToConstant: 200),
      doneButton.heightAnchor.constraint(equalToConstant: 50),
    ])

    // Add cancel button
    let cancelButton = UIButton(type: .system)
    cancelButton.setTitle("Cancel", for: .normal)
    cancelButton.titleLabel?.font = UIFont.systemFont(ofSize: 16)
    cancelButton.setTitleColor(.white, for: .normal)
    cancelButton.translatesAutoresizingMaskIntoConstraints = false
    cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
    vc.view.addSubview(cancelButton)

    NSLayoutConstraint.activate([
      cancelButton.topAnchor.constraint(equalTo: vc.view.safeAreaLayoutGuide.topAnchor, constant: 16),
      cancelButton.leadingAnchor.constraint(equalTo: vc.view.leadingAnchor, constant: 20),
    ])

    vc.modalPresentationStyle = .fullScreen

    self.captureView = captureView
    self.viewController = vc

    // Present from the root view controller
    guard let rootVC = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene })
      .flatMap({ $0.windows })
      .first(where: { $0.isKeyWindow })?
      .rootViewController?.presentedViewController ?? UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene })
      .flatMap({ $0.windows })
      .first(where: { $0.isKeyWindow })?
      .rootViewController
    else {
      promise.reject("PRESENTATION_ERROR", "Could not find root view controller")
      return
    }

    rootVC.present(vc, animated: true) { [weak self] in
      let config = RoomCaptureSession.Configuration()
      self?.captureView?.captureSession.run(configuration: config)
    }
  }

  @objc private func doneTapped() {
    captureView?.captureSession.stop()
  }

  @objc private func cancelTapped() {
    captureView?.captureSession.stop()
    viewController?.dismiss(animated: true) { [weak self] in
      self?.promise.reject("CANCELLED", "User cancelled room scan")
      self?.onCleanup()
    }
  }

  // MARK: - RoomCaptureSessionDelegate

  func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {
    // This delegate fires when session stops; data is available after processing
  }

  /// Called on every room model update during scanning — use to feed Vision analyzer.
  func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
    // Grab the current AR frame and feed it to Vision analyzer
    if let arFrame = session.arSession.currentFrame {
      visionAnalyzer.analyzeFrameIfNeeded(arFrame)
    }
  }

  // MARK: - RoomCaptureViewDelegate

  func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
    return true // Always process
  }

  func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
    // Dismiss and return data
    viewController?.dismiss(animated: true) { [weak self] in
      guard let self = self else { return }

      if let error = error {
        self.promise.reject("PROCESSING_ERROR", error.localizedDescription)
        return
      }

      var result = self.serializeCapturedRoom(processedResult)
      // Merge Vision AI analysis results alongside RoomPlan data
      result["visionDetections"] = self.visionAnalyzer.getResults()
      self.promise.resolve(["roomData": result])
      self.visionAnalyzer.reset()
      self.onCleanup()
    }
  }

  // MARK: - Serialization

  private func serializeCapturedRoom(_ room: CapturedRoom) -> [String: Any] {
    var result: [String: Any] = [:]

    // Serialize walls with IDs for adjacency mapping
    let wallsData = room.walls.enumerated().map { (i, wall) -> [String: Any] in
      let pos = positionFromTransform(wall.transform)
      return [
        "id": "wall_\(i)",
        "dimensions": [
          "width": wall.dimensions.x,   // length of the wall (meters)
          "height": wall.dimensions.y,  // height (meters)
          "length": wall.dimensions.z,  // thickness (meters)
        ],
        "position": ["x": pos.x, "y": pos.y, "z": pos.z],
        "transform": serializeTransform(wall.transform),
      ]
    }
    result["walls"] = wallsData

    // Serialize doors with category and wall adjacency
    result["doors"] = room.doors.enumerated().map { (i, door) -> [String: Any] in
      let pos = positionFromTransform(door.transform)
      let nearestWall = findNearestWall(position: pos, walls: room.walls, wallIds: wallsData)
      return [
        "id": "door_\(i)",
        "category": serializeSurfaceCategory(door),
        "dimensions": [
          "width": door.dimensions.x,
          "height": door.dimensions.y,
        ],
        "position": ["x": pos.x, "y": pos.y, "z": pos.z],
        "wallId": nearestWall,
        "transform": serializeTransform(door.transform),
      ]
    }

    // Serialize windows with category and wall adjacency
    result["windows"] = room.windows.enumerated().map { (i, window) -> [String: Any] in
      let pos = positionFromTransform(window.transform)
      let nearestWall = findNearestWall(position: pos, walls: room.walls, wallIds: wallsData)
      return [
        "id": "window_\(i)",
        "category": serializeSurfaceCategory(window),
        "dimensions": [
          "width": window.dimensions.x,
          "height": window.dimensions.y,
        ],
        "position": ["x": pos.x, "y": pos.y, "z": pos.z],
        "wallId": nearestWall,
        "transform": serializeTransform(window.transform),
      ]
    }

    // Serialize openings with wall adjacency
    result["openings"] = room.openings.enumerated().map { (i, opening) -> [String: Any] in
      let pos = positionFromTransform(opening.transform)
      let nearestWall = findNearestWall(position: pos, walls: room.walls, wallIds: wallsData)
      return [
        "id": "opening_\(i)",
        "category": serializeSurfaceCategory(opening),
        "dimensions": [
          "width": opening.dimensions.x,
          "height": opening.dimensions.y,
        ],
        "position": ["x": pos.x, "y": pos.y, "z": pos.z],
        "wallId": nearestWall,
        "transform": serializeTransform(opening.transform),
      ]
    }

    // Serialize ALL objects — capture everything: sinks, faucets, toilets, cabinets, appliances, furniture
    result["objects"] = room.objects.enumerated().map { (i, obj) -> [String: Any] in
      let pos = positionFromTransform(obj.transform)
      let cat = mapObjectCategory(obj.category)
      return [
        "id": "obj_\(i)",
        "category": cat.mapped,
        "rawCategory": cat.raw,
        "label": cat.label,
        "dimensions": [
          "width": obj.dimensions.x,
          "height": obj.dimensions.y,
          "length": obj.dimensions.z,
        ],
        "position": ["x": pos.x, "y": pos.y, "z": pos.z],
        "transform": serializeTransform(obj.transform),
        "confidence": 1.0, // RoomPlan detections are high confidence
      ]
    }

    // Derive ceiling height from wall heights
    let wallHeights = room.walls.map { $0.dimensions.y }
    let avgCeilingHeight = wallHeights.isEmpty ? 0 : wallHeights.reduce(0, +) / Float(wallHeights.count)
    let minHeight = wallHeights.min() ?? 0
    let maxHeight = wallHeights.max() ?? 0
    result["ceilingHeight"] = Double(avgCeilingHeight)
    result["ceilingHeightVaries"] = (maxHeight - minHeight) > 0.15 // >6" variation = vaulted/stepped

    // Floor polygon from wall positions (project wall centers onto XZ plane)
    let floorVertices: [[Double]] = room.walls.map { wall in
      let p = positionFromTransform(wall.transform)
      return [Double(p.x), Double(p.z)] // XZ plane = floor plane
    }
    result["floorPolygon"] = floorVertices

    // Summary counts for quick access
    result["summary"] = [
      "wallCount": room.walls.count,
      "doorCount": room.doors.count,
      "windowCount": room.windows.count,
      "openingCount": room.openings.count,
      "objectCount": room.objects.count,
    ]

    return result
  }

  // MARK: - Helpers

  private func positionFromTransform(_ t: simd_float4x4) -> SIMD3<Float> {
    return SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
  }

  /// Find the nearest wall to a door/window/opening based on XZ distance.
  private func findNearestWall(position: SIMD3<Float>, walls: [CapturedRoom.Surface], wallIds: [[String: Any]]) -> String {
    var nearestId = ""
    var nearestDist: Float = .greatestFiniteMagnitude

    for (i, wall) in walls.enumerated() {
      let wallPos = positionFromTransform(wall.transform)
      // Use XZ distance (horizontal plane) — Y is height
      let dx = position.x - wallPos.x
      let dz = position.z - wallPos.z
      let dist = sqrt(dx * dx + dz * dz)
      if dist < nearestDist {
        nearestDist = dist
        nearestId = wallIds[i]["id"] as? String ?? "wall_\(i)"
      }
    }
    return nearestId
  }

  private func serializeTransform(_ t: simd_float4x4) -> [Float] {
    return [
      t.columns.0.x, t.columns.0.y, t.columns.0.z, t.columns.0.w,
      t.columns.1.x, t.columns.1.y, t.columns.1.z, t.columns.1.w,
      t.columns.2.x, t.columns.2.y, t.columns.2.z, t.columns.2.w,
      t.columns.3.x, t.columns.3.y, t.columns.3.z, t.columns.3.w,
    ]
  }

  /// Extract the real surface category from RoomPlan (doors, windows, openings).
  private func serializeSurfaceCategory(_ surface: CapturedRoom.Surface) -> String {
    // CapturedRoom.Surface.Category: .door, .opening, .wall, .window
    let raw = String(describing: surface.category)
    return raw.lowercased()
  }

  /// Map every RoomPlan object category to our ScanNEX fixture taxonomy.
  /// Captures EVERYTHING — sinks, faucets, toilets, appliances, furniture, infrastructure.
  private func mapObjectCategory(_ category: CapturedRoom.Object.Category) -> (mapped: String, raw: String, label: String) {
    let raw = String(describing: category)
    switch category {
    // Plumbing
    case .sink:          return ("sink",         raw, "Sink")
    case .toilet:        return ("toilet",       raw, "Toilet")
    case .bathtub:       return ("bathtub",      raw, "Bathtub")
    // Kitchen appliances
    case .stove:         return ("stove",        raw, "Stove")
    case .oven:          return ("oven",         raw, "Oven")
    case .refrigerator:  return ("refrigerator", raw, "Refrigerator")
    case .dishwasher:    return ("dishwasher",   raw, "Dishwasher")
    // Laundry
    case .washerDryer:   return ("washer",       raw, "Washer/Dryer")
    // Storage
    case .storage:       return ("cabinet",      raw, "Cabinet/Storage")
    // Furniture
    case .table:         return ("table",        raw, "Table")
    case .chair:         return ("chair",        raw, "Chair")
    case .sofa:          return ("sofa",         raw, "Sofa")
    case .bed:           return ("bed",          raw, "Bed")
    // Infrastructure
    case .fireplace:     return ("fireplace",    raw, "Fireplace")
    case .stairs:        return ("stairs",       raw, "Stairs")
    case .television:    return ("television",   raw, "Television")
    @unknown default:    return ("other",        raw, raw.capitalized)
    }
  }
}
#endif
