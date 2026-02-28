import UIKit
import ARKit
import RealityKit

// MARK: - Data Types

/// A single measurement between two 3D points.
struct MeasurementLine {
  let id: String
  let start: SIMD3<Float>
  let end: SIMD3<Float>
  let distanceMeters: Float

  var distanceFeet: Float { distanceMeters * 3.28084 }

  var formatted: String {
    let totalInches = distanceFeet * 12
    let feet = Int(totalInches / 12)
    let inches = Int(totalInches.truncatingRemainder(dividingBy: 12))
    let fraction = totalInches.truncatingRemainder(dividingBy: 1)
    if fraction >= 0.375 && fraction < 0.625 {
      return "\(feet)' \(inches) 1/2\""
    }
    return "\(feet)' \(inches)\""
  }

  func toDictionary() -> [String: Any] {
    return [
      "id": id,
      "startPoint": ["x": start.x, "y": start.y, "z": start.z],
      "endPoint": ["x": end.x, "y": end.y, "z": end.z],
      "distanceMeters": Double(distanceMeters),
      "distanceFeet": Double(distanceFeet),
      "distanceFormatted": formatted,
    ]
  }
}

// MARK: - View Controller

/// Full-screen AR measurement experience.
/// User taps to place points; every two points creates a measurement line.
/// Supports multiple measurements per session, undo, clear all, and screenshot on done.
class ARMeasurementViewController: UIViewController, ARSessionDelegate {

  // ── Callbacks ──────────────────────────────────────────────
  var onComplete: (([String: Any]) -> Void)?
  var onCancel: (() -> Void)?

  // ── AR ─────────────────────────────────────────────────────
  private var arView: ARView!
  private let useLiDAR = ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)

  // ── State ──────────────────────────────────────────────────
  private var currentStartPoint: SIMD3<Float>?
  private var currentStartAnchor: AnchorEntity?
  private var measurements: [MeasurementLine] = []
  private var measurementAnchors: [(anchor: AnchorEntity, label: UILabel)] = []
  private var previewLine: ModelEntity?
  private var previewAnchor: AnchorEntity?

  // ── UI ─────────────────────────────────────────────────────
  private let crosshairView = UIView()
  private let instructionLabel = UILabel()
  private let measurementCountLabel = UILabel()
  private let doneButton = UIButton(type: .system)
  private let undoButton = UIButton(type: .system)
  private let clearButton = UIButton(type: .system)
  private let cancelButton = UIButton(type: .system)
  private let tapButton = UIButton(type: .system)

  // MARK: - Lifecycle

  override func viewDidLoad() {
    super.viewDidLoad()
    setupARView()
    setupUI()
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    arView.session.pause()
  }

  override var prefersStatusBarHidden: Bool { true }

  // MARK: - AR Setup

  private func setupARView() {
    arView = ARView(frame: view.bounds)
    arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    arView.session.delegate = self
    // Subtle coaching overlay while planes are detected
    arView.environment.sceneUnderstanding.options.insert(.occlusion)
    view.addSubview(arView)

    let config = ARWorldTrackingConfiguration()
    config.planeDetection = [.horizontal, .vertical]
    config.environmentTexturing = .automatic

    // Enable mesh reconstruction on LiDAR devices for more accurate raycasting
    if useLiDAR {
      config.sceneReconstruction = .mesh
    }

    arView.session.run(config)
  }

  // MARK: - UI Setup

  private func setupUI() {
    // Crosshair at screen center
    crosshairView.translatesAutoresizingMaskIntoConstraints = false
    crosshairView.isUserInteractionEnabled = false
    view.addSubview(crosshairView)
    drawCrosshair()

    NSLayoutConstraint.activate([
      crosshairView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      crosshairView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      crosshairView.widthAnchor.constraint(equalToConstant: 40),
      crosshairView.heightAnchor.constraint(equalToConstant: 40),
    ])

    // Instruction label (top)
    instructionLabel.text = "Point at a surface and tap to place first point"
    instructionLabel.textColor = .white
    instructionLabel.font = .systemFont(ofSize: 16, weight: .semibold)
    instructionLabel.textAlignment = .center
    instructionLabel.backgroundColor = UIColor.black.withAlphaComponent(0.55)
    instructionLabel.layer.cornerRadius = 10
    instructionLabel.clipsToBounds = true
    instructionLabel.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(instructionLabel)

    NSLayoutConstraint.activate([
      instructionLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 60),
      instructionLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      instructionLabel.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, multiplier: 0.85),
      instructionLabel.heightAnchor.constraint(equalToConstant: 44),
    ])

    // Measurement count badge (top-right)
    measurementCountLabel.text = ""
    measurementCountLabel.textColor = .white
    measurementCountLabel.font = .systemFont(ofSize: 13, weight: .bold)
    measurementCountLabel.textAlignment = .center
    measurementCountLabel.backgroundColor = UIColor.systemGreen.withAlphaComponent(0.8)
    measurementCountLabel.layer.cornerRadius = 14
    measurementCountLabel.clipsToBounds = true
    measurementCountLabel.translatesAutoresizingMaskIntoConstraints = false
    measurementCountLabel.isHidden = true
    view.addSubview(measurementCountLabel)

    NSLayoutConstraint.activate([
      measurementCountLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
      measurementCountLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
      measurementCountLabel.widthAnchor.constraint(equalToConstant: 28),
      measurementCountLabel.heightAnchor.constraint(equalToConstant: 28),
    ])

    // Cancel button (top-left)
    styleButton(cancelButton, title: "Cancel", bgColor: UIColor.white.withAlphaComponent(0.2))
    cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
    view.addSubview(cancelButton)
    NSLayoutConstraint.activate([
      cancelButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
      cancelButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
      cancelButton.widthAnchor.constraint(equalToConstant: 80),
      cancelButton.heightAnchor.constraint(equalToConstant: 40),
    ])

    // Tap/place button (bottom center — large)
    tapButton.setTitle("  Place Point  ", for: .normal)
    tapButton.titleLabel?.font = .systemFont(ofSize: 18, weight: .bold)
    tapButton.setTitleColor(.white, for: .normal)
    tapButton.backgroundColor = UIColor.systemBlue
    tapButton.layer.cornerRadius = 30
    tapButton.translatesAutoresizingMaskIntoConstraints = false
    tapButton.addTarget(self, action: #selector(placeTapped), for: .touchUpInside)
    view.addSubview(tapButton)

    NSLayoutConstraint.activate([
      tapButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
      tapButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      tapButton.widthAnchor.constraint(equalToConstant: 200),
      tapButton.heightAnchor.constraint(equalToConstant: 60),
    ])

    // Undo button (bottom-left)
    styleButton(undoButton, title: "Undo", bgColor: UIColor.systemOrange)
    undoButton.addTarget(self, action: #selector(undoTapped), for: .touchUpInside)
    undoButton.isHidden = true
    view.addSubview(undoButton)
    NSLayoutConstraint.activate([
      undoButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -28),
      undoButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
      undoButton.widthAnchor.constraint(equalToConstant: 72),
      undoButton.heightAnchor.constraint(equalToConstant: 44),
    ])

    // Done button (bottom-right)
    styleButton(doneButton, title: "Done", bgColor: UIColor.systemGreen)
    doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
    doneButton.isHidden = true
    view.addSubview(doneButton)
    NSLayoutConstraint.activate([
      doneButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -28),
      doneButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
      doneButton.widthAnchor.constraint(equalToConstant: 72),
      doneButton.heightAnchor.constraint(equalToConstant: 44),
    ])

    // Clear button (above undo)
    styleButton(clearButton, title: "Clear All", bgColor: UIColor.systemRed.withAlphaComponent(0.8))
    clearButton.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
    clearButton.addTarget(self, action: #selector(clearTapped), for: .touchUpInside)
    clearButton.isHidden = true
    view.addSubview(clearButton)
    NSLayoutConstraint.activate([
      clearButton.bottomAnchor.constraint(equalTo: undoButton.topAnchor, constant: -10),
      clearButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
      clearButton.widthAnchor.constraint(equalToConstant: 80),
      clearButton.heightAnchor.constraint(equalToConstant: 34),
    ])
  }

  private func styleButton(_ button: UIButton, title: String, bgColor: UIColor) {
    button.setTitle(title, for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: 16, weight: .bold)
    button.setTitleColor(.white, for: .normal)
    button.backgroundColor = bgColor
    button.layer.cornerRadius = 12
    button.translatesAutoresizingMaskIntoConstraints = false
  }

  private func drawCrosshair() {
    let size: CGFloat = 40
    let lineLength: CGFloat = 14
    let lineWidth: CGFloat = 2

    let h = UIView(frame: CGRect(x: (size - lineLength) / 2, y: (size - lineWidth) / 2, width: lineLength, height: lineWidth))
    h.backgroundColor = .white
    h.layer.cornerRadius = 1
    crosshairView.addSubview(h)

    let v = UIView(frame: CGRect(x: (size - lineWidth) / 2, y: (size - lineLength) / 2, width: lineWidth, height: lineLength))
    v.backgroundColor = .white
    v.layer.cornerRadius = 1
    crosshairView.addSubview(v)

    let dot = UIView(frame: CGRect(x: (size - 6) / 2, y: (size - 6) / 2, width: 6, height: 6))
    dot.backgroundColor = UIColor.systemBlue
    dot.layer.cornerRadius = 3
    crosshairView.addSubview(dot)
  }

  // MARK: - Actions

  @objc private func placeTapped() {
    let center = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)

    // Raycast from screen center — prefer mesh on LiDAR, estimated planes otherwise
    let allowTargets: ARRaycastQuery.Target = useLiDAR ? .existingPlaneGeometry : .estimatedPlane
    guard let query = arView.makeRaycastQuery(from: center, allowing: allowTargets, alignment: .any) else {
      flashInstruction("No surface detected — move closer")
      return
    }

    let results = arView.session.raycast(query)
    guard let hit = results.first else {
      flashInstruction("No surface detected — try a different angle")
      return
    }

    let worldPos = SIMD3<Float>(hit.worldTransform.columns.3.x,
                                 hit.worldTransform.columns.3.y,
                                 hit.worldTransform.columns.3.z)

    if let startPoint = currentStartPoint {
      // Second tap — complete the measurement
      let distance = simd_distance(startPoint, worldPos)
      let measurement = MeasurementLine(
        id: "m_\(measurements.count + 1)",
        start: startPoint,
        end: worldPos,
        distanceMeters: distance
      )
      measurements.append(measurement)

      // Draw the final measurement line + label
      addMeasurementVisual(from: startPoint, to: worldPos, label: measurement.formatted)

      // Remove the start point indicator
      currentStartAnchor?.removeFromParent()
      currentStartAnchor = nil
      currentStartPoint = nil
      previewLine?.removeFromParent()
      previewLine = nil
      previewAnchor?.removeFromParent()
      previewAnchor = nil

      updateUI()
      flashInstruction("📏 \(measurement.formatted) — Tap to start next measurement")
    } else {
      // First tap — place start point
      currentStartPoint = worldPos
      let anchor = addPointIndicator(at: worldPos, color: .systemBlue)
      currentStartAnchor = anchor
      flashInstruction("Tap second point to measure distance")
    }
  }

  @objc private func undoTapped() {
    if currentStartPoint != nil {
      // Undo the pending first point
      currentStartAnchor?.removeFromParent()
      currentStartAnchor = nil
      currentStartPoint = nil
      previewLine?.removeFromParent()
      previewLine = nil
      previewAnchor?.removeFromParent()
      previewAnchor = nil
      flashInstruction("Point at a surface and tap to place first point")
    } else if let last = measurementAnchors.popLast() {
      // Undo the last completed measurement
      last.anchor.removeFromParent()
      last.label.removeFromSuperview()
      measurements.removeLast()
      if measurements.isEmpty {
        flashInstruction("Point at a surface and tap to place first point")
      } else {
        flashInstruction("Removed last measurement")
      }
    }
    updateUI()
  }

  @objc private func clearTapped() {
    // Remove all visuals
    for (anchor, label) in measurementAnchors {
      anchor.removeFromParent()
      label.removeFromSuperview()
    }
    measurementAnchors.removeAll()
    measurements.removeAll()

    currentStartAnchor?.removeFromParent()
    currentStartAnchor = nil
    currentStartPoint = nil
    previewLine?.removeFromParent()
    previewLine = nil
    previewAnchor?.removeFromParent()
    previewAnchor = nil

    updateUI()
    flashInstruction("Cleared — tap to start measuring")
  }

  @objc private func cancelTapped() {
    arView.session.pause()
    onCancel?()
  }

  @objc private func doneTapped() {
    guard !measurements.isEmpty else { return }

    // Take screenshot of the AR view with all measurement overlays visible
    arView.snapshot(saveToHDR: false) { [weak self] image in
      guard let self = self else { return }

      var result: [String: Any] = [
        "usedLiDAR": self.useLiDAR,
        "measurements": self.measurements.map { $0.toDictionary() },
      ]

      // Save screenshot to temp file and return URI
      if let image = image, let data = image.jpegData(compressionQuality: 0.85) {
        let tmpDir = FileManager.default.temporaryDirectory
        let fileName = "scannex_measure_\(Int(Date().timeIntervalSince1970)).jpg"
        let fileURL = tmpDir.appendingPathComponent(fileName)
        do {
          try data.write(to: fileURL)
          result["screenshotUri"] = fileURL.absoluteString
        } catch {
          print("[ScanNEX] Failed to write screenshot: \(error)")
        }
      }

      self.arView.session.pause()
      DispatchQueue.main.async {
        self.onComplete?(result)
      }
    }
  }

  // MARK: - Visuals

  /// Place a small sphere at a 3D point to mark measurement endpoints.
  @discardableResult
  private func addPointIndicator(at position: SIMD3<Float>, color: UIColor) -> AnchorEntity {
    let anchor = AnchorEntity(world: position)
    let sphere = ModelEntity(
      mesh: .generateSphere(radius: 0.008),
      materials: [SimpleMaterial(color: color, isMetallic: false)]
    )
    anchor.addChild(sphere)
    arView.scene.addAnchor(anchor)
    return anchor
  }

  /// Draw a measurement line between two points with endpoint spheres and a floating label.
  private func addMeasurementVisual(from start: SIMD3<Float>, to end: SIMD3<Float>, label: String) {
    let anchor = AnchorEntity(world: (start + end) / 2)

    // Line: thin box stretched between points
    let distance = simd_distance(start, end)
    let lineEntity = ModelEntity(
      mesh: .generateBox(size: SIMD3<Float>(0.003, 0.003, distance)),
      materials: [SimpleMaterial(color: .systemGreen, isMetallic: false)]
    )

    // Orient the line from start to end
    let direction = normalize(end - start)
    let up = SIMD3<Float>(0, 0, 1) // Default box extends along Z
    let rotation = simd_quaternion(up, direction)
    lineEntity.orientation = rotation

    anchor.addChild(lineEntity)

    // Endpoint spheres
    let startSphere = ModelEntity(
      mesh: .generateSphere(radius: 0.008),
      materials: [SimpleMaterial(color: .systemGreen, isMetallic: false)]
    )
    startSphere.position = start - (start + end) / 2

    let endSphere = ModelEntity(
      mesh: .generateSphere(radius: 0.008),
      materials: [SimpleMaterial(color: .systemGreen, isMetallic: false)]
    )
    endSphere.position = end - (start + end) / 2

    anchor.addChild(startSphere)
    anchor.addChild(endSphere)

    arView.scene.addAnchor(anchor)

    // Floating UILabel for the dimension text (rendered as 2D overlay, always faces camera)
    let midpoint = (start + end) / 2
    let labelView = createDimensionLabel(text: label)
    view.addSubview(labelView)

    // Position the label — we'll update in session delegate
    updateLabelPosition(labelView, worldPosition: midpoint)

    measurementAnchors.append((anchor: anchor, label: labelView))
  }

  private func createDimensionLabel(text: String) -> UILabel {
    let label = UILabel()
    label.text = "  \(text)  "
    label.textColor = .white
    label.font = .systemFont(ofSize: 15, weight: .bold)
    label.backgroundColor = UIColor.systemGreen.withAlphaComponent(0.85)
    label.layer.cornerRadius = 6
    label.clipsToBounds = true
    label.textAlignment = .center
    label.sizeToFit()
    let size = label.sizeThatFits(CGSize(width: 200, height: 30))
    label.frame.size = CGSize(width: size.width + 16, height: size.height + 8)
    return label
  }

  private func updateLabelPosition(_ label: UILabel, worldPosition: SIMD3<Float>) {
    // Project 3D world position to 2D screen coordinates
    let projected = arView.project(worldPosition)
    if let point = projected {
      label.center = CGPoint(x: point.x, y: point.y - 24) // Offset above the line
      label.isHidden = false
    } else {
      label.isHidden = true
    }
  }

  // MARK: - UI Updates

  private func updateUI() {
    let hasMeasurements = !measurements.isEmpty
    let hasPendingPoint = currentStartPoint != nil

    doneButton.isHidden = !hasMeasurements
    undoButton.isHidden = !hasMeasurements && !hasPendingPoint
    clearButton.isHidden = !hasMeasurements

    if hasMeasurements {
      measurementCountLabel.text = "\(measurements.count)"
      measurementCountLabel.isHidden = false
    } else {
      measurementCountLabel.isHidden = true
    }

    if hasPendingPoint {
      tapButton.setTitle("  Place End Point  ", for: .normal)
      tapButton.backgroundColor = .systemOrange
    } else {
      tapButton.setTitle("  Place Point  ", for: .normal)
      tapButton.backgroundColor = .systemBlue
    }
  }

  private func flashInstruction(_ text: String) {
    instructionLabel.text = "  \(text)  "
    instructionLabel.alpha = 1

    // Fade out after delay (unless another flash replaces it)
    DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
      UIView.animate(withDuration: 0.5) {
        self?.instructionLabel.alpha = 0.6
      }
    }
  }

  // MARK: - ARSessionDelegate

  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    // Update floating label positions as camera moves
    for (i, entry) in measurementAnchors.enumerated() {
      guard i < measurements.count else { break }
      let m = measurements[i]
      let midpoint = (m.start + m.end) / 2
      updateLabelPosition(entry.label, worldPosition: midpoint)
    }

    // Draw a preview line from the start point to where the crosshair is pointing
    if let startPoint = currentStartPoint {
      let center = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)
      let allowTargets: ARRaycastQuery.Target = useLiDAR ? .existingPlaneGeometry : .estimatedPlane
      if let query = arView.makeRaycastQuery(from: center, allowing: allowTargets, alignment: .any),
         let hit = session.raycast(query).first {
        let endPos = SIMD3<Float>(hit.worldTransform.columns.3.x,
                                   hit.worldTransform.columns.3.y,
                                   hit.worldTransform.columns.3.z)
        updatePreviewLine(from: startPoint, to: endPos)
      }
    }
  }

  /// Live preview line from start point to current crosshair position.
  private func updatePreviewLine(from start: SIMD3<Float>, to end: SIMD3<Float>) {
    // Remove old preview
    previewLine?.removeFromParent()
    previewAnchor?.removeFromParent()

    let midpoint = (start + end) / 2
    let anchor = AnchorEntity(world: midpoint)
    let distance = simd_distance(start, end)

    let line = ModelEntity(
      mesh: .generateBox(size: SIMD3<Float>(0.002, 0.002, distance)),
      materials: [SimpleMaterial(color: UIColor.systemBlue.withAlphaComponent(0.6), isMetallic: false)]
    )

    let direction = normalize(end - start)
    let up = SIMD3<Float>(0, 0, 1)
    line.orientation = simd_quaternion(up, direction)

    anchor.addChild(line)
    arView.scene.addAnchor(anchor)
    previewAnchor = anchor
    previewLine = line

    // Update instruction with live distance
    let feet = distance * 3.28084
    let totalInches = feet * 12
    let ft = Int(totalInches / 12)
    let inches = Int(totalInches.truncatingRemainder(dividingBy: 12))
    instructionLabel.text = "  \(ft)' \(inches)\" — Tap to complete  "
    instructionLabel.alpha = 1
  }
}

// MARK: - simd_quaternion helper

/// Create a quaternion that rotates vector `from` to align with vector `to`.
func simd_quaternion(_ from: SIMD3<Float>, _ to: SIMD3<Float>) -> simd_quatf {
  let fromN = normalize(from)
  let toN = normalize(to)
  let dot = simd_dot(fromN, toN)

  if dot > 0.9999 {
    return simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)
  }
  if dot < -0.9999 {
    // Vectors are opposite — pick an arbitrary perpendicular axis
    var perp = simd_cross(SIMD3<Float>(1, 0, 0), fromN)
    if simd_length(perp) < 0.001 {
      perp = simd_cross(SIMD3<Float>(0, 1, 0), fromN)
    }
    perp = normalize(perp)
    return simd_quatf(ix: perp.x, iy: perp.y, iz: perp.z, r: 0)
  }

  let axis = simd_cross(fromN, toN)
  let s = sqrt((1 + dot) * 2)
  return simd_quatf(ix: axis.x / s, iy: axis.y / s, iz: axis.z / s, r: s / 2)
}
