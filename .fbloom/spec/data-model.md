---
created: "2026-04-04T09:15:00.000Z"
updated: "2026-04-04T16:00:00.000Z"
module: data-model
---

# Data Model

## Design Principle

**Files are source of truth.** All project state lives in `.fbloom/` as human-readable, git-friendly files. No database dependency.

- State is derivable from files — any `.fbloom/` directory can be opened fresh without migration
- Project portability — clone the repo, switch branches, everything works
- No global state — each project is fully self-contained

## FileStore Structure (.fbloom/)

```
.fbloom/
├── state.json       # Project state index (non-sensitive, derived)
├── goal.md          # YAML frontmatter + goal text (1-3 sentences)
├── context.md       # Tech stack, conventions, notes
├── config.json      # Project-level config (sensitive, gitignored)
├── config.sample.json # Config template (tracked in git)
├── spec/
│   ├── _index.md    # Module index with links
│   ├── overview.md  # Architecture overview
│   └── *.md         # Individual spec modules
├── plan.md          # Markdown checklist with sections
├── sessions/        # Chat session history (JSON)
└── logs/            # Runtime logs (JSON lines)
```

### state.json — Project State Index

A lightweight JSON file that tracks project metadata and phase progress. This file is **derived state** — it can be rebuilt from the other files via `scanForImport()`.

```json
{
  "name": "my-project",
  "current_phase": "spec",
  "status": "active",
  "created_at": "2026-04-04T09:15:00.000Z",
  "updated_at": "2026-04-04T16:00:00.000Z",
  "phases": {
    "goal": {
      "status": "done",
      "started_at": "2026-04-04T09:15:00.000Z",
      "completed_at": "2026-04-04T09:20:00.000Z"
    },
    "spec": {
      "status": "in_progress",
      "started_at": "2026-04-04T10:00:00.000Z"
    },
    "plan": { "status": "pending" },
    "dev": { "status": "pending" },
    "test": { "status": "pending" },
    "review": { "status": "pending" },
    "deploy": { "status": "pending" }
  }
}
```

**Rules:**
- `name` defaults to the project directory name
- `current_phase` advances as phases complete
- `status` is one of: `active`, `completed`, `failed`, `abandoned`
- Phase `status` is one of: `pending`, `in_progress`, `waiting_input`, `done`, `failed`
- This file is **git-tracked** — it contains no secrets, only project progress
- Can be regenerated from file presence if corrupted or missing

### goal.md

YAML frontmatter + plain text goal:

```yaml
---
status: active
created: "2026-04-04T09:15:00.000Z"
updated: "2026-04-04T16:00:00.000Z"
---

Build an AI-powered development lifecycle orchestrator.
```

### context.md

Free-form project context (tech stack, conventions, constraints). Updated by user or AI.

### config.json

Project-level configuration overrides. **Gitignored** — may contain API keys and sensitive settings. See `config.sample.json` for the full schema.

### spec/ Directory

Each module is a markdown file with frontmatter:

```yaml
---
created: "2026-04-04T09:15:00.000Z"
updated: "2026-04-04T16:00:00.000Z"
ai_generated: true
---

<module content in markdown>
```

- `_index.md` lists all modules with links
- Version history is tracked via git, not inline versions
- Modules are created/updated by AI during spec phase, reviewed by human

### plan.md

Markdown checklist with phase sections:

```markdown
## Dev
- [ ] Setup project structure
  <!-- fbloom-id: step-1 -->
  Initialize package.json and directory
- [x] Implement CLI
  <!-- fbloom-id: step-2 -->
  Commander.js subcommands
```

- Checked items (`[x]`) indicate completed steps
- `<!-- fbloom-id: ... -->` comments provide stable identifiers for step tracking

### sessions/ Directory

Chat sessions stored as JSON files:

```typescript
interface Session {
  id: string;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}
```

- Automatic compression when messages exceed configurable max chars
- Optional AI-powered summarization

### logs/ Directory

Runtime logs stored as JSON Lines files (one file per day or per session):

```jsonl
{"ts":"2026-04-04T09:15:00.000Z","level":"info","agent":"orchestrator","phase":"goal","message":"Starting goal phase"}
{"ts":"2026-04-04T09:20:00.000Z","level":"info","agent":"orchestrator","phase":"goal","message":"Goal phase completed"}
```

- Logs are append-only, no querying needed
- Optional cleanup by age (configurable)

## State Reconstruction

When opening an existing `.fbloom/` directory (e.g., after git clone or branch switch):

1. `scanForImport()` reads files to determine project state
2. If `state.json` exists → use it directly
3. If `state.json` is missing or corrupted → rebuild from file presence:
   - `goal.md` exists → goal phase done
   - `spec/*.md` files exist → spec phase done
   - `plan.md` exists → plan phase done (check for `[x]` items → dev progress)
4. Write reconstructed `state.json`

This ensures any branch with `.fbloom/` files can be resumed without setup.
