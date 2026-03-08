import ExpoModulesCore
import UIKit
import SwiftUI

// RealityKit contains ObjectCaptureSession (iOS 17+) and PhotogrammetrySession (iOS 17+)
#if canImport(RealityKit)
import RealityKit
#endif

public class NexusObjectCaptureModule: Module {
  #if canImport(RealityKit)
  private var activeCoordinator: AnyObject?
  #endif

  public func definition() -> ModuleDefinition {
    Name("NexusObjectCapture")

    /// Check if device supports Object Capture (LiDAR + iOS 17+)
    AsyncFunction("isSupported") { () -> Bool in
      #if canImport(RealityKit)
      if #available(iOS 17.0, *) {
        return await MainActor.run { ObjectCaptureSession.isSupported }
      }
      #endif
      return false
    }

    /// Launch the full Object Capture flow:
    /// 1. ObjectCaptureSession for guided image capture
    /// 2. PhotogrammetrySession for 3D reconstruction
    /// Returns: { modelPath, thumbnailPath, dimensions, boundingBox }
    AsyncFunction("startCapture") { (promise: Promise) in
      #if canImport(RealityKit)
      if #available(iOS 17.0, *) {
        let supported = await MainActor.run { ObjectCaptureSession.isSupported }
        guard supported else {
          promise.reject("UNSUPPORTED", "Device does not support Object Capture (requires LiDAR + iOS 17)")
          return
        }

        DispatchQueue.main.async { [weak self] in
          let coordinator = ObjectCaptureCoordinator(promise: promise) { [weak self] in
            self?.activeCoordinator = nil
          }
          self?.activeCoordinator = coordinator
          coordinator.start()
        }
        return
      }
      #endif
      promise.reject("UNSUPPORTED", "Object Capture requires iOS 17+ with LiDAR")
    }

    /// Launch Precision Capture: captures high-density images for Mac Studio
    /// reconstruction via NexMESH. Does NOT run on-device photogrammetry.
    /// Returns: { imagePaths: string[], imageCount: number }
    AsyncFunction("startPrecisionCapture") { () async throws -> [String: Any] in
      #if canImport(RealityKit)
      if #available(iOS 17.0, *) {
        let supported = await MainActor.run { ObjectCaptureSession.isSupported }
        guard supported else {
          throw NSError(domain: "NexusPrecision", code: 1,
                       userInfo: [NSLocalizedDescriptionKey: "Device does not support Object Capture (requires LiDAR + iOS 17)"])
        }

        return try await withCheckedThrowingContinuation { continuation in
          DispatchQueue.main.async { [weak self] in
            let coordinator = PrecisionCaptureCoordinator(continuation: continuation) { [weak self] in
              self?.activeCoordinator = nil
            }
            self?.activeCoordinator = coordinator
            coordinator.start()
          }
        }
      }
      #endif
      throw NSError(domain: "NexusPrecision", code: 2,
                   userInfo: [NSLocalizedDescriptionKey: "Precision Capture requires iOS 17+ with LiDAR"])
    }

    /// Lightweight check that returns device capabilities without starting capture
    AsyncFunction("getDeviceCapabilities") { () -> [String: Any] in
      var caps: [String: Any] = [
        "hasLiDAR": false,
        "supportsObjectCapture": false,
        "iosVersion": UIDevice.current.systemVersion,
      ]

      #if canImport(RealityKit)
      if #available(iOS 17.0, *) {
        let supported = await MainActor.run { ObjectCaptureSession.isSupported }
        caps["supportsObjectCapture"] = supported
        caps["hasLiDAR"] = supported
      }
      #endif

      return caps
    }
  }
}

// MARK: - Object Capture Coordinator

#if canImport(RealityKit)
@available(iOS 17.0, *)
@MainActor
class ObjectCaptureCoordinator: NSObject {
  private let promise: Promise
  private let onCleanup: () -> Void
  private var session: ObjectCaptureSession?
  private var hostingController: UIViewController?
  private var imagesDirectory: URL?
  private var outputDirectory: URL?

  init(promise: Promise, onCleanup: @escaping () -> Void) {
    self.promise = promise
    self.onCleanup = onCleanup
    super.init()
  }

  func start() {
    // Create temp directories for captured images and output model
    let tempBase = FileManager.default.temporaryDirectory
      .appendingPathComponent("nexus-object-capture-\(UUID().uuidString)")

    let imagesDir = tempBase.appendingPathComponent("images")
    let outputDir = tempBase.appendingPathComponent("output")

    do {
      try FileManager.default.createDirectory(at: imagesDir, withIntermediateDirectories: true)
      try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
    } catch {
      promise.reject("DIR_ERROR", "Failed to create capture directories: \(error.localizedDescription)")
      return
    }

    self.imagesDirectory = imagesDir
    self.outputDirectory = outputDir

    // Initialize the capture session
    let session = ObjectCaptureSession()
    self.session = session

    // Configure and start the session
    var config = ObjectCaptureSession.Configuration()
    config.checkpointDirectory = tempBase.appendingPathComponent("checkpoints")
    try? FileManager.default.createDirectory(at: config.checkpointDirectory!, withIntermediateDirectories: true)

    session.start(imagesDirectory: imagesDir, configuration: config)

    // Observe session state changes
    Task { @MainActor [weak self] in
      guard let self = self else { return }
      for await state in session.stateUpdates {
        self.handleStateUpdate(state)
      }
    }

    // Present the capture view
    let captureView = ObjectCaptureContainerView(
      session: session,
      onDone: { [weak self] in self?.finishCapture() },
      onCancel: { [weak self] in self?.cancel() }
    )

    let vc = UIHostingController(rootView: captureView)
    vc.modalPresentationStyle = .fullScreen
    self.hostingController = vc

    guard let rootVC = findPresentingViewController() else {
      promise.reject("PRESENTATION_ERROR", "Could not find root view controller")
      return
    }

    rootVC.present(vc, animated: true)
  }

  private func handleStateUpdate(_ state: ObjectCaptureSession.CaptureState) {
    switch state {
    case .initializing:
      print("[NexusObjectCapture] Session initializing")
    case .ready:
      print("[NexusObjectCapture] Session ready")
    case .detecting:
      print("[NexusObjectCapture] Detecting object...")
    case .capturing:
      print("[NexusObjectCapture] Capturing images...")
    case .finishing:
      print("[NexusObjectCapture] Finishing capture...")
    case .completed:
      print("[NexusObjectCapture] Capture complete, starting reconstruction...")
      startReconstruction()
    case .failed(let error):
      print("[NexusObjectCapture] Capture failed: \(error)")
      dismiss {
        self.promise.reject("CAPTURE_FAILED", error.localizedDescription)
        self.cleanup()
      }
    @unknown default:
      break
    }
  }

  private func finishCapture() {
    session?.finish()
  }

  private func cancel() {
    session?.cancel()
    dismiss {
      self.promise.reject("CANCELLED", "User cancelled object capture")
      self.cleanup()
    }
  }

  // MARK: - 3D Reconstruction

  private func startReconstruction() {
    guard let imagesDir = imagesDirectory, let outputDir = outputDirectory else {
      promise.reject("INTERNAL_ERROR", "Missing capture directories")
      cleanup()
      return
    }

    let modelURL = outputDir.appendingPathComponent("model.usdz")

    Task {
      do {
        let photogrammetrySession = try PhotogrammetrySession(
          input: imagesDir,
          configuration: PhotogrammetrySession.Configuration()
        )

        // Request a reduced-detail model (faster processing on device)
        try photogrammetrySession.process(requests: [
          .modelFile(url: modelURL, detail: .reduced)
        ])

        // Wait for the model to finish processing
        for try await output in photogrammetrySession.outputs {
          switch output {
          case .processingComplete:
            print("[NexusObjectCapture] Reconstruction complete")
            await self.handleReconstructionComplete(modelURL: modelURL)
            return

          case .requestProgress(_, let fraction):
            print("[NexusObjectCapture] Processing: \(Int(fraction * 100))%")

          case .requestError(_, let error):
            print("[NexusObjectCapture] Processing error: \(error)")
            await MainActor.run {
              self.dismiss {
                self.promise.reject("RECONSTRUCTION_FAILED", error.localizedDescription)
                self.cleanup()
              }
            }
            return

          default:
            break
          }
        }
      } catch {
        await MainActor.run {
          self.dismiss {
            self.promise.reject("RECONSTRUCTION_FAILED", error.localizedDescription)
            self.cleanup()
          }
        }
      }
    }
  }

  @MainActor
  private func handleReconstructionComplete(modelURL: URL) {
    // Extract bounding box and dimensions from the USDZ model
    var result: [String: Any] = [
      "modelPath": modelURL.path,
    ]

    // Preserve up to 10 reference images for NEXI enrollment.
    // Select evenly-spaced images from the capture directory.
    if let imagesDir = imagesDirectory {
      let refPaths = Self.preserveReferenceImages(from: imagesDir, maxCount: 10)
      result["referenceImagePaths"] = refPaths
    }

    // Load the model to extract bounding box
    if let entity = try? ModelEntity.load(contentsOf: modelURL) {
      let bounds = entity.visualBounds(relativeTo: nil)
      let extents = bounds.extents // SIMD3<Float> in meters

      // Convert meters to inches (user-friendly for restoration equipment)
      let metersToInches: Float = 39.3701

      result["dimensions"] = [
        "length": Double(extents.x * metersToInches),
        "width": Double(extents.z * metersToInches),
        "height": Double(extents.y * metersToInches),
        "unit": "inches",
        // Also include metric
        "lengthMeters": Double(extents.x),
        "widthMeters": Double(extents.z),
        "heightMeters": Double(extents.y),
      ]

      result["boundingBox"] = [
        "min": [Double(bounds.min.x), Double(bounds.min.y), Double(bounds.min.z)],
        "max": [Double(bounds.max.x), Double(bounds.max.y), Double(bounds.max.z)],
      ]
    }

    // Generate a thumbnail from the model
    let thumbnailPath = outputDirectory?.appendingPathComponent("thumbnail.jpg").path
    if let thumbPath = thumbnailPath {
      // For now, use a simple render. In the future, can use ModelEntity.snapshot.
      result["thumbnailPath"] = thumbPath
    }

    dismiss {
      self.promise.resolve(result)
      self.cleanup()
    }
  }

  // MARK: - Helpers

  private func dismiss(completion: @escaping () -> Void) {
    DispatchQueue.main.async { [weak self] in
      if let vc = self?.hostingController {
        vc.dismiss(animated: true, completion: completion)
      } else {
        completion()
      }
    }
  }

  private func cleanup() {
    onCleanup()
    // Clean up temp directories after a delay to ensure files are read
    if let imagesDir = imagesDirectory?.deletingLastPathComponent() {
      DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 60) {
        try? FileManager.default.removeItem(at: imagesDir)
      }
    }
  }

  /// Copy up to `maxCount` evenly-spaced HEIC/JPG images from the capture directory
  /// to a persistent location so they survive the temp cleanup.
  /// Returns an array of file paths for the preserved images.
  private static func preserveReferenceImages(from imagesDir: URL, maxCount: Int) -> [String] {
    let fm = FileManager.default
    guard let allFiles = try? fm.contentsOfDirectory(at: imagesDir, includingPropertiesForKeys: nil) else {
      return []
    }

    // Filter to image files only
    let imageExts: Set<String> = ["heic", "jpg", "jpeg", "png"]
    let imageFiles = allFiles
      .filter { imageExts.contains($0.pathExtension.lowercased()) }
      .sorted { $0.lastPathComponent < $1.lastPathComponent }

    guard !imageFiles.isEmpty else { return [] }

    // Select evenly-spaced indices
    let count = min(maxCount, imageFiles.count)
    let step = max(1, imageFiles.count / count)
    var selected: [URL] = []
    for i in stride(from: 0, to: imageFiles.count, by: step) {
      if selected.count >= count { break }
      selected.append(imageFiles[i])
    }

    // Copy to a persistent directory within Documents
    let docsDir = fm.urls(for: .documentDirectory, in: .userDomainMask).first!
    let refDir = docsDir.appendingPathComponent("nexi-reference-\(UUID().uuidString)")
    try? fm.createDirectory(at: refDir, withIntermediateDirectories: true)

    var paths: [String] = []
    for (i, src) in selected.enumerated() {
      let dest = refDir.appendingPathComponent("ref_\(i).\(src.pathExtension)")
      do {
        try fm.copyItem(at: src, to: dest)
        paths.append(dest.path)
      } catch {
        print("[NexusObjectCapture] Failed to copy reference image: \(error)")
      }
    }

    return paths
  }

  private func findPresentingViewController() -> UIViewController? {
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first(where: { $0.isKeyWindow })?
      .rootViewController?.presentedViewController ?? UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first(where: { $0.isKeyWindow })?
      .rootViewController
  }
}

// MARK: - Precision Capture Coordinator (images only, no on-device reconstruction)

@available(iOS 17.0, *)
@MainActor
class PrecisionCaptureCoordinator: NSObject {
  private let continuation: CheckedContinuation<[String: Any], Error>
  private let onCleanup: () -> Void
  private var session: ObjectCaptureSession?
  private var hostingController: UIViewController?
  private var imagesDirectory: URL?
  private var persistentImagesDir: URL?
  private var hasResumed = false

  init(continuation: CheckedContinuation<[String: Any], Error>, onCleanup: @escaping () -> Void) {
    self.continuation = continuation
    self.onCleanup = onCleanup
    super.init()
  }

  /// Resume continuation with a successful result. Safe to call multiple times — only the first fires.
  private func resumeSuccess(_ result: [String: Any]) {
    guard !hasResumed else { return }
    hasResumed = true
    continuation.resume(returning: result)
    onCleanup()
  }

  /// Resume continuation with an error. Safe to call multiple times — only the first fires.
  private func resumeError(_ message: String) {
    guard !hasResumed else { return }
    hasResumed = true
    continuation.resume(throwing: NSError(domain: "NexusPrecision", code: 0,
                                          userInfo: [NSLocalizedDescriptionKey: message]))
    onCleanup()
  }

  func start() {
    let tempBase = FileManager.default.temporaryDirectory
      .appendingPathComponent("nexus-precision-\(UUID().uuidString)")
    let imagesDir = tempBase.appendingPathComponent("images")

    do {
      try FileManager.default.createDirectory(at: imagesDir, withIntermediateDirectories: true)
    } catch {
      resumeError("Failed to create capture directories: \(error.localizedDescription)")
      return
    }

    self.imagesDirectory = imagesDir

    let session = ObjectCaptureSession()
    self.session = session

    var config = ObjectCaptureSession.Configuration()
    config.checkpointDirectory = tempBase.appendingPathComponent("checkpoints")
    config.isOverCaptureEnabled = true
    try? FileManager.default.createDirectory(at: config.checkpointDirectory!, withIntermediateDirectories: true)

    session.start(imagesDirectory: imagesDir, configuration: config)

    // Observe state — but we only care about .completed (all images written)
    Task { @MainActor [weak self] in
      guard let self = self else { return }
      for await state in session.stateUpdates {
        self.handleState(state)
      }
    }

    // Present the capture view with precision-specific guidance
    let captureView = PrecisionCaptureContainerView(
      session: session,
      onDone: { [weak self] in self?.finishCapture() },
      onCancel: { [weak self] in self?.cancel() }
    )

    let vc = UIHostingController(rootView: captureView)
    vc.modalPresentationStyle = .fullScreen
    self.hostingController = vc

    guard let rootVC = findPresentingViewController() else {
      resumeError("Could not find root view controller")
      return
    }

    rootVC.present(vc, animated: true)
  }

  private func handleState(_ state: ObjectCaptureSession.CaptureState) {
    switch state {
    case .initializing:
      print("[NexusPrecision] Session initializing (overCapture enabled)")
    case .ready:
      print("[NexusPrecision] Session ready")
    case .detecting:
      print("[NexusPrecision] Detecting object...")
    case .capturing:
      print("[NexusPrecision] Capturing images (precision mode)...")
    case .finishing:
      print("[NexusPrecision] Finishing capture...")
    case .completed:
      print("[NexusPrecision] Capture complete — collecting images")
      collectImagesAndReturn()
    case .failed(let error):
      print("[NexusPrecision] Capture failed: \(error)")
      dismiss {
        self.resumeError(error.localizedDescription)
      }
    @unknown default:
      break
    }
  }

  private func finishCapture() {
    session?.finish()
  }

  private func cancel() {
    session?.cancel()
    dismiss {
      self.resumeError("User cancelled precision capture")
    }
  }

  /// Collect all captured images and copy them to a persistent directory.
  /// Returns image paths to JS without running photogrammetry.
  private func collectImagesAndReturn() {
    guard let imagesDir = imagesDirectory else {
      resumeError("Missing images directory")
      return
    }

    let fm = FileManager.default
    guard let allFiles = try? fm.contentsOfDirectory(at: imagesDir, includingPropertiesForKeys: [.fileSizeKey]) else {
      dismiss {
        self.resumeError("Could not read captured images")
      }
      return
    }

    let imageExts: Set<String> = ["heic", "jpg", "jpeg", "png"]
    let imageFiles = allFiles
      .filter { imageExts.contains($0.pathExtension.lowercased()) }
      .sorted { $0.lastPathComponent < $1.lastPathComponent }

    guard !imageFiles.isEmpty else {
      dismiss {
        self.resumeError("No images were captured")
      }
      return
    }

    // Copy to persistent Documents directory (survives temp cleanup)
    let docsDir = fm.urls(for: .documentDirectory, in: .userDomainMask).first!
    let persistDir = docsDir.appendingPathComponent("precision-capture-\(UUID().uuidString)")
    try? fm.createDirectory(at: persistDir, withIntermediateDirectories: true)
    self.persistentImagesDir = persistDir

    var paths: [String] = []
    var totalBytes: Int64 = 0

    for (i, src) in imageFiles.enumerated() {
      let dest = persistDir.appendingPathComponent("img_\(String(format: "%04d", i)).\(src.pathExtension)")
      do {
        try fm.copyItem(at: src, to: dest)
        paths.append(dest.path)
        if let attrs = try? fm.attributesOfItem(atPath: dest.path),
           let size = attrs[.size] as? Int64 {
          totalBytes += size
        }
      } catch {
        print("[NexusPrecision] Failed to copy image \(i): \(error)")
      }
    }

    print("[NexusPrecision] Collected \(paths.count) images (\(totalBytes / 1024 / 1024)MB)")

    let result: [String: Any] = [
      "imagePaths": paths,
      "imageCount": paths.count,
      "totalSizeBytes": totalBytes,
      "persistentDir": persistDir.path,
    ]

    dismiss {
      self.resumeSuccess(result)
    }
  }

  private func dismiss(completion: @escaping () -> Void) {
    DispatchQueue.main.async { [weak self] in
      if let vc = self?.hostingController {
        vc.dismiss(animated: true, completion: completion)
      } else {
        completion()
      }
    }
  }

  private func findPresentingViewController() -> UIViewController? {
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first(where: { $0.isKeyWindow })?
      .rootViewController?.presentedViewController ?? UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first(where: { $0.isKeyWindow })?
      .rootViewController
  }
}

/// Precision capture UI — similar to standard but with image count guidance.
@available(iOS 17.0, *)
struct PrecisionCaptureContainerView: View {
  let session: ObjectCaptureSession
  let onDone: () -> Void
  let onCancel: () -> Void

  var body: some View {
    ZStack {
      ObjectCaptureView(session: session)
        .edgesIgnoringSafeArea(.all)

      VStack {
        // Top bar
        HStack {
          Button(action: onCancel) {
            HStack(spacing: 6) {
              Image(systemName: "xmark")
              Text("Cancel")
            }
            .foregroundColor(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial, in: Capsule())
          }
          Spacer()

          // Precision mode badge
          Text("PRECISION")
            .font(.caption.weight(.heavy))
            .foregroundColor(.orange)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(.ultraThinMaterial, in: Capsule())
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)

        Spacer()

        // Done button
        if session.canRequestImageCapture {
          Button(action: onDone) {
            Text("Done Scanning")
              .font(.headline)
              .foregroundColor(.white)
              .frame(width: 200, height: 50)
              .background(Color.orange)
              .cornerRadius(12)
          }
          .padding(.bottom, 10)
        }

        // Guidance text
        precisionStatusView
          .padding(.bottom, 10)
      }
    }
  }

  @ViewBuilder
  private var precisionStatusView: some View {
    switch session.state {
    case .ready:
      Label("Precision Mode — capture from all angles", systemImage: "viewfinder")
        .font(.subheadline).foregroundColor(.white)
        .padding(8).background(.ultraThinMaterial, in: Capsule())
    case .detecting:
      Label("Move closer to the object...", systemImage: "magnifyingglass")
        .font(.subheadline).foregroundColor(.white)
        .padding(8).background(.ultraThinMaterial, in: Capsule())
    case .capturing:
      Label("Orbit slowly — capture all sides, top & bottom", systemImage: "arrow.triangle.2.circlepath.camera")
        .font(.subheadline).foregroundColor(.orange)
        .padding(8).background(.ultraThinMaterial, in: Capsule())
    case .finishing:
      Label("Saving images...", systemImage: "gearshape.2")
        .font(.subheadline).foregroundColor(.yellow)
        .padding(8).background(.ultraThinMaterial, in: Capsule())
    default:
      EmptyView()
    }
  }
}

// MARK: - SwiftUI Capture View (Standard Mode)

@available(iOS 17.0, *)
struct ObjectCaptureContainerView: View {
  let session: ObjectCaptureSession
  let onDone: () -> Void
  let onCancel: () -> Void

  var body: some View {
    ZStack {
      ObjectCaptureView(session: session)
        .edgesIgnoringSafeArea(.all)

      // Overlay controls
      VStack {
        // Top bar with cancel
        HStack {
          Button(action: onCancel) {
            HStack(spacing: 6) {
              Image(systemName: "xmark")
              Text("Cancel")
            }
            .foregroundColor(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial, in: Capsule())
          }
          Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)

        Spacer()

        // Bottom: Done button (visible once enough images captured)
        if session.canRequestImageCapture {
          Button(action: onDone) {
            Text("Done Scanning")
              .font(.headline)
              .foregroundColor(.white)
              .frame(width: 200, height: 50)
              .background(Color.green)
              .cornerRadius(12)
          }
          .padding(.bottom, 20)
        }

        // Status indicator
        statusView
          .padding(.bottom, 10)
      }
    }
  }

  @ViewBuilder
  private var statusView: some View {
    switch session.state {
    case .ready:
      Label("Point at object to begin", systemImage: "viewfinder")
        .font(.subheadline).foregroundColor(.white)
        .padding(8).background(.ultraThinMaterial, in: Capsule())
    case .detecting:
      Label("Detecting object...", systemImage: "magnifyingglass")
        .font(.subheadline).foregroundColor(.white)
        .padding(8).background(.ultraThinMaterial, in: Capsule())
    case .capturing:
      Label("Move slowly around the object", systemImage: "arrow.triangle.2.circlepath.camera")
        .font(.subheadline).foregroundColor(.white)
        .padding(8).background(.ultraThinMaterial, in: Capsule())
    case .finishing:
      Label("Processing...", systemImage: "gearshape.2")
        .font(.subheadline).foregroundColor(.yellow)
        .padding(8).background(.ultraThinMaterial, in: Capsule())
    default:
      EmptyView()
    }
  }
}
#endif
