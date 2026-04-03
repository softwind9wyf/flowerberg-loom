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
  | "paused"
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

export interface Project {
  id: string;
  name: string;
  description: string;
  current_phase: ProjectPhase;
  status: ProjectStatus;
  project_path: string;
  goal: string | null;
  goal_metadata: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export type PhaseStateStatus =
  | "pending"
  | "in_progress"
  | "waiting_input"
  | "done"
  | "failed";

export interface PhaseState {
  id: string;
  project_id: string;
  phase: ProjectPhase;
  status: PhaseStateStatus;
  started_at: string | null;
  completed_at: string | null;
  input_data: string | null;
  output_data: string | null;
  error_message: string | null;
}
