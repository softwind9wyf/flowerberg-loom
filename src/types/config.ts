import type { AgentType } from "./agent.js";

export interface AgentConfig {
  type: AgentType;
  path: string;
  default_model?: string;
}

export interface DeployConfig {
  host: string;
  port: number;
  user: string;
  path: string;
  ssh_key?: string;
}

export interface AppConfig {
  /** @deprecated Use default_agent.path instead */
  claude_path?: string;
  default_agent: AgentConfig;
  agents: AgentConfig[];
  max_parallel_agents: number;
  default_max_retries: number;
  deploy: DeployConfig;
}

/** Backward compat: old format had claude_path as top-level string */
export interface LegacyAppConfig {
  claude_path: string;
  max_parallel_agents?: number;
  default_max_retries?: number;
  deploy?: DeployConfig;
}
