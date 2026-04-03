import { spawn } from "child_process";
import type { AgentResult, AppConfig, SubtaskType } from "../types.js";

const AGENT_PROMPTS: Record<SubtaskType, string> = {
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

export class AgentRunner {
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  /**
   * Run a Claude Code CLI instance for the given subtask type.
   * Claude Code will have full tool access (read, write, bash, etc.)
   * and operate autonomously in the project directory.
   */
  async run(
    type: SubtaskType,
    taskDescription: string,
    projectPath: string,
    context?: string,
  ): Promise<AgentResult> {
    const model = this.getModelForType(type);
    const systemPrompt = AGENT_PROMPTS[type];

    const fullPrompt = context
      ? `${taskDescription}\n\nAdditional context:\n${context}`
      : taskDescription;

    return this.execClaude(fullPrompt, systemPrompt, model, projectPath);
  }

  /**
   * Decompose a task using Claude Code CLI with structured output.
   * This still uses the orchestrator model for task planning.
   */
  async decompose(taskDescription: string, projectPath: string): Promise<AgentResult> {
    const systemPrompt = `You are an expert software architect. Analyze the codebase and break down the user's request into concrete, implementable subtasks.

First, explore the project structure to understand what exists. Then create a plan.

For each subtask, provide:
- type: "code" | "test" | "review" | "deploy"
- title: short title
- description: detailed description of what needs to be done
- depends_on: list of subtask indices this depends on (0-based)

Output ONLY valid JSON array at the end, no markdown fences:
[{"type":"code","title":"...","description":"...","depends_on":[]}]`;

    const prompt = `Analyze this project and create an implementation plan for:\n\n${taskDescription}`;

    return this.execClaude(prompt, systemPrompt, this.config.model_orchestrator, projectPath);
  }

  private getModelForType(type: SubtaskType): string {
    switch (type) {
      case "review":
        return this.config.model_reviewer;
      default:
        return this.config.model_coder;
    }
  }

  private execClaude(
    prompt: string,
    systemPrompt: string,
    model: string,
    cwd: string,
  ): Promise<AgentResult> {
    return new Promise((resolve) => {
      const args = [
        "-p",
        prompt,
        "--model", model,
        "--system-prompt", systemPrompt,
        "--output-format", "text",
        "--dangerously-skip-permissions",
        "--verbose",
      ];

      const proc = spawn(this.config.claude_path, args, {
        cwd,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
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
