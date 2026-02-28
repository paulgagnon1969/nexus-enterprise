# Deployment Monitoring Scripts

Automated tools for monitoring GitHub Actions deployments with automatic error detection.

## Prerequisites

Install and authenticate with GitHub CLI:

```bash
brew install gh
gh auth login
```

## Scripts

### 1. `deploy-and-monitor.sh` - Full Deployment Pipeline

**Complete automation from commit to deployment monitoring.**

```bash
./scripts/deploy-and-monitor.sh
```

**What it does:**
1. ✅ Checks git status and current branch
2. 📝 Commits uncommitted changes (prompts for message)
3. 📤 Pushes to GitHub
4. ⏳ Waits for GitHub Actions to start
5. 📊 Monitors deployment in real-time
6. ✅ Shows success summary with deployment time
7. ❌ **Automatically fetches and displays error logs if deployment fails**

**Success Output:**
```
✅ DEPLOYMENT SUCCESSFUL!
⏱️  Duration: 7m 33s
🎯 What was deployed:
  c1664a0 fix(api): Remove incompatible Multer...
🌐 Production URLs:
   API: https://nexus-api-wswbn2e6ta-uc.a.run.app
```

**Failure Output:**
```
❌ DEPLOYMENT FAILED!
🔍 Fetching error logs...
❌ Failed jobs:
   • deploy
📋 Error logs (last 100 lines):
   [actual error messages from GitHub Actions]
💡 Troubleshooting tips:
   1. Check full logs: gh run view 12345 --log
   2. Run type check: npm run check-types -w apps/api
```

### 2. `check-deploy-status.sh` - Quick Status Check

**Check the current deployment status without deploying.**

```bash
./scripts/check-deploy-status.sh
```

**What it does:**
- Shows status of the latest GitHub Actions run
- If failed: **automatically fetches last 50 lines of error logs**
- If in progress: shows watch command
- If successful: shows what's deployed

**Example Usage:**

```bash
# Check current branch
./scripts/check-deploy-status.sh

# Check specific branch
./scripts/check-deploy-status.sh develop
```

## Integration with Existing Workflows

### Replace `deploy-prod.sh` calls

**Before:**
```bash
./scripts/deploy-prod.sh  # Opens terminal, hard to see errors
```

**After:**
```bash
./scripts/deploy-and-monitor.sh  # Runs in current terminal, auto-shows errors
```

### Quick status after any push

```bash
git push origin main
sleep 10  # Wait for GitHub Actions to start
./scripts/check-deploy-status.sh
```

### Watch active deployment

```bash
# Find the run ID
./scripts/check-deploy-status.sh

# Watch it live
gh run watch <run-id>
```

## Example Scenarios

### Scenario 1: Deploy and catch errors immediately

```bash
$ ./scripts/deploy-and-monitor.sh

🚀 NEXUS DEPLOYMENT MONITOR
📋 Step 1: Checking git status...
   Branch: main
📝 Step 2: Uncommitted changes detected
   Commit message: fix room scan module
   Pushing to origin/main...
   ✅ Changes pushed
⏳ Step 3: Waiting for GitHub Actions to start...
   ✅ Found run: #12345
📊 Step 4: Monitoring deployment...

[... build progress ...]

❌ DEPLOYMENT FAILED!
🔍 Fetching error logs...

📋 Error logs (last 100 lines):
ERROR: Cannot find module '@nestjs/platform-express'
  at Module._resolveFilename
  ...
  
💡 Troubleshooting tips:
   1. Check the full logs: gh run view 12345 --log
   2. View in browser: https://github.com/...
   3. Run type check locally: npm run check-types -w apps/api
   4. Test build locally: npm run build -w apps/api
```

**Now you can immediately see the error and fix it!**

### Scenario 2: Check status after manual push

```bash
$ git push origin main
Enumerating objects: 5, done...

$ ./scripts/check-deploy-status.sh

🔍 Checking deployment status for branch: main
📦 Run #12346: Prod API deploy (Cloud Run)
📝 fix: remove multer dependency

✅ Status: SUCCESS

🌐 Production is live with these changes:
  c1664a0 fix(api): Remove incompatible Multer...
```

### Scenario 3: Monitor deployment that's already running

```bash
$ ./scripts/check-deploy-status.sh

🔍 Checking deployment status for branch: main
📦 Run #12347: Prod API deploy (Cloud Run)

⏳ Status: IN PROGRESS

Watch live: gh run watch 12347
🔗 https://github.com/.../actions/runs/12347

# Follow the suggestion to watch live
$ gh run watch 12347
```

## Advanced Usage

### Get full error logs

```bash
# After deployment fails
gh run view <run-id> --log > deployment-error.log

# Or just view failed logs
gh run view <run-id> --log-failed
```

### Re-run failed deployment

```bash
gh run rerun <run-id>
./scripts/check-deploy-status.sh  # Monitor the re-run
```

### Cancel deployment

```bash
gh run cancel <run-id>
```

## Benefits

✅ **No more guessing** - See actual error messages immediately  
✅ **No more manual checking** - Auto-fetches logs on failure  
✅ **Faster debugging** - Error appears in your terminal right away  
✅ **Better visibility** - See deployment progress in real-time  
✅ **No browser needed** - Everything in the terminal  

## What This Fixes

**Before:** Deployment failed, you had to:
1. Go to GitHub website
2. Navigate to Actions tab
3. Find the failed run
4. Click through to see logs
5. Scroll to find the error

**After:** Error logs automatically appear in your terminal! 🎉
