import * as readline from "node:readline";
import pc from "picocolors";

let pendingInput: string | null = null;

// TUI integration - lazy import
let tuiModule: typeof import("../tui/index.tsx") | null = null;

function isTuiActive(): boolean {
	return tuiModule?.isTuiActive() ?? false;
}

async function getTuiModule() {
	if (!tuiModule) {
		try {
			tuiModule = await import("../tui/index.tsx");
		} catch {
			// TUI not available
		}
	}
	return tuiModule;
}

/**
 * Prompt for user input between tasks
 * Shows a brief prompt with timeout, user can type to inject a message
 */
export async function promptForUserInput(): Promise<string | null> {
	if (!process.stdin.isTTY) return null;

	// Use TUI input if active
	if (isTuiActive() && tuiModule) {
		return tuiModule.waitForInput();
	}

	return new Promise((resolve) => {
		// Draw input box
		const cols = process.stdout.columns || 80;
		console.log("");
		console.log(pc.dim("─".repeat(cols)));
		console.log(pc.cyan("❯ ") + pc.dim("Type to inject message, or wait 3s to continue..."));

		let resolved = false;
		let hasInput = false;

		// Auto-continue after 3 seconds
		const timeout = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				// Clear the prompt lines
				process.stdout.write("\x1b[2A"); // Move up 2 lines
				process.stdout.write("\x1b[J"); // Clear from cursor to end
				if (process.stdin.isTTY) {
					try {
						process.stdin.setRawMode(false);
					} catch {}
					process.stdin.pause();
				}
				resolve(null);
			}
		}, 3000);

		// Listen for keypress
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(true);
		}
		process.stdin.resume();
		process.stdin.setEncoding("utf8");

		const onData = (key: string) => {
			// Ctrl+C - exit
			if (key === "\u0003") {
				clearTimeout(timeout);
				if (process.stdin.isTTY) {
					process.stdin.setRawMode(false);
				}
				process.exit();
			}

			// Enter without input = skip
			if ((key === "\r" || key === "\n") && !hasInput) {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeout);
					process.stdin.removeListener("data", onData);
					if (process.stdin.isTTY) {
						process.stdin.setRawMode(false);
					}
					process.stdin.pause();
					// Clear the prompt lines
					process.stdout.write("\x1b[2A");
					process.stdout.write("\x1b[J");
					resolve(null);
				}
				return;
			}

			// First keypress - switch to full input mode
			if (!hasInput && key !== "\r" && key !== "\n") {
				hasInput = true;
				clearTimeout(timeout);
				process.stdin.removeListener("data", onData);
				if (process.stdin.isTTY) {
					process.stdin.setRawMode(false);
				}

				// Clear the auto-continue prompt
				process.stdout.write("\x1b[1A"); // Move up 1 line
				process.stdout.write("\x1b[2K"); // Clear line

				const rl = readline.createInterface({
					input: process.stdin,
					output: process.stdout,
				});

				// Show the prompt with the first character already typed
				process.stdout.write(pc.cyan("❯ "));

				rl.question("", (answer) => {
					rl.close();
					resolved = true;

					// Combine first char with rest of input
					const fullInput = key + answer;
					const trimmed = fullInput.trim();

					if (trimmed) {
						console.log(pc.green("✓") + pc.dim(` Message queued (${trimmed.length} chars)`));
						console.log("");
						resolve(trimmed);
					} else {
						resolve(null);
					}
				});

				// Write the first character that triggered input mode
				rl.write(key);
			}
		};

		process.stdin.on("data", onData);
	});
}

/**
 * Set pending input (for external injection)
 */
export function setPendingInput(input: string): void {
	pendingInput = input;
}

/**
 * Get and clear pending input
 */
export function getPendingInput(): string | null {
	const input = pendingInput;
	pendingInput = null;
	return input;
}

/**
 * Check if there's pending input
 */
export function hasPendingInput(): boolean {
	return pendingInput !== null;
}

// Simplified lifecycle functions
export function initInputListener(): void {
	// No-op - input is handled per-prompt now
}

export function cleanupInputListener(): void {
	if (process.stdin.isTTY) {
		try {
			process.stdin.setRawMode(false);
		} catch {}
	}
}

/**
 * Refresh input prompt - no-op in simplified mode
 */
export function refreshInputPrompt(): void {
	// No-op
}

/**
 * Check if persistent input is active - always false in simplified mode
 */
export function isInputActive(): boolean {
	return false;
}
