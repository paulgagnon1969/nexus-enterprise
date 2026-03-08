#!/usr/bin/env python3
"""analyze_mesh.py — NexCAD Mesh Geometry Analyzer

Extracts engineering-grade measurements from a 3D mesh file.
Outputs a JSON report with dimensions, bounding box, geometry stats,
and detected features (planes, edges).

Usage:
    python3 analyze_mesh.py <input_file> <output_json>

Supported input: OBJ, STL, PLY, GLTF, GLB, OFF
Requires: pip3 install trimesh numpy
"""

import json
import sys
import os
import time

def analyze(input_path: str, output_path: str):
    start_time = time.time()

    try:
        import trimesh
    except ImportError:
        result = {
            "error": "trimesh not installed. Run: pip3 install trimesh numpy",
            "success": False,
        }
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2)
        return

    if not os.path.exists(input_path):
        result = {"error": f"File not found: {input_path}", "success": False}
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2)
        return

    # Load the mesh
    try:
        mesh = trimesh.load(input_path, force="mesh")
    except Exception as e:
        result = {"error": f"Failed to load mesh: {e}", "success": False}
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2)
        return

    result = {"success": True, "inputPath": input_path}

    # --- Basic geometry stats ---
    result["geometry"] = {
        "vertexCount": int(len(mesh.vertices)),
        "faceCount": int(len(mesh.faces)),
        "isWatertight": bool(mesh.is_watertight),
        "volume": float(mesh.volume) if mesh.is_watertight else None,
        "surfaceArea": float(mesh.area),
    }

    # --- Bounding box (axis-aligned) ---
    bb_min = mesh.bounds[0].tolist()
    bb_max = mesh.bounds[1].tolist()
    extents = mesh.extents.tolist()

    METERS_TO_MM = 1000.0
    METERS_TO_INCHES = 39.3701

    result["boundingBox"] = {
        "min": bb_min,
        "max": bb_max,
    }

    result["dimensions"] = {
        "lengthMeters": extents[0],
        "widthMeters": extents[1],
        "heightMeters": extents[2],
        "lengthMm": extents[0] * METERS_TO_MM,
        "widthMm": extents[1] * METERS_TO_MM,
        "heightMm": extents[2] * METERS_TO_MM,
        "lengthInches": extents[0] * METERS_TO_INCHES,
        "widthInches": extents[1] * METERS_TO_INCHES,
        "heightInches": extents[2] * METERS_TO_INCHES,
    }

    # --- Oriented bounding box (tighter fit) ---
    try:
        obb = mesh.bounding_box_oriented
        obb_extents = obb.extents.tolist()
        result["orientedBoundingBox"] = {
            "extentsMeters": obb_extents,
            "extentsMm": [e * METERS_TO_MM for e in obb_extents],
            "extentsInches": [e * METERS_TO_INCHES for e in obb_extents],
        }
    except Exception:
        pass

    # --- Centroid ---
    result["centroid"] = mesh.centroid.tolist()

    # --- Sharp edges (feature detection) ---
    try:
        import numpy as np
        face_adjacency_angles = mesh.face_adjacency_angles
        # Edges where face angle > 30 degrees are "sharp" (potential feature boundaries)
        sharp_mask = face_adjacency_angles > np.radians(30)
        sharp_edge_count = int(np.sum(sharp_mask))
        result["sharpEdges"] = {
            "count": sharp_edge_count,
            "thresholdDegrees": 30,
        }

        # Very sharp edges (>60 deg) — likely geometric features
        very_sharp = face_adjacency_angles > np.radians(60)
        result["verySharpEdges"] = {
            "count": int(np.sum(very_sharp)),
            "thresholdDegrees": 60,
        }
    except Exception:
        pass

    # --- Face normals analysis (detect dominant planes) ---
    try:
        import numpy as np
        normals = mesh.face_normals
        face_areas = mesh.area_faces

        # Cluster normals by direction to find dominant planes
        # Simplified: check alignment with principal axes
        planes = []
        for axis_name, axis_vec in [("XY", [0, 0, 1]), ("XZ", [0, 1, 0]), ("YZ", [1, 0, 0])]:
            axis = np.array(axis_vec, dtype=float)
            alignment = np.abs(np.dot(normals, axis))
            # Faces aligned within 10 degrees of axis
            aligned_mask = alignment > np.cos(np.radians(10))
            if np.any(aligned_mask):
                aligned_area = float(np.sum(face_areas[aligned_mask]))
                planes.append({
                    "plane": axis_name,
                    "alignedFaces": int(np.sum(aligned_mask)),
                    "alignedAreaM2": aligned_area,
                    "alignedAreaFt2": aligned_area * 10.7639,
                })
        result["dominantPlanes"] = planes
    except Exception:
        pass

    # --- Processing time ---
    result["processingTimeSecs"] = round(time.time() - start_time, 3)

    # Write output
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)

    print(json.dumps({"stage": "complete", "pct": 100, "outputPath": output_path}))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 analyze_mesh.py <input_file> <output_json>")
        sys.exit(1)

    analyze(sys.argv[1], sys.argv[2])
