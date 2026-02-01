import { For, createMemo, createEffect, Show } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import { logStore, type LogEntry } from "../stores/log.ts";
import pc from "picocolors";

// Color mapping for log types
const typeColors: Record<LogEntry["type"], (s: string) => string> = {
	info: pc.blue,
	success: pc.green,
	warn: pc.yellow,
	error: pc.red,
	debug: pc.dim,
	ai: pc.cyan,
	tool: pc.yellow,
	stream: pc.dim,
	chat: pc.magenta,
};

const typeLabels: Record<LogEntry["type"], string> = {
	info: "[INFO]",
	success: "[OK]",
	warn: "[WARN]",
	error: "[ERROR]",
	debug: "[DEBUG]",
	ai: "",
	tool: "",
	stream: "",
	chat: "[CHAT]",
};

export function LogsPanel() {
	let scrollRef: ScrollBoxRenderable;

	const logs = logStore.logs;

	// Auto-scroll to bottom when new logs arrive
	createEffect(() => {
		const _ = logs(); // Track logs changes
		if (scrollRef && !scrollRef.isDestroyed) {
			// Use setTimeout to ensure render completes before scrolling
			setTimeout(() => {
				if (scrollRef && !scrollRef.isDestroyed) {
					scrollRef.scrollTo(scrollRef.scrollHeight);
				}
			}, 10);
		}
	});

	return (
		<scrollbox
			ref={(r: ScrollBoxRenderable) => (scrollRef = r)}
			flexGrow={1}
			stickyScroll={true}
			stickyStart="bottom"
		>
			<For each={logs()}>
				{(entry) => <LogEntryLine entry={entry} />}
			</For>
			<Show when={logs().length === 0}>
				<text fg="#666666">Waiting for tasks...</text>
			</Show>
		</scrollbox>
	);
}

function LogEntryLine(props: { entry: LogEntry }) {
	const colorFn = createMemo(() => typeColors[props.entry.type] || pc.white);
	const label = createMemo(() => typeLabels[props.entry.type]);

	// Format based on entry type
	const formatted = createMemo(() => {
		const { type, content, metadata } = props.entry;

		switch (type) {
			case "ai":
				// AI response - show in a box
				return formatAiResponse(content, metadata?.engine, metadata?.model);
			case "tool":
				// Tool call - show with icon
				return formatToolCall(content, metadata);
			case "stream":
				// Streaming content - dim
				return content;
			default:
				// Standard log with label
				return label() ? `${label()} ${content}` : content;
		}
	});

	return (
		<text fg={getFgColor(props.entry.type)}>
			{formatted()}
		</text>
	);
}

function getFgColor(type: LogEntry["type"]): string {
	switch (type) {
		case "info":
			return "#5c8fff";
		case "success":
			return "#50fa7b";
		case "warn":
			return "#f1fa8c";
		case "error":
			return "#ff5555";
		case "debug":
			return "#6272a4";
		case "ai":
			return "#8be9fd";
		case "tool":
			return "#ffb86c";
		case "stream":
			return "#6272a4";
		case "chat":
			return "#ff79c6"; // Dracula Pink/Magenta
		default:
			return "#f8f8f2";
	}
}

function formatAiResponse(content: string, engine?: string, model?: string): string {
	const lines = content.split("\n");
	let header = "--- AI Response";
	if (engine && model) {
		header += ` | ${engine} | ${model}`;
	}
	header += " ---";

	const formatted = [header, ...lines.map((line) => `| ${line}`), "---"];
	return formatted.join("\n");
}

function formatToolCall(
	content: string,
	metadata?: { toolName?: string; status?: "running" | "completed" | "error" },
): string {
	const icon = metadata?.status === "completed" ? "+" : metadata?.status === "error" ? "x" : "~";
	const toolName = metadata?.toolName || "tool";
	return `${icon} ${toolName} ${content}`;
}
