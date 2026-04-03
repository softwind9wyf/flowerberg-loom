import { spawn } from "child_process";
import type { AgentResult, AppConfig } from "../types.js";
import type { AgentType, AgentInterface, AgentRunOptions } from "../types/agent.js";

/**
 * ClaudeCodeAgent — executes Claude Code CLI as a subprocess.
 *
 * This is the legacy agent that wraps the Claude Code CLI.
 * It will be replaced by the new AgentInterface in Step 2.
 */
export class ClaudeCodeAgent implements AgentInterface {
  readonly type = "claude-cli" as const;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  async run(options: AgentRunOptions): Promise<AgentResult> {
    const type = options.type || "code";
    const systemPrompt = this.getSystemPrompt(type);
    const fullPrompt = options.context
      ? `${options.prompt}\n\nAdditional context:\n${options.context}`
      : options.prompt;

    return this.execClaude(fullPrompt, systemPrompt, options.cwd, options.onChunk);
  }

  async decompose(options: Omit<AgentRunOptions, "type">): Promise<AgentResult> {
    const systemPrompt = `You are an expert software architect. Analyze the codebase and break down the user's request into concrete, implementable subtasks.

First, explore the project structure to understand what exists. Then create a plan.

For each subtask, provide:
- type: "code" | "test" | "review" | "deploy"
- title: short title
- description: detailed description of what needs to be done
- depends_on: list of subtask indices this depends on (0-based)

Output ONLY valid JSON array at the end, no markdown fences:
[{"type":"code","title":"...","description":"...","depends_on":[]}]`;

    return this.execClaude(
      `Analyze this project and create an implementation plan for:\n\n${options.prompt}`,
      systemPrompt,
      options.cwd,
    );
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(this.config.default_agent.path, ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      proc.on("close", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
    });
  }

  private getSystemPrompt(type: string): string {
    const prompts: Record<string, string> = {
      code: `You are an expert software developer working on a specific subtask of a larger project.

Rules:
- Read the existing codebase to understand conventions and structure before writing code
- Write clean, well-structured code following existing patterns
- After writing code, run relevant tests to verify your changes work
- If tests fail, fix the issues and re-run until they pass
- Do NOT add unnecessary features, comments, or abstractions beyond what was asked
- When done, output a brief summary of what you changed`,

      test: `You are a test engineer. Your job is to write and run tests for code changes.

Rules:
- Read the existing code to understand what needs testing
- Use the project's existing test framework and conventions
- Write tests for both happy path and error cases
- Run the tests and verify they pass
- If tests fail, investigate and fix either the test or the code as appropriate
- When done, output a brief summary of test results`,

      review: `You are a senior code reviewer. Review the recent code changes in this project.

Check for:
1. Correctness — does the code do what it's supposed to?
2. Security — any injection, XSS, or other vulnerabilities?
3. Performance — any obvious bottlenecks?
4. Code style — does it follow project conventions?
5. Error handling — are edge cases covered?

Run the tests to verify nothing is broken. Then output your review as JSON:
{"approved": true/false, "issues": ["..."], "suggestions": ["..."]}`,

      deploy: `You are a deployment specialist. Prepare and deploy the project.

Rules:
- Run build/check commands to verify the project is ready
- Check for any obvious issues before deploying
- Follow the deployment instructions provided
- Report the deployment result`,
    };
    return prompts[type] || "";
  }

  private execClaude(
    prompt: string,
    systemPrompt: string,
    cwd: string,
    onChunk?: (chunk: string) => void,
  ): Promise<AgentResult> {
    return new Promise((resolve) => {
      const args = [
        "-p", prompt,
        "--system-prompt", systemPrompt,
        "--output-format", "text",
        "--dangerously-skip-permissions",
        "--verbose",
      ];

      const proc = spawn(this.config.default_agent.path, args, {
        cwd,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        onChunk?.(chunk);
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve({ success: true, output: stdout.trim() });
        } else {
          resolve({
            success: false,
            output: stdout.trim(),
            error: stderr.trim() || `Process exited with code ${code}`,
          });
        }
      });

      proc.on("error", (err) => {
        resolve({ success: false, output: "", error: err.message });
      });
    });
  }
}
