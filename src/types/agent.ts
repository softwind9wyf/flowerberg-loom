export type AgentType = "claude-cli" | "opencode" | "custom";

export interface AgentRunOptions {
  type?: string;          // task type hint (code, test, review, deploy)
  prompt: string;         // the main prompt / task description
  cwd: string;            // working directory for the agent
  context?: string;       // additional context from completed dependencies
  systemPrompt?: string;  // override the default system prompt
  messages?: Array<{ role: "user" | "assistant"; content: string }>; // conversation history
  onChunk?: (chunk: string) => void;  // streaming callback
}

export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface AgentInterface {
  readonly type: AgentType;
  run(options: AgentRunOptions): Promise<AgentResult>;
  decompose(options: Omit<AgentRunOptions, "type">): Promise<AgentResult>;
  isAvailable(): Promise<boolean>;
}
