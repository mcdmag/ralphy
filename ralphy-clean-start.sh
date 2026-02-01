#!/bin/bash
# ralphy-clean-start.sh - Clean start script for Ralphy
# Kills stale ralphy processes, cleans up, and starts fresh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

show_help() {
    cat << EOF
Usage: ./ralphy-clean-start.sh [options]

Clean up stale Ralphy processes and start fresh.

Options:
    -h, --help              Show this help message
    -v, --verbose           Show streaming AI responses in real-time (default: on)
    --no-verbose            Disable verbose streaming output
    --prd <path>            Use a specific PRD file or folder (default: ./prd/ or PRD.md)
    --parallel              Enable parallel task execution
    --max-parallel <n>      Max parallel agents (default: 3)
    --fast                  Skip tests and linting
    --dry-run               Show what would be done without executing
    --claude                Use Claude Code as AI engine
    --cursor                Use Cursor as AI engine
    --opencode              Use OpenCode as AI engine (default)
    --copilot               Use GitHub Copilot as AI engine
    --opus                  Use Antigravity Claude Opus model
    --gemini                Use Gemini 3 Pro model (default - Opus often rate-limited)

Examples:
    ./ralphy-clean-start.sh                    # Default: Gemini 3 Pro, auto-retry Opus every 10min
    ./ralphy-clean-start.sh --opus             # Force Opus (may hit rate limits)
    ./ralphy-clean-start.sh --no-verbose       # Quiet mode (no streaming output)
    ./ralphy-clean-start.sh --prd custom.md    # Use different PRD
    ./ralphy-clean-start.sh --parallel         # Run tasks in parallel
    ./ralphy-clean-start.sh --claude           # Use Claude Code directly
    ./ralphy-clean-start.sh --dry-run          # Preview without executing

Models (for --opencode):
    --gemini   google/antigravity-gemini-3-pro (default)
    --opus     google/antigravity-claude-opus-4-5-thinking

Rate Limit Handling:
    When using Gemini (default), the script will:
    1. Run tasks with Gemini
    2. If tasks remain, wait 10 minutes
    3. Try Opus model (in case quota reset)
    4. If Opus rate-limited, switch back to Gemini
    5. Repeat until all tasks complete

Note: This script only kills ralphy processes, not the AI engines
(claude, opencode, cursor, copilot) which may be used independently.
EOF
}

# Check for help flag first
for arg in "$@"; do
    if [[ "$arg" == "-h" ]] || [[ "$arg" == "--help" ]]; then
        show_help
        exit 0
    fi
done

echo -e "${YELLOW}🧹 Cleaning up stale Ralphy processes...${NC}"

# Check what's running BEFORE cleanup
echo -e "${BLUE}Current ralphy processes:${NC}"
ps aux | grep -E "ralphy" | grep -v grep | grep -v "ralphy-clean" | head -5 || echo "  (none)"
echo ""

# Kill only ralphy processes (not AI engines which may be used independently)
pkill -f "ralphy" 2>/dev/null && echo "  ✓ Killed ralphy" || true

# Kill any stale tmux sessions with "ralphy" in the name
for session in $(tmux list-sessions -F '#S' 2>/dev/null | grep -i ralphy); do
    tmux kill-session -t "$session" 2>/dev/null && echo "  ✓ Killed tmux session: $session" || true
done

# Clean up stale worktrees and sandboxes
rm -rf .ralphy-worktrees 2>/dev/null && echo "  ✓ Cleaned worktrees" || true
rm -rf .ralphy-sandboxes 2>/dev/null && echo "  ✓ Cleaned sandboxes" || true

# Brief pause to ensure cleanup completes
sleep 1

# Verify cleanup
echo -e "${BLUE}After cleanup:${NC}"
remaining=$(ps aux | grep -E "ralphy" | grep -v grep | grep -v "ralphy-clean" | wc -l)
if [[ $remaining -gt 0 ]]; then
    echo -e "${RED}  ⚠️ Some ralphy processes still running:${NC}"
    ps aux | grep -E "ralphy" | grep -v grep | grep -v "ralphy-clean"
else
    echo -e "${GREEN}  ✓ All Ralphy processes stopped${NC}"
fi

tmux_sessions=$(tmux list-sessions 2>/dev/null | grep -i ralphy | wc -l)
if [[ $tmux_sessions -gt 0 ]]; then
    echo -e "${RED}  ⚠️ Tmux sessions still exist:${NC}"
    tmux list-sessions | grep -i ralphy
else
    echo -e "${GREEN}  ✓ No Ralphy tmux sessions${NC}"
fi

echo ""

# Check if prd folder or PRD.md exists
if [[ ! -d "prd" ]] && [[ ! -f "PRD.md" ]]; then
    echo -e "${RED}Error: Neither prd/ folder nor PRD.md found${NC}"
    echo "Run this script from a directory containing prd/ or PRD.md"
    exit 1
fi

# Ensure Ralphy dependencies are installed and linked
# Works for both standalone repo (cli/) and embedded in church-site-builder (libs/ralphy/cli/)
RALPHY_CLI_DIR=""
if [[ -d "cli" ]]; then
    RALPHY_CLI_DIR="cli"
elif [[ -d "libs/ralphy/cli" ]]; then
    RALPHY_CLI_DIR="libs/ralphy/cli"
fi

if [[ -n "$RALPHY_CLI_DIR" ]]; then
    echo -e "${BLUE}📦 Ensuring Ralphy dependencies...${NC}"
    # Only install if node_modules doesn't exist
    if [[ ! -d "$RALPHY_CLI_DIR/node_modules" ]]; then
        echo "  Installing dependencies..."
        (cd "$RALPHY_CLI_DIR" && bun install >/dev/null 2>&1)
    fi
    # Always ensure linked (fast if already linked)
    (cd "$RALPHY_CLI_DIR" && npm link >/dev/null 2>&1) || true
    echo -e "${GREEN}  ✓ Dependencies ready${NC}"
else
    echo -e "${YELLOW}⚠️ cli/ directory not found, assuming global install${NC}"
fi

# Check if ralphy is installed (should be now)
if ! command -v ralphy &> /dev/null; then
    echo -e "${RED}Error: ralphy command failed to install${NC}"
    exit 1
fi

# Parse arguments
RALPHY_ARGS="--verbose"
# Default engine is opencode
ENGINE="opencode"
# Default model for opencode: Gemini 3 Pro (Opus often rate-limited)
OPENCODE_MODEL="google/antigravity-gemini-3-pro"
# Default to prd/ folder if it exists, otherwise PRD.md
if [[ -d "prd" ]]; then
    PRD_FILE="./prd/"
else
    PRD_FILE="PRD.md"
fi

while [[ $# -gt 0 ]]; do
    case $1 in
        --prd)
            PRD_FILE="$2"
            shift 2
            ;;
        --parallel)
            RALPHY_ARGS="$RALPHY_ARGS --parallel"
            shift
            ;;
        --max-parallel)
            RALPHY_ARGS="$RALPHY_ARGS --max-parallel $2"
            shift 2
            ;;
        --fast)
            RALPHY_ARGS="$RALPHY_ARGS --fast"
            shift
            ;;
        --dry-run)
            RALPHY_ARGS="$RALPHY_ARGS --dry-run"
            shift
            ;;
        --claude)
            ENGINE="claude"
            shift
            ;;
        --cursor)
            ENGINE="cursor"
            shift
            ;;
        --opencode)
            ENGINE="opencode"
            shift
            ;;
        --copilot)
            ENGINE="copilot"
            shift
            ;;
        --gemini-cli)
            ENGINE="gemini"
            shift
            ;;
        --opus)
            OPENCODE_MODEL="google/antigravity-claude-opus-4-5-thinking"
            shift
            ;;
        --gemini)
            OPENCODE_MODEL="google/antigravity-gemini-3-pro"
            shift
            ;;
        --model)
            OPENCODE_MODEL="$2"
            shift 2
            ;;
        -v|--verbose)
            # Already in RALPHY_ARGS by default, just skip
            shift
            ;;
        --no-verbose)
            # Remove --verbose from args
            RALPHY_ARGS="${RALPHY_ARGS//--verbose/}"
            shift
            ;;
        *)
            RALPHY_ARGS="$RALPHY_ARGS $1"
            shift
            ;;
    esac
done

# Add the selected engine to args
RALPHY_ARGS="$RALPHY_ARGS --$ENGINE"

# Add model to args if using opencode
if [[ "$ENGINE" == "opencode" ]]; then
    RALPHY_ARGS="$RALPHY_ARGS --model $OPENCODE_MODEL"
fi

echo -e "${GREEN}🚀 Starting Ralphy with: --prd $PRD_FILE $RALPHY_ARGS${NC}"
echo ""

# Preferred model (Opus) - will try this every 10 minutes if rate-limited
PREFERRED_MODEL="google/antigravity-claude-opus-4-5-thinking"
FALLBACK_MODEL="google/antigravity-gemini-3-pro"
RETRY_INTERVAL=600  # 10 minutes in seconds

# Function to count remaining tasks in PRD
count_remaining_tasks() {
    if [[ -d "$PRD_FILE" ]]; then
        # Count unchecked tasks in all markdown files in the folder
        grep -rh "^- \[ \]" "$PRD_FILE" 2>/dev/null | wc -l | tr -d ' '
    elif [[ -f "$PRD_FILE" ]]; then
        # Count unchecked tasks in single file
        grep -c "^- \[ \]" "$PRD_FILE" 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

# Main execution loop
while true; do
    # Run Ralphy with current model
    # shellcheck disable=SC2086
    ralphy --prd "$PRD_FILE" $RALPHY_ARGS
    EXIT_CODE=$?

    # Check if there are remaining tasks
    REMAINING=$(count_remaining_tasks)

    if [[ "$REMAINING" -eq 0 ]]; then
        echo -e "${GREEN}✅ All tasks completed!${NC}"
        exit 0
    fi

    echo ""
    echo -e "${YELLOW}📋 $REMAINING tasks remaining${NC}"

    # Model switching only applies to opencode
    if [[ "$ENGINE" != "opencode" ]]; then
        echo -e "${BLUE}⏳ Waiting before retrying...${NC}"
        sleep 60
        continue
    fi

    # If we're using fallback (Gemini), try switching to Opus
    if [[ "$OPENCODE_MODEL" == "$FALLBACK_MODEL" ]]; then
        echo -e "${BLUE}⏳ Waiting 10 minutes before trying Opus model again...${NC}"
        echo -e "${BLUE}   (Opus may have quota available now)${NC}"
        sleep $RETRY_INTERVAL

        # Try Opus
        echo -e "${YELLOW}🔄 Trying Opus model...${NC}"
        OPENCODE_MODEL="$PREFERRED_MODEL"
        RALPHY_ARGS="${RALPHY_ARGS/--model $FALLBACK_MODEL/--model $PREFERRED_MODEL}"
    else
        # Already using Opus but hit rate limit, switch to Gemini
        echo -e "${YELLOW}⚠️ Opus rate-limited, switching to Gemini...${NC}"
        OPENCODE_MODEL="$FALLBACK_MODEL"
        RALPHY_ARGS="${RALPHY_ARGS/--model $PREFERRED_MODEL/--model $FALLBACK_MODEL}"
    fi
done
