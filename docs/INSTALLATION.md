# Ralphy Installation Guide

This guide covers installing the custom Ralphy version included in this repository. **Do not use the public npm package** - this repo contains a customized version with the Planning-with-Files methodology.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Platform-Specific Setup](#platform-specific-setup)
- [AI Engine Setup](#ai-engine-setup)
- [Configuration](#configuration)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required

| Dependency | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | Runtime |
| Bun | Latest | Build and run ralphy |
| AI CLI | Latest | At least one: Claude Code, Cursor, etc. |

### Optional

| Dependency | Purpose |
|------------|---------|
| Git | Required for `--branch-per-task` |
| gh CLI | GitHub integration, PRs, issues |

---

## Installation

### Step 1: Install Bun

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Or via Homebrew (macOS)
brew install oven-sh/bun/bun

# Windows (via npm)
npm install -g bun
```

### Step 2: Install Dependencies

```bash
# From the repo root
cd libs/ralphy/cli

# Install dependencies
bun install

# Generate version file
node scripts/generate-version.js
```

### Step 3: Link Globally

```bash
# Still in libs/ralphy/cli
npm link
```

**What `npm link` does:**
- Creates a symlink from global npm folder to your local `libs/ralphy/cli`
- Makes the `ralphy` command available system-wide
- Changes to `libs/ralphy/cli` are immediately available (no reinstall needed)

**To verify the symlink:**
```bash
which ralphy                    # Shows path to ralphy command
ls -la $(which ralphy)          # Shows symlink target
npm ls -g --depth=0 --link=true # Lists all linked packages
```

**To re-link after pulling updates:**
```bash
cd libs/ralphy/cli
npm unlink && npm link
```

### Step 4: Verify

```bash
# Should show version
ralphy --version

# Should show planning-with-files in output
ralphy --verbose --dry-run "test task"
```

---

## Running Without Global Link

If you prefer not to link globally, run directly:

```bash
# From repo root
cd libs/ralphy/cli
bun run src/index.ts "your task"

# Or with flags
bun run src/index.ts --prd ../../PRD.md --verbose
```

---

## Platform-Specific Setup

### macOS

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js and Bun
brew install node
brew install oven-sh/bun/bun

# Install ralphy from repo
cd libs/ralphy/cli
bun install
node scripts/generate-version.js
npm link
```

### Linux (Ubuntu/Debian)

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install ralphy from repo
cd libs/ralphy/cli
bun install
node scripts/generate-version.js
npm link
```

### Linux (Fedora/RHEL)

```bash
# Install Node.js
sudo dnf install nodejs

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install ralphy from repo
cd libs/ralphy/cli
bun install
node scripts/generate-version.js
npm link
```

### Windows (WSL Recommended)

```bash
# Inside WSL
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
curl -fsSL https://bun.sh/install | bash

# Install ralphy from repo
cd libs/ralphy/cli
bun install
node scripts/generate-version.js
npm link
```

### Windows (Native)

```powershell
# Install Node.js
winget install OpenJS.NodeJS.LTS

# Install Bun
npm install -g bun

# Install ralphy from repo
cd libs\ralphy\cli
bun install
node scripts\generate-version.js
npm link
```

---

## AI Engine Setup

Install at least one AI engine CLI:

### Claude Code (Default)

```bash
npm install -g @anthropic-ai/claude-code
claude auth login
```

### Cursor

```bash
# Comes with Cursor IDE
# Download from: https://cursor.com
```

### GitHub Copilot

```bash
gh extension install github/gh-copilot
```

### Gemini CLI

```bash
npm install -g @google/gemini-cli
gemini auth login
```

### OpenCode

```bash
# Install from: https://opencode.ai/docs/
```

---

## Configuration

### Initialize Project Config

```bash
# From your project directory
ralphy --init
```

Creates `.ralphy/config.yaml`:

```yaml
project:
  name: "church-site-builder"
  language: "TypeScript"
  framework: "Next.js"

commands:
  test: "npm test"
  lint: "npm run lint"
  build: "npm run build"

rules:
  - "follow patterns in CLAUDE.md"
  - "use planning-with-files methodology"

boundaries:
  never_touch:
    - "*.lock"
    - ".env*"
```

---

## Verification

### Check Installation

```bash
ralphy --version
# Expected: 4.7.1

ralphy --verbose --dry-run "test task"
```

### Expected Output

```
[INFO] Running task with Claude Code...
[DEBUG] Planning-with-Files Instructions:
[DEBUG]   Task: test task
[DEBUG]   Session Path: .agent/sessions/2026-01-31/test-task
[DEBUG]   Date: 2026-01-31
[DEBUG]   Instructions:
## Planning Protocol (MANDATORY - DO THIS FIRST)
...
✔ (dry run) Would execute task
```

The `[DEBUG] Planning-with-Files Instructions` confirms the custom methodology is active.

---

## Troubleshooting

### "command not found: ralphy"

```bash
# Re-link
cd libs/ralphy/cli
npm unlink
npm link

# Check PATH
echo $PATH | grep npm
```

### "Cannot find module" errors

```bash
cd libs/ralphy/cli
rm -rf node_modules
bun install
node scripts/generate-version.js
```

### "bun: command not found"

```bash
# Reinstall Bun
curl -fsSL https://bun.sh/install | bash

# Add to PATH
export PATH="$HOME/.bun/bin:$PATH"
```

### Planning files not being created

```bash
# Check verbose output
ralphy --verbose "your task"

# Look for [DEBUG] Planning-with-Files Instructions
# If missing, reinstall from libs/ralphy/cli
```

### Global skill warnings

```bash
# If you see:
# [WARN] Global planning skill detected: ~/.claude/skills/planning-with-files
# [WARN] Ralphy will use its own built-in planning-with-files methodology.
# [WARN] The agent may receive instructions from both sources.

# This is informational only - both can coexist
# Global skill is used when running Claude directly
# Ralphy's built-in is used when running through ralphy
```

---

## Updating

When the repo is updated with ralphy changes:

```bash
cd libs/ralphy/cli
git pull  # or however you update the repo
bun install
node scripts/generate-version.js
npm unlink
npm link
```

---

## Important Notes

1. **Do NOT use `npm install -g ralphy-cli`** - that's the public package without our customizations
2. **Always use the version in `libs/ralphy/cli`** - it has the Planning-with-Files methodology
3. **Run from repo root** when using `--prd PRD.md` to ensure correct path resolution

---

## Global Planning Skills

Ralphy has its own Planning-with-Files methodology built-in. If you also have a global planning skill installed for Claude Code or OpenCode (for direct CLI usage), ralphy will detect and inform you.

### Detection

Ralphy automatically detects global skills and logs:

```
[WARN] Global planning skill detected: /Users/you/.claude/skills/planning-with-files
[WARN] Ralphy will use its own built-in planning-with-files methodology.
[WARN] The agent may receive instructions from both sources.
```

### What This Means

When running through ralphy:
- Ralphy injects its own planning instructions into the prompt
- If a global skill exists, the agent may also see those instructions
- Both sets of instructions are similar, so this is generally fine

When running Claude Code directly (not through ralphy):
- Only the global skill applies
- Ralphy's built-in methodology is not used

This allows you to keep global skills for direct CLI usage while ralphy uses its own version.
