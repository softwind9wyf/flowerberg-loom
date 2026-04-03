import Anthropic from "@anthropic-ai/sdk";
import type { AgentResult, AppConfig, SubtaskType } from "../types.js";

const SYSTEM_PROMPTS: Record<SubtaskType | "orchestrator", string> = {
  orchestrator: `You are an expert software architect. Your job is to break down a user's feature request into concrete, implementable subtasks.

For each subtask, provide:
- type: "code" | "test" | "review" | "deploy"
- title: short title
- description: detailed description of what needs to be done
- depends_on: list of subtask indices this depends on (0-based)

Output ONLY valid JSON array, no markdown:
[{"type":"code","title":"...","description":"...","depends_on":[]}]
`,

  code: `You are an expert software developer. You will be given a task description and you must write the code to implement it.

Rules:
- Write clean, well-structured code
- Follow existing project conventions
- Include error handling for external inputs
- Return the code with file paths as headers

Format your response as:
### File: path/to/file.ts
\`\`\`typescript
// code here
\`\`\`

### File: path/to/another-file.ts
\`\`\`typescript
// code here
\`\`\`
`,

  test: `You are a test engineer. Given a code task, write comprehensive tests.

Rules:
- Test both happy path and error cases
- Use the project's existing test framework
- Be thorough but practical

Format your response as:
### File: path/to/test.ts
\`\`\`typescript
// test code here
\`\`\`
`,

  review: `You are a senior code reviewer. Review the code changes for:
1. Correctness
2. Security issues
3. Performance concerns
4. Code style and conventions
5. Missing error handling

Respond with JSON:
{"approved": true/false, "issues": ["issue1", "issue2"], "suggestions": ["suggestion1"]}
`,
};

export class AgentRunner {
  private client: Anthropic;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.anthropic_api_key });
  }

  private getModelForType(type: SubtaskType | "orchestrator"): string {
    switch (type) {
      case "orchestrator":
        return this.config.model_orchestrator;
      case "review":
        return this.config.model_reviewer;
      default:
        return this.config.model_coder;
    }
  }

  async run(
    type: SubtaskType | "orchestrator",
    prompt: string,
    context?: string
  ): Promise<AgentResult> {
    const fullPrompt = context ? `${prompt}\n\nContext:\n${context}` : prompt;

    try {
      const response = await this.client.messages.create({
        model: this.getModelForType(type),
        max_tokens: 8192,
        system: SYSTEM_PROMPTS[type],
        messages: [{ role: "user", content: fullPrompt }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        return { success: false, output: "", error: "No text response from model" };
      }

      return { success: true, output: textBlock.text };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, output: "", error: msg };
    }
  }

  async decompose(taskDescription: string): Promise<AgentResult> {
    return this.run("orchestrator", taskDescription);
  }
}
