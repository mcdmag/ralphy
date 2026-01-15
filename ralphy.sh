#!/bin/bash

# ============================================
# Ralph - Autonomous Claude Coding Loop
# Runs until PRD is complete
# ============================================

# Parse arguments
SKIP_TESTS=false
SKIP_LINT=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --no-tests|--skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --no-lint|--skip-lint)
      SKIP_LINT=true
      shift
      ;;
    --fast)
      SKIP_TESTS=true
      SKIP_LINT=true
      shift
      ;;
    -h|--help)
      echo "Usage: ./ralph.sh [options]"
      echo ""
      echo "Options:"
      echo "  --no-tests    Skip writing and running tests"
      echo "  --no-lint     Skip linting"
      echo "  --fast        Skip both tests and linting"
      echo "  -h, --help    Show this help"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage"
      exit 1
      ;;
  esac
done

# Pre-flight checks
if [ ! -f "PRD.md" ]; then
  echo "Error: PRD.md not found in current directory"
  exit 1
fi

# Global vars for cleanup
claude_pid=""
monitor_pid=""
tmpfile=""
current_step="Thinking"

# Cleanup on exit
cleanup() {
  local exit_code=$?
  # Kill background processes
  [ -n "$monitor_pid" ] && kill $monitor_pid 2>/dev/null || true
  [ -n "$claude_pid" ] && kill $claude_pid 2>/dev/null || true
  # Kill any remaining child processes
  pkill -P $$ 2>/dev/null || true
  [ -n "$tmpfile" ] && rm -f "$tmpfile"
  # Only show message on interrupt
  if [ $exit_code -eq 130 ]; then
    printf "\n"
    echo "Interrupted! Cleaned up."
  fi
}

# Trap signals - use EXIT to catch everything
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

if [ ! -f "progress.txt" ]; then
  echo "Warning: progress.txt not found, creating it..."
  touch progress.txt
fi

# Cost tracking
total_input_tokens=0
total_output_tokens=0

# Get next incomplete task from PRD
get_next_task() {
  grep -m1 '^\- \[ \]' PRD.md 2>/dev/null | sed 's/^- \[ \] //' | cut -c1-50 || echo "Working..."
}

# Monitor Claude's streaming output and show progress
monitor_progress() {
  local file=$1
  local task=$2
  local start_time=$(date +%s)
  local spinstr='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local spin_idx=0

  task="${task:0:40}"

  while true; do
    local elapsed=$(($(date +%s) - start_time))
    local mins=$((elapsed / 60))
    local secs=$((elapsed % 60))

    # Check latest output for step indicators
    if [ -f "$file" ] && [ -s "$file" ]; then
      local content=$(tail -c 5000 "$file" 2>/dev/null || true)

      if echo "$content" | grep -qE 'git commit|"command":"git commit'; then
        current_step="Committing"
      elif echo "$content" | grep -qE 'git add|"command":"git add'; then
        current_step="Staging"
      elif echo "$content" | grep -qE 'progress\.txt'; then
        current_step="Logging progress"
      elif echo "$content" | grep -qE 'PRD\.md'; then
        current_step="Updating PRD"
      elif echo "$content" | grep -qE 'lint|eslint|biome'; then
        current_step="Linting"
      elif echo "$content" | grep -qE 'vitest|jest|bun test|npm test'; then
        current_step="Running tests"
      elif echo "$content" | grep -qE '\.test\.|\.spec\.|__tests__'; then
        current_step="Writing tests"
      elif echo "$content" | grep -qE '"tool":"Write"|"tool":"Edit"'; then
        current_step="Implementing"
      elif echo "$content" | grep -qE '"tool":"Read"|"tool":"Glob"|"tool":"Grep"'; then
        current_step="Reading code"
      fi
    fi

    local spinner_char="${spinstr:$spin_idx:1}"
    # Use tput for cleaner line clearing
    tput cr 2>/dev/null || printf "\r"
    tput el 2>/dev/null || true
    printf "  %s %-16s │ %s [%02d:%02d]" "$spinner_char" "$current_step" "$task" "$mins" "$secs"

    spin_idx=$(( (spin_idx + 1) % ${#spinstr} ))
    sleep 0.12
  done
}

# Notification sound (macOS)
notify_done() {
  if command -v afplay &> /dev/null; then
    afplay /System/Library/Sounds/Glass.aiff 2>/dev/null
  fi
}

echo "============================================"
echo "Ralph - Running until PRD is complete"
if [ "$SKIP_TESTS" = true ] || [ "$SKIP_LINT" = true ]; then
  mode=""
  [ "$SKIP_TESTS" = true ] && mode="no-tests"
  [ "$SKIP_LINT" = true ] && mode="${mode:+$mode, }no-lint"
  echo "Mode: $mode"
fi
echo "============================================"

iteration=0
while true; do
  ((iteration++))
  echo ""
  echo ">>> Task $iteration"
  echo "--------------------------------------------"

  # Get current task for display
  current_task=$(get_next_task)
  current_step="Thinking"

  # Temp file for Claude output
  tmpfile=$(mktemp)

  # Build prompt based on flags
  prompt="@PRD.md @progress.txt
1. Find the highest-priority incomplete task and implement it."

  step=2
  if [ "$SKIP_TESTS" = false ]; then
    prompt="$prompt
$step. Write tests for the feature.
$((step+1)). Run tests and ensure they pass before proceeding."
    step=$((step+2))
  fi

  if [ "$SKIP_LINT" = false ]; then
    prompt="$prompt
$step. Run linting and ensure it passes before proceeding."
    step=$((step+1))
  fi

  prompt="$prompt
$step. Update the PRD to mark the task as complete.
$((step+1)). Append your progress to progress.txt.
$((step+2)). Commit your changes with a descriptive message.
ONLY WORK ON A SINGLE TASK."

  if [ "$SKIP_TESTS" = false ]; then
    prompt="$prompt Do not proceed if tests fail."
  fi
  if [ "$SKIP_LINT" = false ]; then
    prompt="$prompt Do not proceed if linting fails."
  fi

  prompt="$prompt
If ALL tasks in the PRD are complete, output <promise>COMPLETE</promise>."

  # Start Claude with streaming JSON output
  claude --dangerously-skip-permissions --verbose --output-format stream-json -p "$prompt" > "$tmpfile" 2>&1 &
  claude_pid=$!

  # Start progress monitor in background
  monitor_progress "$tmpfile" "$current_task" &
  monitor_pid=$!

  # Wait for Claude to finish
  wait $claude_pid 2>/dev/null
  exit_code=$?

  # Stop the monitor
  kill $monitor_pid 2>/dev/null || true
  wait $monitor_pid 2>/dev/null || true

  # Show completion
  tput cr 2>/dev/null || printf "\r"
  tput el 2>/dev/null || true
  printf "  ✓ %-16s │ %s\n" "Done" "$current_task"

  # Read result
  result=$(cat "$tmpfile" 2>/dev/null || echo "")
  rm -f "$tmpfile"
  tmpfile=""

  # Check if result is empty or contains error
  if [ -z "$result" ]; then
    echo "Error: Claude returned empty response"
    echo "Exit code: $exit_code"
    continue
  fi

  # Check for API errors in stream
  if echo "$result" | grep -q '"type":"error"'; then
    echo "Error from Claude:"
    echo "$result" | grep '"type":"error"' | head -1 | jq -r '.error.message // .message // .' 2>/dev/null || echo "$result" | tail -5
    continue
  fi

  # Extract final result message
  result_line=$(echo "$result" | grep '"type":"result"' | tail -1)
  if [ -n "$result_line" ]; then
    response=$(echo "$result_line" | jq -r '.result // "No result text"' 2>/dev/null || echo "Could not parse result")
    echo ""
    echo "$response"

    # Token usage
    input_tokens=$(echo "$result_line" | jq -r '.usage.input_tokens // 0' 2>/dev/null || echo "0")
    output_tokens=$(echo "$result_line" | jq -r '.usage.output_tokens // 0' 2>/dev/null || echo "0")
    [[ "$input_tokens" =~ ^[0-9]+$ ]] || input_tokens=0
    [[ "$output_tokens" =~ ^[0-9]+$ ]] || output_tokens=0
    total_input_tokens=$((total_input_tokens + input_tokens))
    total_output_tokens=$((total_output_tokens + output_tokens))
  else
    echo "No result found in response. Raw output:"
    echo "$result" | tail -20
  fi

  # Check for completion
  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo ""
    echo "============================================"
    echo "PRD complete! Finished $iteration tasks."
    echo "============================================"
    echo ""
    echo ">>> Cost Summary"
    echo "Input tokens:  $total_input_tokens"
    echo "Output tokens: $total_output_tokens"
    echo "Total tokens:  $((total_input_tokens + total_output_tokens))"
    echo "Est. cost:     \$$(echo "scale=4; ($total_input_tokens * 0.000003) + ($total_output_tokens * 0.000015)" | bc)"
    echo "============================================"
    notify_done
    exit 0
  fi

  # Small delay between iterations
  sleep 1
done

