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
  title: string;
  description: string;
  status: TaskStatus;
  version: string;
  project_path: string;
  parent_task_id: string | null;
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

export interface Version {
  id: string;
  name: string;
  branch: string;
  worktree_path: string;
  base_branch: string;
  status: "active" | "merged" | "abandoned";
  created_at: string;
}

export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface AppConfig {
  claude_path: string;
  model_coder: string;
  model_reviewer: string;
  model_orchestrator: string;
  max_parallel_agents: number;
  default_max_retries: number;
  deploy: {
    host: string;
    port: number;
    user: string;
    path: string;
    ssh_key?: string;
  };
}
