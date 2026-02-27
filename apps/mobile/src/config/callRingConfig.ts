/**
 * ── NCC Call Ring Configuration ─────────────────────────────────────
 *
 * Central control surface for all incoming-call ring behaviour.
 * Flip flags here instead of hunting through IncomingCallScreen,
 * pushNotifications.ts, or App.tsx.
 *
 * See the SOP:  docs/sops-staging/ncc-call-ring-system-sop.md
 */

export const callRingConfig = {
  // ── System notification sound ────────────────────────────────────
  /** Play the OS-level notification sound (nexus_ring.wav via channel/APNs). */
  systemSound: {
    /** Play when the app is in the foreground. */
    foreground: true,
    /** Play when the app is in the background / killed. */
    background: true,
  },

  // ── In-app audio fallback (expo-audio) ───────────────────────────
  /**
   * When true, IncomingCallScreen also plays the ringtone through
   * expo-audio.  Useful if the system notification sound is unreliable
   * on certain devices, but causes a double-ring when systemSound is
   * also enabled for the same state.
   *
   * Recommended: false (system sound handles it).
   * Set to true only if users report silent rings in the foreground.
   */
  inAppAudioFallback: true,

  /**
   * Force iOS silent-mode override via expo-audio (playsInSilentMode).
   * Only relevant when inAppAudioFallback is true.
   */
  overrideSilentMode: true,

  // ── Vibration ────────────────────────────────────────────────────
  /** Vibrate the device on incoming call. */
  vibrationEnabled: true,

  /**
   * Vibration pattern in ms: [pause, buzz, pause, buzz, …].
   * The `true` flag passed to Vibration.vibrate() repeats indefinitely.
   */
  vibrationPattern: [0, 800, 200, 800, 200, 600, 400, 800],

  // ── Timing ───────────────────────────────────────────────────────
  /**
   * How long (ms) the IncomingCallScreen stays visible before
   * auto-dismissing.  Set to 0 to never auto-dismiss.
   */
  ringTimeoutMs: 45_000,

  // ── Notification presentation (foreground) ───────────────────────
  /**
   * Show the system alert / banner when the app is in the foreground.
   * Usually false because IncomingCallScreen replaces it, but set to
   * true if the overlay isn't rendering reliably.
   */
  showForegroundBanner: false,
} as const;

export type CallRingConfig = typeof callRingConfig;
