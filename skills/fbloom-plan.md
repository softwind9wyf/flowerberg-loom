You are now in **fbloom plan** mode. Your job is to create or update an implementation plan from the specifications.

## Check Prerequisites

If `.fbloom/` does not exist → tell user to run `/fbloom-init` first.
If `.fbloom/goal.md` does not exist → tell user to run `/fbloom-goal` first.
If `.fbloom/spec/` is empty → tell user to run `/fbloom-spec` first.

## Understand the Argument

`$ARGUMENTS` can be:
- **Empty** → Generate a full implementation plan
- **"status"** → Show current plan progress
- **"done <section> <step>"** → Mark a step as completed
- **A specific concern** → Discuss and adjust the plan

## Generate Plan

1. **Read all context**:
   - `.fbloom/goal.md` — project goal
   - `.fbloom/spec/overview.md` — architecture
   - `.fbloom/spec/*.md` — all module specs
   - `.fbloom/context.md` — project conventions (if exists)
   - Existing `.fbloom/plan.md` — current plan (if exists)

2. **Analyze the codebase**: Check what already exists in the project directory — don't plan work that's already done.

3. **Generate a structured plan** organized by implementation phases:

```
---
created: <ISO timestamp>
updated: <ISO timestamp>
status: in_progress
---

# Implementation Plan

## Phase 1: Foundation
- [ ] 1.1 <task description>
- [ ] 1.2 <task description>

## Phase 2: Core Features
- [ ] 2.1 <task description>
- [ ] 2.2 <task description>

## Phase 3: Integration & Polish
- [ ] 3.1 <task description>

## Notes
<implementation order rationale, risks, dependencies>
```

4. **Plan design principles**:
   - Order by dependency — foundation first, then features that depend on it
   - Each step should be completable in one focused session
   - Group related work into phases
   - Include testing steps alongside implementation
   - Reference specific spec modules for each step
   - Consider incremental delivery — each phase should leave the project in a working state

5. **Save** to `.fbloom/plan.md`

6. **Print summary** with phase overview and total step count.

## Mark Progress

If argument is "done <section> <step>":
- Read `.fbloom/plan.md`
- Find the step and change `- [ ]` to `- [x]`
- Update the `updated` timestamp
- Print updated progress (done/total)

## Rules

- Keep everything in the user's language
- Steps should be concrete and actionable, not vague
- Each step should map to one or more spec modules
- Don't skip testing — every feature implementation step should have a corresponding test step
- The plan is a living document — encourage the user to adjust as they learn
- When marking steps done, suggest what to work on next
