// Legacy export: AgentRunner (backward compat with old orchestrator)
export { ClaudeCodeAgent as AgentRunner } from "./claude-cli.js";

// New exports
export { AgentFactory } from "./factory.js";
export { AGENT_PROMPTS, DECOMPOSE_PROMPT, SPEC_GENERATION_PROMPT, PLAN_GENERATION_PROMPT } from "./prompt-templates.js";
