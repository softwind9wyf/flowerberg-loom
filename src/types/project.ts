export type ProjectPhase =
  | "goal"
  | "spec"
  | "plan"
  | "dev"
  | "test"
  | "review"
  | "deploy";

export type ProjectStatus =
  | "active"
  | "completed"
  | "failed"
  | "abandoned";

export type PhaseInteraction = "human" | "autonomous" | "hybrid";

export const PHASE_ORDER: ProjectPhase[] = [
  "goal",
  "spec",
  "plan",
  "dev",
  "test",
  "review",
  "deploy",
];

export const PHASE_INTERACTION: Record<ProjectPhase, PhaseInteraction> = {
  goal: "human",
  spec: "hybrid",
  plan: "autonomous",
  dev: "autonomous",
  test: "autonomous",
  review: "autonomous",
  deploy: "hybrid",
};

export type PhaseStateStatus =
  | "pending"
  | "in_progress"
  | "waiting_input"
  | "done"
  | "failed";

/** Phase state entry in state.json */
export interface PhaseStateInfo {
  status: PhaseStateStatus;
  started_at?: string | null;
  completed_at?: string | null;
  input_data?: string | null;
  output_data?: string | null;
  error_message?: string | null;
}

/** state.json structure — the project state index */
export interface ProjectState {
  name: string;
  current_phase: ProjectPhase;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  phases: Partial<Record<ProjectPhase, PhaseStateInfo>>;
}

/** Backward-compatible project view (used by TUI, CLI) */
export interface Project {
  name: string;
  description: string;
  current_phase: ProjectPhase;
  status: ProjectStatus;
  project_path: string;
  goal: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** @deprecated Kept for gradual migration — prefer ProjectState */
export interface PhaseState {
  phase: ProjectPhase;
  status: PhaseStateStatus;
  started_at: string | null;
  completed_at: string | null;
  input_data: string | null;
  output_data: string | null;
  error_message: string | null;
}
