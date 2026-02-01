import { createSignal, createRoot } from "solid-js";

export interface LogEntry {
	id: string;
	type: "info" | "success" | "warn" | "error" | "debug" | "ai" | "tool" | "stream" | "chat";
	content: string;
	timestamp: number;
	metadata?: {
		toolName?: string;
		status?: "running" | "completed" | "error";
		engine?: string;
		model?: string;
	};
}

export interface SpinnerState {
	active: boolean;
	step: string;
	startTime: number;
	engine?: string;
	model?: string;
}

export interface InputState {
	visible: boolean;
	placeholder: string;
	history: string[];
	historyIndex: number;
}

// Create singleton store using createRoot to persist signals
const store = createRoot(() => {
	const [logs, setLogs] = createSignal<LogEntry[]>([]);
	const [spinner, setSpinner] = createSignal<SpinnerState>({
		active: false,
		step: "Idle",
		startTime: 0,
	});
	const [input, setInput] = createSignal<InputState>({
		visible: true,
		placeholder: "Type message and press Enter...",
		history: [],
		historyIndex: -1,
	});
	const [lastInput, setLastInput] = createSignal<string | null>(null);
	const [lastAiResponse, setLastAiResponse] = createSignal<string | null>(null);
	const [inputQueue, setInputQueue] = createSignal<string[]>([]);
	const [inputResolver, setInputResolver] = createSignal<((value: string | null) => void) | null>(null);

	function setAiResponse(text: string | null): void {
		setLastAiResponse(text);
	}

	let logIdCounter = 0;

	function addLog(type: LogEntry["type"], content: string, metadata?: LogEntry["metadata"]): void {
		const entry: LogEntry = {
			id: `log-${++logIdCounter}`,
			type,
			content,
			timestamp: Date.now(),
			metadata,
		};
		setLogs((prev) => [...prev, entry]);
	}

	function clearLogs(): void {
		setLogs([]);
	}

	function startSpinner(step: string, engine?: string, model?: string): void {
		setSpinner({
			active: true,
			step,
			startTime: Date.now(),
			engine,
			model,
		});
	}

	function updateSpinnerStep(step: string): void {
		setSpinner((prev) => ({ ...prev, step }));
	}

	function updateSpinnerInfo(engine: string, model: string): void {
		setSpinner((prev) => ({ ...prev, engine, model }));
	}

	function stopSpinner(): void {
		setSpinner((prev) => ({ ...prev, active: false }));
	}

	function showInput(placeholder?: string): void {
		setInput((prev) => ({
			...prev,
			visible: true,
			placeholder: placeholder || prev.placeholder,
		}));
	}

	function hideInput(): void {
		setInput((prev) => ({ ...prev, visible: false }));
	}

	function addToHistory(text: string): void {
		if (text.trim()) {
			setInput((prev) => ({
				...prev,
				history: [...prev.history.filter((h) => h !== text), text],
				historyIndex: -1,
			}));
		}
	}

	// Wait for user input - returns a promise that resolves when user submits
	function waitForInput(): Promise<string | null> {
		return new Promise((resolve) => {
			setInputResolver(() => resolve);
		});
	}

	// Submit input - called when user presses Enter
	function submitInput(text: string | null): void {
		if (text) {
			addToHistory(text);
			// Echo input to logs
			addLog("info", `> ${text}`);
			setLastInput(text);
		}

		const resolver = inputResolver();
		if (resolver) {
			resolver(text);
			setInputResolver(null);
		} else if (text) {
			// No one is waiting, queue it for the run loop
			setInputQueue((prev) => [...prev, text]);
			// Show immediate feedback that it's queued
			setTimeout(() => {
				const currentSpinner = spinner();
				if (currentSpinner.active) {
					addLog("debug", "Message queued. Will be answered after current task.");
				}
			}, 100);
		}
	}

	// Get next queued input
	function popInputQueue(): string | null {
		const queue = inputQueue();
		if (queue.length === 0) return null;

		const [next, ...rest] = queue;
		setInputQueue(rest);
		return next;
	}

	return {
		logs,
		spinner,
		input,
		lastInput,
		lastAiResponse,
		inputQueue,
		inputResolver,
		addLog,
		clearLogs,
		startSpinner,
		updateSpinnerStep,
		updateSpinnerInfo,
		stopSpinner,
		showInput,
		hideInput,
		addToHistory,
		waitForInput,
		submitInput,
		popInputQueue,
		setAiResponse,
	};
});

export const logStore = store;
