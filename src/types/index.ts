// Re-export all types from submodules

// === Project types ===
export type {
  ProjectPhase,
  ProjectStatus,
  PhaseInteraction,
  Project,
  PhaseStateStatus,
  PhaseState,
} from "./project.js";

export {
  PHASE_ORDER,
  PHASE_INTERACTION,
} from "./project.js";

// === Spec types ===
export type {
  SpecDocument,
  SpecStatus,
} from "./spec.js";

// === Plan types ===
export type {
  PlanStepStatus,
  PlanStep,
} from "./plan.js";

// === Agent types ===
export type {
  AgentType,
  AgentRunOptions,
  AgentResult,
  AgentInterface,
} from "./agent.js";

// === Config types ===
export type {
  AgentConfig,
  AppConfig,
} from "./config.js";

// === Event types ===
export type {
  ProjectEvent,
} from "./events.js";
