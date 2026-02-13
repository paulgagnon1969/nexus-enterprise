# Mobile App Version Control

## Overview

The Nexus Mobile app uses **semantic versioning** with automatic build number incrementing to ensure consistent builds across the team.

## Version Format

```
<version>.<buildNumber>
Example: 1.2.3 (45)
```

- **Version** (`app.json` → `expo.version`): Semantic version (MAJOR.MINOR.PATCH)
- **Build Number**: Auto-incremented by EAS Build on each build

## Configuration Files

### app.json
```json
{
  "expo": {
    "version": "1.0.0",  // ← Bump this manually
    "runtimeVersion": {
      "policy": "appVersion"  // Runtime version matches app version
    }
  }
}
```

### eas.json
```json
{
  "cli": {
    "appVersionSource": "remote"  // Version managed by EAS
  },
  "build": {
    "development": {
      "autoIncrement": true  // ← Auto-increment build number
    },
    "preview": {
      "autoIncrement": true
    },
    "production": {
      "autoIncrement": true
    }
  }
}
```

## Versioning Workflow

### When to Bump Version

Follow semantic versioning:

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes, complete redesign
- **MINOR** (1.0.0 → 1.1.0): New features, non-breaking changes
- **PATCH** (1.0.0 → 1.0.1): Bug fixes, small improvements

### How to Bump Version

1. Edit `apps/mobile/app.json`:
   ```json
   {
     "expo": {
       "version": "1.1.0"  // ← Update this
     }
   }
   ```

2. Commit the change:
   ```bash
   git add apps/mobile/app.json
   git commit -m "chore(mobile): bump version to 1.1.0"
   git push
   ```

3. Build automatically increments the build number

### Build Number Auto-Increment

Build numbers are **automatically incremented** on every EAS build:

```bash
# Development build
eas build --profile development --platform ios
# → Version 1.1.0 (23)

# Next development build
eas build --profile development --platform ios
# → Version 1.1.0 (24)
```

## Build Profiles

### Development
- **Channel**: `development`
- **Distribution**: Internal (TestFlight/Internal Testing)
- **Auto-increment**: ✅ Enabled
- **API**: Production API

```bash
eas build --profile development --platform ios
eas build --profile development --platform android
```

### Preview
- **Channel**: `preview`
- **Distribution**: Internal
- **Auto-increment**: ✅ Enabled
- **API**: Production API
- **Use case**: Pre-release testing, stakeholder demos

```bash
eas build --profile preview --platform ios
eas build --profile preview --platform android
```

### Production
- **Channel**: `production`
- **Distribution**: App Store / Google Play
- **Auto-increment**: ✅ Enabled
- **API**: Production API

```bash
eas build --profile production --platform ios
eas build --profile production --platform android
```

## Checking Current Version

### In the App
Display version in app settings/about screen:

```typescript
import Constants from 'expo-constants';

const version = Constants.expoConfig?.version; // "1.1.0"
const buildNumber = Constants.expoConfig?.ios?.buildNumber || 
                    Constants.expoConfig?.android?.versionCode;
```

### In EAS
```bash
eas build:list
```

### In Git
```bash
cat apps/mobile/app.json | grep '"version"'
```

## Team Workflow

### When Starting Work

1. **Pull latest code**:
   ```bash
   git pull origin main
   ```

2. **Check current version**:
   ```bash
   cat apps/mobile/app.json | grep '"version"'
   ```

3. **Install latest build** (if available):
   - iOS: Check TestFlight
   - Android: Check internal testing track

### When Releasing

1. **Decide version bump** (MAJOR/MINOR/PATCH)

2. **Update version in `app.json`**:
   ```bash
   # Edit apps/mobile/app.json
   # Change "version": "1.0.0" → "1.1.0"
   ```

3. **Commit version bump**:
   ```bash
   git add apps/mobile/app.json
   git commit -m "chore(mobile): bump version to 1.1.0"
   git push
   ```

4. **Build for testing**:
   ```bash
   eas build --profile preview --platform all
   ```

5. **Test thoroughly**

6. **Build for production**:
   ```bash
   eas build --profile production --platform all
   ```

7. **Submit to stores**:
   ```bash
   eas submit --platform ios
   eas submit --platform android
   ```

## Version Tracking in Git

### Tags
Create git tags for production releases:

```bash
# After production build
git tag mobile-v1.1.0
git push origin mobile-v1.1.0
```

### Commit Messages
Use conventional commits for mobile changes:

```
feat(mobile): add offline sync for daily logs
fix(mobile): resolve camera permission crash
chore(mobile): bump version to 1.1.0
```

## OTA Updates (Over-The-Air)

EAS Update allows pushing JavaScript/asset changes without rebuilding:

```bash
# Push update to development channel
eas update --branch development --message "Fix login screen bug"

# Push update to production channel
eas update --branch production --message "Hotfix: daily log sync"
```

**Note**: OTA updates only work within the same `runtimeVersion`. Native code changes require a full rebuild.

## Troubleshooting

### "Version already exists" error
- Build number auto-increments, so this shouldn't happen
- If it does, manually increment in App Store Connect / Google Play Console

### Team members on different builds
- **Solution**: Always pull latest code and install latest TestFlight/internal testing build
- **Check build**: Run `eas build:list` to see latest build IDs

### Version mismatch between iOS and Android
- Both platforms share the same `version` in `app.json`
- Build numbers may differ (iOS and Android increment separately)
- This is normal and expected

## Best Practices

1. ✅ **Always commit version bumps** to git before building
2. ✅ **Use semantic versioning** (MAJOR.MINOR.PATCH)
3. ✅ **Tag production releases** in git
4. ✅ **Document changes** in CHANGELOG.md (if you create one)
5. ✅ **Test preview builds** before production
6. ❌ **Don't manually set build numbers** (let EAS auto-increment)
7. ❌ **Don't skip version bumps** for significant changes

---

**Last Updated**: 2026-02-12
