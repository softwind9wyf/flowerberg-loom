// Backward-compatible re-exports from new type modules
// Existing code importing from "../types.js" will continue to work

// Legacy task types
export type {
  TaskStatus,
  SubtaskType,
  Task,
  Subtask,
  LogEntry,
} from "./types/task.js";

// Project types
export type {
  ProjectPhase,
  ProjectStatus,
  PhaseInteraction,
  Project,
  PhaseStateStatus,
  PhaseState,
} from "./types/project.js";

export {
  PHASE_ORDER,
  PHASE_INTERACTION,
} from "./types/project.js";

// Spec types
export type {
  SpecDocument,
  SpecStatus,
} from "./types/spec.js";

// Plan types
export type {
  PlanStepStatus,
  PlanStep,
} from "./types/plan.js";

// Agent types
export type {
  AgentType,
  AgentRunOptions,
  AgentResult,
  AgentInterface,
} from "./types/agent.js";

// Config types
export type {
  AgentConfig,
  AppConfig,
} from "./types/config.js";

// Event types
export type {
  ProjectEvent,
} from "./types/events.js";

// Version type (legacy, kept here for store compat)
export interface Version {
  id: string;
  name: string;
  branch: string;
  worktree_path: string;
  base_branch: string;
  status: "active" | "merged" | "abandoned";
  created_at: string;
}
