// Legacy Orchestrator — kept for backward compat with `fbloom submit`
// New project-based orchestration is in ProjectOrchestrator

export { Orchestrator, type OrchestratorEvent } from "./legacy.js";
export { ProjectOrchestrator, type ProjectStatusView } from "./project.js";
export { PhaseStateMachine, type PhaseResult } from "./state-machine.js";
export {
  GoalPhaseHandler,
  SpecPhaseHandler,
  PlanPhaseHandler,
  DevPhaseHandler,
  TestPhaseHandler,
  ReviewPhaseHandler,
  DeployPhaseHandler,
  type PhaseHandlerContext,
  type PhaseHandler,
} from "./phase-handler.js";
export { GitWorktreeManager, type WorktreeInfo } from "./git.js";
