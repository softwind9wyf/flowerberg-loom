You are now in **fbloom spec** mode. Your job is to help design specifications from the project goal.

## Check Prerequisites

If `.fbloom/` does not exist → tell user to run `/fbloom-init` first.
If `.fbloom/goal.md` does not exist → tell user to run `/fbloom-goal` first.

## Understand the Argument

`$ARGUMENTS` can be:
- **Empty or "generate"** → Generate all specs from scratch based on goal
- **"overview"** → Show or discuss the overall architecture
- **A module name** (e.g. "auth", "api") → Discuss/refine that specific module's spec

## Phase 1: Generate Specs (no argument or "generate")

1. **Read the goal** from `.fbloom/goal.md`
2. **Read existing specs** from `.fbloom/spec/*.md` if any
3. **Read project context** from `.fbloom/context.md` if any
4. **Analyze and design**:
   - Identify functional modules from the goal
   - Define overall architecture (how modules connect)
   - For each module, define: purpose, interfaces, data structures, error handling, edge cases
5. **Generate files**:
   - `.fbloom/spec/overview.md` — Overall architecture, module list, dependency graph, tech decisions
   - `.fbloom/spec/<module>.md` — One file per module with detailed spec

### Overview format (`.fbloom/spec/overview.md`):
```
---
created: <ISO timestamp>
updated: <ISO timestamp>
---

# Architecture Overview

## Goal
<project goal>

## Module Architecture
<text description of how modules connect, possibly with ASCII diagram>

## Modules
| Module | Responsibility | Dependencies |
|--------|---------------|--------------|
| module-a | ... | module-b, module-c |
| module-b | ... | - |

## Tech Decisions
- <key technical choices and why>

## Data Flow
<how data flows through the system>
```

### Module spec format (`.fbloom/spec/<module>.md`):
```
---
created: <ISO timestamp>
updated: <ISO timestamp>
module: <module-name>
---

# <Module Name>

## Purpose
<what this module does and why>

## Interfaces
<API contracts, function signatures, events>

## Data Structures
<types, schemas, models>

## Behavior
<functional requirements, step-by-step flows>

## Edge Cases & Error Handling
<what can go wrong and how to handle it>

## Dependencies
<other modules or external dependencies>

## Testing Criteria
<how to verify this module works correctly>
```

6. **Print summary**: List all generated modules and suggest:
   - `/fbloom-spec <module>` to review or refine any module
   - `/fbloom-plan` to generate implementation plan

## Phase 2: Discuss a specific module (module name as argument)

1. **Read the module spec** from `.fbloom/spec/<module>.md`
2. **Read the overview** from `.fbloom/spec/overview.md` for context
3. **Discuss with the user**: Help refine interfaces, data structures, edge cases
4. **Update the spec**: After discussion, save the updated content to the same file (update the `updated` timestamp in frontmatter)

## Rules

- Keep everything in the user's language
- Specs should be detailed enough that a developer can implement without asking questions
- Focus on "what" and "how", not "why" (that's the goal's job)
- Each module should have a single responsibility
- Interfaces between modules must be clearly defined
- Don't write code — specs describe behavior, not implementation
- If the user wants to add/remove modules, update overview.md accordingly
- Always consider error cases and edge conditions
