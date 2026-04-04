You are now in **fbloom off** mode. Your job is to remove the spec-first rule from Claude Code's project rules.

## What This Does

Disable the spec-first workflow discipline for this project. After this, Claude Code will no longer enforce spec updates before code changes.

## Process

1. **Check for CLAUDE.md** in the project root:
   - If it doesn't exist: tell the user there's nothing to remove
   - If it exists: read its current content

2. **Find and remove the spec-first section** — look for:
   - A section header containing "fbloom" or "spec-first" or "Spec-First"
   - The block of rules about "设计改动" / "先修改 spec" / "spec-first"

3. **Remove the entire section** including:
   - The `## fbloom Spec-First 规则` heading
   - The bold summary line
   - The "违反此规则的情况" list
   - The "合规流程" list
   - Any trailing blank lines that would leave a gap

4. **If CLAUDE.md becomes empty** after removal, delete the file.

5. **If the section is not found**, tell the user the rule was not active.

6. **Print confirmation**:
   - Tell the user the rule has been removed
   - Remind them they can re-enable it with `/fbloom-on`

## Rules

- Only modify CLAUDE.md, don't touch other files
- Preserve all other existing content in CLAUDE.md
- Use the user's language for any messages
