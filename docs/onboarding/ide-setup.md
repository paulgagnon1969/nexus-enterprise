# IDE Setup & Development Environment

**Functional Area:** IDE / Code Editor Recommendation & Configuration  
**Target Audience:** New developers joining the Nexus project  
**Last Updated:** February 8, 2026

---

## Primary Recommendation: Visual Studio Code

**VS Code is the officially supported IDE for the Nexus project.**

VS Code is the best choice for the Nexus full-stack monorepo (TypeScript/React/Next.js + NestJS + Prisma + potential mobile/Flutter or React Native later).

### Why VS Code Wins for Nexus

✅ **Free & Cross-Platform** - Runs everywhere (Windows, macOS, Linux)  
✅ **Best TypeScript/JavaScript/React Support** - Out of the box, no config needed  
✅ **Excellent Monorepo Support** - Multi-root workspaces, path intelligence  
✅ **Prisma Integration** - First-class schema editing and Prisma Client autocomplete  
✅ **GitLens & Live Share** - Collaboration features built-in  
✅ **Remote Development** - SSH, Containers, WSL support  
✅ **Huge Extension Marketplace** - Curated list below  
✅ **Built-in Terminal, Debugger, Tasks** - Everything in one place

---

## Quick Start (5 Minutes)

### 1. Install VS Code

Download from: https://code.visualstudio.com/

### 2. Open Nexus Workspace

```bash
cd nexus-enterprise
code nexus.code-workspace
```

**OR** if you want to open just the folder:

```bash
code .
```

### 3. Install Recommended Extensions

When you open the workspace, VS Code will prompt:

> "This workspace has extension recommendations"

Click **Install All** to get the full Nexus extension stack.

**Manual install if needed:**
1. Press `Cmd+Shift+X` (macOS) or `Ctrl+Shift+X` (Windows/Linux)
2. Search for `@recommended`
3. Install all extensions in the "Workspace Recommendations" section

---

## Core Extensions (Must Install)

These extensions are in `.vscode/extensions.json` and will be auto-recommended:

### TypeScript/JavaScript
- **TypeScript Next** (`ms-vscode.vscode-typescript-next`) - Latest TS features
- **Prettier** (`esbenp.prettier-vscode`) - Code formatting
- **ESLint** (`dbaeumer.vscode-eslint`) - Linting

### React/Next.js
- **ES7+ React/Redux/React-Native Snippets** (`dsznajder.es7-react-js-snippets`) - Code snippets
- **Tailwind CSS IntelliSense** (`bradlc.vscode-tailwindcss`) - Tailwind autocomplete

### Database
- **Prisma** (`Prisma.prisma`) - Prisma schema support
- **SQLTools** (`mtxr.sqltools`) - Database explorer
- **SQLTools PostgreSQL Driver** (`mtxr.sqltools-driver-pg`) - PostgreSQL support

### Git
- **GitLens** (`eamodio.gitlens`) - Git superpowers (blame, history, etc.)
- **GitHub Pull Requests** (`github.vscode-pull-request-github`) - PR management

### AI Assistance
- **GitHub Copilot** (`github.copilot`) - AI pair programmer
- **GitHub Copilot Chat** (`github.copilot-chat`) - ChatGPT-style assistance

### Docker/DevContainers
- **Docker** (`ms-azuretools.vscode-docker`) - Docker support
- **Dev Containers** (`ms-vscode-remote.remote-containers`) - Container dev environment

### Utilities
- **Error Lens** (`usernamehw.errorlens`) - Inline error display
- **Indent Rainbow** (`oderwat.indent-rainbow`) - Visual indent guide
- **TODO Tree** (`gruntfuggly.todo-tree`) - TODO comment explorer
- **Code Spell Checker** (`streetsidesoftware.code-spell-checker`) - Spell check

### Testing
- **Jest** (`orta.vscode-jest`) - Test runner integration

---

## Workspace Structure

The Nexus workspace is configured as a **multi-root workspace** with 6 folders:

```
nexus-enterprise/
├── 🏠 Root (entire monorepo)
├── 🌐 Web App (apps/web)
├── 🔌 API (apps/api)
├── 🗄️ Database (packages/database)
├── 📦 Packages (packages/*)
└── 📚 Documentation (docs/)
```

**Benefits:**
- Each folder has its own TypeScript, ESLint, and Prettier config
- Workspace-wide search across all folders
- Per-folder debugging and tasks
- Organized sidebar navigation

---

## Key Features Configured

### 1. Format on Save

Code automatically formats when you save:
- Uses Prettier for TypeScript/JavaScript/JSON/CSS
- Uses Prisma formatter for `.prisma` files
- ESLint auto-fixes on save

**Test it:**
1. Open any `.ts` file
2. Mess up the formatting (remove spaces, add extra lines)
3. Press `Cmd+S` / `Ctrl+S`
4. Code auto-formats! ✨

### 2. File Nesting

Related files are nested in the explorer:

```
📄 user.ts
  └── 📄 user.test.ts
  └── 📄 user.spec.ts
  └── 📄 user.d.ts

📄 package.json
  └── 📄 package-lock.json
  └── 📄 pnpm-lock.yaml
```

Toggle nesting: `View` → `File Nesting`

### 3. Built-in Debugging

Press `F5` to start debugging. Pre-configured debug configs:

- **🌐 Debug Web (Next.js)** - Debug the web app
- **🔌 Debug API (NestJS)** - Debug the API
- **🧪 Debug Current Test File** - Debug the open test file
- **🚀 Debug Full Stack** - Debug both web + API simultaneously

### 4. Tasks

Press `Cmd+Shift+B` / `Ctrl+Shift+B` to run tasks:

- **🚀 Start All (Turbo)** - `npm run dev` (entire monorepo)
- **🗄️ Prisma Generate** - Generate Prisma Client
- **🔄 Prisma Migrate Dev** - Run database migrations
- **🧹 Clean All** - Remove all node_modules, .next, dist folders

### 5. Terminal with DATABASE_URL

Integrated terminal automatically has `DATABASE_URL` set:

```bash
# No need to export DATABASE_URL every time!
npm run test:extrapolation  # Just works
```

---

## Database Integration

### Connect to PostgreSQL in VS Code

1. Install SQLTools extensions (recommended above)
2. Open SQLTools: `Cmd+Shift+P` → "SQLTools: Add New Connection"
3. Select **PostgreSQL**
4. Configure:
   ```
   Connection Name: Nexus Local
   Server: 127.0.0.1
   Port: 5433
   Database: nexus_db
   Username: nexus_user
   Password: nexus_password
   ```
5. Click **Test Connection** → **Save**

Now you can:
- Browse database tables in sidebar
- Run SQL queries with autocomplete
- Export query results to CSV/JSON

---

## Keyboard Shortcuts (Essential)

### General
- `Cmd/Ctrl + P` - Quick open file
- `Cmd/Ctrl + Shift + P` - Command palette
- `Cmd/Ctrl + B` - Toggle sidebar
- `Cmd/Ctrl + J` - Toggle terminal
- `Cmd/Ctrl + ` - Toggle integrated terminal

### Editing
- `Cmd/Ctrl + D` - Select next occurrence
- `Cmd/Ctrl + Shift + L` - Select all occurrences
- `Alt/Option + Up/Down` - Move line up/down
- `Shift + Alt/Option + Up/Down` - Copy line up/down
- `Cmd/Ctrl + /` - Toggle comment

### Navigation
- `Cmd/Ctrl + Click` - Go to definition
- `Alt/Option + Click` - Peek definition
- `Cmd/Ctrl + Shift + O` - Go to symbol in file
- `Cmd/Ctrl + T` - Go to symbol in workspace
- `Cmd/Ctrl + -` - Go back
- `Cmd/Ctrl + Shift + -` - Go forward

### Debugging
- `F5` - Start debugging
- `F9` - Toggle breakpoint
- `F10` - Step over
- `F11` - Step into
- `Shift + F11` - Step out
- `Shift + F5` - Stop debugging

---

## Customization

### User Settings vs Workspace Settings

- **Workspace Settings** (`.vscode/settings.json`) - Team-wide, committed to git
- **User Settings** - Your personal preferences, not committed

**To customize for yourself only:**
1. `Cmd/Ctrl + ,` to open Settings
2. Switch to "User" tab
3. Change settings (won't affect teammates)

### Recommended User Settings

Add to your User Settings (`Cmd/Ctrl + Shift + P` → "Preferences: Open User Settings (JSON)"):

```json
{
  "editor.fontSize": 14,
  "editor.fontFamily": "Fira Code, Menlo, Monaco, 'Courier New', monospace",
  "editor.fontLigatures": true,
  "workbench.colorTheme": "GitHub Dark Default",
  "workbench.iconTheme": "material-icon-theme"
}
```

---

## Alternative IDEs (Only if You Have Strong Reasons)

| IDE | When to Consider | Nexus Fit Score |
|-----|-----------------|-----------------|
| **WebStorm** | Heavy pure JS/TS work, willing to pay | 8/10 |
| **Neovim/Vim** | Terminal warrior, custom config | 7/10 (high setup cost) |
| **Cursor** | AI-first editor (Copilot on steroids) | 9/10 (rising fast in 2025) |
| **Zed** | Super fast, Rust-based, modern | 8/10 (still maturing) |
| **PyCharm** | Python-only backend focus | 5/10 (too heavy for full-stack) |

### Using Cursor as Secondary Editor

Cursor is a VS Code fork with enhanced AI features. Great for:
- AI-assisted refactoring
- Explaining complex code
- Generating boilerplate

**Setup:**
1. Install Cursor: https://cursor.sh/
2. Open Nexus workspace: `cursor nexus.code-workspace`
3. All VS Code extensions and settings work!

---

## Troubleshooting

### "Cannot find module '@repo/database'"

**Fix:**
1. Run Prisma generate: `npm run prisma:generate` in `packages/database`
2. Restart TypeScript server: `Cmd/Ctrl + Shift + P` → "TypeScript: Restart TS Server"

### Extensions Not Auto-Installing

**Fix:**
1. Open Extensions: `Cmd/Ctrl + Shift + X`
2. Type: `@recommended`
3. Manually install missing extensions

### Format on Save Not Working

**Fix:**
1. Check default formatter: Open any `.ts` file
2. Right-click → "Format Document With..."
3. Select "Prettier - Code formatter"
4. Check "Configure Default Formatter" → Select "Prettier"

### TypeScript Version Mismatch

**Fix:**
1. `Cmd/Ctrl + Shift + P` → "TypeScript: Select TypeScript Version"
2. Choose "Use Workspace Version"
3. Version should show: `5.5.x (workspace)`

### ESLint Not Working

**Fix:**
1. Check ESLint output: `View` → `Output` → Select "ESLint"
2. Common issue: ESLint not installed
3. Run: `npm install` in the root directory

---

## First-Time Setup Checklist

After installing VS Code and opening the workspace:

- [ ] Install all recommended extensions (click "Install All")
- [ ] Verify format on save (open a file, mess up formatting, save)
- [ ] Connect to PostgreSQL database (SQLTools)
- [ ] Run Prisma generate: `npm run prisma:generate` in packages/database
- [ ] Test debugging: Press F5, verify web/API starts
- [ ] Open integrated terminal: Verify DATABASE_URL is set
- [ ] Sign in to GitHub Copilot (if you have access)
- [ ] Explore workspace folders in sidebar
- [ ] Try running a task: `Cmd/Ctrl + Shift + B` → "Start All"

---

## Support

**Questions about IDE setup?**
- Check Nexus docs: `docs/onboarding/`
- Ask in Slack: `#nexus-dev`
- Review VS Code docs: https://code.visualstudio.com/docs

**Want to suggest an extension or setting?**
- Open a PR modifying `.vscode/extensions.json` or `.vscode/settings.json`
- Add a description of why it's helpful

---

**Last Updated:** February 8, 2026  
**Maintained By:** Engineering Team
