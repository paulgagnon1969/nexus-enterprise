// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "photogrammetry_helper",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "photogrammetry_helper",
            path: "Sources",
            linkerSettings: [
                .linkedFramework("RealityKit"),
                .linkedFramework("ModelIO"),
                .linkedFramework("Metal"),
            ]
        ),
    ]
)
