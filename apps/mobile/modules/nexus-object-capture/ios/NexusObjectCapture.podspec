Pod::Spec.new do |s|
  s.name           = 'NexusObjectCapture'
  s.version        = '1.0.0'
  s.summary        = 'Apple Object Capture (3D photogrammetry) integration for Nexus Mobile'
  s.description    = 'Expo native module wrapping Apple ObjectCaptureSession + PhotogrammetrySession for 3D asset scanning on LiDAR-enabled devices (iOS 17+).'
  s.homepage       = 'https://github.com/nexus-enterprise'
  s.license        = { type: 'MIT' }
  s.author         = 'Nexus'
  # Match the main app deployment target.
  # Object Capture availability is handled at runtime via @available(iOS 17.0, *).
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.source_files   = '**/*.swift'
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  # Weak-link RealityKit so the app still runs on devices without LiDAR / iOS < 17.
  # The Swift code uses @available(iOS 17.0, *) to gracefully degrade.
  s.weak_framework = 'RealityKit'
end
