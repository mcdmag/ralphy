# Ralphy

![Ralphy](assets/ralphy.jpeg)

An autonomous AI coding assistant that works through tasks until everything is complete.

## Two Ways to Use

### Quick Task
```bash
ralphy "add a login button to the header"
```
Just tell it what to do. No setup needed.

### Task List (PRD)
```bash
./ralphy.sh
```
Works through a checklist in `PRD.md` until all tasks are done.

## Getting Started

```bash
# Clone and setup
git clone https://github.com/michaelshimeles/ralphy.git
cd ralphy
chmod +x ralphy.sh

# Option 1: Quick task
./ralphy.sh "add dark mode toggle"

# Option 2: Create a task list
cat > PRD.md << 'EOF'
## Tasks
- [ ] Create user authentication
- [ ] Add dashboard page
- [ ] Build API endpoints
EOF

./ralphy.sh
```

## Project Config (Optional)

Set up project-specific rules and context:

```bash
./ralphy.sh --init
```

This creates `.ralphy/` with auto-detected settings:

```yaml
# .ralphy/config.yaml
project:
  name: "my-app"
  language: "TypeScript"
  framework: "Next.js"

commands:
  test: "npm test"
  lint: "npm run lint"

rules:
  - "Use server actions instead of API routes"
  - "Follow the error handling pattern in src/utils/errors.ts"

boundaries:
  never_touch:
    - "src/legacy/**"
    - "*.lock"
```

Your rules apply to every task, whether quick or from a PRD.

## Commands

| Command | Description |
|---------|-------------|
| `ralphy "task"` | Run a single task |
| `ralphy --init` | Setup project config |
| `ralphy --config` | View current config |
| `ralphy --add-rule "rule"` | Add a rule |
| `ralphy --no-commit` | Don't auto-commit |

## AI Engines

```bash
./ralphy.sh              # Claude Code (default)
./ralphy.sh --opencode   # OpenCode
./ralphy.sh --cursor     # Cursor
./ralphy.sh --codex      # Codex
./ralphy.sh --qwen       # Qwen-Code
./ralphy.sh --droid      # Factory Droid
```

## Task Sources

### Markdown (default)
```bash
./ralphy.sh --prd PRD.md
```

```markdown
## Tasks
- [ ] First task
- [ ] Second task
- [x] Done (skipped)
```

### YAML
```bash
./ralphy.sh --yaml tasks.yaml
```

```yaml
tasks:
  - title: First task
    completed: false
  - title: Second task
    completed: false
```

### GitHub Issues
```bash
./ralphy.sh --github owner/repo
./ralphy.sh --github owner/repo --github-label "ready"
```

## Parallel Execution

Run multiple agents at once:

```bash
./ralphy.sh --parallel                    # 3 agents
./ralphy.sh --parallel --max-parallel 5   # 5 agents
```

Each agent gets its own git worktree and branch:

```
Agent 1 → worktree: /tmp/xxx/agent-1 → branch: ralphy/agent-1-create-user-model
Agent 2 → worktree: /tmp/xxx/agent-2 → branch: ralphy/agent-2-add-api-endpoints
Agent 3 → worktree: /tmp/xxx/agent-3 → branch: ralphy/agent-3-setup-database
```

Without `--create-pr`, branches auto-merge back. With `--create-pr`, each task gets its own PR.

### YAML Parallel Groups

Control which tasks run together:

```yaml
tasks:
  - title: Create User model
    parallel_group: 1
  - title: Create Post model
    parallel_group: 1  # Runs with User model
  - title: Add relationships
    parallel_group: 2  # Runs after group 1
```

## Branch Workflow

```bash
./ralphy.sh --branch-per-task             # Feature branch per task
./ralphy.sh --branch-per-task --create-pr # Auto-create PRs
./ralphy.sh --branch-per-task --draft-pr  # Draft PRs
```

Branch naming: `ralphy/<task-name-slug>`

## Requirements

**Required:**
- One of: [Claude Code](https://github.com/anthropics/claude-code), [OpenCode](https://opencode.ai/docs/), Codex, [Cursor](https://cursor.com), [Qwen-Code](https://github.com/anthropics/qwen-code), or [Factory Droid](https://docs.factory.ai/cli/getting-started/quickstart)
- `jq`

**Optional:**
- `yq` - for YAML task files
- `gh` - for GitHub Issues or `--create-pr`

## All Options

| Flag | Description |
|------|-------------|
| `--prd FILE` | Task file (default: PRD.md) |
| `--yaml FILE` | YAML task file |
| `--github REPO` | GitHub issues source |
| `--parallel` | Run tasks in parallel |
| `--max-parallel N` | Max concurrent agents (default: 3) |
| `--branch-per-task` | Create branch per task |
| `--create-pr` | Create pull requests |
| `--draft-pr` | Create draft PRs |
| `--no-tests` | Skip tests |
| `--no-lint` | Skip linting |
| `--fast` | Skip tests and linting |
| `--max-iterations N` | Stop after N tasks |
| `--dry-run` | Preview without executing |
| `-v, --verbose` | Debug output |

---

## Changelog

### v4.0.0
- **Single-task mode**: `ralphy "add feature"` without needing a PRD
- **Project config**: `--init` creates `.ralphy/` with rules, boundaries, and auto-detected settings
- **New commands**: `--config`, `--add-rule`, `--no-commit`
- Config applies to both single tasks and PRD loop mode

### v3.3.0
- Added Factory Droid support (`--droid`)

### v3.2.0
- Added Qwen-Code support (`--qwen`)

### v3.1.0
- Added Cursor support (`--cursor`)
- Improved task completion verification

### v3.0.0
- Parallel execution with isolated git worktrees
- Branch-per-task workflow with auto-PR creation
- Multiple task sources: Markdown, YAML, GitHub Issues
- YAML parallel groups

### v2.0.0
- Added OpenCode support
- Retry logic, `--max-iterations`, `--dry-run`

### v1.0.0
- Initial release

## License

MIT
