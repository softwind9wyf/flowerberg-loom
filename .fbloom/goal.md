---
status: active
created: "2026-04-04T09:15:00.000Z"
updated: "2026-04-04T09:15:00.000Z"
---

# Goal

Build **fbloom** — an AI-powered development lifecycle orchestrator that automates the full software delivery pipeline from goal to deployment.

fbloom provides:

- **Persistent TUI chat interface** with slash commands (`/goal`, `/spec`, `/plan`, `/status`, `/deploy`) for interactive project management
- **CLI subcommands** (`fbloom init`, `fbloom start`, `fbloom status`) for scripting and automation
- **File-based documents** (`.fbloom/` directory) storing goal, spec, and plan as editable markdown with git versioning
- **SQLite runtime state** for phase tracking, plan steps, and project logs
- **7-phase lifecycle**: goal → spec → plan → dev → test → review → deploy
- **AI agent integration** via Claude Code CLI for autonomous code generation, testing, and review
- **Git worktree isolation** during dev phase, with automatic merge after review
- **Deploy automation** with git push and GitHub release creation

The tool is self-hosting — fbloom is used to manage fbloom's own development.
