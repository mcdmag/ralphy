#!/bin/bash
# ralphy-kill.sh - Kill all Ralphy processes

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

show_help() {
    cat << EOF
Usage: ./ralphy-kill.sh [options]

Kill all running Ralphy processes and tmux sessions.

Options:
    -h, --help      Show this help message
    -v, --verbose   Show detailed process information before killing

Examples:
    ./ralphy-kill.sh           # Kill all ralphy processes
    ./ralphy-kill.sh -v        # Show processes before killing

Note: This script only kills ralphy processes, not the AI engines
(claude, opencode, cursor, copilot) which may be used independently.
EOF
}

VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

echo "🔪 Killing all Ralphy processes..."

if [[ "$VERBOSE" == true ]]; then
    echo ""
    echo "Current ralphy processes:"
    ps aux | grep -E "ralphy" | grep -v grep | grep -v "ralphy-kill" || echo "  (none)"
    echo ""
fi

# Kill ralphy processes only
pkill -f "ralphy" 2>/dev/null && echo "  ✓ ralphy processes killed" || true

# Kill any worktree/sandbox processes
pkill -f "ralphy-worktrees" 2>/dev/null && echo "  ✓ worktrees" || true
pkill -f "ralphy-sandboxes" 2>/dev/null && echo "  ✓ sandboxes" || true

# Kill tmux sessions with "ralphy" in the name
for session in $(tmux list-sessions -F '#S' 2>/dev/null | grep -i ralphy); do
    tmux kill-session -t "$session" 2>/dev/null && echo "  ✓ tmux: $session"
done

sleep 1

# Verify
remaining=$(ps aux | grep -E "ralphy" | grep -v grep | grep -v "ralphy-kill" | wc -l)
if [[ $remaining -eq 0 ]]; then
    echo -e "${GREEN}✅ All ralphy processes stopped${NC}"
else
    echo -e "${RED}⚠️ Some processes still running:${NC}"
    ps aux | grep -E "ralphy" | grep -v grep | grep -v "ralphy-kill"
fi
