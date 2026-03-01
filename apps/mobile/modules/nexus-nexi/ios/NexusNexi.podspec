Pod::Spec.new do |s|
  s.name           = 'NexusNexi'
  s.version        = '1.0.0'
  s.summary        = 'NEXI — Nexus Enhanced eXtraction Identifier'
  s.description    = 'Expo native module wrapping Apple Vision VNGenerateImageFeaturePrintRequest for object fingerprinting. Extract visual feature prints from images, compare them, and find best matches against a catalog — all on-device, no network calls.'
  s.homepage       = 'https://github.com/nexus-enterprise'
  s.license        = { type: 'MIT' }
  s.author         = 'Nexus'
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.source_files   = '**/*.swift'
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  # Vision framework is available on all iOS versions we target.
  s.framework = 'Vision'
end
