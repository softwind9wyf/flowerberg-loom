import type { ProjectPhase, ProjectStatus, PhaseStateStatus } from "./project.js";
import type { PlanStepStatus } from "./plan.js";

export type ProjectEvent =
  | { type: "project_status"; projectId: string; status: ProjectStatus; phase: ProjectPhase }
  | { type: "phase_status"; projectId: string; phase: ProjectPhase; status: PhaseStateStatus }
  | { type: "plan_step_status"; projectId: string; stepId: string; status: PlanStepStatus }
  | { type: "spec_updated"; projectId: string; specId: string; version: number }
  | { type: "human_input_required"; projectId: string; phase: ProjectPhase; prompt: string }
  | { type: "agent_output"; projectId: string; chunk: string }
  | { type: "log"; projectId: string; message: string; level: "info" | "warn" | "error" };

// Backward compat — old orchestrator events
export type OrchestratorEvent = ProjectEvent;
