# sketchup_import.rb — NexCAD SketchUp Import Script
#
# Imports a Collada DAE file into SketchUp and saves as native .skp
#
# Usage (invoked by NexBridge via SketchUp CLI):
#   /Applications/SketchUp 2026/SketchUp.app/Contents/MacOS/SketchUp \
#     -RubyStartup /path/to/sketchup_import.rb
#
# Environment variables:
#   NEXCAD_INPUT  — path to input .dae file
#   NEXCAD_OUTPUT — path for output .skp file
#
# The script imports the DAE, zooms to fit, and saves as .skp.

input_dae  = ENV['NEXCAD_INPUT']
output_skp = ENV['NEXCAD_OUTPUT']

unless input_dae && output_skp
  STDERR.puts "[NexCAD] ERROR: NEXCAD_INPUT and NEXCAD_OUTPUT must be set"
  Sketchup.quit
  exit 1
end

unless File.exist?(input_dae)
  STDERR.puts "[NexCAD] ERROR: Input file not found: #{input_dae}"
  Sketchup.quit
  exit 1
end

STDERR.puts "[NexCAD] Importing: #{input_dae}"

begin
  model = Sketchup.active_model

  # Import the DAE file
  # SketchUp import options for Collada:
  #   false = do not show the import options dialog
  success = model.import(input_dae, false)

  unless success
    STDERR.puts "[NexCAD] ERROR: Import failed for #{input_dae}"
    Sketchup.quit
    exit 1
  end

  STDERR.puts "[NexCAD] Import successful, saving to: #{output_skp}"

  # Zoom to fit the imported geometry
  view = model.active_view
  view.zoom_extents

  # Set model units to millimeters (most useful for precision scans)
  options = model.options["UnitsOptions"]
  if options
    options["LengthUnit"]    = 2  # 0=in, 1=ft, 2=mm, 3=cm, 4=m
    options["LengthPrecision"] = 1  # 1 decimal place
  end

  # Save the model
  status = model.save(output_skp)

  if status
    STDERR.puts "[NexCAD] Saved: #{output_skp}"
  else
    STDERR.puts "[NexCAD] WARNING: Save returned false for #{output_skp}"
  end

rescue => e
  STDERR.puts "[NexCAD] ERROR: #{e.message}"
  STDERR.puts e.backtrace.first(5).join("\n")
end

# Quit SketchUp after processing
Sketchup.quit
