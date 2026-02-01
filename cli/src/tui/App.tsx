import { useTerminalDimensions, useKeyboard, useRenderer } from "@opentui/solid";
import { Show } from "solid-js";
import { TextAttributes } from "@opentui/core";
import { LogsPanel } from "./components/LogsPanel.tsx";
import { InputBox } from "./components/InputBox.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { logStore } from "./stores/log.ts";

interface AppProps {
	onExit: () => void;
}

// Cleanup terminal and exit (matching OpenCode pattern)
function cleanupAndExit(renderer: any, onExit: () => void) {
	// OpenCode pattern: just destroy and exit, library handles cleanup
	renderer.destroy();
	onExit();
	process.exit(0);
}

export function App(props: AppProps) {
	const dimensions = useTerminalDimensions();
	const renderer = useRenderer();

	// Disable stdout interception so we can still use console.log for debugging
	renderer.disableStdoutInterception();

	// Handle Ctrl+C at app level
	useKeyboard((evt) => {
		if (evt.ctrl && evt.name === "c") {
			// Cleanup and exit
			cleanupAndExit(renderer, props.onExit);
		}
	});

	return (
		<box
			width={dimensions().width}
			height={dimensions().height}
			backgroundColor="#0a0a0a"
			flexDirection="column"
		>
			{/* Header */}
			<box
				paddingLeft={1}
				paddingRight={1}
				flexShrink={0}
				backgroundColor="#1a1a2e"
			>
				<text fg="#8be9fd" attributes={TextAttributes.BOLD}>
					Ralphy
				</text>
				<text fg="#6272a4"> - Autonomous AI Coding Loop</text>
			</box>

			{/* Main content - scrollable logs */}
			<LogsPanel />

			{/* Sticky Last Input Display */}
			<Show when={logStore.lastInput()}>
				<box
					paddingLeft={1}
					paddingRight={1}
					paddingTop={0}
					paddingBottom={0}
					flexShrink={0}
					border={["top"]}
					borderColor="#333333"
				>
					<text fg="#6272a4">{"> "}</text>
					<text fg="#f8f8f2">{logStore.lastInput()}</text>
				</box>
			</Show>

			{/* Sticky AI Response Display */}
			<Show when={logStore.lastAiResponse()}>
				<box
					paddingLeft={1}
					paddingRight={1}
					paddingTop={0}
					paddingBottom={0}
					flexShrink={0}
					border={undefined}
					borderColor="#333333"
				>
					<text fg="#ff79c6">{"AI: "}</text>
					<text fg="#ff79c6">{logStore.lastAiResponse()}</text>
				</box>
			</Show>

			{/* Status bar with spinner */}
			<StatusBar />

			{/* Input box at bottom */}
			<InputBox />
		</box>
	);
}
