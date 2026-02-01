# Ralphy Quick Reference

## Installation (from this repo)

```bash
cd libs/ralphy/cli
bun install
node scripts/generate-version.js
npm link
```

## Basic Commands

```bash
ralphy "task description"          # Single task
ralphy                             # Use PRD.md
ralphy --prd tasks.md              # Custom PRD
ralphy --parallel                  # Parallel execution
ralphy --dry-run "task"            # Preview only
ralphy --verbose "task"            # Debug output
```

## AI Engines

```bash
ralphy "task"                      # Claude (default)
ralphy --cursor "task"             # Cursor
ralphy --opencode "task"           # OpenCode
ralphy --codex "task"              # Codex
ralphy --copilot "task"            # GitHub Copilot
ralphy --gemini "task"             # Gemini
ralphy --qwen "task"               # Qwen
ralphy --droid "task"              # Factory Droid
ralphy --sonnet "task"             # Claude with Sonnet model
```

## Task Sources

```bash
ralphy --prd PRD.md                # Markdown
ralphy --prd ./prd/                # Markdown folder
ralphy --yaml tasks.yaml           # YAML
ralphy --json tasks.json           # JSON
ralphy --github owner/repo         # GitHub issues
```

## Parallel & Branching

```bash
ralphy --parallel                  # 3 parallel agents
ralphy --parallel --max-parallel 5 # 5 parallel agents
ralphy --branch-per-task           # Branch per task
ralphy --branch-per-task --create-pr  # With PRs
ralphy --parallel --sandbox        # Lightweight sandboxes
```

## Speed Options

```bash
ralphy --no-tests "task"           # Skip tests
ralphy --no-lint "task"            # Skip lint
ralphy --fast "task"               # Skip both
ralphy --no-commit "task"          # No auto-commit
```

## Configuration

```bash
ralphy --init                      # Create .ralphy/config.yaml
ralphy --config                    # View config
ralphy --add-rule "use TypeScript" # Add rule
```

## Planning-with-Files (Automatic)

Every task creates:
```
.agent/sessions/{date}/{task-slug}/
├── task_plan.md    # Phases, goals, errors
├── findings.md     # Research, decisions
└── progress.md     # Actions, test results
```

## PRD Format

```markdown
## Tasks
- [ ] uncompleted task
- [x] completed task (skipped)
```

## Useful Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--verbose` | `-v` | Debug output |
| `--dry-run` | | Preview only |
| `--parallel` | | Parallel execution |
| `--fast` | | Skip tests + lint |
| `--create-pr` | | Create PRs |

## Logs & Troubleshooting

```bash
# View today's log
cat .ralphy/logs/$(date +%Y-%m-%d).log

# Watch logs in real-time
tail -f .ralphy/logs/$(date +%Y-%m-%d).log

# Find errors
grep -i error .ralphy/logs/$(date +%Y-%m-%d).log

# View last session (full request/response)
ls -t .ralphy/logs/sessions/*.log | head -1 | xargs cat

# List all session logs
ls -la .ralphy/logs/sessions/
```

Log structure:
```
.ralphy/logs/
├── YYYY-MM-DD.log           # Daily log (all activity)
└── sessions/
    └── *.log                # Per-session (request/response)
```

## Help

```bash
ralphy --help
ralphy --version
```
