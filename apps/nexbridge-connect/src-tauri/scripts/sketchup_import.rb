# sketchup_import.rb — NexCAD SketchUp Import Script
#
# Imports a Collada DAE file into SketchUp and saves as native .skp.
#
# Uses an AppObserver so the import fires exactly when a model becomes
# available — no timers, no polling, handles the welcome screen safely.
#
# Usage:
#   NEXCAD_INPUT=/path/to/model.dae NEXCAD_OUTPUT=/path/to/model.skp \
#     /Applications/SketchUp\ 2026/SketchUp.app/Contents/MacOS/SketchUp \
#     -RubyStartup /path/to/sketchup_import.rb

$nexcad_done = false

module NexCAD
  def self.run_import(model)
    return if $nexcad_done
    $nexcad_done = true

    input_dae  = ENV['NEXCAD_INPUT']
    output_skp = ENV['NEXCAD_OUTPUT']

    unless input_dae && output_skp
      STDERR.puts "[NexCAD] ERROR: NEXCAD_INPUT and NEXCAD_OUTPUT must be set"
      UI.start_timer(0.5, false) { Sketchup.quit }
      return
    end

    unless File.exist?(input_dae)
      STDERR.puts "[NexCAD] ERROR: Input file not found: #{input_dae}"
      UI.start_timer(0.5, false) { Sketchup.quit }
      return
    end

    STDERR.puts "[NexCAD] Model available — importing: #{input_dae}"

    begin
      success = model.import(input_dae, false)

      unless success
        STDERR.puts "[NexCAD] ERROR: Import returned false for #{input_dae}"
        UI.start_timer(0.5, false) { Sketchup.quit }
        return
      end

      STDERR.puts "[NexCAD] Import OK, configuring model..."

      # Set model units to millimeters
      opts = model.options["UnitsOptions"]
      if opts
        opts["LengthUnit"]      = 2   # 0=in, 1=ft, 2=mm, 3=cm, 4=m
        opts["LengthPrecision"] = 1   # 1 decimal place
      end

      # Zoom to fit
      view = model.active_view
      view.zoom_extents if view

      # Save as .skp
      STDERR.puts "[NexCAD] Saving to: #{output_skp}"
      status = model.save(output_skp)

      if status
        size = File.size(output_skp) rescue 0
        STDERR.puts "[NexCAD] SUCCESS: #{output_skp} (#{size} bytes)"
      else
        STDERR.puts "[NexCAD] WARNING: model.save returned false"
      end

    rescue => e
      STDERR.puts "[NexCAD] ERROR: #{e.message}"
      STDERR.puts e.backtrace.first(5).join("\n")
    end

    # Defer quit so SketchUp finishes flushing the save
    UI.start_timer(1.0, false) { Sketchup.quit }
  end
end

# -----------------------------------------------------------------------
# AppObserver — fires when the user (or welcome screen) creates/opens
# a model.  This is the safe, crash-free way to detect readiness.
# -----------------------------------------------------------------------
class NexCADAppObserver < Sketchup::AppObserver
  def onNewModel(model)
    NexCAD.run_import(model)
  end

  def onOpenModel(model)
    NexCAD.run_import(model)
  end
end

Sketchup.add_observer(NexCADAppObserver.new)
STDERR.puts "[NexCAD] Observer registered — waiting for model..."
