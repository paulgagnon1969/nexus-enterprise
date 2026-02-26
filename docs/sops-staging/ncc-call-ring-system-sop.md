---
title: "NCC Call Ring System SOP"
module: video-calling
revision: "1.0"
tags: [sop, video-calling, push-notifications, ring, mobile]
status: draft
created: 2026-02-26
updated: 2026-02-26
author: Warp
---

# NCC Call Ring System

## Purpose
Documents how incoming video/audio call notifications ring on recipient devices, the central configuration flags that control behaviour, and how to troubleshoot or tweak the ring flow.

## Who Uses This
- Mobile developers modifying call UX
- DevOps debugging "silent ring" reports
- Product team tuning ring duration, vibration, or sound

## Architecture Overview

```
Caller taps "Call"
  → POST /video/rooms (create room)
  → Caller enters VideoCallScreen
  → Caller taps "Invite" → selects contacts
  → POST /video/rooms/:roomId/smart-invite
      ├─ userId present? → push notification (Expo)
      ├─ phone present?  → SMS via MessageBird + guest link
      └─ email present?  → Email + guest join URL
```

### Push notification delivery path

```
Expo Push API
  ├─ iOS  → APNs → sound field = "nexus_ring.wav" (bundled in app)
  └─ Android → FCM → channelId = "video-calls"
                       → channel sound = "nexus_ring.wav"
                       → importance = MAX, bypassDnd = true
```

### On the recipient device (mobile app)

```
Push arrives
  ├─ App FOREGROUNDED
  │    ├─ setNotificationHandler fires
  │    │    ├─ shouldPlaySound = callRingConfig.systemSound.foreground (default: true)
  │    │    └─ shouldShowAlert = callRingConfig.showForegroundBanner (default: false)
  │    └─ addNotificationReceivedListener fires
  │         └─ setIncomingCall(callData) → renders <IncomingCallScreen>
  │              ├─ expo-audio ring = callRingConfig.inAppAudioFallback (default: false)
  │              ├─ vibration = callRingConfig.vibrationEnabled (default: true)
  │              └─ auto-dismiss after callRingConfig.ringTimeoutMs (default: 45s)
  │
  ├─ App BACKGROUNDED
  │    ├─ setNotificationHandler fires
  │    │    ├─ shouldPlaySound = callRingConfig.systemSound.background (default: true)
  │    │    └─ shouldShowAlert = true (always show system notification)
  │    └─ User taps notification → addNotificationResponseReceivedListener
  │         → joins room via POST /video/rooms/:roomId/join
  │
  └─ App KILLED
       └─ OS shows notification using channel defaults
            → sound from "video-calls" channel (Android)
            → sound from APNs payload (iOS)
```

## Configuration Flags

All ring behaviour is controlled from a single file:

**`apps/mobile/src/config/callRingConfig.ts`**

### Flag Reference

**systemSound.foreground** (`boolean`, default: `true`)
Play the OS notification sound when the app is in the foreground. The IncomingCallScreen overlay still renders on top.

**systemSound.background** (`boolean`, default: `true`)
Play the OS notification sound when the app is in the background. This is the primary ring mechanism for background calls.

**inAppAudioFallback** (`boolean`, default: `false`)
When true, IncomingCallScreen also plays `nexus_ring.wav` through expo-audio. Use as a fallback if system notification sound is unreliable on specific devices. **Warning:** enabling this alongside `systemSound.foreground = true` causes a double-ring.

**overrideSilentMode** (`boolean`, default: `true`)
Force playback through iOS silent mode switch. Only applies when `inAppAudioFallback = true`.

**vibrationEnabled** (`boolean`, default: `true`)
Vibrate the device when the IncomingCallScreen is showing.

**vibrationPattern** (`number[]`, default: `[0, 800, 200, 800, 200, 600, 400, 800]`)
Vibration pattern in ms: [pause, buzz, pause, buzz, …]. Repeats indefinitely until accepted or declined.

**ringTimeoutMs** (`number`, default: `45000`)
How long the IncomingCallScreen stays visible before auto-dismissing. Set to `0` to never auto-dismiss.

**showForegroundBanner** (`boolean`, default: `false`)
Show the system alert/banner overlay when the app is foregrounded. Usually false because IncomingCallScreen replaces it. Set to true if the custom overlay is not rendering reliably.

## Common Scenarios & Recommended Settings

### Default (current)
System notification sound handles all ringing. IncomingCallScreen provides the visual UX + vibration.
```typescript
systemSound:         { foreground: true, background: true }
inAppAudioFallback:  false
vibrationEnabled:    true
showForegroundBanner: false
```

### Double-ring safety net (for flaky devices)
Enable expo-audio as a fallback if users report silent foreground rings.
```typescript
systemSound:         { foreground: true, background: true }
inAppAudioFallback:  true   // ← double-ring, but guarantees sound
```

### Silent ring (vibrate only)
For environments where audible rings are disruptive.
```typescript
systemSound:         { foreground: false, background: false }
inAppAudioFallback:  false
vibrationEnabled:    true
```

### System-only (no custom overlay)
Rely entirely on the OS notification. Useful for debugging.
```typescript
showForegroundBanner: true
inAppAudioFallback:  false
```

## Files Involved

- `apps/mobile/src/config/callRingConfig.ts` — central flag file (EDIT THIS)
- `apps/mobile/src/utils/pushNotifications.ts` — notification handler, reads config
- `apps/mobile/src/screens/IncomingCallScreen.tsx` — full-screen call overlay, reads config
- `apps/mobile/App.tsx` — notification listener, ring timeout from config
- `apps/api/src/modules/notifications/push.service.ts` — sends push via Expo SDK
- `apps/api/src/modules/video/video.service.ts` — smart-invite routing, sets sound/channelId
- `apps/api/src/common/email.service.ts` — sendCallInvite email template
- `apps/api/src/common/messagebird-sms.client.ts` — SMS delivery for guest links
- `apps/mobile/assets/sounds/nexus_ring.wav` — ringtone audio file
- `apps/mobile/app.json` — expo-notifications plugin bundles the sound file

## Troubleshooting

### Phone doesn't ring at all
1. Verify push token is registered: check `DevicePushToken` table for the user
2. Check API logs for `Push sent: X, failed: Y` after smart-invite
3. Confirm `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` are set in API env
4. On Android: check notification channel settings (user may have muted "Video Calls")
5. On iOS: check notification permissions in Settings → Nexus Mobile

### Ring plays but IncomingCallScreen doesn't show
1. Only fires via `addNotificationReceivedListener` — requires app to be in foreground
2. Check that push data includes `type: "video_call"` and `roomId`
3. Background calls show as system notifications only (no overlay)

### Double ring sound
Set `callRingConfig.inAppAudioFallback = false` (it's the default). This disables the expo-audio path, leaving only the system notification sound.

### Ring too short or too long
Adjust `callRingConfig.ringTimeoutMs`. The visual overlay auto-dismisses after this duration. The system notification sound duration is controlled by the audio file length.

### Ring doesn't bypass Do Not Disturb (Android)
The `video-calls` channel is configured with `bypassDnd: true`. If it's not working:
1. The channel config is set at first registration — if the user installed before this flag was added, delete and recreate the channel (requires app reinstall or channel deletion via Android settings).
2. Android 13+ may require explicit DND override permission.

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-26 | Initial release — documented ring architecture, callRingConfig flags, and troubleshooting |
