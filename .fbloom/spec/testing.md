---
created: "2026-04-04T09:15:00.000Z"
updated: "2026-04-04T09:15:00.000Z"
ai_generated: true
---

# Testing Strategy

## Current Test Coverage

- **Store tests** (`src/store/__tests__/`): SQLite CRUD operations, migrations, phase states
- **FileStore tests** (`src/store/__tests__/file-store.test.ts`): Frontmatter parsing, goal/spec/plan read/write, plan checkbox parsing
- **Deploy handler tests** (`src/orchestrator/__tests__/deploy-handler.test.ts`): Build verification, git status checks, deploy confirmation flow, push+release execution
- **State machine tests** (`src/orchestrator/__tests__/state-machine.test.ts`): Phase transitions, human input pause/resume

## Testing Approach

- **Unit tests**: Vitest with mocked external dependencies (execCommand, agent)
- **Integration tests**: In-memory SQLite for store tests, temp directories for FileStore
- **No E2E tests yet**: TUI and full lifecycle would need interactive testing

## Future Improvements

- Add TUI component snapshot tests
- Add integration test for full lifecycle (goal → deploy) with mocked agent
- Add CLI command tests
