// Existing task/subtask types (kept for backward compat and standalone tasks)

export type TaskStatus =
  | "pending"
  | "decomposing"
  | "coding"
  | "testing"
  | "reviewing"
  | "deploying"
  | "done"
  | "failed";

export type SubtaskType = "code" | "test" | "review" | "deploy";

export interface Task {
  id: string;
  project_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  version: string;
  project_path: string;
  parent_task_id: string | null;
  plan_step_id: string | null;
  created_at: string;
  updated_at: string;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
}

export interface Subtask {
  id: string;
  task_id: string;
  type: SubtaskType;
  title: string;
  description: string;
  status: TaskStatus;
  assigned_agent: string | null;
  result: string | null;
  depends_on: string[];
  created_at: string;
  updated_at: string;
  error_message: string | null;
}

export interface LogEntry {
  id: string;
  task_id: string;
  subtask_id: string | null;
  agent: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  created_at: string;
}

// Version type (legacy, kept for store compat)
export interface Version {
  id: string;
  name: string;
  branch: string;
  worktree_path: string;
  base_branch: string;
  status: "active" | "merged" | "abandoned";
  created_at: string;
}
