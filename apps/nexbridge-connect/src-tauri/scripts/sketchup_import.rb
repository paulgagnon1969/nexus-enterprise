# sketchup_import.rb — NexCAD SketchUp Import Script
#
# Imports a Collada DAE file into SketchUp and saves as native .skp.
#
# Uses an AppObserver for normal flow, with a fallback polling timer for
# SketchUp 2026 welcome-screen cases where observer callbacks may not fire.
#
# Usage:
#   NEXCAD_INPUT=/path/to/model.dae NEXCAD_OUTPUT=/path/to/model.skp \
#     /Applications/SketchUp\ 2026/SketchUp.app/Contents/MacOS/SketchUp \
#     -RubyStartup /path/to/sketchup_import.rb

$nexcad_done = false
$nexcad_started_at = Time.now

# Maximum seconds to wait before giving up and quitting
NEXCAD_TIMEOUT = 90
# Seconds between fallback polls for active model
NEXCAD_POLL_INTERVAL = 2.0

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

# -----------------------------------------------------------------------
# Fallback polling timer — in case the AppObserver never fires
# (e.g. SketchUp 2026 welcome screen doesn't trigger onNewModel).
# Polls Sketchup.active_model every NEXCAD_POLL_INTERVAL seconds.
# Also enforces an absolute timeout to prevent infinite hangs.
# -----------------------------------------------------------------------
UI.start_timer(NEXCAD_POLL_INTERVAL, true) do |timer_id|
  if $nexcad_done
    # Import already handled by observer — stop polling
    UI.stop_timer(timer_id)
    next
  end

  elapsed = Time.now - $nexcad_started_at

  if elapsed > NEXCAD_TIMEOUT
    STDERR.puts "[NexCAD] TIMEOUT after #{elapsed.to_i}s — quitting"
    UI.stop_timer(timer_id)
    UI.start_timer(0.5, false) { Sketchup.quit }
    next
  end

  # Check if SketchUp has an active model we can use
  model = Sketchup.active_model
  if model
    STDERR.puts "[NexCAD] Fallback poll: active model found after #{elapsed.to_i}s"
    UI.stop_timer(timer_id)
    NexCAD.run_import(model)
  else
    STDERR.puts "[NexCAD] Fallback poll: no model yet (#{elapsed.to_i}s elapsed)"
  end
end
