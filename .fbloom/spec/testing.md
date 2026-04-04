---
created: "2026-04-04T09:15:00.000Z"
updated: "2026-04-04T16:00:00.000Z"
module: testing
---

# Testing Strategy

## Current Test Coverage

### Store Tests (src/store/__tests__/)

- **file-store.test.ts**: Frontmatter parsing, goal/spec/plan read/write, plan checkbox parsing, git auto-commit
- **Session store tests**: SQLite CRUD operations, schema migrations, phase state transitions, project logging

### Orchestrator Tests (src/orchestrator/__tests__/)

- **state-machine.test.ts**: Phase transitions, human input pause/resume, invalid transition rejection
- **deploy-handler.test.ts**: Build verification, git status checks, deploy confirmation flow, push + release execution

## Testing Approach

### Unit Tests
- **Framework**: Vitest
- **Strategy**: Mock external dependencies (execCommand, agent, git)
- **Database**: In-memory SQLite (`:memory:`) for store tests
- **FileStore**: Temporary directories (`os.tmpdir()`) for file tests

### Integration Tests
- Store + orchestrator interaction
- Full phase lifecycle with mocked agent
- Configuration loading and validation

### Not Yet Tested
- TUI components (Ink/React rendering)
- Full end-to-end lifecycle (goal → deploy)
- CLI subcommand routing
- Agent streaming behavior
- Session compression and summarization

## Test Commands

```bash
npm test          # Run all tests once
npm run test:watch # Run tests in watch mode
```

## Testing Criteria Per Module

| Module | What to Test |
|--------|-------------|
| agents | Agent availability check, prompt construction, streaming, error handling |
| store/file-store | Frontmatter parse/serialize, CRUD operations, git integration |
| store/session-store | Migrations, CRUD, query filters |
| orchestrator/state-machine | Phase transitions, input handling, state persistence |
| orchestrator/phase-handlers | Each handler's execute/input flow |
| tui/commands | Command registration, routing, argument parsing |
| cli | Subcommand definitions, config loading |
