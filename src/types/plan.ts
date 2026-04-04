import type { ProjectPhase } from "./project.js";

export type PlanStepStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "failed";

/** Plan step — derived from plan.md checkboxes. No separate storage needed. */
export interface PlanStep {
  id: string;
  phase: ProjectPhase;
  sequence: number;
  title: string;
  description: string;
  status: PlanStepStatus;
  depends_on: string[];
}
