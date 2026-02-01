## Planning Protocol (MANDATORY - DO THIS FIRST)

> **Context Window = RAM (volatile, limited)**
> **Filesystem = Disk (persistent, unlimited)**
> **→ Anything important gets written to disk**

**Before ANY implementation, you MUST create planning files. This is NON-NEGOTIABLE.**
**If you forget at the start, create them IMMEDIATELY when you realize.**

### Step 1: Create Session Directory
```bash
mkdir -p {{sessionPath}}
```

### Step 2: Create Planning Files
Create these 3 files in `{{sessionPath}}/`:

| File | Purpose |
|------|---------|
| `task_plan.md` | Phases, goals, decisions, error tracking |
| `findings.md` | Research, requirements, technical decisions |
| `progress.md` | Session log, test results, actions taken |

### File Templates

**task_plan.md:**
```markdown
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
- [ ] Stage and commit changes
- [ ] Deliver to user
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|----------|-----------|

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
```

**findings.md:**
```markdown
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
```

**progress.md:**
```markdown
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
```

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
