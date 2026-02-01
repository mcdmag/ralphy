import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import { logStore } from "../stores/log.ts";

// Spinner frames (same as nanospinner)
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function StatusBar() {
	const [frameIndex, setFrameIndex] = createSignal(0);
	const [elapsed, setElapsed] = createSignal(0);

	const spinner = logStore.spinner;

	// Animate spinner
	createEffect(() => {
		if (!spinner().active) return;

		const frameInterval = setInterval(() => {
			setFrameIndex((prev) => (prev + 1) % spinnerFrames.length);
		}, 80);

		const elapsedInterval = setInterval(() => {
			setElapsed(Math.floor((Date.now() - spinner().startTime) / 1000));
		}, 1000);

		onCleanup(() => {
			clearInterval(frameInterval);
			clearInterval(elapsedInterval);
		});
	});

	const formatElapsed = () => {
		const secs = elapsed();
		if (secs < 60) return `${secs}s`;
		const mins = Math.floor(secs / 60);
		const remainingSecs = secs % 60;
		return `${mins}m ${remainingSecs}s`;
	};

	return (
		<box
			border={["top"]}
			borderColor="#444444"
			paddingLeft={1}
			flexShrink={0}
			flexDirection="row"
			gap={2}
		>
			<Show
				when={spinner().active}
				fallback={
					<text fg="#50fa7b">
						<span style={{ bold: true }}>{">"}</span> Ready
					</text>
				}
			>
				<text fg="#f1fa8c">
					<span style={{ fg: "#ff79c6" }}>{spinnerFrames[frameIndex()]}</span>
					{" "}
					{spinner().step}
					{" "}
					<span style={{ fg: "#6272a4" }}>[{formatElapsed()}]</span>
				</text>
				<Show when={spinner().engine && spinner().model}>
					<text fg="#6272a4">
						| {spinner().engine} | {spinner().model}
					</text>
				</Show>
			</Show>
		</box>
	);
}
