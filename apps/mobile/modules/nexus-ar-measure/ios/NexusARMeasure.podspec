Pod::Spec.new do |s|
  s.name           = 'NexusARMeasure'
  s.version        = '1.0.0'
  s.summary        = 'ARKit point-to-point measurement for Nexus Mobile (ScanNEX Phase 1)'
  s.description    = 'Expo native module providing AR-based tap-to-measure using ARKit raycasting. Works on all ARKit devices; LiDAR enhances accuracy.'
  s.homepage       = 'https://github.com/nexus-enterprise'
  s.license        = { type: 'MIT' }
  s.author         = 'Nexus'
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.source_files   = '**/*.swift'
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  # ARKit is available on all modern iOS devices; weak-link so the app
  # still runs on older devices that lack ARKit (graceful degradation).
  s.weak_framework = 'ARKit'
  s.framework      = 'RealityKit'
end
