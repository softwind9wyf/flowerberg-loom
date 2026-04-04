---
created: "2026-04-04T09:15:00.000Z"
updated: "2026-04-04T16:00:00.000Z"
---

# Overview

fbloom is a CLI/TUI tool that orchestrates the full software development lifecycle using AI agents. It bridges human intent (goal) to production deployment through a structured phase pipeline.

## Core Value Proposition

1. **Single tool, full pipeline** — from idea to deployed code
2. **Human-in-the-loop** — humans approve specs, review plans, confirm deployments
3. **AI-autonomous execution** — dev, test, and review phases run without human intervention
4. **File-based transparency** — all state is markdown/JSON in `.fbloom/`, editable with any editor, versioned with git
5. **Fully portable** — clone the repo and resume work, no database setup needed

## Target Users

- Solo developers who want AI-assisted project scaffolding
- Small teams looking for structured development workflows
- Anyone building CLI/Node.js projects who wants automated lifecycle management

## Module Architecture

| Module | Responsibility | Dependencies |
|--------|---------------|--------------|
| agents | AI agent abstraction (CLI, API, factory) | types/agent, types/config |
| cli | Commander.js entry point and subcommands | store, orchestrator, tui |
| orchestrator | Phase lifecycle state machine and handlers | agents, store, git |
| store | File-based persistence (FileStore + SessionStore) | types/* |
| tui | Ink-based chat interface and slash commands | store, orchestrator |
| types | Shared TypeScript type definitions | — |

## Data Flow

```
User → CLI/TUI → Orchestrator → PhaseHandler → Agent → Code
                                    ↕
                            FileStore (.fbloom/)
```

1. User interacts via CLI commands or TUI chat
2. Orchestrator manages phase state machine (state tracked in `state.json`)
3. Phase handlers delegate work to AI agents
4. FileStore persists all documents and state in `.fbloom/` directory
5. SessionStore tracks conversation history in `sessions/`
6. Runtime logs append to `logs/` directory
7. Events propagate updates to TUI in real-time
