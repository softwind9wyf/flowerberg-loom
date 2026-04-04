You are now in **fbloom init** mode. Your job is to initialize a project management structure in the current project.

## What is fbloom

fbloom is a project lifecycle methodology with 7 phases:

1. **goal** — Define what the project aims to achieve (1-3 sentences, clear and actionable)
2. **spec** — Break the goal into functional modules with detailed specifications
3. **plan** — Create a step-by-step implementation plan from specs
4. **dev** — Execute the plan using coding tools
5. **test** — Verify implementations
6. **review** — Code review against specs
7. **deploy** — Ship it

## Your Task

1. Check if `.fbloom/` directory already exists in the project root.
   - If yes: read existing files and tell the user what's already set up.
   - If no: proceed with initialization.

2. Look at the project to understand what it is:
   - Read `package.json`, `README.md`, or equivalent project files
   - Scan directory structure to understand tech stack and project scope

3. Create the `.fbloom/` directory structure:

```
.fbloom/
├── goal.md          # Project goal (frontmatter + markdown)
├── context.md       # Project conventions, tech stack, team rules
├── config.json      # Project-level config
├── spec/
│   ├── overview.md  # Architecture overview, module dependencies
│   └── *.md         # Individual spec modules
├── plan.md          # Implementation plan (checklist format)
└── sessions/        # Chat session history (auto-managed)
```

4. Create initial files:

- `.fbloom/config.json` — empty config `{}`

- `.fbloom/context.md` — pre-fill with what you can infer from the project:
  ```
  # Project Context

  ## Tech Stack
  (auto-detected from project files)

  ## Conventions
  (inferred from existing code patterns)

  ## Notes
  (any other relevant observations)
  ```

5. Ask the user if they want to set the project goal now. If yes, guide them through a brief discussion:
   - What is the core problem this project solves?
   - Who are the target users?
   - What does success look like?
   - Summarize into 1-3 clear, actionable sentences

6. Write the goal to `.fbloom/goal.md` with frontmatter:
  ```
  ---
  status: active
  created: <ISO timestamp>
  updated: <ISO timestamp>
  ---

  <goal content>
  ```

7. Print a summary of what was created and suggest next steps:
   - `/fbloom-goal` to refine the goal
   - `/fbloom-spec` to generate specifications
   - `/fbloom-context` to add project conventions

## Rules

- Keep everything in Chinese if the user communicates in Chinese
- Be concise and practical
- Don't over-engineer — start minimal, iterate later
- The `.fbloom/` directory IS the project state — all data lives there as markdown files

## Spec-First Workflow Rule

When initializing, inject the following rule into `.fbloom/context.md` under a "## Conventions" section:

> **设计改动规则（Spec-First）**：任何设计层面的改动，必须先修改 `.fbloom/spec/` 下的相关规格文档，确认无误后，再根据 spec 修改代码。禁止直接改代码而不更新 spec。
