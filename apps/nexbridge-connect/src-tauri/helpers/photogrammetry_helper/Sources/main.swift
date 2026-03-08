// photogrammetry_helper — NexCAD Photogrammetry & Model Conversion CLI
//
// Subcommands:
//   reconstruct --input <dir> --output <dir> [--detail full|medium|raw] [--sensitivity high|normal]
//   convert     --input <file.usdz> --output <file.obj>
//   info        --input <file.usdz>
//
// Progress is streamed as JSON lines to stdout for the parent Rust process to parse.

import Foundation
import RealityKit
import ModelIO
import MetalKit

// MARK: - JSON Progress Output

func progress(_ stage: String, pct: Int, message: String? = nil, extra: [String: Any]? = nil) {
    var dict: [String: Any] = ["stage": stage, "pct": pct]
    if let msg = message { dict["message"] = msg }
    if let ext = extra {
        for (k, v) in ext { dict[k] = v }
    }
    if let data = try? JSONSerialization.data(withJSONObject: dict),
       let str = String(data: data, encoding: .utf8) {
        print(str)
        fflush(stdout)
    }
}

func fatal(_ message: String) -> Never {
    let dict: [String: Any] = ["stage": "error", "pct": -1, "message": message]
    if let data = try? JSONSerialization.data(withJSONObject: dict),
       let str = String(data: data, encoding: .utf8) {
        print(str)
        fflush(stdout)
    }
    exit(1)
}

// MARK: - Argument Parsing

struct Args {
    var subcommand: String = ""
    var inputPath: String = ""
    var outputPath: String = ""
    var detail: String = "full"
    var sensitivity: String = "high"

    static func parse() -> Args {
        var args = Args()
        let argv = CommandLine.arguments

        guard argv.count >= 2 else {
            printUsage()
            exit(0)
        }

        args.subcommand = argv[1]

        var i = 2
        while i < argv.count {
            switch argv[i] {
            case "--input":
                i += 1; args.inputPath = argv[i]
            case "--output":
                i += 1; args.outputPath = argv[i]
            case "--detail":
                i += 1; args.detail = argv[i]
            case "--sensitivity":
                i += 1; args.sensitivity = argv[i]
            case "--help", "-h":
                printUsage(); exit(0)
            default:
                break
            }
            i += 1
        }

        return args
    }

    static func printUsage() {
        let usage = """
        photogrammetry_helper — NexCAD Photogrammetry CLI

        SUBCOMMANDS:
          reconstruct  Run PhotogrammetrySession on a folder of images
          convert      Convert USDZ to OBJ via ModelIO
          info         Print model metadata (bounding box, dimensions)

        OPTIONS:
          --input <path>         Input directory (reconstruct) or file (convert/info)
          --output <path>        Output directory (reconstruct) or file (convert)
          --detail <level>       Detail level: full, medium, reduced, raw (default: full)
          --sensitivity <level>  Feature sensitivity: high, normal (default: high)
        """
        fputs(usage, stderr)
    }
}

// MARK: - Reconstruct

@available(macOS 14.0, *)
func runReconstruct(args: Args) async {
    let inputURL = URL(fileURLWithPath: args.inputPath, isDirectory: true)
    let outputDir = URL(fileURLWithPath: args.outputPath, isDirectory: true)

    // Validate input
    var isDir: ObjCBool = false
    guard FileManager.default.fileExists(atPath: args.inputPath, isDirectory: &isDir), isDir.boolValue else {
        fatal("Input directory does not exist: \(args.inputPath)")
    }

    // Create output directory
    try? FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

    let modelURL = outputDir.appendingPathComponent("model.usdz")
    let resultURL = outputDir.appendingPathComponent("result.json")

    // Configure session
    var config = PhotogrammetrySession.Configuration()
    config.featureSensitivity = args.sensitivity == "high" ? .high : .normal
    config.isObjectMaskingEnabled = true
    config.sampleOrdering = .unordered

    progress("initializing", pct: 0, message: "Creating photogrammetry session...")

    let session: PhotogrammetrySession
    do {
        session = try PhotogrammetrySession(input: inputURL, configuration: config)
    } catch {
        fatal("Failed to create PhotogrammetrySession: \(error.localizedDescription)")
    }

    // Map detail level
    let detailLevel: PhotogrammetrySession.Request.Detail
    switch args.detail.lowercased() {
    case "raw":
        detailLevel = .raw
    case "full":
        detailLevel = .full
    case "medium":
        detailLevel = .medium
    case "reduced":
        detailLevel = .reduced
    default:
        detailLevel = .full
    }

    progress("processing", pct: 5, message: "Starting reconstruction at \(args.detail) detail...")

    // Start processing
    do {
        try session.process(requests: [
            .modelFile(url: modelURL, detail: detailLevel)
        ])
    } catch {
        fatal("Failed to start processing: \(error.localizedDescription)")
    }

    // Monitor progress
    do {
        for try await output in session.outputs {
            switch output {
            case .processingComplete:
                progress("reconstructed", pct: 80, message: "Reconstruction complete")

            case .requestProgress(_, let fraction):
                // Map 0.0-1.0 to 5-80%
                let pct = 5 + Int(fraction * 75)
                progress("processing", pct: pct, message: "Reconstructing: \(Int(fraction * 100))%")

            case .requestComplete(_, let result):
                switch result {
                case .modelFile(let url):
                    progress("model_ready", pct: 85, message: "Model saved: \(url.lastPathComponent)")
                default:
                    break
                }

            case .requestError(_, let error):
                fatal("Reconstruction failed: \(error.localizedDescription)")

            case .inputComplete:
                break

            case .invalidSample(let id, let reason):
                // Log but don't fail
                let msg = "Skipped sample \(id): \(reason)"
                progress("warning", pct: -1, message: msg)

            default:
                break
            }
        }
    } catch {
        fatal("Processing stream error: \(error.localizedDescription)")
    }

    // Extract model metadata using ModelIO (works on macOS 14+, no actor issues)
    progress("analyzing", pct: 90, message: "Extracting model dimensions...")

    var resultDict: [String: Any] = [
        "modelPath": modelURL.path,
        "detail": args.detail,
        "sensitivity": args.sensitivity,
    ]

    let asset = MDLAsset(url: modelURL)
    if asset.count > 0 {
        let bounds = asset.boundingBox
        let extents: [Float] = [
            bounds.maxBounds.x - bounds.minBounds.x,
            bounds.maxBounds.y - bounds.minBounds.y,
            bounds.maxBounds.z - bounds.minBounds.z,
        ]

        let metersToInches: Float = 39.3701
        let metersToMm: Float = 1000.0

        // Count geometry
        var totalVertices = 0
        var totalFaces = 0
        for i in 0..<asset.count {
            if let mesh = asset.object(at: i) as? MDLMesh {
                totalVertices += mesh.vertexCount
                for sub in mesh.submeshes as? [MDLSubmesh] ?? [] {
                    totalFaces += sub.indexCount / 3
                }
            }
        }

        resultDict["dimensions"] = [
            "lengthMeters": Double(extents[0]),
            "widthMeters": Double(extents[2]),
            "heightMeters": Double(extents[1]),
            "lengthInches": Double(extents[0] * metersToInches),
            "widthInches": Double(extents[2] * metersToInches),
            "heightInches": Double(extents[1] * metersToInches),
            "lengthMm": Double(extents[0] * metersToMm),
            "widthMm": Double(extents[2] * metersToMm),
            "heightMm": Double(extents[1] * metersToMm),
        ]

        resultDict["boundingBox"] = [
            "min": [Double(bounds.minBounds.x), Double(bounds.minBounds.y), Double(bounds.minBounds.z)],
            "max": [Double(bounds.maxBounds.x), Double(bounds.maxBounds.y), Double(bounds.maxBounds.z)],
        ]

        resultDict["totalVertices"] = totalVertices
        resultDict["totalFaces"] = totalFaces
    }

    // Write result.json
    if let jsonData = try? JSONSerialization.data(withJSONObject: resultDict, options: .prettyPrinted) {
        try? jsonData.write(to: resultURL)
    }

    progress("complete", pct: 100, message: "Reconstruction complete", extra: [
        "modelPath": modelURL.path,
        "resultPath": resultURL.path,
    ])
}

// MARK: - Convert USDZ → OBJ

func runConvert(args: Args) {
    let inputURL = URL(fileURLWithPath: args.inputPath)
    let outputURL = URL(fileURLWithPath: args.outputPath)

    guard FileManager.default.fileExists(atPath: args.inputPath) else {
        fatal("Input file does not exist: \(args.inputPath)")
    }

    progress("converting", pct: 10, message: "Loading USDZ model...")

    // Use ModelIO to load USDZ and export as OBJ
    let asset = MDLAsset(url: inputURL)
    guard asset.count > 0 else {
        fatal("No objects found in USDZ file")
    }

    progress("converting", pct: 50, message: "Exporting to OBJ...")

    // Determine output format from extension
    let ext = outputURL.pathExtension.lowercased()
    let canExport: Bool
    switch ext {
    case "obj":
        canExport = MDLAsset.canExportFileExtension("obj")
    case "stl":
        canExport = MDLAsset.canExportFileExtension("stl")
    case "ply":
        canExport = MDLAsset.canExportFileExtension("ply")
    case "usd", "usda", "usdc", "usdz":
        canExport = MDLAsset.canExportFileExtension(ext)
    default:
        canExport = MDLAsset.canExportFileExtension(ext)
    }

    guard canExport else {
        fatal("ModelIO cannot export to .\(ext) format")
    }

    do {
        try asset.export(to: outputURL)
    } catch {
        fatal("Export failed: \(error.localizedDescription)")
    }

    // Get file size
    let fileSize = (try? FileManager.default.attributesOfItem(atPath: outputURL.path)[.size] as? UInt64) ?? 0

    progress("complete", pct: 100, message: "Converted to \(ext)", extra: [
        "outputPath": outputURL.path,
        "fileSize": fileSize,
    ])
}

// MARK: - Info

func runInfo(args: Args) {
    let inputURL = URL(fileURLWithPath: args.inputPath)

    guard FileManager.default.fileExists(atPath: args.inputPath) else {
        fatal("Input file does not exist: \(args.inputPath)")
    }

    let asset = MDLAsset(url: inputURL)

    var info: [String: Any] = [
        "path": args.inputPath,
        "objectCount": asset.count,
    ]

    // Count vertices and faces across all meshes
    var totalVertices = 0
    var totalFaces = 0

    for i in 0..<asset.count {
        let obj = asset.object(at: i)
        if let mesh = obj as? MDLMesh {
            totalVertices += mesh.vertexCount
            for sub in mesh.submeshes as? [MDLSubmesh] ?? [] {
                totalFaces += sub.indexCount / 3
            }
        }
    }

    info["totalVertices"] = totalVertices
    info["totalFaces"] = totalFaces

    // Bounding box
    let bounds = asset.boundingBox
    let extents = [
        bounds.maxBounds.x - bounds.minBounds.x,
        bounds.maxBounds.y - bounds.minBounds.y,
        bounds.maxBounds.z - bounds.minBounds.z,
    ]

    let metersToMm: Float = 1000.0
    info["dimensions"] = [
        "lengthMeters": Double(extents[0]),
        "widthMeters": Double(extents[2]),
        "heightMeters": Double(extents[1]),
        "lengthMm": Double(extents[0] * metersToMm),
        "widthMm": Double(extents[2] * metersToMm),
        "heightMm": Double(extents[1] * metersToMm),
    ]

    info["boundingBox"] = [
        "min": [Double(bounds.minBounds.x), Double(bounds.minBounds.y), Double(bounds.minBounds.z)],
        "max": [Double(bounds.maxBounds.x), Double(bounds.maxBounds.y), Double(bounds.maxBounds.z)],
    ]

    if let data = try? JSONSerialization.data(withJSONObject: info, options: .prettyPrinted),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}

// MARK: - Entry Point

let args = Args.parse()

switch args.subcommand {
case "reconstruct":
    guard !args.inputPath.isEmpty, !args.outputPath.isEmpty else {
        fatal("reconstruct requires --input and --output")
    }
    if #available(macOS 14.0, *) {
        let semaphore = DispatchSemaphore(value: 0)
        Task {
            await runReconstruct(args: args)
            semaphore.signal()
        }
        semaphore.wait()
    } else {
        fatal("Reconstruction requires macOS 14.0 or later")
    }

case "convert":
    guard !args.inputPath.isEmpty, !args.outputPath.isEmpty else {
        fatal("convert requires --input and --output")
    }
    runConvert(args: args)

case "info":
    guard !args.inputPath.isEmpty else {
        fatal("info requires --input")
    }
    runInfo(args: args)

default:
    Args.printUsage()
    exit(1)
}
