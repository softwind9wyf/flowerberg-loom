---
created: "2026-04-04T09:15:00.000Z"
updated: "2026-04-04T09:15:00.000Z"
ai_generated: true
---

# Architecture

## Component Diagram

```
┌─────────────────────────────────────────────────┐
│                    CLI (Commander)               │
│  fbloom init / start / goal / status / migrate   │
└────────────────────┬────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
┌────────▼────────┐    ┌─────────▼──────────┐
│   Chat TUI      │    │  ProjectOrchestrator│
│  (Ink + React)  │    │  (Phase State Machine)│
│  /slash commands│    │                      │
└────────┬────────┘    └─────────┬────────────┘
         │                       │
    ┌────┴─────┐        ┌────────┴────────┐
    │  FileStore│        │  PhaseHandlers  │
    │ (.fbloom/)│        │  (goal/spec/    │
    │           │        │   plan/dev/test │
    └───────────┘        │   review/deploy)│
                         └────────┬────────┘
                                  │
                    ┌─────────────┼──────────────┐
                    │             │              │
              ┌─────▼─────┐ ┌────▼─────┐ ┌──────▼──────┐
              │   Store    │ │  Agent   │ │  GitWorktree│
              │  (SQLite)  │ │ (Claude) │ │  Manager    │
              └────────────┘ └──────────┘ └─────────────┘
```

## Key Design Decisions

- **Dual storage**: SQLite for runtime state (fast queries, joins), FileStore for human-readable documents (git-friendly)
- **Phase state machine**: Each project goes through 7 phases in order, with pause/resume for human input
- **Agent abstraction**: `AgentInterface` allows swapping AI backends; current implementation uses Claude Code CLI
- **Worktree isolation**: Dev/test/review happen in a git worktree, keeping main branch clean until review passes

## Technology Stack

- **Runtime**: Node.js (ESM, TypeScript)
- **TUI**: Ink v6 (React for CLI)
- **Database**: better-sqlite3 (synchronous, embedded)
- **CLI**: Commander.js
- **AI**: Claude Code CLI (`claude` command)
- **Git**: git worktree for isolation, gh CLI for releases
