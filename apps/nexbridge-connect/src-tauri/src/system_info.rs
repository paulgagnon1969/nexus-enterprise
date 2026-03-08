use serde::{Deserialize, Serialize};
use sysinfo::System;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub cpu_cores: usize,
    pub ram_gb: f64,
    pub platform: String,
    pub battery_pct: Option<f64>,
    pub on_ac: bool,
    pub cpu_load_pct: f64,
}

fn detect_platform() -> String {
    let arch = std::env::consts::ARCH; // "aarch64", "x86_64", etc.
    let os = std::env::consts::OS; // "macos", "windows", "linux"
    format!("{}-{}", os, arch)
}

/// Best-effort battery reading via system commands.
/// Returns (battery_pct, on_ac).
fn read_battery() -> (Option<f64>, bool) {
    #[cfg(target_os = "macos")]
    {
        // pmset -g batt → "Now drawing from 'AC Power'" or "'Battery Power'"
        // and "-InternalBattery-0 (id=…)  100%; charged; …"
        if let Ok(output) = std::process::Command::new("pmset")
            .args(["-g", "batt"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            let on_ac = text.contains("AC Power");
            // Look for a percentage like "100%"
            let pct = text
                .lines()
                .find_map(|line| {
                    line.split_whitespace()
                        .find(|w| w.ends_with("%;"))
                        .or_else(|| line.split_whitespace().find(|w| w.ends_with('%')))
                        .and_then(|w| w.trim_end_matches(|c: char| !c.is_ascii_digit()).parse::<f64>().ok())
                });
            // If no battery line found, this is likely a desktop Mac
            if pct.is_none() && !text.contains("InternalBattery") {
                return (None, true); // desktop, always AC
            }
            return (pct, on_ac);
        }
    }

    #[cfg(target_os = "windows")]
    {
        // WMIC — works on most Windows versions
        if let Ok(output) = std::process::Command::new("wmic")
            .args(["path", "Win32_Battery", "get", "EstimatedChargeRemaining,BatteryStatus"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            let mut pct = None;
            let mut on_ac = true;
            for line in text.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    // BatteryStatus 2 = AC, 1 = battery
                    if let Ok(status) = parts[0].parse::<u32>() {
                        on_ac = status == 2;
                    }
                    if let Ok(p) = parts[1].parse::<f64>() {
                        pct = Some(p);
                    }
                }
            }
            return (pct, on_ac);
        }
    }

    // Linux / fallback — assume desktop
    (None, true)
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu_cores = sys.cpus().len();
    let ram_gb = sys.total_memory() as f64 / 1_073_741_824.0; // bytes → GB

    // Average CPU usage across all cores
    let cpu_load_pct = if cpu_cores > 0 {
        sys.cpus().iter().map(|c| c.cpu_usage() as f64).sum::<f64>() / cpu_cores as f64
    } else {
        0.0
    };

    let (battery_pct, on_ac) = read_battery();

    SystemInfo {
        cpu_cores,
        ram_gb: (ram_gb * 10.0).round() / 10.0, // 1 decimal place
        platform: detect_platform(),
        battery_pct,
        on_ac,
        cpu_load_pct: (cpu_load_pct * 10.0).round() / 10.0,
    }
}
