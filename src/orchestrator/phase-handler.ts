import type { ProjectPhase } from "../types/project.js";
import type { AgentInterface, AgentRunOptions } from "../types/agent.js";
import type { Store } from "../store/index.js";
import type { PhaseResult } from "./state-machine.js";
import {
  SPEC_GENERATION_PROMPT,
  PLAN_GENERATION_PROMPT,
  AGENT_PROMPTS,
} from "../agents/prompt-templates.js";

export interface PhaseHandlerContext {
  projectId: string;
  projectPath: string;
  goal: string | null;
  store: Store;
  agent: AgentInterface;
  getPhaseOutput: (phase: ProjectPhase) => string | null;
}

export interface PhaseHandler {
  readonly phase: ProjectPhase;
  execute(ctx: PhaseHandlerContext): Promise<PhaseResult>;
}

// ---- Goal Phase ----
export class GoalPhaseHandler implements PhaseHandler {
  readonly phase: ProjectPhase = "goal";

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    // Goal phase is purely human-driven
    // The system waits for the user to provide a goal
    if (!ctx.goal) {
      return {
        success: false,
        requiresHumanInput: true,
        humanPrompt: "Please describe the goal of your project. What are you building and why?",
      };
    }

    // Goal already provided — mark done
    return { success: true, output: ctx.goal };
  }
}

// ---- Spec Phase ----
export class SpecPhaseHandler implements PhaseHandler {
  readonly phase: ProjectPhase = "spec";

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    const goal = ctx.goal;
    if (!goal) {
      return {
        success: false,
        error: "No goal defined. Cannot generate spec without a goal.",
      };
    }

    const result = await ctx.agent.run({
      type: "spec",
      prompt: SPEC_GENERATION_PROMPT.replace("{GOAL}", goal),
      cwd: ctx.projectPath,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Store spec in store
    ctx.store.createSpec({
      project_id: ctx.projectId,
      content: result.output,
      ai_generated: true,
    });

    // Spec needs human review
    return {
      success: true,
      output: result.output,
      requiresHumanInput: true,
      humanPrompt: "AI has generated a specification. Please review and approve or request changes:\n\n" + result.output.slice(0, 500) + "...",
    };
  }
}

// ---- Plan Phase ----
export class PlanPhaseHandler implements PhaseHandler {
  readonly phase: ProjectPhase = "plan";

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    const spec = ctx.getPhaseOutput("spec");
    if (!spec) {
      return { success: false, error: "No spec document found. Run spec phase first." };
    }

    const result = await ctx.agent.run({
      type: "plan",
      prompt: PLAN_GENERATION_PROMPT.replace("{SPEC}", spec),
      cwd: ctx.projectPath,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Parse plan steps from output
    let steps;
    try {
      const jsonMatch = result.output.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return { success: false, error: "Failed to parse plan steps from agent output" };
      }
      steps = JSON.parse(jsonMatch[0]);
    } catch {
      return { success: false, error: "Invalid JSON in plan output" };
    }

    if (!Array.isArray(steps) || steps.length === 0) {
      return { success: false, error: "No plan steps generated" };
    }

    // Store plan steps
    const createdIds: string[] = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const deps = (step.depends_on || [])
        .filter((idx: number) => idx < createdIds.length)
        .map((idx: number) => createdIds[idx]);

      const created = ctx.store.createPlanStep({
        project_id: ctx.projectId,
        phase: step.phase || "dev",
        sequence: i,
        title: step.title,
        description: step.description,
        depends_on: deps,
      });
      createdIds.push(created.id);
    }

    return {
      success: true,
      output: `Created ${steps.length} plan steps`,
    };
  }
}

// ---- Dev Phase ----
export class DevPhaseHandler implements PhaseHandler {
  readonly phase: ProjectPhase = "dev";

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    return await executeAutonomousPhase(ctx, "dev");
  }
}

// ---- Test Phase ----
export class TestPhaseHandler implements PhaseHandler {
  readonly phase: ProjectPhase = "test";

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    return await executeAutonomousPhase(ctx, "test");
  }
}

// ---- Review Phase ----
export class ReviewPhaseHandler implements PhaseHandler {
  readonly phase: ProjectPhase = "review";

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    return await executeAutonomousPhase(ctx, "review");
  }
}

// ---- Deploy Phase ----
export class DeployPhaseHandler implements PhaseHandler {
  readonly phase: ProjectPhase = "deploy";

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    return await executeAutonomousPhase(ctx, "deploy");
  }
}

// ---- Helper: execute autonomous phase (dev/test/review/deploy) ----
async function executeAutonomousPhase(
  ctx: PhaseHandlerContext,
  phaseType: string,
): Promise<PhaseResult> {
  // Get ready plan steps for this phase
  const readySteps = ctx.store.getReadyPlanSteps(ctx.projectId, phaseType as ProjectPhase);

  if (readySteps.length === 0) {
    // Check if all steps are done
    const allSteps = ctx.store.getPlanSteps(ctx.projectId)
      .filter((s) => s.phase === phaseType);

    if (allSteps.length === 0) {
      return { success: true, output: `No plan steps for ${phaseType} phase, skipping.` };
    }

    if (allSteps.every((s) => s.status === "done")) {
      return { success: true, output: `All ${phaseType} steps completed.` };
    }

    // Some steps are pending but not ready (blocked by dependencies)
    return { success: false, error: `No ready steps for ${phaseType} phase. Dependencies not met.` };
  }

  // Execute each ready step
  const results: string[] = [];
  for (const step of readySteps) {
    ctx.store.updatePlanStepStatus(step.id, "in_progress");

    // Gather context from completed dependencies
    const siblings = ctx.store.getPlanSteps(ctx.projectId);
    const contextParts: string[] = [];
    for (const depId of JSON.parse(step.depends_on as unknown as string) as string[]) {
      const dep = siblings.find((s) => s.id === depId);
      if (dep?.result) {
        contextParts.push(`--- Completed: "${dep.title}" ---\n${dep.result}`);
      }
    }
    const context = contextParts.length > 0 ? contextParts.join("\n\n") : undefined;

    const agentType = phaseType === "dev" ? "code" : phaseType === "test" ? "test" : phaseType === "review" ? "review" : "deploy";

    const result = await ctx.agent.run({
      type: agentType,
      prompt: step.description,
      cwd: ctx.projectPath,
      context,
    });

    if (!result.success) {
      ctx.store.updatePlanStepStatus(step.id, "failed", undefined, result.error);
      return { success: false, error: `Step "${step.title}" failed: ${result.error}` };
    }

    ctx.store.updatePlanStepStatus(step.id, "done", result.output);
    results.push(`[${step.title}] ${result.output.slice(0, 100)}`);
  }

  return {
    success: true,
    output: results.join("\n"),
  };
}
