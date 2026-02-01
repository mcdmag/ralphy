# Ralphy Documentation

Autonomous AI coding loop that runs agents on tasks until done.

## Documentation Index

| Document | Description |
|----------|-------------|
| [INSTALLATION.md](./INSTALLATION.md) | Installation guide for all platforms |
| [USAGE.md](./USAGE.md) | Comprehensive usage guide |
| [QUICK-REFERENCE.md](./QUICK-REFERENCE.md) | Command cheat sheet |
| [PLANNING-WITH-FILES.md](./PLANNING-WITH-FILES.md) | Planning methodology details |

## Quick Start

```bash
# Install from this repo (NOT npm)
cd libs/ralphy/cli
bun install
node scripts/generate-version.js
npm link

# Run a task
ralphy "add dark mode"

# Run from PRD
ralphy --prd PRD.md

# Parallel execution
ralphy --parallel
```

## Key Features

- **8 AI Engines**: Claude, Cursor, OpenCode, Codex, Copilot, Gemini, Qwen, Droid
- **Planning-with-Files**: Automatic file-based working memory for agents
- **Parallel Execution**: Multiple agents working simultaneously
- **Branch Workflow**: Branch per task with PR creation
- **Multiple Task Sources**: Markdown, YAML, JSON, GitHub Issues

## Planning-with-Files

Ralphy automatically injects persistent working memory for every task:

```
.agent/sessions/{date}/{task}/
├── task_plan.md    # Phases, goals, error tracking
├── findings.md     # Research, decisions
└── progress.md     # Actions, test results
```

This prevents goal drift, repeated errors, and lost context.

## Support

- [Discord Community](https://discord.gg/SZZV74mCuV)
- [GitHub Issues](https://github.com/michaelshimeles/ralphy/issues)
