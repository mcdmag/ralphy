/**
 * Result from AI engine execution
 */
export interface AIResult {
	success: boolean;
	response: string;
	inputTokens: number;
	outputTokens: number;
	/** Actual cost in dollars (if provided by engine) or duration in ms */
	cost?: string;
	error?: string;
}

/**
 * Options passed to engine execute methods
 */
export interface EngineOptions {
	/** Override the default model */
	modelOverride?: string;
	/** Additional arguments to pass to the engine CLI */
	engineArgs?: string[];
}

/**
 * Progress callback type for streaming execution
 * @param step - The current step name (e.g., "Reading code", "Implementing")
 * @param rawLine - Optional raw output line for verbose display
 */
export type ProgressCallback = (step: string, rawLine?: string) => void;

/**
 * AI Engine interface - one per AI tool
 */
export interface AIEngine {
	/** Display name of the engine */
	name: string;
	/** CLI command to invoke */
	cliCommand: string;
	/** Default model used by this engine (if known) */
	defaultModel?: string;
	/** Check if the engine CLI is available */
	isAvailable(): Promise<boolean>;
	/** Execute a prompt and return the result */
	execute(prompt: string, workDir: string, options?: EngineOptions): Promise<AIResult>;
	/** Execute with streaming progress updates (optional) */
	executeStreaming?(
		prompt: string,
		workDir: string,
		onProgress: ProgressCallback,
		options?: EngineOptions,
	): Promise<AIResult>;
}

/**
 * Supported AI engine names
 */
export type AIEngineName =
	| "claude"
	| "opencode"
	| "cursor"
	| "codex"
	| "qwen"
	| "droid"
	| "copilot"
	| "gemini";
