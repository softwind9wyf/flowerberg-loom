---
created: "2026-04-04T09:15:00.000Z"
updated: "2026-04-04T09:15:00.000Z"
ai_generated: true
---

# Data Model

## SQLite Tables

### projects
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| name | TEXT | Unique project name |
| current_phase | TEXT | One of: goal/spec/plan/dev/test/review/deploy |
| status | TEXT | active/paused/completed/failed/abandoned |
| project_path | TEXT | Absolute path to project directory |
| goal | TEXT | Project goal description |
| data_mode | TEXT | "file" (default) or "sqlite" (legacy) |

### phase_states
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | References projects |
| phase | TEXT | Phase name |
| status | TEXT | pending/in_progress/waiting_input/done/failed |

### plan_steps
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | References projects |
| phase | TEXT | Which phase this step belongs to |
| sequence | INTEGER | Execution order |
| title | TEXT | Step title |
| status | TEXT | pending/in_progress/done/failed |
| depends_on | TEXT | JSON array of step IDs |

## FileStore Structure

```
.fbloom/
  goal.md              # YAML frontmatter + goal text
  spec/
    _index.md          # Module index
    overview.md        # Spec modules (one per chapter)
    architecture.md
    data-model.md
    ...
  plan.md              # Markdown checklist with sections
```

### Plan Format

```markdown
## Dev
- [ ] Setup project structure
  <!-- fbloom-id: step-1 -->
  Initialize package.json and directory
- [x] Implement CLI
  <!-- fbloom-id: step-2 -->
  Commander.js subcommands
```
