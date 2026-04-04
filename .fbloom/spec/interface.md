---
created: "2026-04-04T09:15:00.000Z"
updated: "2026-04-04T09:15:00.000Z"
ai_generated: true
---

# Interface Design

## CLI Commands

```
fbloom                          # Launch Chat TUI (default)
fbloom init <name>              # Create project
fbloom projects                 # List projects
fbloom start <id>               # Start/resume lifecycle
fbloom goal <id> <text>         # Set goal
fbloom status <id>              # Show status
fbloom input <id> <value>       # Provide human input
fbloom migrate <id>             # Migrate SQLite → FileStore
fbloom dashboard                # Legacy project TUI
fbloom config [--show|--set-*]  # Configuration
```

## Chat TUI Slash Commands

```
/init <name>        Create project
/goal [text]        Set or view goal
/spec [module]      View spec modules
/plan [done <s> <i>] View or update plan
/status             Project status
/diff <from> <to>   View version diff
/log                Change history
/help               Show commands
/quit               Exit
```

Non-`/` text is sent to the AI agent as free conversation.

## TUI Layout

```
┌─ fbloom │ project-name │ ▶ dev ──────────────────┐
│                                                    │
│  [system] Project created: my-app                  │
│  [assistant] Spec generated with 4 modules.        │
│  [user] /spec                                      │
│  [system] ── spec/overview.md ──                   │
│                                                    │
├────────────────────────────────────────────────────┤
│ > ▎                                                │
└────────────────────────────────────────────────────┘
```

## Configuration (~/.config/fbloom/config.json)

```json
{
  "claude_path": "claude",
  "default_agent": { "type": "claude-cli", "path": "claude" },
  "max_parallel_agents": 3,
  "deploy": {
    "remote": "origin",
    "createRelease": true,
    "tagPrefix": "v",
    "buildCommand": "npm run build",
    "verifyBuild": true
  }
}
```
