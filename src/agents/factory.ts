import type { AgentType, AgentInterface } from "../types/agent.js";
import type { AppConfig } from "../types/config.js";
import { ClaudeCodeAgent } from "./claude-cli.js";

export class AgentFactory {
  private creators: Map<AgentType, (config: AppConfig) => AgentInterface>;

  constructor() {
    this.creators = new Map([
      ["claude-cli", (config) => new ClaudeCodeAgent(config)],
    ]);
  }

  create(type: AgentType, config: AppConfig): AgentInterface {
    const creator = this.creators.get(type);
    if (!creator) {
      throw new Error(`Unknown agent type: ${type}`);
    }
    return creator(config);
  }

  getDefault(appConfig: AppConfig): AgentInterface {
    return this.create(appConfig.default_agent.type, appConfig);
  }
}
