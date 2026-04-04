import type { AgentType } from "./agent.js";

export interface AgentConfig {
  type: AgentType;
  path: string;
  default_model?: string;
}

export interface DeployConfig {
  /** Git remote to push to (default: "origin") */
  remote?: string;
  /** Branch to push (default: current branch) */
  branch?: string;
  /** Create a GitHub Release after push (default: true) */
  createRelease?: boolean;
  /** Tag prefix for releases (default: "v") */
  tagPrefix?: string;
  /** Build command to verify before deploy (default: "npm run build") */
  buildCommand?: string;
  /** Whether to verify build before deploying (default: true) */
  verifyBuild?: boolean;
}

export interface AppConfig {
  /** @deprecated Use default_agent.path instead */
  claude_path?: string;
  default_agent: AgentConfig;
  agents: AgentConfig[];
  max_parallel_agents: number;
  default_max_retries: number;
  deploy: DeployConfig;
  ai?: AiConfig;
}

export interface AiConfig {
  /** API provider: "anthropic" (default) or "openai" for OpenAI-compatible endpoints */
  provider?: "anthropic" | "openai";
  /** Base URL for the API. Defaults to provider's official endpoint */
  base_url?: string;
  /** API key for authentication */
  api_key: string;
  /** Model name to use */
  model?: string;
}

/** Backward compat: old format had claude_path as top-level string */
export interface LegacyAppConfig {
  claude_path: string;
  max_parallel_agents?: number;
  default_max_retries?: number;
  deploy?: DeployConfig;
}
