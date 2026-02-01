# Ralphy Usage Guide

Complete guide for using Ralphy's features, including the integrated Planning-with-Files methodology.

## Table of Contents

- [Quick Start](#quick-start)
- [Execution Modes](#execution-modes)
- [Planning-with-Files Methodology](#planning-with-files-methodology)
- [Task Sources](#task-sources)
- [AI Engines](#ai-engines)
- [Parallel Execution](#parallel-execution)
- [Branch Workflow](#branch-workflow)
- [Browser Automation](#browser-automation)
- [Command Reference](#command-reference)

---

## Quick Start

### Single Task

```bash
# Execute a single task
ralphy "add dark mode toggle to the header"

# With specific engine
ralphy --cursor "fix the login bug"

# Dry run (preview without executing)
ralphy --dry-run "refactor auth module"
```

### PRD Mode (Task List)

```bash
# Use default PRD.md
ralphy

# Specify PRD file
ralphy --prd tasks.md

# Use folder of markdown files
ralphy --prd ./prd/
```

---

## Execution Modes

### Sequential (Default)

Tasks execute one at a time:

```bash
ralphy --prd PRD.md
```

### Parallel

Multiple agents work simultaneously:

```bash
# 3 agents (default)
ralphy --parallel

# Custom agent count
ralphy --parallel --max-parallel 5
```

### Branch Per Task

Each task gets its own git branch:

```bash
ralphy --branch-per-task

# With PRs
ralphy --branch-per-task --create-pr

# Draft PRs
ralphy --branch-per-task --draft-pr
```

---

## Planning-with-Files Methodology

Ralphy automatically injects the Planning-with-Files methodology into every task. This ensures agents maintain persistent working memory across complex tasks.

### How It Works

For every task, agents are instructed to:

1. **Create Session Directory**
   ```
   .agent/sessions/{YYYY-MM-DD}/{task-slug}/
   ```

2. **Create 3 Planning Files**
   | File | Purpose |
   |------|---------|
   | `task_plan.md` | Phases, goals, decisions, error tracking |
   | `findings.md` | Research, requirements, technical decisions |
   | `progress.md` | Session log, test results, actions taken |

### The 6 Planning Rules

1. **Plan First**: Never start without planning files
2. **2-Action Rule**: After every 2 view/search operations, save to findings.md
3. **Pre-Decision Reading**: Re-read task_plan.md before major decisions
4. **Post-Action Updates**: Update progress.md after each phase
5. **Error Logging**: Log ALL errors with attempt number and resolution
6. **Never Repeat Failures**: Track failed approaches, mutate strategy

### 3-Strike Error Protocol

- **Attempt 1**: Diagnose root cause, apply targeted fix
- **Attempt 2**: Try alternative method/approach
- **Attempt 3**: Broader rethink of assumptions
- **After 3 failures**: STOP and escalate to user

### 5-Question Reboot Test

If context resets, verify:
1. Where am I? → Current phase in task_plan.md
2. Where am I going? → Remaining phases
3. What's the goal? → Goal statement
4. What have I learned? → See findings.md
5. What have I done? → See progress.md

### Example Session Structure

```
.agent/sessions/2026-01-31/add-dark-mode/
├── task_plan.md
│   # Task Plan: Add Dark Mode
│   ## Goal
│   Implement dark mode toggle in header
│   ## Current Phase
│   Phase 3
│   ## Phases
│   ### Phase 1: Requirements ✓
│   ### Phase 2: Planning ✓
│   ### Phase 3: Implementation (in_progress)
│   ...
│
├── findings.md
│   # Findings & Decisions
│   ## Requirements
│   - Toggle in header
│   - Persist preference in localStorage
│   ## Technical Decisions
│   | Use CSS variables | Easy theming |
│   ...
│
└── progress.md
    # Progress Log
    ## Session: 2026-01-31
    ### Phase 1: Requirements
    - Status: complete
    - Actions: Reviewed existing CSS, identified color variables
    ...
```

### Viewing Debug Output

```bash
# See planning instructions being injected
ralphy --verbose "your task"
```

---

## Task Sources

### Markdown (Default)

```markdown
## Tasks
- [ ] create user authentication
- [ ] add dashboard page
- [x] setup database (skipped - already done)
```

```bash
ralphy --prd PRD.md
```

### Markdown Folder

```
prd/
├── backend.md    # - [ ] create user API
├── frontend.md   # - [ ] add login page
└── infra.md      # - [ ] setup CI/CD
```

```bash
ralphy --prd ./prd/
```

### YAML

```yaml
tasks:
  - title: create user API
    completed: false
    parallel_group: 1
  - title: add login page
    completed: false
    parallel_group: 1
  - title: integrate API
    completed: false
    parallel_group: 2  # Runs after group 1
```

```bash
ralphy --yaml tasks.yaml
```

### JSON

```json
{
  "tasks": [
    {
      "title": "create auth",
      "completed": false,
      "parallel_group": 1,
      "description": "Optional details"
    }
  ]
}
```

```bash
ralphy --json tasks.json
```

### GitHub Issues

```bash
# All open issues
ralphy --github owner/repo

# Filtered by label
ralphy --github owner/repo --github-label "ready"

# Sync progress back to issue
ralphy --github owner/repo --sync-issue 123
```

---

## AI Engines

### Available Engines

| Engine | Flag | CLI Command | Permissions Mode |
|--------|------|-------------|------------------|
| Claude Code | `--claude` (default) | `claude` | `--dangerously-skip-permissions` |
| Cursor | `--cursor` | `cursor` | `--force` |
| OpenCode | `--opencode` | `opencode` | `full-auto` |
| Codex | `--codex` | `codex` | N/A |
| Qwen | `--qwen` | `qwen` | `--approval-mode yolo` |
| Factory Droid | `--droid` | `droid exec` | `--auto medium` |
| GitHub Copilot | `--copilot` | `copilot` | `--yolo` |
| Gemini | `--gemini` | `gemini` | `--yolo` |

### Usage Examples

```bash
# Default (Claude Code)
ralphy "add feature"

# Specific engine
ralphy --cursor "fix bug"
ralphy --opencode "refactor module"
ralphy --copilot "add tests"

# Model override
ralphy --model sonnet "create API"
ralphy --sonnet "create API"  # Shortcut
ralphy --opencode --model opencode/glm-4.7-free "task"
```

### Engine-Specific Arguments

Pass arguments directly to the underlying CLI:

```bash
# After -- separator
ralphy --copilot "task" -- --allow-all-tools --stream on
ralphy --claude "task" -- --no-permissions-prompt
```

---

## Parallel Execution

### Basic Parallel

```bash
ralphy --parallel                  # 3 agents
ralphy --parallel --max-parallel 5 # 5 agents
```

### How It Works

Each agent gets:
- Isolated git worktree
- Separate branch: `ralphy/agent-{n}-{task-slug}`
- Independent execution environment

```
Agent 1 → /tmp/xxx/agent-1 → ralphy/agent-1-create-auth
Agent 2 → /tmp/xxx/agent-2 → ralphy/agent-2-add-dashboard
Agent 3 → /tmp/xxx/agent-3 → ralphy/agent-3-build-api
```

### Merge Behavior

```bash
# Auto-merge back to base (default)
ralphy --parallel

# Create PRs instead
ralphy --parallel --create-pr

# Keep branches, no merge
ralphy --parallel --no-merge
```

### Sandbox Mode

For large repos with big `node_modules`:

```bash
ralphy --parallel --sandbox
```

Uses symlinks for dependencies, faster than worktrees.

### Parallel Groups (YAML/JSON)

Control execution order:

```yaml
tasks:
  - title: Create User model
    parallel_group: 1
  - title: Create Post model
    parallel_group: 1  # Runs with User model
  - title: Add relationships
    parallel_group: 2  # Runs after group 1
```

---

## Branch Workflow

### Branch Per Task

```bash
ralphy --branch-per-task
```

Creates branch: `ralphy/{task-slug}`

### With Pull Requests

```bash
# Regular PRs
ralphy --branch-per-task --create-pr

# Draft PRs
ralphy --branch-per-task --draft-pr
```

### Base Branch

```bash
# Branch from specific base
ralphy --branch-per-task --base-branch develop
```

---

## Browser Automation

Ralphy integrates with [agent-browser](https://agent-browser.dev) for UI testing.

### Enable/Disable

```bash
ralphy "test login flow" --browser      # Force enable
ralphy "add feature" --no-browser       # Force disable
ralphy "build feature"                  # Auto-detect (default)
```

### Available Commands (for agents)

```bash
agent-browser open <url>           # Navigate
agent-browser snapshot             # Get element refs (@e1, @e2)
agent-browser click @e1            # Click element
agent-browser type @e1 "text"      # Type into input
agent-browser screenshot <file>   # Capture screenshot
```

### Configuration

```yaml
# .ralphy/config.yaml
capabilities:
  browser: "auto"  # "auto", "true", or "false"
```

---

## Command Reference

### Flags

| Flag | Description |
|------|-------------|
| `--prd PATH` | Task file or folder (default: PRD.md) |
| `--yaml FILE` | YAML task file |
| `--json FILE` | JSON task file |
| `--github REPO` | Use GitHub issues |
| `--github-label TAG` | Filter issues by label |
| `--sync-issue N` | Sync progress to GitHub issue #N |
| `--model NAME` | Override model for any engine |
| `--sonnet` | Shortcut for `--claude --model sonnet` |
| `--parallel` | Run parallel execution |
| `--max-parallel N` | Max agents (default: 3) |
| `--sandbox` | Use sandboxes instead of worktrees |
| `--no-merge` | Skip auto-merge in parallel mode |
| `--branch-per-task` | Create branch per task |
| `--base-branch NAME` | Base branch for branching |
| `--create-pr` | Create pull requests |
| `--draft-pr` | Create draft PRs |
| `--no-tests` | Skip test execution |
| `--no-lint` | Skip linting |
| `--fast` | Skip tests + lint |
| `--no-commit` | Don't auto-commit |
| `--max-iterations N` | Stop after N tasks |
| `--max-retries N` | Retries per task (default: 3) |
| `--retry-delay N` | Seconds between retries |
| `--dry-run` | Preview without executing |
| `--browser` | Enable browser automation |
| `--no-browser` | Disable browser automation |
| `-v, --verbose` | Show streaming AI responses in real-time |
| `--init` | Setup .ralphy/ config |
| `--config` | Show current config |
| `--add-rule "rule"` | Add rule to config |

### Examples

```bash
# Simple task
ralphy "add logout button"

# PRD with parallel execution
ralphy --prd features.md --parallel --max-parallel 4

# Branch workflow with PRs
ralphy --prd PRD.md --branch-per-task --create-pr

# Fast mode (skip tests/lint)
ralphy --fast "quick fix"

# Debug mode
ralphy --verbose --dry-run "test task"

# GitHub integration
ralphy --github owner/repo --github-label "ready" --parallel
```

---

## Verbose Streaming Output

When `--verbose` (or `-v`) is enabled, Ralphy displays AI responses in real-time as they stream from the engine.

### Enabling Verbose Mode

```bash
# Enable verbose streaming
ralphy -v "add feature"
ralphy --verbose --prd PRD.md

# ralphy-clean-start.sh enables verbose by default
./ralphy-clean-start.sh                  # Verbose on
./ralphy-clean-start.sh --no-verbose     # Verbose off
```

### What You'll See

In verbose mode, the terminal shows:
- **AI text responses** - The agent's thinking and explanations (cyan)
- **Tool calls** - Files being read, edited, commands executed (yellow)
- **Tool results** - Success/failure indicators (green/red)
- **Errors** - Any errors that occur (red)

Example output:
```
│ I'll start by reading the current header component...
│ 🔧 Read (file_path=src/components/Header.tsx)
│ ✓ Tool completed
│ Now I'll add the dark mode toggle button...
│ 🔧 Edit (file_path=src/components/Header.tsx)
│ ✓ Tool completed
```

### Why Use Verbose Mode

- **See what the AI is doing** in real-time
- **Debug issues** by watching the AI's decision process
- **Learn** how the AI approaches problems
- **Monitor progress** on long-running tasks

---

## Logs & Troubleshooting

Ralphy automatically logs all activity to files for debugging and troubleshooting.

### Log Location

```
.ralphy/logs/
├── YYYY-MM-DD.log              # Daily log file (all activity)
└── sessions/
    └── YYYY-MM-DD_HH-MM-SS_xxxx.log  # Per-session logs (request/response)
```

### Viewing Logs

```bash
# View today's log
cat .ralphy/logs/$(date +%Y-%m-%d).log

# View recent log entries
tail -100 .ralphy/logs/$(date +%Y-%m-%d).log

# Watch logs in real-time
tail -f .ralphy/logs/$(date +%Y-%m-%d).log

# List all session logs
ls -la .ralphy/logs/sessions/

# View a specific session (request/response details)
cat .ralphy/logs/sessions/<session-id>.log
```

### What's Logged

| Log Type | Location | Contents |
|----------|----------|----------|
| Daily Log | `.ralphy/logs/YYYY-MM-DD.log` | All INFO, WARN, ERROR, DEBUG messages |
| Session Log | `.ralphy/logs/sessions/*.log` | Full request prompts and agent responses |

### Log Levels

- `[INFO]` - General information
- `[OK]` - Success messages
- `[WARN]` - Warnings (non-fatal)
- `[ERROR]` - Errors (check these for failures)
- `[DEBUG]` - Debug info (always written to file, console only with `--verbose`)
- `[REQUEST]` - Prompt sent to AI agent
- `[RESPONSE]` - Response received from AI agent
- `[SESSION]` - Session start/end markers
- `[STREAM]` - Raw streaming output from AI (with `--verbose`)

### Troubleshooting Common Issues

**Task not completing:**
```bash
# Check for errors in today's log
grep -i error .ralphy/logs/$(date +%Y-%m-%d).log

# View the last session's full request/response
ls -t .ralphy/logs/sessions/*.log | head -1 | xargs cat
```

**Agent returning unexpected results:**
```bash
# Find the session log for a specific task
grep -l "Task: your-task-name" .ralphy/logs/sessions/*.log | xargs cat
```

**View all errors from recent sessions:**
```bash
grep -r "ERROR\|FAILED" .ralphy/logs/
```
