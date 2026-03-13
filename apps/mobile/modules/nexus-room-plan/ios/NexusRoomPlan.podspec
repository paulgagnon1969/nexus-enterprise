Pod::Spec.new do |s|
  s.name           = 'NexusRoomPlan'
  s.version        = '1.0.0'
  s.summary        = 'Apple RoomPlan (LiDAR) integration for Nexus Mobile'
  s.description    = 'Expo native module wrapping Apple RoomPlan for LiDAR-based room scanning on iPhone/iPad Pro devices.'
  s.homepage       = 'https://github.com/nexus-enterprise'
  s.license        = { type: 'MIT' }
  s.author         = 'Nexus'
  # Match the main app's deployment target — NOT iOS 16.
  # RoomPlan availability is handled at runtime via @available(iOS 16.0, *).
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.source_files   = '**/*.swift'
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  # Weak-link so the app still runs on devices without LiDAR / iOS < 16.
  # The Swift code uses `#if canImport(RoomPlan)` + `@available(iOS 16.0, *)`
  # to gracefully degrade at runtime.
  s.framework      = 'ARKit'
  s.weak_framework = 'RoomPlan'
end
