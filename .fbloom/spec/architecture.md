---
created: "2026-04-04T09:15:00.000Z"
updated: "2026-04-04T16:00:00.000Z"
---

# Architecture

## Component Diagram

```
┌─────────────────────────────────────────────────────┐
│                  CLI (Commander.js)                   │
│  fbloom init / start / goal / status / config        │
└──────────────────────┬──────────────────────────────┘
                       │
           ┌───────────┴───────────┐
           │                       │
┌──────────▼──────────┐  ┌────────▼──────────┐
│     Chat TUI        │  │  ProjectOrchestrator│
│   (Ink + React)     │  │  (Phase State       │
│  /slash commands    │  │   Machine)           │
│  SessionStore       │  │                      │
└──────────┬──────────┘  └────────┬────────────┘
           │                      │
      ┌────┴──────────────────────┴──────────┐
      │              FileStore                │
      │              (.fbloom/)               │
      │  state.json + goal.md + spec/        │
      │  plan.md + sessions/ + logs/         │
      └──────────────────────────────────────┘
                        │
           ┌────────────┼────────────────┐
           │            │                │
     ┌─────▼─────┐ ┌───▼───────┐ ┌──────▼──────┐
     │ Phase      │ │  Agent    │ │ GitWorktree  │
     │ Handlers   │ │ Factory   │ │ Manager      │
     └───────────┘ └────┬──────┘ └──────────────┘
                       │
             ┌─────────┼─────────┐
             │                   │
       ┌─────▼──────┐    ┌──────▼───────┐
       │ ApiAgent   │    │ ClaudeCliAgent│
       │(Anthropic/ │    │ (claude CLI)  │
       │ OpenAI)    │    │               │
       └────────────┘    └──────────────┘
```

## Key Design Decisions

### File-Based Storage (No Database)

All project state lives in `.fbloom/` as files:
- **state.json**: Project metadata and phase progress (lightweight index, rebuildable from other files)
- **Markdown files** (goal.md, spec/*.md, plan.md): Human-readable, git-friendly, editable with any editor
- **sessions/**: Chat history as JSON files with optional AI compression
- **logs/**: Runtime logs as JSON Lines files

**Why no database:**
- Files are source of truth — DB was just an index
- Git already provides version history (no need for spec versioning in DB)
- Project portability — clone, branch switch, everything works
- No native dependency (better-sqlite3) — simpler install
- `state.json` is rebuildable from file presence, never a single point of failure

### Agent Abstraction
- `AgentInterface` defines `run()`, `decompose()`, `isAvailable()` methods
- `AgentFactory` selects backend based on config:
  - **ApiAgent**: Direct API calls to Anthropic or OpenAI (preferred if configured)
  - **ClaudeCliAgent**: Spawns `claude` CLI as subprocess (fallback)
- Streaming support via SSE callbacks

### Phase State Machine
- 7 phases in order: goal → spec → plan → dev → test → review → deploy
- Each phase has a dedicated handler with `execute()` and `handleInput()` methods
- Human-in-the-loop: goal, spec approval, plan review, deploy confirmation
- Autonomous: dev, test, review phases run without human input

### Event System
- `ProjectEvent` union type for real-time updates
- Events: status changes, phase transitions, agent output, human input requests
- TUI subscribes to events for live updates

### Worktree Isolation
- Dev/test/review phases execute in git worktrees
- Main branch stays clean until review passes
- Automatic merge and cleanup after review

## Technology Stack

- **Runtime**: Node.js 18+ (ESM, TypeScript strict)
- **Build**: tsup
- **TUI**: Ink v6 + React 19
- **Storage**: File-based only (JSON + Markdown + YAML frontmatter)
- **CLI**: Commander.js
- **AI**: Anthropic API / OpenAI API / Claude Code CLI
- **Git**: git worktree for isolation, gh CLI for releases
- **Test**: Vitest
