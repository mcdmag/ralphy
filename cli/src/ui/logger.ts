import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { isInputActive, refreshInputPrompt } from "./input.ts";

// Import tuiState directly to avoid circular dependency issues
// The state.ts module has no dependencies and can be imported synchronously
import { tuiState } from "../tui/state.ts";
import { logStore } from "../tui/stores/log.ts";

// TUI integration - lazy import to avoid circular deps for startup
// We use logStore directly for logging, but need this for startTui
let tuiModule: typeof import("../tui/index.tsx") | null = null;

async function getTuiModule() {
	if (!tuiModule) {
		try {
			tuiModule = await import("../tui/index.tsx");
		} catch (err) {
			console.error("[Logger] Failed to load TUI module:", err);
			// TUI not available - likely JSX transformation issue
			// This happens when running from outside the package directory
			// without the proper Bun preload configuration
			// Silent fail - TUI is optional
		}
	}
	return tuiModule;
}

function isTuiActive(): boolean {
	// Access tuiState directly instead of going through tuiModule
	// This avoids the circular dependency that caused ReferenceError
	return tuiState.active;
}

/**
 * Wait for TUI to become active (poll with timeout)
 * Useful to ensure TUI is ready before streaming logs
 */
export async function waitForTuiActive(timeoutMs = 5000): Promise<boolean> {
	if (tuiState.active) return true;

	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (tuiState.active) return true;
		await new Promise(r => setTimeout(r, 50));
	}

	return false;
}

let verboseMode = false;
let logsDir: string | null = null;
let currentSessionId: string | null = null;
let currentEngine: string | null = null;
let currentModel: string | null = null;

/**
 * Set verbose mode
 */
export function setVerbose(verbose: boolean): void {
	verboseMode = verbose;
}

/**
 * Initialize file logging
 * @param workDir - Working directory (logs go to workDir/.ralphy/logs/)
 */
export function initFileLogging(workDir: string): void {
	logsDir = join(workDir, ".ralphy", "logs");
	if (!existsSync(logsDir)) {
		mkdirSync(logsDir, { recursive: true });
	}
	// Create sessions subdirectory
	const sessionsDir = join(logsDir, "sessions");
	if (!existsSync(sessionsDir)) {
		mkdirSync(sessionsDir, { recursive: true });
	}
}

/**
 * Get current date in YYYY-MM-DD format
 */
function getDateString(): string {
	return new Date().toISOString().split("T")[0];
}

/**
 * Get current timestamp in ISO format
 */
function getTimestamp(): string {
	return new Date().toISOString();
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
	const date = getDateString();
	const time = new Date().toISOString().split("T")[1].replace(/[:.]/g, "-").slice(0, 8);
	const rand = Math.random().toString(36).substring(2, 6);
	return `${date}_${time}_${rand}`;
}

/**
 * Write to the daily log file
 */
function writeToLogFile(level: string, message: string): void {
	if (!logsDir) return;

	const logFile = join(logsDir, `${getDateString()}.log`);
	const timestamp = getTimestamp();
	const logLine = `[${timestamp}] [${level}] ${message}\n`;

	try {
		appendFileSync(logFile, logLine, "utf-8");
	} catch {
		// Silently fail if we can't write to log file
	}
}

/**
 * Start a new agent session for logging
 * @returns Session ID for this interaction
 */
export function startAgentSession(taskTitle: string): string {
	currentSessionId = generateSessionId();

	if (logsDir) {
		const sessionFile = join(logsDir, "sessions", `${currentSessionId}.log`);
		const header = `=== Agent Session: ${currentSessionId} ===
Task: ${taskTitle}
Started: ${getTimestamp()}
${"=".repeat(60)}

`;
		try {
			writeFileSync(sessionFile, header, "utf-8");
		} catch {
			// Silently fail
		}
	}

	writeToLogFile("SESSION", `Started session ${currentSessionId} for task: ${taskTitle}`);
	return currentSessionId;
}

/**
 * Log request/prompt sent to agent
 */
export function logAgentRequest(prompt: string, engine: string): void {
	const message = `[${engine}] Request sent (${prompt.length} chars)`;
	writeToLogFile("REQUEST", message);

	if (logsDir && currentSessionId) {
		const sessionFile = join(logsDir, "sessions", `${currentSessionId}.log`);
		const content = `
--- REQUEST TO ${engine.toUpperCase()} ---
Timestamp: ${getTimestamp()}
Prompt Length: ${prompt.length} characters

${prompt}

${"─".repeat(60)}
`;
		try {
			appendFileSync(sessionFile, content, "utf-8");
		} catch {
			// Silently fail
		}
	}
}

/**
 * Log response received from agent
 */
export function logAgentResponse(
	response: string,
	engine: string,
	success: boolean,
	inputTokens?: number,
	outputTokens?: number,
): void {
	const status = success ? "SUCCESS" : "FAILED";
	const tokens = inputTokens && outputTokens ? ` (${inputTokens} in / ${outputTokens} out)` : "";
	const message = `[${engine}] Response ${status}${tokens}`;
	writeToLogFile("RESPONSE", message);

	if (logsDir && currentSessionId) {
		const sessionFile = join(logsDir, "sessions", `${currentSessionId}.log`);
		const content = `
--- RESPONSE FROM ${engine.toUpperCase()} ---
Timestamp: ${getTimestamp()}
Status: ${status}
${inputTokens ? `Input Tokens: ${inputTokens}` : ""}
${outputTokens ? `Output Tokens: ${outputTokens}` : ""}

${response}

${"─".repeat(60)}
`;
		try {
			appendFileSync(sessionFile, content, "utf-8");
		} catch {
			// Silently fail
		}
	}
}

/**
 * End the current agent session
 */
export function endAgentSession(success: boolean, error?: string): void {
	if (logsDir && currentSessionId) {
		const sessionFile = join(logsDir, "sessions", `${currentSessionId}.log`);
		const footer = `

${"=".repeat(60)}
Session Ended: ${getTimestamp()}
Status: ${success ? "SUCCESS" : "FAILED"}
${error ? `Error: ${error}` : ""}
${"=".repeat(60)}
`;
		try {
			appendFileSync(sessionFile, footer, "utf-8");
		} catch {
			// Silently fail
		}
	}

	writeToLogFile(
		"SESSION",
		`Ended session ${currentSessionId} - ${success ? "SUCCESS" : "FAILED"}`,
	);
	currentSessionId = null;
}

/**
 * Get the path to the logs directory
 */
export function getLogsDir(): string | null {
	return logsDir;
}

/**
 * Get the current session ID
 */
export function getCurrentSessionId(): string | null {
	return currentSessionId;
}

/**
 * Log info message
 */
export function logInfo(...args: unknown[]): void {
	const message = args.map(String).join(" ");
	if (isTuiActive()) {
		logStore.addLog("info", message);
	} else {
		console.log(pc.blue("[INFO]"), ...args);
		if (isInputActive()) refreshInputPrompt();
	}
	writeToLogFile("INFO", message);
}

/**
 * Log success message
 */
export function logSuccess(...args: unknown[]): void {
	const message = args.map(String).join(" ");
	if (isTuiActive()) {
		logStore.addLog("success", message);
	} else {
		console.log(pc.green("[OK]"), ...args);
		if (isInputActive()) refreshInputPrompt();
	}
	writeToLogFile("OK", message);
}

/**
 * Log warning message
 */
export function logWarn(...args: unknown[]): void {
	const message = args.map(String).join(" ");
	if (isTuiActive()) {
		logStore.addLog("warn", message);
	} else {
		console.log(pc.yellow("[WARN]"), ...args);
		if (isInputActive()) refreshInputPrompt();
	}
	writeToLogFile("WARN", message);
}

/**
 * Log error message
 */
export function logError(...args: unknown[]): void {
	const message = args.map(String).join(" ");
	if (isTuiActive()) {
		logStore.addLog("error", message);
	} else {
		console.error(pc.red("[ERROR]"), ...args);
		if (isInputActive()) refreshInputPrompt();
	}
	writeToLogFile("ERROR", message);
}

/**
 * Log debug message (only in verbose mode)
 */
export function logDebug(...args: unknown[]): void {
	const message = args.map(String).join(" ");
	if (verboseMode) {
		if (isTuiActive()) {
			logStore.addLog("debug", message);
		} else {
			console.log(pc.dim("[DEBUG]"), ...args);
			if (isInputActive()) refreshInputPrompt();
		}
	}
	// Always write debug to file (useful for troubleshooting)
	writeToLogFile("DEBUG", message);
}

/**
 * Display engine info in a prominent box
 */
export function logEngineInfo(options: {
	engine: string;
	model: string;
	tasks: number;
	mode: string;
	browserEnabled?: boolean;
	verbose?: boolean;
}): void {
	const infoLines = [
		`AI Engine: ${options.engine}`,
		`Model: ${options.model}`,
		`Tasks: ${options.tasks}`,
		`Mode: ${options.mode}`,
		...(options.browserEnabled ? ["Browser: enabled"] : []),
		...(options.verbose ? ["Verbose: enabled"] : []),
	];

	if (isTuiActive()) {
		logStore.addLog("info", infoLines.join(" | "));
	} else {
		console.log("");
		console.log(pc.cyan("╔══════════════════════════════════════════════════════════════╗"));
		console.log(pc.cyan(`║  🤖 AI Engine: ${options.engine.padEnd(47)}║`));
		console.log(pc.cyan(`║  📦 Model: ${options.model.padEnd(51)}║`));
		console.log(pc.cyan(`║  📋 Tasks: ${String(options.tasks).padEnd(51)}║`));
		console.log(pc.cyan(`║  ⚡ Mode: ${options.mode.padEnd(52)}║`));
		if (options.browserEnabled) {
			console.log(pc.cyan(`║  🌐 Browser: enabled (agent-browser)${" ".repeat(25)}║`));
		}
		if (options.verbose) {
			console.log(pc.cyan(`║  📝 Verbose: enabled${" ".repeat(41)}║`));
		}
		console.log(pc.cyan("╚══════════════════════════════════════════════════════════════╝"));
		console.log("");
		if (isInputActive()) refreshInputPrompt();
	}

	// Also write to log file
	writeToLogFile(
		"ENGINE",
		`${options.engine} | ${options.model} | ${options.tasks} tasks | ${options.mode}`,
	);
}

/**
 * Print verbose output on a new line (clears spinner line first)
 */
function printVerbose(message: string): void {
	if (isTuiActive()) {
		logStore.addLog("stream", message);
	} else {
		// Clear current line and move to start, then print on new line
		process.stdout.write("\r\x1b[K"); // Clear line
		console.log(message);
		if (isInputActive()) refreshInputPrompt();
	}
}

/**
 * Print a boxed/formatted block of text for AI responses
 */
function printAiResponse(text: string): void {
	if (isTuiActive()) {
		logStore.addLog("ai", text, { engine: currentEngine || undefined, model: currentModel || undefined });
	} else {
		process.stdout.write("\r\x1b[K"); // Clear spinner line
		console.log(""); // Empty line before
		// Show engine and model in header
		let header = "┌─ AI Response";
		if (currentEngine && currentModel) {
			header += ` │ 🤖 ${currentEngine} │ 📦 ${currentModel}`;
		}
		header += " ─".padEnd(65 - header.length, "─");
		console.log(pc.cyan(header));
		const lines = text.split("\n");
		for (const line of lines) {
			console.log(pc.cyan("│ ") + line);
		}
		console.log(pc.cyan("└───────────────────────────────────────────────────────────────"));
		console.log(""); // Empty line after
		if (isInputActive()) refreshInputPrompt();
	}
}

/**
 * Print the prompt being sent to AI in verbose mode
 */
export function logVerbosePrompt(prompt: string, engine: string): void {
	if (!verboseMode) return;

	if (isTuiActive()) {
		const header = `┌─ Prompt to ${engine} ─────────────────────────────────────────────`;
		const footer = `└─ ${prompt.length.toLocaleString()} chars ────────────────────────────────────────────`;
		const lines = prompt.split("\n").map((line) => `│ ${line}`);
		const content = [header, ...lines, footer].join("\n");
		logStore.addLog("debug", content);
	} else {
		process.stdout.write("\r\x1b[K"); // Clear spinner line
		console.log("");
		console.log(pc.magenta(`┌─ Prompt to ${engine} ─────────────────────────────────────────────`));

		// Show all lines
		const lines = prompt.split("\n");
		for (const line of lines) {
			console.log(pc.magenta("│ ") + pc.dim(line));
		}

		console.log(
			pc.magenta(
				`└─ ${prompt.length.toLocaleString()} chars ────────────────────────────────────────────`,
			),
		);
		console.log("");
		if (isInputActive()) refreshInputPrompt();
	}
}

/**
 * Set the AI engine and model being used (called at start of task)
 * This stores the info to display with token counts
 */
export function setCurrentEngineInfo(engine: string, model: string): void {
	currentEngine = engine;
	currentModel = model;
}

/**
 * Log verbose streaming output from AI engine
 * This parses JSON lines and displays them in a readable format
 * Supports Claude, OpenCode, Gemini, and other engine formats
 */
export function logVerboseStream(rawLine: string): void {
	if (!verboseMode) return;

	const trimmed = rawLine.trim();
	if (!trimmed) return;

	// Try to parse as JSON for prettier output
	if (trimmed.startsWith("{")) {
		try {
			const parsed = JSON.parse(trimmed);

			// Handle different message types

			// OpenCode format: { type: "text", part: { text: "..." } }
			if (parsed.type === "text" && parsed.part?.text) {
				const text = parsed.part.text;
				printAiResponse(text);
				writeToLogFile("STREAM", trimmed);
				return;
			}

			// OpenCode alternative: { type: "text-delta", part: { text: "..." } }
			if (parsed.type === "text-delta" && parsed.part?.text) {
				const text = parsed.part.text;
				printAiResponse(text);
				writeToLogFile("STREAM", trimmed);
				return;
			}

			// OpenCode message content: { type: "message", content: "..." }
			if (
				parsed.type === "message" &&
				typeof parsed.content === "string" &&
				parsed.content.trim()
			) {
				printAiResponse(parsed.content);
				writeToLogFile("STREAM", trimmed);
				return;
			}

			// OpenCode step with text: { type: "step", part: { text: "..." } }
			if (parsed.type === "step" && parsed.part?.text) {
				printAiResponse(parsed.part.text);
				writeToLogFile("STREAM", trimmed);
				return;
			}

			// OpenCode format: { type: "tool_use", part: { tool: "...", state: { input: {...} } } }
			if (parsed.type === "tool_use" && parsed.part) {
				const toolName = parsed.part.tool || "unknown";
				const state = parsed.part.state || {};
				// Input can be in state.input, part.input, or part.args
				const input = state.input || parsed.part.input || parsed.part.args || {};
				const status = state.status;

				// Always log full structure for debugging
				writeToLogFile("DEBUG_TOOL", JSON.stringify(parsed, null, 2));

				// Display full parsed object if no input found (helps debug)
				const hasInput = Object.keys(input).length > 0;

				// Build params string - show file path or command
				let paramStr = "";
				if (input.filePath) {
					// Show just the filename for brevity
					const fileName = input.filePath.split("/").pop() || input.filePath;
					paramStr = fileName;
				} else if (input.file_path) {
					const fileName = input.file_path.split("/").pop() || input.file_path;
					paramStr = fileName;
				} else if (input.command) {
					paramStr = input.command.slice(0, 60);
				} else if (input.pattern) {
					paramStr = input.pattern;
				} else if (input.path) {
					paramStr = input.path;
				}

				if (status === "completed") {
					printVerbose(pc.green(`│ ✓ ${toolName}`) + (paramStr ? pc.dim(` ${paramStr}`) : ""));

					// Show all input params for any tool
					if (hasInput) {
						// For edit tool, show as diff format
						if (toolName === "edit" && (input.old_string || input.new_string)) {
							if (input.file_path) {
								printVerbose(pc.dim(`│   file: ${input.file_path}`));
							}
							if (input.old_string) {
								printVerbose(pc.dim("│   ┌─ old_string ──────────────────────────────"));
								const oldLines = input.old_string.split("\n");
								for (const line of oldLines) {
									printVerbose(pc.red(`│   │ - ${line}`));
								}
								printVerbose(pc.dim("│   └───────────────────────────────────────────"));
							}
							if (input.new_string) {
								printVerbose(pc.dim("│   ┌─ new_string ──────────────────────────────"));
								const newLines = input.new_string.split("\n");
								for (const line of newLines) {
									printVerbose(pc.green(`│   │ + ${line}`));
								}
								printVerbose(pc.dim("│   └───────────────────────────────────────────"));
							}
						}
						// For write tool, show content
						else if (toolName === "write" && input.content) {
							printVerbose(pc.dim("│   ┌─ Content ───────────────────────────────────"));
							const lines = input.content.split("\n");
							for (const line of lines) {
								printVerbose(pc.dim(`│   │ ${line}`));
							}
							printVerbose(pc.dim("│   └───────────────────────────────────────────"));
						}
						// For other tools, show all params
						else {
							for (const key of Object.keys(input)) {
								const value = input[key];
								if (typeof value === "string") {
									if (value.includes("\n")) {
										printVerbose(pc.dim(`│   ${key}:`));
										const lines = value.split("\n");
										for (const line of lines) {
											printVerbose(pc.dim(`│     ${line}`));
										}
									} else {
										printVerbose(pc.dim(`│   ${key}: "${value}"`));
									}
								} else if (value !== null && value !== undefined) {
									printVerbose(pc.dim(`│   ${key}: ${JSON.stringify(value)}`));
								}
							}
						}
					}

					// For bash tool, also show output
					if (toolName === "bash" && state.output) {
						const output = state.output.trim();
						if (output.length > 0) {
							printVerbose(pc.dim("│   ┌─ Output ──────────────────────────────────"));
							const lines = output.split("\n");
							for (const line of lines) {
								printVerbose(pc.dim(`│   │ ${line}`));
							}
							printVerbose(pc.dim("│   └───────────────────────────────────────────"));
						}
					}

					// For read tool, show file content
					if (toolName === "read" && state.output) {
						const output = state.output;
						const lines = output.split("\n");
						printVerbose(pc.dim("│   ┌─ File Content ────────────────────────────"));
						for (const line of lines) {
							printVerbose(pc.dim(`│   │ ${line}`));
						}
						printVerbose(pc.dim("│   └───────────────────────────────────────────"));
					}

					// If no input found, show what's available in part for debugging
					if (!hasInput && parsed.part) {
						const partKeys = Object.keys(parsed.part).filter((k) => k !== "tool" && k !== "state");
						if (partKeys.length > 0) {
							printVerbose(pc.dim("│   [raw data]:"));
							for (const key of partKeys) {
								const value = parsed.part[key];
								if (typeof value === "string" && value.length < 200) {
									printVerbose(pc.dim(`│     ${key}: "${value}"`));
								} else if (typeof value === "object") {
									printVerbose(pc.dim(`│     ${key}: ${JSON.stringify(value).slice(0, 100)}...`));
								}
							}
						}
					}
				} else if (status === "running") {
					// Show tool being called with full arguments
					printVerbose(pc.yellow(`│ 🔧 ${toolName}`) + (paramStr ? pc.dim(` ${paramStr}`) : ""));

					// Special formatting for edit tool - show as diff
					if (toolName === "edit" && (input.old_string || input.new_string)) {
						if (input.file_path) {
							printVerbose(pc.dim(`│   file: ${input.file_path}`));
						}
						if (input.old_string) {
							printVerbose(pc.dim("│   ┌─ old_string ──────────────────────────────"));
							const oldLines = input.old_string.split("\n");
							for (const line of oldLines) {
								printVerbose(pc.red(`│   │ - ${line}`));
							}
							printVerbose(pc.dim("│   └───────────────────────────────────────────"));
						}
						if (input.new_string) {
							printVerbose(pc.dim("│   ┌─ new_string ──────────────────────────────"));
							const newLines = input.new_string.split("\n");
							for (const line of newLines) {
								printVerbose(pc.green(`│   │ + ${line}`));
							}
							printVerbose(pc.dim("│   └───────────────────────────────────────────"));
						}
					} else {
						// Display all input arguments in full for other tools
						const argKeys = Object.keys(input);
						if (argKeys.length > 0) {
							for (const key of argKeys) {
								const value = input[key];
								if (typeof value === "string") {
									if (value.includes("\n")) {
										// Multi-line content - show all
										printVerbose(pc.dim(`│   ${key}:`));
										const lines = value.split("\n");
										for (const line of lines) {
											printVerbose(pc.dim(`│     ${line}`));
										}
									} else {
										printVerbose(pc.dim(`│   ${key}: "${value}"`));
									}
								} else if (typeof value === "boolean" || typeof value === "number") {
									printVerbose(pc.dim(`│   ${key}: ${value}`));
								} else if (value !== null && value !== undefined) {
									printVerbose(pc.dim(`│   ${key}: ${JSON.stringify(value)}`));
								}
							}
						}
					}
				} else {
					printVerbose(pc.yellow(`│ 🔧 ${toolName}`) + (paramStr ? pc.dim(` ${paramStr}`) : ""));
				}
				writeToLogFile("STREAM", trimmed);
				return;
			}

			// Claude format: { type: "assistant", message: { content: [...] } }
			if (parsed.type === "assistant" && parsed.message?.content) {
				const content = Array.isArray(parsed.message.content)
					? parsed.message.content
						.filter((c: { type: string }) => c.type === "text")
						.map((c: { text: string }) => c.text)
						.join("\n")
					: parsed.message.content;
				if (content) {
					printAiResponse(content);
				}

				// Also handle tool_use blocks in the message content
				if (Array.isArray(parsed.message.content)) {
					for (const block of parsed.message.content) {
						if (block.type === "tool_use") {
							const toolName = block.name || "unknown";
							const input = block.input || {};

							let paramStr = "";
							if (input.file_path) {
								paramStr = input.file_path.split("/").pop() || input.file_path;
							} else if (input.command) {
								paramStr = input.command.slice(0, 60);
							}

							printVerbose(
								pc.yellow(`│ 🔧 ${toolName}`) + (paramStr ? pc.dim(` ${paramStr}`) : ""),
							);

							// Show params based on tool type
							if (
								(toolName === "Edit" || toolName === "edit") &&
								(input.old_string || input.new_string)
							) {
								if (input.file_path) {
									printVerbose(pc.dim(`│   file: ${input.file_path}`));
								}
								if (input.old_string) {
									printVerbose(pc.dim("│   ┌─ old_string ──────────────────────────────"));
									for (const line of input.old_string.split("\n")) {
										printVerbose(pc.red(`│   │ - ${line}`));
									}
									printVerbose(pc.dim("│   └───────────────────────────────────────────"));
								}
								if (input.new_string) {
									printVerbose(pc.dim("│   ┌─ new_string ──────────────────────────────"));
									for (const line of input.new_string.split("\n")) {
										printVerbose(pc.green(`│   │ + ${line}`));
									}
									printVerbose(pc.dim("│   └───────────────────────────────────────────"));
								}
							} else if ((toolName === "Write" || toolName === "write") && input.content) {
								printVerbose(pc.dim("│   ┌─ Content ───────────────────────────────────"));
								for (const line of input.content.split("\n")) {
									printVerbose(pc.dim(`│   │ ${line}`));
								}
								printVerbose(pc.dim("│   └───────────────────────────────────────────"));
							} else {
								for (const key of Object.keys(input)) {
									const value = input[key];
									if (typeof value === "string") {
										if (value.includes("\n")) {
											printVerbose(pc.dim(`│   ${key}:`));
											for (const line of value.split("\n")) {
												printVerbose(pc.dim(`│     ${line}`));
											}
										} else {
											printVerbose(pc.dim(`│   ${key}: "${value}"`));
										}
									} else if (value !== null && value !== undefined) {
										printVerbose(pc.dim(`│   ${key}: ${JSON.stringify(value)}`));
									}
								}
							}
						}
					}
				}
				writeToLogFile("STREAM", trimmed);
				return;
			}

			// Claude content_block_start - tool use beginning
			if (parsed.type === "content_block_start" && parsed.content_block?.type === "tool_use") {
				const toolName = parsed.content_block.name || "unknown";
				printVerbose(pc.yellow(`│ 🔧 ${toolName} (starting...)`));
				writeToLogFile("STREAM", trimmed);
				return;
			}

			// Claude content_block_delta - streaming text
			if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
				// For streaming text, we might want to accumulate it
				// For now, just log it
				writeToLogFile("STREAM", trimmed);
				return;
			}

			// Claude format: { tool: "...", name: "...", input: {...} }
			// Also handles: { type: "tool_use", name: "...", input: {...} }
			if (parsed.tool || (parsed.type === "tool_use" && parsed.name)) {
				const toolName = parsed.name || parsed.tool || "unknown";
				const input = parsed.input || parsed.arguments || {};

				// Build short param string for the header
				let paramStr = "";
				if (input.file_path) {
					const fileName = input.file_path.split("/").pop() || input.file_path;
					paramStr = fileName;
				} else if (input.command) {
					paramStr = input.command.slice(0, 60);
				} else if (input.pattern) {
					paramStr = input.pattern;
				} else if (input.path) {
					paramStr = input.path;
				}

				printVerbose(pc.yellow(`│ 🔧 ${toolName}`) + (paramStr ? pc.dim(` ${paramStr}`) : ""));

				// Show full input params
				if (toolName === "Edit" || toolName === "edit") {
					// Edit tool - show as diff
					if (input.file_path) {
						printVerbose(pc.dim(`│   file: ${input.file_path}`));
					}
					if (input.old_string) {
						printVerbose(pc.dim("│   ┌─ old_string ──────────────────────────────"));
						const oldLines = input.old_string.split("\n");
						for (const line of oldLines) {
							printVerbose(pc.red(`│   │ - ${line}`));
						}
						printVerbose(pc.dim("│   └───────────────────────────────────────────"));
					}
					if (input.new_string) {
						printVerbose(pc.dim("│   ┌─ new_string ──────────────────────────────"));
						const newLines = input.new_string.split("\n");
						for (const line of newLines) {
							printVerbose(pc.green(`│   │ + ${line}`));
						}
						printVerbose(pc.dim("│   └───────────────────────────────────────────"));
					}
				} else if ((toolName === "Write" || toolName === "write") && input.content) {
					// Write tool - show content
					printVerbose(pc.dim("│   ┌─ Content ───────────────────────────────────"));
					const lines = input.content.split("\n");
					for (const line of lines) {
						printVerbose(pc.dim(`│   │ ${line}`));
					}
					printVerbose(pc.dim("│   └───────────────────────────────────────────"));
				} else {
					// Other tools - show all params
					for (const key of Object.keys(input)) {
						const value = input[key];
						if (typeof value === "string") {
							if (value.includes("\n")) {
								printVerbose(pc.dim(`│   ${key}:`));
								const lines = value.split("\n");
								for (const line of lines) {
									printVerbose(pc.dim(`│     ${line}`));
								}
							} else {
								printVerbose(pc.dim(`│   ${key}: "${value}"`));
							}
						} else if (value !== null && value !== undefined) {
							printVerbose(pc.dim(`│   ${key}: ${JSON.stringify(value)}`));
						}
					}
				}
				writeToLogFile("STREAM", trimmed);
				return;
			}

			// Tool result (Claude format)
			if (parsed.type === "tool_result") {
				const success = !parsed.is_error;
				const toolId = parsed.tool_use_id || "";
				printVerbose(success ? pc.green(`│ ✓ Tool completed`) : pc.red(`│ ✗ Tool failed`));

				// Show result content if available
				if (parsed.content) {
					const content =
						typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed.content);
					if (content.length > 0) {
						const lines = content.split("\n");
						printVerbose(pc.dim("│   ┌─ Result ────────────────────────────────────"));
						for (const line of lines) {
							printVerbose(pc.dim(`│   │ ${line}`));
						}
						printVerbose(pc.dim("│   └───────────────────────────────────────────"));
					}
				}
				writeToLogFile("STREAM", trimmed);
				return;
			}

			// OpenCode step_finish - show token usage with engine/model
			if (parsed.type === "step_finish" && parsed.part?.tokens) {
				const tokens = parsed.part.tokens;
				let line = `│ 📊 Tokens: ${tokens.input} in / ${tokens.output} out`;
				if (currentEngine && currentModel) {
					line += ` │ 🤖 ${currentEngine} │ 📦 ${currentModel}`;
				}
				printVerbose(pc.dim(line));
				writeToLogFile("STREAM", trimmed);
				return;
			}

			// Claude message with usage - show token counts
			if (parsed.type === "message" && parsed.usage) {
				const inputTokens = parsed.usage.input_tokens || 0;
				const outputTokens = parsed.usage.output_tokens || 0;
				if (inputTokens > 0 || outputTokens > 0) {
					let line = `│ 📊 Tokens: ${inputTokens} in / ${outputTokens} out`;
					if (currentEngine && currentModel) {
						line += ` │ 🤖 ${currentEngine} │ 📦 ${currentModel}`;
					}
					printVerbose(pc.dim(line));
				}
				writeToLogFile("STREAM", trimmed);
				return;
			}

			// Error message
			if (parsed.type === "error") {
				const errorMsg = parsed.error?.message || parsed.message || "Unknown error";
				printVerbose(pc.red(`│ ❌ Error: ${errorMsg}`));
				writeToLogFile("STREAM", trimmed);
				return;
			}

			// Claude result - show token usage
			if (parsed.type === "result" && parsed.usage) {
				const inputTokens = parsed.usage.input_tokens || 0;
				const outputTokens = parsed.usage.output_tokens || 0;
				if (inputTokens > 0 || outputTokens > 0) {
					let line = `│ 📊 Tokens: ${inputTokens} in / ${outputTokens} out`;
					if (currentEngine && currentModel) {
						line += ` │ 🤖 ${currentEngine} │ 📦 ${currentModel}`;
					}
					printVerbose(pc.dim(line));
				}
				writeToLogFile("STREAM", trimmed);
				return;
			}

			// Final result without usage - skip (already shown in spinner)
			if (parsed.type === "result") {
				writeToLogFile("STREAM", trimmed);
				return;
			}

			// Unknown JSON type - log type for debugging, write full content to file
			if (parsed.type) {
				writeToLogFile("UNKNOWN_TYPE", `type=${parsed.type}: ${trimmed.slice(0, 200)}`);
			}
			writeToLogFile("STREAM", trimmed);
		} catch {
			// Not valid JSON, print as-is
			printVerbose(pc.dim("│ ") + trimmed);
			writeToLogFile("STREAM", trimmed);
		}
	} else {
		// Non-JSON output, print as-is
		printVerbose(pc.dim("│ ") + trimmed);
		writeToLogFile("STREAM", trimmed);
	}
}

/**
 * Format a task name for display (truncate if too long)
 */
export function formatTask(task: string, maxLen = 40): string {
	if (task.length <= maxLen) return task;
	return `${task.slice(0, maxLen - 3)}...`;
}

/**
 * Format duration in human readable format
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const secs = Math.floor(ms / 1000);
	const mins = Math.floor(secs / 60);
	const remainingSecs = secs % 60;
	if (mins === 0) return `${secs}s`;
	return `${mins}m ${remainingSecs}s`;
}

/**
 * Format token count
 */
export function formatTokens(input: number, output: number): string {
	const total = input + output;
	if (total === 0) return "";
	return pc.dim(`(${input.toLocaleString()} in / ${output.toLocaleString()} out)`);
}

// ============================================================================
// TUI Integration
// ============================================================================

/**
 * Initialize TUI module (call before using TUI features)
 */
export async function initTui(): Promise<void> {
	await getTuiModule();
}

/**
 * Start the TUI interface
 */
/**
 * Start the TUI interface
 */
export async function startTui(): Promise<void> {
	const tui = await getTuiModule();
	if (tui) {
		await tui.startTui();
	}
}

/**
 * Stop the TUI and clean up terminal state
 */
export async function stopTui(): Promise<void> {
	if (isTuiActive() && tuiModule) {
		tuiModule.stopTui();
	}
}

/**
 * Check if TUI should be used (TTY check)
 * Uses Boolean() to handle undefined isTTY values that occur in piped contexts
 */
export function shouldUseTui(): boolean {
	const stdinTTY = process.stdin.isTTY;
	const stdoutTTY = process.stdout.isTTY;
	return Boolean(stdinTTY) && Boolean(stdoutTTY);
}

/**
 * Update TUI spinner
 */
export function updateTuiSpinner(step: string): void {
	if (isTuiActive() && tuiModule) {
		tuiModule.updateSpinnerStep(step);
	}
}

/**
 * Start TUI spinner
 */
export function startTuiSpinner(step: string, engine?: string, model?: string): void {
	if (isTuiActive() && tuiModule) {
		tuiModule.startSpinner(step, engine, model);
	}
}

/**
 * Stop TUI spinner
 */
export function stopTuiSpinner(): void {
	if (isTuiActive() && tuiModule) {
		tuiModule.stopSpinner();
	}
}

/**
 * Wait for user input in TUI mode
 */
export async function waitForTuiInput(): Promise<string | null> {
	if (isTuiActive()) {
		return logStore.waitForInput();
	}
	return null;
}
