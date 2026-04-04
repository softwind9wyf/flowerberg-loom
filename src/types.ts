// Backward-compatible re-exports from new type modules
// Existing code importing from "../types.js" will continue to work

// Project types
export type {
  ProjectPhase,
  ProjectStatus,
  PhaseInteraction,
  ProjectState,
  PhaseStateInfo,
  Project,
  PhaseState,
  PhaseStateStatus,
} from "./types/project.js";

export {
  PHASE_ORDER,
  PHASE_INTERACTION,
} from "./types/project.js";

// Spec types
export type {
  SpecInfo,
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
