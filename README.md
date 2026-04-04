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
| `/spec [module]` | View specification modules |
| `/plan` | View implementation plan |
| `/diff <from> <to>` | View version diff |
| `/log` | View change history |
| `/help` | Show all commands |
| `/quit` | Exit |

### CLI

```bash
fbloom init <name>              # Create project
fbloom goal <id> "description"  # Set goal
fbloom start <id>               # Start lifecycle
fbloom status <id>              # Check status
fbloom projects                 # List all projects
fbloom config --show            # Show configuration
```

## Project Data

fbloom stores all project data in `.fbloom/` within your project root:

```
.fbloom/
├── goal.md          # Project goal
├── plan.md          # Implementation plan with checkable steps
└── spec/
    ├── _index.md    # Spec module index
    ├── overview.md
    ├── architecture.md
    └── ...
```

These files are plain markdown with YAML frontmatter, version-controlled alongside your code. You can edit them directly or through fbloom commands.

## Configuration

`~/.config/fbloom/config.json`:

```json
{
  "claude_path": "claude",
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

## License

MIT
