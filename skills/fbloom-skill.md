You are now in **fbloom skill** mode. Your job is to generate skill files that bridge fbloom project data into coding tools.

## What This Does

Generate a Claude Code skill file (`.claude/commands/fbloom.md`) that summarizes the current fbloom project state. When a developer uses Claude Code, they can type `/fbloom <task>` and Claude will already understand the project's goal, specs, and plan.

## Process

1. **Read all fbloom data**:
   - `.fbloom/goal.md` — project goal
   - `.fbloom/context.md` — project conventions (if exists)
   - `.fbloom/spec/overview.md` — architecture overview (if exists)
   - `.fbloom/spec/*.md` — module specs
   - `.fbloom/plan.md` — implementation plan with progress

2. **Generate the skill file** at `.claude/commands/fbloom.md`:

```markdown
# fbloom: Project Context

## Project Goal
<goal content>

## Architecture
<overview summary>

## Current Progress
<plan status: which steps done, which remain>

## Key Specs
<brief summary of each spec module>

## Conventions
<context.md content>

## Instructions
When working on this project:
1. **设计改动必须先改 spec**：任何设计层面的改动（架构、接口、数据模型、行为变更等），必须先修改 `.fbloom/spec/` 下的相关规格文档，确认无误后，再根据 spec 修改代码。禁止直接改代码而不更新 spec。
2. Read relevant spec files in .fbloom/spec/ for detailed requirements
3. Check .fbloom/plan.md for implementation plan
4. Follow conventions from .fbloom/context.md
5. Focus on: <current incomplete plan steps>
6. After completing work, mark plan steps done in .fbloom/plan.md

$ARGUMENTS
```

3. **Print confirmation** with the file path and usage instructions.

## Rules

- The skill file should be self-contained — Claude Code only sees this one file
- Summarize specs, don't copy them verbatim (keep skill file under ~100 lines)
- Highlight what needs to be done NEXT, not what's already done
- Update the file if it already exists (don't create duplicates)
- Keep in the user's language
