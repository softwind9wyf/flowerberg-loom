# fbloom

AI-powered development lifecycle orchestrator — from goal to deployment.

fbloom manages software projects through a structured lifecycle, using Claude Code as the AI execution engine. Each project runs its own fbloom instance, with all project data stored in a `.fbloom/` directory alongside your code.

## Install

```bash
npm install -g flowerberg-loom
```

Requires Node.js 18+ and [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed.

## Quick Start

```bash
# Enter your project directory
cd my-project

# Launch fbloom — it will auto-detect an existing .fbloom/ or start fresh
fbloom
```

First run shows `no project selected`. Initialize with:

```
/init my-project
/goal Build a REST API that manages user bookmarks
```

After that, just run `fbloom` again — it will automatically resume your project.

## Lifecycle

| Phase | Mode | Description |
|-------|------|-------------|
| **Goal** | Human | Set the project vision |
| **Spec** | Hybrid | AI generates spec, human approves |
| **Plan** | Autonomous | AI breaks down implementation steps |
| **Dev** | Autonomous | AI writes code in isolated git worktree |
| **Test** | Autonomous | AI writes and runs tests |
| **Review** | Autonomous | AI code review |
| **Deploy** | Hybrid | Build verification, human confirms, git push + GitHub Release |

## Commands

### Chat TUI (default)

Run `fbloom` with no arguments to enter the interactive chat:

| Command | Description |
|---------|-------------|
| `/init <name>` | Create a new project |
| `/goal <text>` | Set or view project goal |
| `/status` | Show project status and phase progress |
| `/spec [generate\|<module>\|chat <module>]` | View/generate/discuss spec modules |
| `/plan [done <section> <step>]` | View or update implementation plan |
| `/diff <from> <to>` | View version diff |
| `/log` | View change history |
| `/skill` | Generate Claude Code skill file |
| `/help` | Show all commands |
| `/quit` | Exit |

### Claude Code Skills

fbloom provides slash commands for Claude Code:

| Skill | Description |
|-------|-------------|
| `/fbloom-init <name>` | Initialize a fbloom project |
| `/fbloom-goal` | Define or refine project goal |
| `/fbloom-spec` | Generate specifications from goal |
| `/fbloom-plan` | Create implementation plan from spec |
| `/fbloom-context` | Manage project-level AI context |
| `/fbloom-skill` | Generate skill bridge file for Claude Code |
| `/fbloom-on` | Inject spec-first rule into CLAUDE.md |
| `/fbloom-off` | Remove spec-first rule from CLAUDE.md |

### CLI

```bash
fbloom init <path>              # Create project in directory
fbloom goal "description"       # Set goal (in project dir)
fbloom status [path]            # Check status
fbloom config --show            # Show configuration
```

## Project Data

All project data lives in `.fbloom/` within your project root — **fully self-contained, no database required**:

```
.fbloom/
├── state.json       # Project state index (rebuildable from files)
├── config.json      # Project-level AI config (gitignored, sensitive)
├── config.sample.json  # Config template
├── goal.md          # Project goal
├── context.md       # Project conventions and AI context
├── plan.md          # Implementation plan with checkable steps
├── spec/
│   ├── _index.md    # Spec module index
│   ├── overview.md
│   ├── architecture.md
│   └── ...
├── sessions/        # Chat session history
└── logs/            # Runtime logs (JSONL)
```

These files are plain markdown/JSON, version-controlled alongside your code. You can edit them directly or through fbloom commands.

**State portability**: `state.json` is a lightweight index that can be rebuilt from file presence. Clone the repo, switch branches — everything works. No global database, no migration needed.

## Spec-First Workflow

fbloom enforces a spec-first discipline:

> **Any design-level change must first update `.fbloom/spec/`, then modify code based on the updated spec.**

Enable/disable this rule in Claude Code:

```
/fbloom-on    # Inject spec-first rule into CLAUDE.md
/fbloom-off   # Remove spec-first rule from CLAUDE.md
```

## Configuration

### Global config (~/.fbloom/config.json)

```json
{
  "default_agent": {
    "type": "claude-cli",
    "path": "claude"
  },
  "deploy": {
    "remote": "origin",
    "branch": "main",
    "createRelease": true,
    "tagPrefix": "v",
    "buildCommand": "npm run build",
    "verifyBuild": true
  }
}
```

### Project config (.fbloom/config.json)

Per-project overrides (gitignored). See `.fbloom/config.sample.json` for the full schema.

## License

MIT

---

*This project is entirely AI-generated, built through fbloom's own spec-first workflow with Claude Code.*
