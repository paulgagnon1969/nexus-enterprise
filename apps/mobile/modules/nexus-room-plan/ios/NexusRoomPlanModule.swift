import ExpoModulesCore
import UIKit

// RoomPlan is available on iOS 16+ with LiDAR
#if canImport(RoomPlan)
import RoomPlan
#endif

public class NexusRoomPlanModule: Module {
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

        DispatchQueue.main.async {
          let coordinator = RoomCaptureCoordinator(promise: promise)
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
  private var captureView: RoomCaptureView?
  private var viewController: UIViewController?
  private var finalRoom: CapturedRoom?

  init(promise: Promise) {
    self.promise = promise
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
    }
  }

  // MARK: - RoomCaptureSessionDelegate

  func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {
    // This delegate fires when session stops; data is available after processing
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

      let result = self.serializeCapturedRoom(processedResult)
      self.promise.resolve(["roomData": result])
    }
  }

  // MARK: - Serialization

  private func serializeCapturedRoom(_ room: CapturedRoom) -> [String: Any] {
    var result: [String: Any] = [:]

    result["walls"] = room.walls.map { wall -> [String: Any] in
      return [
        "dimensions": [
          "width": wall.dimensions.x,
          "height": wall.dimensions.y,
          "length": wall.dimensions.z,
        ],
        "transform": serializeTransform(wall.transform),
      ]
    }

    result["doors"] = room.doors.map { door -> [String: Any] in
      return [
        "type": serializeDoorType(door),
        "dimensions": [
          "width": door.dimensions.x,
          "height": door.dimensions.y,
        ],
        "transform": serializeTransform(door.transform),
      ]
    }

    result["windows"] = room.windows.map { window -> [String: Any] in
      return [
        "type": serializeWindowType(window),
        "dimensions": [
          "width": window.dimensions.x,
          "height": window.dimensions.y,
        ],
        "transform": serializeTransform(window.transform),
      ]
    }

    result["openings"] = room.openings.map { opening -> [String: Any] in
      return [
        "dimensions": [
          "width": opening.dimensions.x,
          "height": opening.dimensions.y,
        ],
        "transform": serializeTransform(opening.transform),
      ]
    }

    result["objects"] = room.objects.map { obj -> [String: Any] in
      return [
        "category": serializeObjectCategory(obj),
        "dimensions": [
          "width": obj.dimensions.x,
          "height": obj.dimensions.y,
          "length": obj.dimensions.z,
        ],
        "transform": serializeTransform(obj.transform),
      ]
    }

    return result
  }

  private func serializeTransform(_ t: simd_float4x4) -> [Float] {
    // Column-major 4x4 matrix
    return [
      t.columns.0.x, t.columns.0.y, t.columns.0.z, t.columns.0.w,
      t.columns.1.x, t.columns.1.y, t.columns.1.z, t.columns.1.w,
      t.columns.2.x, t.columns.2.y, t.columns.2.z, t.columns.2.w,
      t.columns.3.x, t.columns.3.y, t.columns.3.z, t.columns.3.w,
    ]
  }

  private func serializeDoorType(_ door: CapturedRoom.Surface) -> String {
    // Door type is inferred from category in CapturedRoom
    return "standard"
  }

  private func serializeWindowType(_ window: CapturedRoom.Surface) -> String {
    return "standard"
  }

  private func serializeObjectCategory(_ obj: CapturedRoom.Object) -> String {
    return String(describing: obj.category)
  }
}
#endif
