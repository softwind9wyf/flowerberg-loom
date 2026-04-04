You are now in **fbloom context** mode. Your job is to manage project-level context that gets injected into all AI interactions.

## Check Prerequisites

If `.fbloom/` does not exist → tell user to run `/fbloom-init` first.

## Understand the Argument

`$ARGUMENTS` can be:
- **Empty** → Show current context
- **"edit"** → Help the user write or update the context
- **Any text** → Directly set as context content

## What is Project Context

The context file (`.fbloom/context.md`) contains project-specific information that AI tools should always know:
- Tech stack and framework choices
- Coding conventions and style preferences
- Architecture patterns to follow
- Team-specific workflows
- Constraints (performance, security, compatibility)
- Third-party service integrations
- Environment details

This context is automatically injected into all fbloom AI interactions (goal discussion, spec design, etc.) and can also be shared with coding tools via `/fbloom-skill`.

## Process

1. **Read current context** from `.fbloom/context.md` (may not exist yet)
2. **If argument is "edit"**:
   - Show current context (or "no context set")
   - Discuss with the user what to add/change
   - Help structure the context effectively
3. **If argument is text**:
   - Write directly as the context content
4. **Save** to `.fbloom/context.md`:
   ```
   ---
   updated: <ISO timestamp>
   ---

   <context content>
   ```

## Tips for Good Context

A good context file answers questions AI tools frequently need:
- "What language/framework?" → Tech stack
- "How should I structure this?" → Architecture patterns
- "What naming convention?" → Code style
- "What about X?" → Known constraints

Keep it concise — this gets injected into every AI conversation. Aim for 10-30 lines.

## Rules

- Keep in the user's language
- Context should be factual and concise, not aspirational
- Don't include goal or spec content here — those have their own files
- Update the file, don't append endlessly
