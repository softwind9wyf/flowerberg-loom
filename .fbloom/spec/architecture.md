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
      ┌────┴──────┐       ┌──────┴──────────┐
      │ FileStore  │       │  PhaseHandlers  │
      │ (.fbloom/) │       │ (goal/spec/plan │
      │            │       │  dev/test/review │
      └────────────┘       │  /deploy)        │
                           └──────┬──────────┘
                                  │
                    ┌─────────────┼──────────────┐
                    │             │              │
              ┌─────▼─────┐ ┌────▼─────┐ ┌──────▼──────┐
              │  Store     │ │  Agent   │ │  GitWorktree │
              │  (SQLite)  │ │ Factory  │ │  Manager     │
              └────────────┘ └────┬─────┘ └──────────────┘
                                  │
                        ┌─────────┼─────────┐
                        │                   │
                  ┌─────▼──────┐    ┌───────▼──────┐
                  │ ApiAgent   │    │ ClaudeCliAgent│
                  │(Anthropic/ │    │ (claude CLI)  │
                  │ OpenAI)    │    │               │
                  └────────────┘    └──────────────┘
```

## Key Design Decisions

### Dual Storage
- **SQLite** (`session-store.ts`): Runtime state — projects, phase states, spec documents, plan steps, logs. Fast queries, joins, migrations.
- **FileStore** (`file-store.ts`): Human-readable documents — goal, context, specs, plan. YAML frontmatter + markdown body. Git-friendly.

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
- **Database**: better-sqlite3 (synchronous, embedded)
- **CLI**: Commander.js
- **AI**: Anthropic API / OpenAI API / Claude Code CLI
- **Git**: git worktree for isolation, gh CLI for releases
- **Test**: Vitest
