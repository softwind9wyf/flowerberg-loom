import type { AgentType, AgentInterface, AgentRunOptions, AgentResult } from "../types/agent.js";
import type { AppConfig, AiConfig } from "../types/config.js";

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
};

export class ApiAgent implements AgentInterface {
  readonly type = "claude-cli" as const; // keep compatible
  private ai: AiConfig;
  private apiFormat: "anthropic" | "openai";

  constructor(config: AppConfig) {
    if (!config.ai?.api_key) {
      throw new Error("ApiAgent requires ai.api_key in config");
    }
    this.ai = config.ai;
    this.apiFormat = this.ai.api_format || "anthropic";
  }

  async run(options: AgentRunOptions): Promise<AgentResult> {
    const type = options.type || "code";
    const systemPrompt = options.systemPrompt || this.getSystemPrompt(type);
    const userPrompt = options.context
      ? `${options.prompt}\n\nAdditional context:\n${options.context}`
      : options.prompt;

    try {
      const output = await this.callApi(systemPrompt, userPrompt, options.onChunk, options.messages);
      return { success: true, output };
    } catch (err) {
      return {
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async decompose(options: Omit<AgentRunOptions, "type">): Promise<AgentResult> {
    const systemPrompt = `You are an expert software architect. Analyze the codebase and break down the user's request into concrete, implementable subtasks.

For each subtask, provide:
- type: "code" | "test" | "review" | "deploy"
- title: short title
- description: detailed description of what needs to be done
- depends_on: list of subtask indices this depends on (0-based)

Output ONLY valid JSON array, no markdown fences:
[{"type":"code","title":"...","description":"...","depends_on":[]}]`;

    try {
      const output = await this.callApi(
        systemPrompt,
        `Analyze this project and create an implementation plan for:\n\n${options.prompt}`,
        undefined,
        undefined,
      );
      return { success: true, output };
    } catch (err) {
      return {
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.ai.api_key;
  }

  private async callApi(
    systemPrompt: string,
    userPrompt: string,
    onChunk?: (chunk: string) => void,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<string> {
    if (this.apiFormat === "openai") {
      return this.callOpenAI(systemPrompt, userPrompt, onChunk, history);
    }
    return this.callAnthropic(systemPrompt, userPrompt, onChunk, history);
  }

  private async callAnthropic(
    systemPrompt: string,
    userPrompt: string,
    onChunk?: (chunk: string) => void,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<string> {
    const baseUrl = (this.ai.base_url || DEFAULT_BASE_URLS.anthropic).replace(/\/+$/, "");
    const model = this.ai.model || DEFAULT_MODELS.anthropic;
    const url = `${baseUrl}/v1/messages`;

    const messages = [...(history || []), { role: "user" as const, content: userPrompt }];

    const body = JSON.stringify({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages,
      stream: !!onChunk,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.ai.api_key,
        "anthropic-version": "2023-06-01",
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${text}`);
    }

    if (onChunk && response.body) {
      return this.readSSE(response.body, onChunk);
    }

    const data = await response.json() as { content: Array<{ type: string; text: string }> };
    return data.content?.map((c) => c.text).join("") ?? "";
  }

  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    onChunk?: (chunk: string) => void,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<string> {
    const baseUrl = (this.ai.base_url || DEFAULT_BASE_URLS.openai).replace(/\/+$/, "");
    const model = this.ai.model || DEFAULT_MODELS.openai;
    const url = `${baseUrl}/v1/chat/completions`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...(history || []),
      { role: "user" as const, content: userPrompt },
    ];

    const body = JSON.stringify({
      model,
      messages,
      stream: !!onChunk,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.ai.api_key}`,
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI-compatible API error ${response.status}: ${text}`);
    }

    if (onChunk && response.body) {
      return this.readSSE(response.body, onChunk);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  }

  private async readSSE(body: ReadableStream<Uint8Array>, onChunk: (chunk: string) => void): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const text = this.parseSSELine(line);
        if (text) {
          fullText += text;
          onChunk(text);
        }
      }
    }

    return fullText;
  }

  private parseSSELine(line: string): string | null {
    if (!line.startsWith("data: ")) return null;
    const data = line.slice(6).trim();
    if (data === "[DONE]") return null;

    try {
      const json = JSON.parse(data);

      // Anthropic format
      if (json.type === "content_block_delta" && json.delta?.text) {
        return json.delta.text;
      }
      // OpenAI format
      if (json.choices?.[0]?.delta?.content) {
        return json.choices[0].delta.content;
      }
    } catch {
      // ignore malformed SSE lines
    }
    return null;
  }

  private getSystemPrompt(type: string): string {
    const prompts: Record<string, string> = {
      code: `You are an expert software developer. Help the user with their project.
- Be concise and practical
- Read and understand existing code before suggesting changes
- Follow existing project conventions`,

      test: `You are a test engineer. Help write and run tests.
- Use the project's existing test framework
- Cover both happy path and error cases`,

      review: `You are a senior code reviewer. Review code for correctness, security, performance, and style.
Output your review as JSON:
{"approved": true/false, "issues": ["..."], "suggestions": ["..."]}`,

      deploy: `You are a deployment specialist. Help prepare and deploy the project.`,
    };
    return prompts[type] || "You are a helpful AI assistant.";
  }
}
