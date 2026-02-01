import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadBoundaries, loadProjectContext, loadRules } from "../config/loader.ts";
import { logDebug, logWarn } from "../ui/logger.ts";
import { getBrowserInstructions, isBrowserAvailable } from "./browser.ts";

/**
 * Check for global planning skills and inform the user
 */
function checkForGlobalPlanningSkills(): void {
	const globalSkillPaths = [
		join(homedir(), ".claude", "skills", "planning-with-files"),
		join(homedir(), ".opencode", "skills", "planning-with-files"),
	];

	for (const skillPath of globalSkillPaths) {
		if (existsSync(skillPath)) {
			logWarn(`Global planning skill detected: ${skillPath}`);
			logWarn("Ralphy will use its own built-in planning-with-files methodology.");
			logWarn("The agent may receive instructions from both sources.");
		}
	}
}

/**
 * Planning with Files prompt template - embedded for bundling with compiled binary
 */
const PLANNING_WITH_FILES_TEMPLATE = `## Planning Protocol (MANDATORY - DO THIS FIRST)

> **Context Window = RAM (volatile, limited)**
> **Filesystem = Disk (persistent, unlimited)**
> **→ Anything important gets written to disk**

**Before ANY implementation, you MUST create planning files. This is NON-NEGOTIABLE.**
**If you forget at the start, create them IMMEDIATELY when you realize.**

### Step 1: Create Session Directory
\`\`\`bash
mkdir -p {{sessionPath}}
\`\`\`

### Step 2: Create Planning Files
Create these 3 files in \`{{sessionPath}}/\`:

| File | Purpose |
|------|---------|
| \`task_plan.md\` | Phases, goals, decisions, error tracking |
| \`findings.md\` | Research, requirements, technical decisions |
| \`progress.md\` | Session log, test results, actions taken |

### File Templates

**task_plan.md:**
\`\`\`markdown
# Task Plan: [Brief Description]

## Goal
[One sentence describing the end state]

## Current Phase
Phase 1

## Phases
### Phase 1: Requirements & Discovery
- [ ] Understand user intent
- [ ] Identify constraints and requirements
- [ ] Document findings in findings.md
- **Status:** in_progress

### Phase 2: Planning & Structure
- [ ] Define technical approach
- [ ] Document decisions with rationale
- **Status:** pending

### Phase 3: Implementation
- [ ] Execute the plan step by step
- [ ] Test incrementally
- **Status:** pending

### Phase 4: Testing & Verification
- [ ] Verify all requirements met
- [ ] Document test results in progress.md
- **Status:** pending

### Phase 5: Delivery
- [ ] Review all output files
- [ ] Deliver to user
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|----------|-----------|

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
\`\`\`

**findings.md:**
\`\`\`markdown
# Findings & Decisions

## Requirements
- [Captured from user request]

## Research Findings
- [Key discoveries - update after every 2 view/search operations]

## Technical Decisions
| Decision | Rationale |
|----------|-----------|

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Resources
- [URLs, file paths, API references]
\`\`\`

**progress.md:**
\`\`\`markdown
# Progress Log

## Session: {{date}}

### Phase 1: [Title]
- **Status:** in_progress
- **Started:** [timestamp]
- Actions taken:
  - [Action 1]
- Files created/modified:
  - [file1]

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase X |
| Where am I going? | Remaining phases |
| What's the goal? | [goal statement] |
| What have I learned? | See findings.md |
| What have I done? | See above |
\`\`\`

### Planning Rules (MUST FOLLOW)

1. **Plan First**: Never start implementation without planning files
2. **2-Action Rule**: After every 2 view/search operations, save findings to findings.md immediately
3. **Pre-Decision Reading**: Re-read task_plan.md before major decisions to prevent goal drift
4. **Post-Action Updates**: Update progress.md after each phase, log actions taken
5. **Error Logging**: Log ALL errors to task_plan.md with attempt number and resolution
6. **Never Repeat Failures**: Track failed approaches, mutate strategy instead of repeating

### 3-Strike Error Protocol
- **Attempt 1**: Diagnose root cause, apply targeted fix
- **Attempt 2**: Try alternative method/approach
- **Attempt 3**: Broader rethink of assumptions
- **After 3 failures**: STOP and escalate to user with detailed explanation

### 5-Question Reboot Test
If context resets or resuming work, verify you can answer:
1. **Where am I?** → Current phase in task_plan.md
2. **Where am I going?** → Remaining phases
3. **What's the goal?** → Goal statement in task_plan.md
4. **What have I learned?** → See findings.md
5. **What have I done?** → See progress.md
`;

/**
 * Generate a URL-safe slug from a task title
 */
function generateTaskSlug(task: string): string {
	return task
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.substring(0, 50);
}

/**
 * Get the current date in YYYY-MM-DD format
 */
function getCurrentDate(): string {
	const now = new Date();
	return now.toISOString().split("T")[0];
}

/**
 * Planning with Files - Ralphy's internal methodology for persistent working memory.
 * This is MANDATORY for all tasks and ensures agents maintain context across tool calls.
 * Inspired by Manus AI's approach: Filesystem = Disk (persistent), Context = RAM (volatile)
 */
function getPlanningWithFilesInstructions(task: string): string {
	// Inform user if global planning skills exist
	checkForGlobalPlanningSkills();

	const date = getCurrentDate();
	const taskSlug = generateTaskSlug(task);
	const sessionPath = `.agent/sessions/${date}/${taskSlug}`;

	// Replace placeholders with actual values using embedded template
	const instructions = PLANNING_WITH_FILES_TEMPLATE.replace(
		/\{\{sessionPath\}\}/g,
		sessionPath,
	).replace(/\{\{date\}\}/g, date);

	// Debug logging (only shows with --verbose flag)
	logDebug("Planning-with-Files Instructions:");
	logDebug(`  Task: ${task}`);
	logDebug(`  Session Path: ${sessionPath}`);
	logDebug(`  Date: ${date}`);
	logDebug(`  Instructions:\n${instructions}`);

	return instructions;
}

interface PromptOptions {
	task: string;
	autoCommit?: boolean;
	workDir?: string;
	browserEnabled?: "auto" | "true" | "false";
	skipTests?: boolean;
	skipLint?: boolean;
	prdFile?: string;
}

// NOTE: Ralphy uses its own internal planning-with-files methodology.
// External agent skills (.claude/skills, .opencode/skills, etc.) are intentionally
// ignored to ensure consistent behavior across all engines and projects.
// The planning protocol is injected directly into prompts via getPlanningWithFilesInstructions().

/**
 * Build the full prompt with project context, rules, boundaries, and task
 */
export function buildPrompt(options: PromptOptions): string {
	const {
		task,
		autoCommit = true,
		workDir = process.cwd(),
		browserEnabled = "auto",
		skipTests = false,
		skipLint = false,
		prdFile,
	} = options;

	const parts: string[] = [];

	// MANDATORY: Planning with Files methodology - always first
	parts.push(getPlanningWithFilesInstructions(task));

	// Add project context if available
	const context = loadProjectContext(workDir);
	if (context) {
		parts.push(`## Project Context\n${context}`);
	}

	// Add rules if available
	const rules = loadRules(workDir);
	const codeChangeRules = [
		"Keep changes focused and minimal. Do not refactor unrelated code.",
		...rules,
	];
	if (codeChangeRules.length > 0) {
		parts.push(
			`## Rules (you MUST follow these)\n${codeChangeRules.map((r) => `- ${r}`).join("\n")}`,
		);
	}

	// Add boundaries - combine system boundaries with user-defined boundaries
	// System boundaries come first to ensure they are prominently visible
	const userBoundaries = loadBoundaries(workDir);
	const systemBoundaries = [
		prdFile || "the PRD file",
		".ralphy/progress.txt",
		".ralphy-worktrees",
		".ralphy-sandboxes",
	];
	const allBoundaries = [...systemBoundaries, ...userBoundaries];
	parts.push(
		`## Boundaries\nDo NOT modify these files/directories:\n${allBoundaries.map((b) => `- ${b}`).join("\n")}`,
	);

	// Add browser instructions if available
	if (isBrowserAvailable(browserEnabled)) {
		parts.push(getBrowserInstructions());
	}

	// Add the task
	parts.push(`## Task\n${task}`);

	// Add instructions
	const instructions = ["1. Implement the task described above"];

	let step = 2;
	if (!skipTests) {
		instructions.push(`${step}. Write tests for the feature`);
		step++;
		instructions.push(`${step}. Run tests and ensure they pass before proceeding`);
		step++;
	}

	if (!skipLint) {
		instructions.push(`${step}. Run linting and ensure it passes`);
		step++;
	}

	instructions.push(`${step}. Ensure the code works correctly`);
	step++;

	if (autoCommit) {
		instructions.push(
			`${step}. Stage and commit your changes with a descriptive message using conventional commits (feat:, fix:, test:, etc.)`,
		);
		step++;
		instructions.push(`${step}. Push your changes to the remote repository`);
	}

	parts.push(`## Instructions\n${instructions.join("\n")}`);

	return parts.join("\n\n");
}

interface ParallelPromptOptions {
	task: string;
	progressFile: string;
	prdFile?: string;
	workDir?: string;
	skipTests?: boolean;
	skipLint?: boolean;
	browserEnabled?: "auto" | "true" | "false";
	allowCommit?: boolean;
}

/**
 * Build a prompt for parallel agent execution
 */
export function buildParallelPrompt(options: ParallelPromptOptions): string {
	const {
		task,
		progressFile,
		prdFile,
		workDir = process.cwd(),
		skipTests = false,
		skipLint = false,
		browserEnabled = "auto",
		allowCommit = true,
	} = options;

	const browserSection = isBrowserAvailable(browserEnabled)
		? `\n\n${getBrowserInstructions()}`
		: "";

	// Load rules from config
	const rules = loadRules(workDir);
	const codeChangeRules = [
		"Keep changes focused and minimal. Do not refactor unrelated code.",
		...rules,
	];
	const rulesSection =
		codeChangeRules.length > 0
			? `\n\nRules (you MUST follow these):\n${codeChangeRules.map((r) => `- ${r}`).join("\n")}`
			: "";

	// Build boundaries section - combine system boundaries with user-defined boundaries
	// System boundaries come first to ensure they are prominently visible
	const userBoundaries = loadBoundaries(workDir);
	const systemBoundaries = [
		prdFile || "the PRD file",
		".ralphy/progress.txt",
		".ralphy-worktrees",
		".ralphy-sandboxes",
	];
	const allBoundaries = [...systemBoundaries, ...userBoundaries];
	const boundariesSection = `\n\nBoundaries - Do NOT modify:\n${allBoundaries.map((b) => `- ${b}`).join("\n")}\n\nDo NOT mark tasks complete - that will be handled separately.`;

	const instructions = ["1. Implement this specific task completely"];

	let step = 2;
	if (!skipTests) {
		instructions.push(`${step}. Write tests for the feature`);
		step++;
		instructions.push(`${step}. Run tests and ensure they pass before proceeding`);
		step++;
	}

	if (!skipLint) {
		instructions.push(`${step}. Run linting and ensure it passes`);
		step++;
	}

	instructions.push(`${step}. Update ${progressFile} with what you did`);
	step++;
	if (allowCommit) {
		instructions.push(
			`${step}. Stage and commit your changes with a descriptive message using conventional commits (feat:, fix:, test:, etc.)`,
		);
		step++;
		instructions.push(`${step}. Push your changes to the remote repository`);
	} else {
		instructions.push(`${step}. Do NOT run git commit; changes will be collected automatically`);
	}

	// Get planning instructions for this task
	const planningInstructions = getPlanningWithFilesInstructions(task);

	return `You are working on a specific task. Focus ONLY on this task:

TASK: ${task}

${planningInstructions}
${rulesSection}${boundariesSection}${browserSection}

Instructions:
${instructions.join("\n")}

Focus only on implementing: ${task}`;
}
