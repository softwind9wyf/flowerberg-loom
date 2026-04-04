# Project Context

## Tech Stack
- **Runtime**: Node.js 18+ (ESM, `"type": "module"`)
- **Language**: TypeScript 6 (strict mode, ES2022 target)
- **Build**: tsup (zero-config bundler)
- **Test**: Vitest 4
- **TUI**: Ink 6 (React 19 for terminal UI)
- **Storage**: better-sqlite3 (SQLite runtime state) + markdown files (`.fbloom/`)
- **CLI**: Commander.js
- **Styling**: chalk 5 (terminal colors)

## Project Structure
```
src/
├── agents/        # AI agent integrations (Claude CLI, API agent, factory)
├── cli/           # Commander CLI entry point
├── deploy/        # Deploy phase (stub)
├── git/           # Git operations (stub)
├── orchestrator/  # Phase lifecycle orchestrator
├── store/         # File store (frontmatter markdown), session store (SQLite)
├── tui/           # Ink-based TUI components and command registry
├── types/         # TypeScript type definitions
└── types.ts       # Core shared types
```

## Conventions
- **File naming**: kebab-case for all files (`file-store.ts`, `api-agent.ts`)
- **Component naming**: PascalCase for React components (`ChatApp.tsx`, `MessageList.tsx`)
- **Exports**: Named exports preferred, no default exports
- **Data format**: YAML frontmatter + markdown body for `.fbloom/` documents
- **Database**: SQLite for runtime state, markdown for user-editable documents
- **Error handling**: Try/catch with user-friendly error messages in TUI

## Notes
- This is a self-hosting project — fbloom manages its own development
- The project follows the 7-phase lifecycle it implements
- Current version: 0.2.1
- TUI commands are registered in `src/tui/commands/registry.ts`
