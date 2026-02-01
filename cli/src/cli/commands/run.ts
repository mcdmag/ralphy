import { existsSync } from "node:fs";
import { loadConfig } from "../../config/loader.ts";
import type { RuntimeOptions } from "../../config/types.ts";
import { createEngine, isEngineAvailable } from "../../engines/index.ts";
import type { AIEngineName } from "../../engines/types.ts";
import { isBrowserAvailable } from "../../execution/browser.ts";
import { runParallel } from "../../execution/parallel.ts";
import { type ExecutionResult, runSequential } from "../../execution/sequential.ts";
import { getDefaultBaseBranch } from "../../git/branch.ts";
import { sendNotifications } from "../../notifications/webhook.ts";
import { CachedTaskSource, createTaskSource } from "../../tasks/index.ts";
import {
	formatDuration,
	formatTokens,
	initTui,
	logDebug,
	logEngineInfo,
	logError,
	logInfo,
	logSuccess,
	setVerbose,
	shouldUseTui,
	startTui,
	stopTui,
	waitForTuiActive,
	waitForTuiInput,
} from "../../ui/logger.ts";
import { notifyAllComplete } from "../../ui/notify.ts";
import { buildActiveSettings } from "../../ui/settings.ts";

/**
 * Run the PRD loop (multiple tasks from file/GitHub)
 */
export async function runLoop(options: RuntimeOptions): Promise<void> {
	const workDir = process.cwd();
	const startTime = Date.now();
	const config = loadConfig(workDir);

	// Set verbose mode
	setVerbose(options.verbose);

	// Initialize TUI if in interactive mode
	const useTui = shouldUseTui() && !options.dryRun;

	const exitWithError = async (code = 1) => {
		if (useTui) {
			logInfo("Press Enter to exit...");
			await waitForTuiInput();
			// Stop TUI to restore terminal
			await stopTui();
		}
		process.exit(code);
	};

	if (options.verbose) {
		logDebug(`TUI check: shouldUseTui=${shouldUseTui()}, dryRun=${options.dryRun}, useTui=${useTui}`);
	}
	if (useTui) {
		try {
			await initTui();
			if (options.verbose) {
				logDebug("TUI initialized successfully");
			}
			// Start TUI in background - DON'T await it
			// The TUI runs concurrently while we continue with task processing
			// TUI will handle all display; task processing continues below
			const tuiPromise = startTui();

			// Handle TUI exit (Ctrl+C) to clean up
			tuiPromise.then(() => {
				process.exit(0);
			}).catch(async (err) => {
				console.error("[TUI] Error:", err);
				await exitWithError(1);
			});

			// Wait for TUI to be fully active before allowing logs to flow
			// This prevents logs from being lost or printing to console before TUI takes over
			await waitForTuiActive();
		} catch (err) {
			// TUI failed to initialize, fall back to console mode
			console.error("[TUI] Failed to initialize:", err);
		}
	}


	// Validate PRD source
	if (
		options.prdSource === "markdown" ||
		options.prdSource === "yaml" ||
		options.prdSource === "json"
	) {
		if (options.verbose) {
			logDebug(`PRD Check: Source=${options.prdSource}, File=${options.prdFile}`);
			logDebug(`CWD: ${process.cwd()}`);
			if (options.prdFile) {
				const resolved = await import("node:path").then((p) => p.resolve(options.prdFile));
				logDebug(`Resolved PRD Path: ${resolved}`);
				logDebug(`Exists: ${existsSync(options.prdFile)}`);
			}
		}

		if (!existsSync(options.prdFile)) {
			logError(`${options.prdFile} not found in current directory`);
			logInfo(`Create a ${options.prdFile} file with tasks`);
			await exitWithError(1);
		}
	} else if (options.prdSource === "markdown-folder") {
		if (!existsSync(options.prdFile)) {
			logError(`PRD folder ${options.prdFile} not found`);
			logInfo(`Create a ${options.prdFile}/ folder with markdown files containing tasks`);
			await exitWithError(1);
		}
	}

	if (options.prdSource === "github" && !options.githubRepo) {
		logError("GitHub repository not specified. Use --github owner/repo");
		await exitWithError(1);
	}

	// Check engine availability
	const engine = createEngine(options.aiEngine as AIEngineName);
	const available = await isEngineAvailable(options.aiEngine as AIEngineName);

	if (!available) {
		logError(`${engine.name} CLI not found. Make sure '${engine.cliCommand}' is in your PATH.`);
		await exitWithError(1);
	}

	// Create task source with caching for better performance
	// Caching reduces file I/O by loading tasks once and batching writes
	const innerTaskSource = createTaskSource({
		type: options.prdSource,
		filePath: options.prdFile,
		repo: options.githubRepo,
		label: options.githubLabel,
	});
	const taskSource = new CachedTaskSource(innerTaskSource);

	// Check if there are tasks
	const remaining = await taskSource.countRemaining();
	if (remaining === 0) {
		logSuccess("No tasks remaining. All done!");
		return;
	}

	// Get base branch if needed
	let baseBranch = options.baseBranch;
	if ((options.branchPerTask || options.parallel || options.createPr) && !baseBranch) {
		baseBranch = await getDefaultBaseBranch(workDir);

		// Check if base branch is empty (unborn branch - no commits yet)
		if (!baseBranch) {
			logError("Cannot run in parallel/branch mode: repository has no commits yet.");
			logInfo("Please make an initial commit first:");
			logInfo('  git add . && git commit -m "Initial commit"');
			await exitWithError(1);
		}
	}

	// Determine the actual model being used
	const actualModel = options.modelOverride || engine.defaultModel || "default";

	// Show engine info prominently
	const mode = options.parallel ? `Parallel (max ${options.maxParallel} agents)` : "Sequential";
	logEngineInfo({
		engine: engine.name,
		model: actualModel,
		tasks: remaining,
		mode,
		browserEnabled: isBrowserAvailable(options.browserEnabled),
		verbose: options.verbose,
	});

	// Build active settings for display
	const activeSettings = buildActiveSettings(options);

	// Run tasks
	let result: ExecutionResult;
	if (options.parallel) {
		result = await runParallel({
			engine,
			taskSource,
			workDir,
			skipTests: options.skipTests,
			skipLint: options.skipLint,
			dryRun: options.dryRun,
			maxIterations: options.maxIterations,
			maxRetries: options.maxRetries,
			retryDelay: options.retryDelay,
			branchPerTask: options.branchPerTask,
			baseBranch,
			createPr: options.createPr,
			draftPr: options.draftPr,
			autoCommit: options.autoCommit,
			browserEnabled: options.browserEnabled,
			maxParallel: options.maxParallel,
			prdSource: options.prdSource,
			prdFile: options.prdFile,
			prdIsFolder: options.prdIsFolder,
			activeSettings,
			useSandbox: options.useSandbox,
			modelOverride: options.modelOverride,
			skipMerge: options.skipMerge,
			engineArgs: options.engineArgs,
			syncIssue: options.syncIssue,
		});
	} else {
		result = await runSequential({
			engine,
			taskSource,
			workDir,
			skipTests: options.skipTests,
			skipLint: options.skipLint,
			dryRun: options.dryRun,
			maxIterations: options.maxIterations,
			maxRetries: options.maxRetries,
			retryDelay: options.retryDelay,
			branchPerTask: options.branchPerTask,
			baseBranch,
			createPr: options.createPr,
			draftPr: options.draftPr,
			autoCommit: options.autoCommit,
			browserEnabled: options.browserEnabled,
			activeSettings,
			prdFile: options.prdFile,
			modelOverride: options.modelOverride,
			skipMerge: options.skipMerge,
			engineArgs: options.engineArgs,
			syncIssue: options.syncIssue,
			verbose: options.verbose,
		});
	}

	// Flush any pending task completions to disk and cleanup
	await taskSource.flush();
	taskSource.dispose();

	// Summary
	const duration = Date.now() - startTime;
	const summaryLines = [
		"",
		"=".repeat(50),
		"Summary:",
		`  Completed: ${result.tasksCompleted}`,
		`  Failed:    ${result.tasksFailed}`,
		`  Duration:  ${formatDuration(duration)}`,
	];
	if (result.totalInputTokens > 0 || result.totalOutputTokens > 0) {
		summaryLines.push(`  Tokens:    ${formatTokens(result.totalInputTokens, result.totalOutputTokens)}`);
	}
	summaryLines.push("=".repeat(50));

	// Log summary (will go to TUI if active, otherwise console)
	for (const line of summaryLines) {
		logInfo(line);
	}

	// Send webhook notifications
	const status = result.tasksFailed > 0 ? "failed" : "completed";
	await sendNotifications(config, status, {
		tasksCompleted: result.tasksCompleted,
		tasksFailed: result.tasksFailed,
	});

	if (result.tasksCompleted > 0) {
		notifyAllComplete(result.tasksCompleted);
	}

	if (result.tasksFailed > 0) {
		await exitWithError(1);
	}

	if (useTui) {
		logInfo("Press Enter to finish...");
		await waitForTuiInput();
		await stopTui();
	}
}
