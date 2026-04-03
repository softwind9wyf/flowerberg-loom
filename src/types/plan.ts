import type { ProjectPhase } from "./project.js";

import type { AgentResult } from "./agent.js";

export type PlanStepStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "failed"
  | "skipped";

export interface PlanStep {
  id: string;
  project_id: string;
  phase: ProjectPhase;
  sequence: number;
  title: string;
  description: string;
  status: PlanStepStatus;
  depends_on: string[];
  assigned_agent: string | null;
  result: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}
