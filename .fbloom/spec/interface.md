---
created: "2026-04-04T09:15:00.000Z"
updated: "2026-04-04T16:00:00.000Z"
module: interface
---

# Interface Design

## CLI Commands

```
fbloom                                # Launch Chat TUI (default, auto-detects .fbloom/)
fbloom init <path>                    # Create project in given directory
fbloom projects                       # List all projects
fbloom start <id>                     # Start/resume lifecycle
fbloom goal <id> "description"        # Set project goal
fbloom status <id>                    # Show project status
fbloom input <id> <value>             # Provide human input to orchestrator
fbloom dashboard                      # Legacy project dashboard TUI
fbloom config [--show|--set-*]        # View/edit configuration
```

Note: `migrate` command removed — no SQLite to migrate from. State is always file-based.

## Chat TUI Slash Commands

| Command | Description |
|---------|-------------|
| `/init <name>` | Create a new project |
| `/goal [text]` | Set or view project goal |
| `/spec [module]` | View spec modules or specific module |
| `/plan [done <step> <index>]` | View or update plan progress |
| `/status` | Show project status and phase |
| `/context` | View/edit project context |
| `/diff <from> <to>` | View version diff |
| `/log` | View change history |
| `/help` | Show all commands |
| `/quit` | Exit fbloom |

Non-`/` text is sent to the AI agent as free conversation.

## TUI Layout

```
┌─ fbloom │ project-name │ ▶ dev ────────────────────────┐
│                                                         │
│  [system] Project created: my-app                       │
│  [assistant] Spec generated with 4 modules.             │
│  [user] /spec                                           │
│  [system] ── spec/overview.md ──                        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ > ▎                                                     │
└─────────────────────────────────────────────────────────┘
```

Components:
- **StatusBar**: Project name, current phase indicator
- **MessageList**: Timestamped messages with role-based styling (system/assistant/user)
- **CommandInput**: Input with CJK character support, terminal-aware width

## Agent Interface

```typescript
interface AgentInterface {
  run(options: AgentRunOptions): Promise<AgentResult>;
  decompose(task: string): Promise<string[]>;
  isAvailable(): Promise<boolean>;
}

interface AgentRunOptions {
  prompt: string;
  cwd?: string;
  context?: string;
  onStream?: (chunk: string) => void;
  onTokenCount?: (count: number) => void;
}

interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
}
```

## Configuration

### Global config (~/.fbloom/config.json)

```json
{
  "default_agent": {
    "type": "claude-cli",
    "path": "claude"
  },
  "max_parallel_agents": 3,
  "default_max_retries": 3,
  "ai": {
    "api_format": "anthropic",
    "base_url": "https://api.anthropic.com",
    "api_key": "YOUR_API_KEY_HERE",
    "model": "claude-sonnet-4-6",
    "provider": "anthropic"
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

Per-project overrides (gitignored, may contain API keys). Inherits from global config. See `.fbloom/config.sample.json` for full schema.

## Events

```typescript
type ProjectEvent =
  | { type: "project_status_changed"; projectId: string; status: string }
  | { type: "phase_status_changed"; projectId: string; phase: string; status: string }
  | { type: "plan_step_status_changed"; stepId: string; status: string }
  | { type: "spec_updated"; projectId: string; moduleId: string }
  | { type: "human_input_required"; projectId: string; phase: string; prompt: string }
  | { type: "agent_output"; projectId: string; chunk: string }
  | { type: "log"; projectId: string; level: string; message: string };
```
