import ExpoModulesCore
import UIKit
import ARKit

public class NexusARMeasureModule: Module {
  /// Strong reference keeps the coordinator alive during the measurement session.
  private var activeCoordinator: AnyObject?

  public func definition() -> ModuleDefinition {
    Name("NexusARMeasure")

    /// Check if device supports ARKit world tracking (iPhone 6s+).
    AsyncFunction("isSupported") { () -> Bool in
      return ARWorldTrackingConfiguration.isSupported
    }

    /// Check if device has LiDAR scanner (iPhone 12 Pro+, iPad Pro 2020+).
    AsyncFunction("hasLiDAR") { () -> Bool in
      return ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
    }

    /// Launch full-screen AR measurement session.
    /// Returns measurements array + screenshot URI on completion.
    AsyncFunction("startMeasurement") { (promise: Promise) in
      guard ARWorldTrackingConfiguration.isSupported else {
        promise.reject("UNSUPPORTED", "ARKit is not supported on this device")
        return
      }

      DispatchQueue.main.async { [weak self] in
        let coordinator = ARMeasureCoordinator(promise: promise) { [weak self] in
          self?.activeCoordinator = nil
        }
        self?.activeCoordinator = coordinator
        coordinator.start()
      }
    }
  }
}

// MARK: - Measurement Coordinator

/// Manages the lifecycle of a single AR measurement session.
/// Presents the ARMeasurementViewController, collects results, and resolves the JS promise.
class ARMeasureCoordinator: NSObject {
  private let promise: Promise
  private let onCleanup: () -> Void
  private var viewController: ARMeasurementViewController?

  init(promise: Promise, onCleanup: @escaping () -> Void) {
    self.promise = promise
    self.onCleanup = onCleanup
    super.init()
  }

  func start() {
    let measureVC = ARMeasurementViewController()
    measureVC.modalPresentationStyle = .fullScreen

    measureVC.onComplete = { [weak self] result in
      self?.viewController?.dismiss(animated: true) {
        self?.promise.resolve(result)
        self?.onCleanup()
      }
    }

    measureVC.onCancel = { [weak self] in
      self?.viewController?.dismiss(animated: true) {
        self?.promise.reject("CANCELLED", "User cancelled measurement")
        self?.onCleanup()
      }
    }

    self.viewController = measureVC

    guard let rootVC = Self.topViewController() else {
      promise.reject("PRESENTATION_ERROR", "Could not find root view controller")
      onCleanup()
      return
    }

    rootVC.present(measureVC, animated: true)
  }

  /// Find the topmost presented view controller.
  private static func topViewController() -> UIViewController? {
    guard let window = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene })
      .flatMap({ $0.windows })
      .first(where: { $0.isKeyWindow }),
      var vc = window.rootViewController
    else { return nil }

    while let presented = vc.presentedViewController {
      vc = presented
    }
    return vc
  }
}
