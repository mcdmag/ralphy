import { exec } from "node:child_process";
import { logTaskProgress } from "../config/writer.ts";
import type { AIEngine, AIResult } from "../engines/types.ts";
import { createTaskBranch, returnToBaseBranch } from "../git/branch.ts";
import { syncPrdToIssue } from "../git/issue-sync.ts";
import { createPullRequest } from "../git/pr.ts";
import type { Task, TaskSource } from "../tasks/types.ts";
import { cleanupInputListener, initInputListener, promptForUserInput } from "../ui/input.ts";
import {
	endAgentSession,
	initFileLogging,
	logAgentRequest,
	logAgentResponse,
	logDebug,
	logError,
	logInfo,
	logSuccess,
	logVerbosePrompt,
	logVerboseStream,
	logWarn,
	setCurrentEngineInfo,
	startAgentSession,
} from "../ui/logger.ts";
import { notifyTaskComplete, notifyTaskFailed } from "../ui/notify.ts";
import { ProgressSpinner } from "../ui/spinner.ts";
import { clearDeferredTask, recordDeferredTask } from "./deferred.ts";
import { type ModelFallbackManager, createModelFallbackManager } from "./model-fallback.ts";
import { buildPrompt } from "./prompt.ts";
import { isFatalError, isRetryableError, sleep, withRetry } from "./retry.ts";

export interface ExecutionOptions {
	engine: AIEngine;
	taskSource: TaskSource;
	workDir: string;
	skipTests: boolean;
	skipLint: boolean;
	dryRun: boolean;
	maxIterations: number;
	maxRetries: number;
	retryDelay: number;
	branchPerTask: boolean;
	baseBranch: string;
	createPr: boolean;
	draftPr: boolean;
	autoCommit: boolean;
	browserEnabled: "auto" | "true" | "false";
	prdFile?: string;
	/** Active settings to display in spinner */
	activeSettings?: string[];
	/** Override default model for the engine */
	modelOverride?: string;
	/** Skip automatic branch merging after parallel execution */
	skipMerge?: boolean;
	/** Use lightweight sandboxes instead of git worktrees for parallel execution */
	useSandbox?: boolean;
	/** Additional arguments to pass to the engine CLI */
	engineArgs?: string[];
	/** GitHub issue number to sync PRD with on each iteration */
	syncIssue?: number;
	/** Enable verbose output (show AI streaming responses) */
	verbose?: boolean;
}

export interface ExecutionResult {
	tasksCompleted: number;
	tasksFailed: number;
	totalInputTokens: number;
	totalOutputTokens: number;
}

/**
 * Run tasks sequentially
 */
export async function runSequential(options: ExecutionOptions): Promise<ExecutionResult> {
	const {
		engine,
		taskSource,
		workDir,
		skipTests,
		skipLint,
		dryRun,
		maxIterations,
		maxRetries,
		retryDelay,
		branchPerTask,
		baseBranch,
		createPr,
		draftPr,
		autoCommit,
		browserEnabled,
		activeSettings,
		modelOverride,
		engineArgs,
		syncIssue,
		verbose,
	} = options;

	// Initialize file logging
	initFileLogging(workDir);
	logInfo(`Logs directory: ${workDir}/.ralphy/logs/`);

	// Check if interactive mode is available
	const isInteractive = process.stdin.isTTY && !dryRun;

	// Initialize persistent input listener for interactive mode
	if (isInteractive) {
		initInputListener();
	}

	// Initialize model fallback manager (Opus -> Gemini with 5min retry)
	const fallbackManager = createModelFallbackManager(engine.name.toLowerCase());

	const result: ExecutionResult = {
		tasksCompleted: 0,
		tasksFailed: 0,
		totalInputTokens: 0,
		totalOutputTokens: 0,
	};

	let iteration = 0;
	let abortDueToRetryableFailure = false;

	// Feedback collected from chat during execution
	let collectedFeedback: string[] = [];
	const onFeedback = (feedback: string) => {
		collectedFeedback.push(feedback);
	};

	while (true) {
		// Process any queued user chat messages (Interleaved Chat)
		await processChatQueue(engine, workDir, verbose, activeSettings, modelOverride, engineArgs, onFeedback, null);

		// Check iteration limit
		if (maxIterations > 0 && iteration >= maxIterations) {
			logInfo(`Reached max iterations (${maxIterations})`);
			break;
		}

		// Get next task
		const task = await taskSource.getNextTask();
		if (!task) {
			logSuccess("All tasks completed!");
			break;
		}

		// Reset feedback for new task (or keep it if it was relevant to next task?)
		// Better to keep it and apply to next task prompt?
		// For now, let's keep it until consumed.

		iteration++;
		const remaining = await taskSource.countRemaining();
		logInfo(`Task ${iteration}: ${task.title} (${remaining} remaining)`);

		// Create branch if needed
		let branch: string | null = null;
		if (branchPerTask && baseBranch) {
			try {
				branch = await createTaskBranch(task.title, baseBranch, workDir);
				logDebug(`Created branch: ${branch}`);
			} catch (error) {
				logError(`Failed to create branch: ${error}`);
			}
		}

		// Build prompt
		const prompt = buildPrompt({
			task: task.body || task.title,
			autoCommit,
			workDir,
			browserEnabled,
			skipTests,
			skipLint,
			prdFile: options.prdFile,
		});

		// Execute with spinner
		const spinner = new ProgressSpinner(task.title, activeSettings);
		let aiResult: AIResult | null = null;

		// Start agent session for logging
		const sessionId = startAgentSession(task.title);
		logDebug(`Session ${sessionId} started for task: ${task.title}`);

		if (dryRun) {
			spinner.success("(dry run) Skipped");
			endAgentSession(true);
		} else {
			try {
				// Log the request/prompt being sent
				logAgentRequest(prompt, engine.name);

				// Get current model from fallback manager (handles Opus -> Gemini fallback)
				const currentModel = modelOverride || fallbackManager.getCurrentModel();
				setCurrentEngineInfo(engine.name, currentModel);

				// In verbose mode, display the prompt
				if (verbose) {
					logVerbosePrompt(prompt, engine.name);
				}

				aiResult = await withRetry(
					async () => {
						spinner.updateStep("Working");

						// Get the model to use (may change during retries due to fallback)
						const modelToUse = modelOverride || fallbackManager.getCurrentModel();

						// Use streaming if available
						const engineOptions = {
							modelOverride: modelToUse,
							...(engineArgs && engineArgs.length > 0 && { engineArgs }),
						};

						// Buffer to hold recent stream output for chat context
						let streamBuffer = "";

						if (engine.executeStreaming) {
							return await engine.executeStreaming(
								prompt,
								workDir,
								async (step, rawLine) => {
									spinner.updateStep(step);
									// In verbose mode, print streaming output
									if (verbose && rawLine) {
										logVerboseStream(rawLine);
										// Append to buffer for chat context
										streamBuffer += rawLine + "\n";
									}

									// Poll chat queue concurrently during streaming
									// Fire-and-forget to avoid blocking the stream
									processChatQueue(engine, workDir, verbose, activeSettings, modelOverride, engineArgs, onFeedback, task, streamBuffer).catch(err => {
										logError(`Concurrent chat failed: ${err}`);
									});
								},
								engineOptions,
							);
						}

						const res = await engine.execute(prompt, workDir, engineOptions);

						// Check if this is a rate limit error and handle fallback
						if (!res.success && res.error) {
							const fallbackResult = fallbackManager.handleError(res.error);
							if (fallbackResult.shouldRetry && fallbackResult.newModel) {
								// Update display to show new model
								setCurrentEngineInfo(engine.name, fallbackResult.newModel);
								throw new Error(res.error); // Trigger retry with new model
							}
							if (isRetryableError(res.error)) {
								throw new Error(res.error);
							}
						}

						return res;
					},
					{
						maxRetries,
						retryDelay,
						onRetry: (attempt) => {
							const currentModel = fallbackManager.getCurrentModel();
							spinner.updateStep(`Retry ${attempt} (${currentModel.split("/").pop()})`);
						},
					},
				);

				// Record success for fallback tracking
				if (aiResult.success) {
					const usedModel = modelOverride || fallbackManager.getCurrentModel();
					fallbackManager.recordSuccess(usedModel);
				}

				// Log the response
				logAgentResponse(
					aiResult.response || "",
					engine.name,
					aiResult.success,
					aiResult.inputTokens,
					aiResult.outputTokens,
				);

				if (aiResult.success) {
					spinner.success(undefined, true); // Show timing breakdown
					result.totalInputTokens += aiResult.inputTokens;
					result.totalOutputTokens += aiResult.outputTokens;

					// End agent session successfully
					endAgentSession(true);

					// Mark task complete
					await taskSource.markComplete(task.id);
					logTaskProgress(task.title, "completed", workDir);
					result.tasksCompleted++;

					// Sync PRD to GitHub issue if configured
					if (syncIssue && options.prdFile) {
						await syncPrdToIssue(options.prdFile, syncIssue, workDir);
					}

					notifyTaskComplete(task.title);
					clearDeferredTask(taskSource.type, task, workDir, options.prdFile);

					// Create PR if needed
					if (createPr && branch && baseBranch) {
						const prUrl = await createPullRequest(
							branch,
							baseBranch,
							task.title,
							`Automated PR created by Ralphy\n\n${aiResult.response}`,
							draftPr,
							workDir,
						);

						if (prUrl) {
							logSuccess(`PR created: ${prUrl}`);
						}
					}

					// 4. Prompt for user input or verification (Interleaved Chat Feedback Auto-Apply)
					if (isInteractive) {
						let userInput: string | null = null;

						// If we have feedback collected during the task, use it as input!
						if (collectedFeedback.length > 0) {
							userInput = collectedFeedback.join("\n");
							logInfo("Applying feedback received during task execution:");
							logInfo(`> ${userInput}`);
							collectedFeedback = []; // Clear applied feedback
						} else {
							userInput = await promptForUserInput();
						}

						if (userInput) {
							logInfo("Processing your message...");
							const userPrompt = `## User Message\n\nThe user has sent the following message after the previous task completed.\n\n### User Message:\n${userInput}\n\n### Previous Task:\n${task.title}\n\nPlease address the user's message.`;

							const userSpinner = new ProgressSpinner("User Message", activeSettings);
							const engineOpts = {
								...(modelOverride && { modelOverride }),
								...(engineArgs && engineArgs.length > 0 && { engineArgs }),
							};

							try {
								setCurrentEngineInfo(
									engine.name,
									modelOverride || engine.defaultModel || "default",
								);
								if (verbose) {
									logVerbosePrompt(userPrompt, engine.name);
								}

								let userResult: AIResult;
								if (engine.executeStreaming) {
									userResult = await engine.executeStreaming(
										userPrompt,
										workDir,
										(step, rawLine) => {
											userSpinner.updateStep(step);
											if (verbose && rawLine) {
												logVerboseStream(rawLine);
											}
										},
										engineOpts,
									);
								} else {
									userResult = await engine.execute(userPrompt, workDir, engineOpts);
								}

								if (userResult.success) {
									userSpinner.success();
									result.totalInputTokens += userResult.inputTokens;
									result.totalOutputTokens += userResult.outputTokens;
								} else {
									userSpinner.error(userResult.error || "Failed");
								}
							} catch (error) {
								userSpinner.error(error instanceof Error ? error.message : String(error));
							}
						}
					}
				} else {
					const errMsg = aiResult.error || "Unknown error";
					// End agent session with failure
					endAgentSession(false, errMsg);

					if (isRetryableError(errMsg)) {
						const deferrals = recordDeferredTask(taskSource.type, task, workDir, options.prdFile);
						spinner.error(errMsg);
						if (deferrals >= maxRetries) {
							logError(`Task "${task.title}" failed after ${deferrals} deferrals: ${errMsg}`);
							logTaskProgress(task.title, "failed", workDir);
							result.tasksFailed++;
							notifyTaskFailed(task.title, errMsg);
							// Don't mark task complete - leave it unchecked so user can retry
							clearDeferredTask(taskSource.type, task, workDir, options.prdFile);
						} else {
							logWarn(`Temporary failure, stopping early (${deferrals}/${maxRetries}): ${errMsg}`);
							result.tasksFailed++;
							abortDueToRetryableFailure = true;
						}
					} else if (isFatalError(errMsg)) {
						// Fatal error (auth, config) - abort all remaining tasks
						spinner.error(errMsg);
						logError(`Fatal error: ${errMsg}`);
						logError("Aborting remaining tasks due to configuration/authentication issue.");
						result.tasksFailed++;
						notifyTaskFailed(task.title, errMsg);
						// Don't mark task complete - leave it unchecked so user can retry
						cleanupInputListener();
						return result; // Exit immediately
					} else {
						// Unknown error - don't mark complete, let user investigate and retry
						spinner.error(errMsg);
						logError(`Task "${task.title}" failed: ${errMsg}`);
						logTaskProgress(task.title, "failed", workDir);
						result.tasksFailed++;
						notifyTaskFailed(task.title, errMsg);
						// Don't mark task complete - leave it unchecked so user can retry
						clearDeferredTask(taskSource.type, task, workDir, options.prdFile);
						// Stop processing to let user investigate
						abortDueToRetryableFailure = true;
					}
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				// End agent session with failure
				endAgentSession(false, errorMsg);

				if (isRetryableError(errorMsg)) {
					const deferrals = recordDeferredTask(taskSource.type, task, workDir, options.prdFile);
					spinner.error(errorMsg);
					if (deferrals >= maxRetries) {
						logError(`Task "${task.title}" failed after ${deferrals} deferrals: ${errorMsg}`);
						logTaskProgress(task.title, "failed", workDir);
						result.tasksFailed++;
						notifyTaskFailed(task.title, errorMsg);
						// Don't mark task complete - leave it unchecked so user can retry
						clearDeferredTask(taskSource.type, task, workDir, options.prdFile);
					} else {
						logWarn(`Temporary failure, stopping early (${deferrals}/${maxRetries}): ${errorMsg}`);
						result.tasksFailed++;
						abortDueToRetryableFailure = true;
					}
				} else if (isFatalError(errorMsg)) {
					// Fatal error (auth, config) - abort all remaining tasks
					spinner.error(errorMsg);
					logError(`Fatal error: ${errorMsg}`);
					logError("Aborting remaining tasks due to configuration/authentication issue.");
					result.tasksFailed++;
					notifyTaskFailed(task.title, errorMsg);
					cleanupInputListener();
					return result; // Exit immediately
				} else {
					// Unknown error - don't mark complete, let user investigate and retry
					spinner.error(errorMsg);
					logError(`Task "${task.title}" failed: ${errorMsg}`);
					logTaskProgress(task.title, "failed", workDir);
					result.tasksFailed++;
					notifyTaskFailed(task.title, errorMsg);
					// Don't mark task complete - leave it unchecked so user can retry
					clearDeferredTask(taskSource.type, task, workDir, options.prdFile);
					// Stop processing to let user investigate
					abortDueToRetryableFailure = true;
				}
			}
		}

		// Return to base branch if we created one
		if (branchPerTask && baseBranch) {
			await returnToBaseBranch(baseBranch, workDir);
		}

		if (abortDueToRetryableFailure) {
			break;
		}
	}

	// Cleanup input listener
	cleanupInputListener();

	return result;
}

/**
 * Process any queued user chat messages
 */
async function processChatQueue(
	engine: AIEngine,
	workDir: string,
	verbose: boolean | undefined,
	activeSettings: string[] | undefined,
	modelOverride: string | undefined,
	engineArgs: string[] | undefined,
	onFeedback: (feedback: string) => void,
	currentTask?: Task | null,
	recentOutput?: string,
) {
	// Dynamically import logStore to avoid circular dependencies if possible
	const { logStore } = await import("../tui/stores/log.ts");

	let userMessage = logStore.popInputQueue();
	while (userMessage) {
		logInfo("Processing user chat message...");
		logInfo(`> ${userMessage}`);

		// Distinct log
		logStore.addLog("debug", "AI is thinking (Chat)...");

		const engineOpts = {
			modelOverride: modelOverride || engine.defaultModel || "default",
			...(engineArgs && engineArgs.length > 0 && { engineArgs }),
		};

		try {
			// Construct context string from current task
			let taskContext = "Idle (No active task)";
			if (currentTask) {
				taskContext = `Active Task: ${currentTask.title}\nDescription: ${currentTask.body || "N/A"}`;
				// Task interface doesn't have files property currently
			}

			// Capture recent output context (last 2000 chars to avoid token limits)
			let outputContext = "";
			if (recentOutput) {
				const truncated = recentOutput.length > 2000 ? "..." + recentOutput.slice(-2000) : recentOutput;
				outputContext = `\n### Recent Code Generation / Output:\n\`\`\`\n${truncated}\n\`\`\``;
			}

			// Context prompt to give AI some awareness
			const chatPrompt = `## User Chat Message\n\nYou are Ralphy, an autonomous AI coding agent. \n\nCURRENT STATUS: You are currently BUSY executing a batch of tasks in the background.\n\n### Current Task Context:\n${taskContext}${outputContext}\n\nThe user has sent a chat message while you are working on this.\n\n### User Message:\n${userMessage}\n\n### Instructions:\n1. If the user is asking a QUESTION (e.g. "what are you doing?"), answer it concisely using the Task Context AND Recent Output.\n2. If the user is giving an INSTRUCTION to change the code/task (e.g. "Make the button blue", "Skip tests"), you must capture it for the main agent.\n   - Output the instruction in a block: \`\`\`FEEDBACK\nInstruction here\n\`\`\`\n   - Tell the user: "Noted. I will apply this correction after the current step."\n3. Do NOT say "I am waiting for your command".\n4. Do NOT execute bash commands.`;

			if (verbose) {
				logVerbosePrompt(chatPrompt, engine.name);
			}

			let result: AIResult;
			// Use generic execute for chat to keep it simple, or streaming if preferred
			// call execute directly
			if (engine.executeStreaming) {
				// Use streaming but ignore spinner updates, just capture result
				result = await engine.executeStreaming(
					chatPrompt,
					workDir,
					() => { }, // No-op progress callback
					engineOpts,
				);
			} else {
				result = await engine.execute(chatPrompt, workDir, engineOpts);
			}

			if (result.success) {
				// Log with distinctive purple "CHAT" style
				logStore.addLog("chat", result.response);

				// Update sticky AI response in TUI
				logStore.setAiResponse(result.response);

				// Parse and collect feedback
				const feedbackMatch = result.response.match(/```FEEDBACK\n([\s\S]*?)\n```/);
				if (feedbackMatch) {
					const feedback = feedbackMatch[1].trim();
					logStore.addLog("warn", `Feedback captured: "${feedback}". Will apply after current task.`);
					onFeedback(feedback);
				}

			} else {
				logError(`Chat failed: ${result.error}`);
				logStore.addLog("error", `Chat failed: ${result.error}`);
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			logError(`Chat error: ${msg}`);
			logStore.addLog("error", `Chat error: ${msg}`);
		}

		// Check for more messages
		userMessage = logStore.popInputQueue();
	}
}
