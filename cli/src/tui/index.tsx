import { tuiState } from "./state.ts";
import { logStore } from "./stores/log.ts";

/**
 * Check if TUI is currently active
 */
export function isTuiActive(): boolean {
	return tuiState.active;
}

/**
 * Start the TUI interface
 * Returns a promise that resolves when the TUI exits
 */
export async function startTui(): Promise<void> {
	if (tuiState.active) {
		return;
	}

	// Dynamic import to ensure proper module resolution with conditions
	const [opentui, appModule] = await Promise.all([
		import("@opentui/solid"),
		import("./App.tsx"),
	]);
	const { render } = opentui;
	const { App } = appModule;

	if (!render) {
		console.error("[TUI] render function not available, falling back to console mode");
		return;
	}

	return new Promise<void>((resolve, reject) => {
		(async () => {
			try {
				tuiState.active = true;
				tuiState.exitResolver = resolve;

				// Add welcome message to logs
				logStore.addLog("info", "Welcome to Ralphy - Autonomous AI Coding Loop");
				logStore.addLog("info", "Press Ctrl+C to exit");
				logStore.startSpinner("Initializing...", "", "");

				const onExit = () => {
					tuiState.active = false;
					if (tuiState.exitResolver) {
						tuiState.exitResolver();
						tuiState.exitResolver = null;
					}
				};

				const dispose = await render(
					() => <App onExit={onExit} />,
					{
						targetFps: 60,
						gatherStats: false,
						exitOnCtrlC: false,
						enableMouse: false,
					},
				);

				// Store dispose function in state so we can call it externally
				// This is crucial for cleanup before process.exit()
				tuiState.dispose = dispose as unknown as () => void;

			} catch (err) {
				console.error("[TUI] Error in render:", err);
				tuiState.active = false;
				reject(err);
			}
		})();
	});
}

/**
 * Stop the TUI and return to normal console mode
 */
export function stopTui(): void {
	if (tuiState.dispose) {
		tuiState.dispose();
		tuiState.dispose = null;
	}
	if (tuiState.exitResolver) {
		tuiState.exitResolver();
		tuiState.exitResolver = null;
	}
	tuiState.active = false;
}

// Helper to get log store (direct import)
function getLogStore() {
	return logStore;
}

// Re-export store functions - simple wrappers
export function addLog(
	type: "info" | "success" | "warn" | "error" | "debug" | "ai" | "tool" | "stream",
	content: string,
	metadata?: { toolName?: string; status?: "running" | "completed" | "error"; engine?: string; model?: string }
): void {
	logStore.addLog(type, content, metadata);
}

export function clearLogs(): void {
	logStore.clearLogs();
}

export function startSpinner(step: string, engine?: string, model?: string): void {
	logStore.startSpinner(step, engine, model);
}

export function updateSpinnerStep(step: string): void {
	logStore.updateSpinnerStep(step);
}

export function updateSpinnerInfo(engine: string, model: string): void {
	logStore.updateSpinnerInfo(engine, model);
}

export function stopSpinner(): void {
	logStore.stopSpinner();
}

export function showInput(placeholder?: string): void {
	logStore.showInput(placeholder);
}

export function hideInput(): void {
	logStore.hideInput();
}

export function waitForInput(): Promise<string | null> {
	return logStore.waitForInput();
}

export function submitInput(text: string | null): void {
	logStore.submitInput(text);
}

export function getPendingInput(): string | null {
	return logStore.getPendingInput();
}
