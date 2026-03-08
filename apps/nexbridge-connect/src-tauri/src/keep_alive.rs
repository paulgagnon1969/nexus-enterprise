// ---------------------------------------------------------------------------
// keep_alive — Prevent macOS App Nap from throttling NexBridge Connect
// ---------------------------------------------------------------------------
//
// NexBridge Connect is a distributed compute mesh node (NexMESH). It MUST stay
// responsive to WebSocket heartbeats and job offers even when the window is
// minimized, hidden, or obscured by other windows.
//
// Without this module, macOS App Nap will:
//   - Throttle JS setInterval timers from 15s → 60s+ intervals
//   - Cause the mesh gateway to mark this node as dead (missed heartbeats)
//   - Stop the node from receiving job:offer events
//
// Two mechanisms are used (belt and suspenders):
//   1. NSProcessInfo.beginActivity — immediate runtime assertion
//   2. defaults write NSAppSleepDisabled — persistent preference for future launches
// ---------------------------------------------------------------------------

/// Call once during app setup to prevent App Nap.
///
/// Safe to call on any platform — no-ops on non-macOS.
#[cfg(target_os = "macos")]
pub fn disable_app_nap() {
    // ── Method 1: Runtime assertion (immediate effect) ───────────────────
    //
    // NSProcessInfo.beginActivity(options:reason:) tells the system this
    // process is performing user-initiated work and must not be throttled.
    // The returned token is intentionally retained for the process lifetime.
    unsafe {
        use objc::{class, msg_send, sel, sel_impl};
        use objc::runtime::Object;
        use std::ffi::CString;

        let process_info: *mut Object = msg_send![class!(NSProcessInfo), processInfo];
        if process_info.is_null() {
            eprintln!("[keep-alive] WARNING: NSProcessInfo.processInfo returned null");
            return;
        }

        let reason_cstr = CString::new(
            "NexMESH distributed compute mesh node — must stay active for job processing"
        ).unwrap();

        let reason: *mut Object = msg_send![
            class!(NSString),
            stringWithUTF8String: reason_cstr.as_ptr()
        ];

        // NSActivityUserInitiated = 0x00FFFFFF
        // Includes NSActivityIdleSystemSleepDisabled (bit 20) and all
        // lower flags that prevent App Nap, timer throttling, and I/O
        // coalescing.
        let options: u64 = 0x00FF_FFFF;

        let activity: *mut Object = msg_send![
            process_info,
            beginActivityWithOptions: options
            reason: reason
        ];

        if !activity.is_null() {
            // Retain the token so it survives autorelease pool drain.
            // Intentionally leaked — lives until the process exits.
            let _: *mut Object = msg_send![activity, retain];
            println!("[keep-alive] App Nap disabled via NSProcessInfo.beginActivity (NSActivityUserInitiated)");
        } else {
            eprintln!("[keep-alive] WARNING: beginActivityWithOptions returned null");
        }
    }

    // ── Method 2: Persistent user default (next-launch insurance) ────────
    //
    // `defaults write` sets a preference that macOS reads at launch time.
    // First launch won't benefit, but Method 1 covers that. From the second
    // launch onward both mechanisms are active.
    match std::process::Command::new("defaults")
        .args([
            "write",
            "com.nexus.nexbridge-connect",
            "NSAppSleepDisabled",
            "-bool",
            "YES",
        ])
        .output()
    {
        Ok(_) => println!("[keep-alive] NSAppSleepDisabled written to user defaults"),
        Err(e) => eprintln!("[keep-alive] WARNING: failed to write user default: {}", e),
    }
}

#[cfg(not(target_os = "macos"))]
pub fn disable_app_nap() {
    // App Nap is macOS-specific. No-op on Windows and Linux.
}
