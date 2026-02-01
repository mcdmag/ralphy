# Planning-with-Files Methodology

Ralphy's integrated approach to persistent AI working memory, inspired by Manus AI's context engineering.

## Core Principle

> **Context Window = RAM (volatile, limited)**
> **Filesystem = Disk (persistent, unlimited)**
> **→ Anything important gets written to disk**

AI agents have limited context windows. After many tool calls, they can:
- Forget original goals (goal drift)
- Lose visual/browser findings
- Repeat the same errors
- Get confused by accumulated context

Planning-with-Files solves this by treating the filesystem as extended memory.

---

## The 3-File Pattern

For every task, Ralphy instructs agents to create:

```
.agent/sessions/{YYYY-MM-DD}/{task-slug}/
├── task_plan.md    # The roadmap
├── findings.md     # The knowledge base
└── progress.md     # The session log
```

### task_plan.md

Your roadmap and error tracker:

```markdown
# Task Plan: Add User Authentication

## Goal
Implement secure user authentication with JWT tokens

## Current Phase
Phase 3

## Phases

### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify constraints
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Define technical approach
- [x] Document decisions
- **Status:** complete

### Phase 3: Implementation
- [ ] Create auth endpoints
- [ ] Add JWT middleware
- [ ] Write tests
- **Status:** in_progress

### Phase 4: Testing & Verification
- [ ] Verify all requirements
- [ ] Document test results
- **Status:** pending

### Phase 5: Delivery
- [ ] Review output
- [ ] Deliver to user
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use JWT over sessions | Stateless, scalable |
| bcrypt for passwords | Industry standard |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Token expiry issue | 1 | Added refresh token flow |
| CORS blocked | 2 | Updated middleware config |
```

### findings.md

Your knowledge base:

```markdown
# Findings & Decisions

## Requirements
- JWT-based authentication
- Refresh token support
- Password hashing with bcrypt
- Protected route middleware

## Research Findings
- Existing auth pattern in src/middleware/
- User model already has password field
- Frontend expects token in Authorization header

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Use existing User model | Already has required fields |
| Store refresh tokens in DB | More secure than localStorage |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| No email service | Used existing SMTP config |

## Resources
- src/middleware/auth.ts (existing pattern)
- src/models/User.ts (user model)
- https://jwt.io/introduction (JWT docs)
```

### progress.md

Your session log:

```markdown
# Progress Log

## Session: 2026-01-31

### Phase 1: Requirements
- **Status:** complete
- **Started:** 10:00
- Actions taken:
  - Reviewed existing auth code
  - Identified User model structure
  - Documented requirements in findings.md
- Files created/modified:
  - findings.md (created)

### Phase 2: Planning
- **Status:** complete
- **Started:** 10:30
- Actions taken:
  - Designed JWT flow
  - Selected bcrypt for hashing
  - Planned file structure
- Files created/modified:
  - task_plan.md (updated decisions)

### Phase 3: Implementation
- **Status:** in_progress
- **Started:** 11:00
- Actions taken:
  - Created auth controller
  - Added JWT middleware
- Files created/modified:
  - src/controllers/auth.ts (created)
  - src/middleware/jwt.ts (created)

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| Login | valid creds | JWT token | JWT token | ✓ |
| Login | invalid | 401 error | 401 error | ✓ |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 11:45 | Token verification failed | 1 | Fixed secret key loading |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 3: Implementation |
| Where am I going? | Phase 4: Testing |
| What's the goal? | JWT auth with refresh tokens |
| What have I learned? | See findings.md |
| What have I done? | Created auth controller, JWT middleware |
```

---

## The 6 Rules

### Rule 1: Plan First (NON-NEGOTIABLE)

**Never start ANY task without creating planning files first.**

- Create the session directory
- Create all 3 files BEFORE implementation
- If you forget, create them IMMEDIATELY when you realize

### Rule 2: The 2-Action Rule

**After every 2 view/browser/search operations, save findings.**

Visual content (images, browser results) doesn't persist in context. Capture it as text immediately.

```
View file → Search code → SAVE TO FINDINGS.MD
View image → Read docs → SAVE TO FINDINGS.MD
```

### Rule 3: Pre-Decision Reading

**Before major decisions, re-read task_plan.md.**

This keeps goals in focus and prevents drift after many tool calls.

### Rule 4: Post-Action Updates

**After each phase or significant action:**

- Update phase status in task_plan.md
- Log actions in progress.md
- Document new findings

### Rule 5: Error Logging

**Every error goes in the plan file.**

Log:
- The error message
- Attempt number
- Resolution applied

This builds knowledge and prevents repetition.

### Rule 6: Never Repeat Failures

**Track failed approaches and mutate strategy.**

Don't repeat the same failing action. If something didn't work:
1. Log it
2. Try a different approach
3. After 3 attempts, escalate

---

## 3-Strike Error Protocol

Structured approach to handling failures:

| Attempt | Action |
|---------|--------|
| 1 | Diagnose root cause, apply targeted fix |
| 2 | Try alternative method (different tool/library/approach) |
| 3 | Broader rethink of assumptions |
| After 3 | STOP and escalate to user with detailed explanation |

---

## 5-Question Reboot Test

If context resets or you're resuming work, verify you can answer:

1. **Where am I?** → Current phase in task_plan.md
2. **Where am I going?** → Remaining phases
3. **What's the goal?** → Goal statement in task_plan.md
4. **What have I learned?** → See findings.md
5. **What have I done?** → See progress.md

If you can answer all 5, your context is solid.

---

## Why This Works

| Problem | Solution |
|---------|----------|
| Goal drift | Re-reading plan keeps focus |
| Lost visual info | 2-Action Rule captures as text |
| Repeated errors | Error logging prevents repetition |
| Context overflow | Files persist beyond context window |
| Session breaks | Files enable seamless resumption |

---

## Viewing the Injected Instructions

```bash
# See the full planning instructions
ralphy --verbose --dry-run "your task"
```

Output:
```
[DEBUG] Planning-with-Files Instructions:
[DEBUG]   Task: your task
[DEBUG]   Session Path: .agent/sessions/2026-01-31/your-task
[DEBUG]   Date: 2026-01-31
[DEBUG]   Instructions:
## Planning Protocol (MANDATORY - DO THIS FIRST)
...
```

---

## Session Directory Structure

```
your-project/
├── .agent/
│   └── sessions/
│       └── 2026-01-31/
│           ├── add-auth/
│           │   ├── task_plan.md
│           │   ├── findings.md
│           │   └── progress.md
│           ├── fix-login-bug/
│           │   ├── task_plan.md
│           │   ├── findings.md
│           │   └── progress.md
│           └── refactor-api/
│               ├── task_plan.md
│               ├── findings.md
│               └── progress.md
├── src/
├── package.json
└── ...
```

Each task gets its own isolated session directory, organized by date.
