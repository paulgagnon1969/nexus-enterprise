---
title: "ADB APK Deployment Session"
module: mobile-deployment
revision: "1.0"
tags: [sop, mobile-deployment, adb, android, apk, operations]
status: draft
created: 2026-02-23
updated: 2026-02-23
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, pm]
---

# ADB APK Deployment — Session Export

## Purpose
Document the process for transferring and installing APK files from a macOS development machine to an Android device using ADB (Android Debug Bridge).

## Session Summary
- **Date:** 2026-02-23
- **Topics covered:** APK transfer methods, ADB installation and setup on macOS
- **Code changes:** None
- **Decisions made:** ADB via USB is the preferred method for fast APK deployment during development

## Problems Solved
- Identified the fastest method to get an APK from Mac to Android device (ADB install via USB)
- Documented the full ADB setup flow on macOS

## APK Deployment Methods (Ranked by Speed)

### 1. ADB via USB (Recommended)
```bash
# Install ADB
brew install android-platform-tools

# Verify device connection
adb devices

# Install APK directly
adb install /path/to/your/file.apk
```

### 2. ADB over Wi-Fi
```bash
adb connect <device_ip>:5555
adb install /path/to/your/file.apk
```

### 3. Cloud Transfer (Google Drive / Email)
- Upload APK, download on device, tap to install
- Slowest but requires no tooling

## Android Device Setup (One-Time)
1. Settings → About Phone → Tap "Build Number" 7 times
2. Settings → Developer Options → Enable "USB Debugging"
3. Connect via USB, approve the debugging prompt on device

## Useful ADB Commands
| Command | Description |
|---------|-------------|
| `adb devices` | List connected devices |
| `adb install <apk>` | Install APK |
| `adb uninstall <package>` | Uninstall app |
| `adb push <local> <remote>` | Copy file to device |
| `adb pull <remote> <local>` | Copy file from device |
| `adb shell` | Open device shell |
| `adb logcat` | Stream device logs |

## Integration with Nexus Mobile Build
After building the Nexus mobile APK locally:
```bash
# Build APK (from apps/mobile)
bash scripts/build-android-local.sh release

# Install directly to connected device
adb install ~/Library/CloudStorage/GoogleDrive-paul.gagnon@keystone-restoration.com/My\ Drive/nexus-builds/nexus-mobile-release-latest.apk
```

## Lessons Learned
- ADB is the fastest path for development APK testing
- USB connection is more reliable than Wi-Fi ADB for large APK files
- Device must have USB debugging enabled before first connection

## Related Modules
- [Mobile Android Local Build SOP](mobile-android-local-build-sop.md)
- [Mobile App Release Distribution SOP](mobile-app-release-distribution-sop.md)

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-23 | Initial release — ADB setup and APK deployment session |
