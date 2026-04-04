---
created: "2026-04-04T09:15:00.000Z"
updated: "2026-04-04T16:00:00.000Z"
module: data-model
---

# Data Model

## SQLite Tables (session-store.ts)

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
| project_id | TEXT FK | References projects.id |
| phase | TEXT | Phase name |
| status | TEXT | pending/in_progress/waiting_input/done/failed |

### spec_documents
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | References projects.id |
| version | INTEGER | Spec version number |
| content | TEXT | Full spec content (markdown) |
| status | TEXT | draft/review/approved/rejected |
| ai_generated | BOOLEAN | Whether AI generated this spec |
| parent_version_id | TEXT | Previous version for audit trail |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### plan_steps
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | References projects.id |
| phase | TEXT | Which phase this step belongs to |
| sequence | INTEGER | Execution order |
| title | TEXT | Step title |
| status | TEXT | pending/in_progress/done/failed |
| depends_on | TEXT | JSON array of step IDs |

### project_logs
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | References projects.id |
| phase | TEXT | Phase name |
| action | TEXT | Action description |
| details | TEXT | JSON details |
| timestamp | TEXT | ISO timestamp |

### Migrations
- Schema versioning via `_meta` table
- Migration files run sequentially on startup

## FileStore Structure (.fbloom/)

```
.fbloom/
├── goal.md          # YAML frontmatter + goal text (1-3 sentences)
├── context.md       # Tech stack, conventions, notes
├── config.json      # Project-level config
├── spec/
│   ├── _index.md    # Module index with links
│   ├── overview.md  # Architecture overview
│   └── *.md         # Individual spec modules
├── plan.md          # Markdown checklist with sections
└── sessions/        # Chat session history (JSON)
```

### Frontmatter Format

All markdown files use YAML frontmatter:

```yaml
---
status: active
created: "2026-04-04T09:15:00.000Z"
updated: "2026-04-04T16:00:00.000Z"
---

<markdown content>
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

- `<!-- fbloom-id: ... -->` comments link checklist items to plan_steps table
- Checked items (`[x]`) map to `done` status

## SessionStore

Chat sessions stored as JSON files in `sessions/`:

```typescript
interface Session {
  id: string;
  projectId: string;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}
```

- Automatic compression when messages exceed configurable max chars
- Optional AI-powered summarization
