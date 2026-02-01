import { createSignal, Show, onMount } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import type { TextareaRenderable } from "@opentui/core";
import { logStore } from "../stores/log.ts";

export function InputBox() {
	const [historyIndex, setHistoryIndex] = createSignal(-1);
	let textareaRef: TextareaRenderable;

	const inputState = logStore.input;

	// Handle keyboard shortcuts
	useKeyboard((evt) => {
		if (!inputState().visible) return;

		// Handle Ctrl+C - cancel/skip
		if (evt.ctrl && evt.name === "c") {
			logStore.submitInput(null);
			if (textareaRef) {
				textareaRef.clear();
			}
			return;
		}

		// Handle Enter - submit
		if (evt.name === "return" || evt.name === "enter") {
			if (textareaRef) {
				const text = textareaRef.plainText.trim();
				logStore.submitInput(text || null);
				textareaRef.clear();
				setHistoryIndex(-1);
			}
			return;
		}

		// Handle Up arrow - history navigation
		if (evt.name === "up" && textareaRef) {
			const history = inputState().history;
			const newIndex = Math.min(historyIndex() + 1, history.length - 1);
			if (newIndex >= 0 && newIndex < history.length) {
				setHistoryIndex(newIndex);
				const histText = history[history.length - 1 - newIndex];
				textareaRef.clear();
				textareaRef.insertText(histText);
			}
			evt.preventDefault();
			return;
		}

		// Handle Down arrow - history navigation
		if (evt.name === "down" && textareaRef) {
			const history = inputState().history;
			const newIndex = historyIndex() - 1;
			if (newIndex < 0) {
				setHistoryIndex(-1);
				textareaRef.clear();
			} else {
				setHistoryIndex(newIndex);
				const histText = history[history.length - 1 - newIndex];
				textareaRef.clear();
				textareaRef.insertText(histText);
			}
			evt.preventDefault();
			return;
		}
	});

	return (
		<Show when={inputState().visible}>
			<box
				border={["top"]}
				borderColor="#444444"
				paddingTop={0}
				paddingBottom={0}
				paddingLeft={1}
				flexShrink={0}
				flexDirection="row"
			>
				<text fg="#50fa7b" flexShrink={0}>{"> "}</text>
				<textarea
					ref={(r: TextareaRenderable) => {
						textareaRef = r;
					}}
					focused
					height={1}
					flexGrow={1}
					focusedTextColor="#f8f8f2"
					cursorColor="#50fa7b"
					placeholder={inputState().placeholder}
					placeholderColor="#666666"
				/>
			</box>
		</Show>
	);
}
