# flowerberg-loom

AI-powered development lifecycle loom — weave goals into shipped software.

flowerberg-loom manages software projects through a structured 7-phase lifecycle, using Claude Code as the execution engine.

## Phases

| Phase | Mode | Description |
|-------|------|-------------|
| **Goal** | Human | Set the project vision |
| **Spec** | Hybrid | AI generates technical specification, human approves |
| **Plan** | Autonomous | AI breaks down implementation into steps |
| **Dev** | Autonomous | AI implements code in isolated git worktree |
| **Test** | Autonomous | AI writes and runs tests |
| **Review** | Autonomous | AI code review |
| **Deploy** | Hybrid | Build verification, human confirms, git push + GitHub Release |

## Install

```bash
npm install
npm run build
```

## Usage

### Create a project

```bash
fbloom init my-project --path ~/projects/my-project
```

### Set the goal

```bash
fbloom goal <projectId> "Build a CLI tool that..."
```

### Start the lifecycle

```bash
fbloom start <projectId>
```

### Provide human input

When a phase requires human input (Goal, Spec, Deploy):

```bash
fbloom input <projectId> "your input"
```

### Check status

```bash
fbloom status <projectId>
fbloom projects
```

### Interactive dashboard

```bash
fbloom dashboard
```

### Deploy

The deploy phase:
1. Verifies the build (`npm run build` by default)
2. Checks git working tree is clean
3. Checks `gh` CLI authentication
4. Prompts for human confirmation
5. Pushes to remote git repository
6. Creates a GitHub Release

## Configuration

Config file: `~/.config/fbloom/config.json`

```json
{
  "claude_path": "claude",
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

## Architecture

```
src/
├── cli/            Commander.js CLI entry point
├── tui/            Ink + React terminal UI
├── orchestrator/   Phase handlers, state machine, git worktree, deploy
├── agents/         AI agent factory + Claude CLI implementation
├── store/          SQLite persistence with migrations
└── types/          TypeScript type definitions
```

## Development

```bash
npm run dev          # Watch mode build
npm run typecheck    # TypeScript check
npm run build        # Production build
npm test             # Run tests (vitest)
npm run test:watch   # Watch mode tests
```

## License

MIT
