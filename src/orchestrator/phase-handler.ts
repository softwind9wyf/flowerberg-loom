import { readFileSync } from "fs";
import { resolve } from "path";
import type { ProjectPhase } from "../types/project.js";
import type { AgentInterface } from "../types/agent.js";
import type { AppConfig, DeployConfig } from "../types/config.js";
import type { ProjectEvent } from "../types/events.js";
import type { Store } from "../store/index.js";
import type { FileStore } from "../store/file-store.js";
import type { PhaseResult } from "./state-machine.js";
import { execCommand } from "./exec.js";
import {
  SPEC_GENERATION_PROMPT,
  PLAN_GENERATION_PROMPT,
} from "../agents/prompt-templates.js";

export interface PhaseHandlerContext {
  projectId: string;
  projectPath: string;
  goal: string | null;
  store: Store;
  fileStore: FileStore | null;
  agent: AgentInterface;
  config: AppConfig;
  getPhaseOutput: (phase: ProjectPhase) => string | null;
  emit: (event: ProjectEvent) => void;
}

export interface PhaseHandler {
  readonly phase: ProjectPhase;
  execute(ctx: PhaseHandlerContext): Promise<PhaseResult>;
}

// ---- Goal Phase ----
export class GoalPhaseHandler implements PhaseHandler {
  readonly phase: ProjectPhase = "goal";

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    if (!ctx.goal) {
      return {
        success: false,
        requiresHumanInput: true,
        humanPrompt: "Please describe the goal of your project. What are you building and why?",
      };
    }
    return { success: true, output: ctx.goal };
  }
}

// ---- Spec Phase ----
export class SpecPhaseHandler implements PhaseHandler {
  readonly phase: ProjectPhase = "spec";

  async execute(ctx: PhaseHandlerContext): Promise<PhaseResult> {
    const goal = ctx.goal;
    if (!goal) {
      return { success: false, error: "No goal defined. Cannot generate spec without a goal." };
    }

    const result = await ctx.agent.run({
      type: "spec",
      prompt: SPEC_GENERATION_PROMPT.replace("{GOAL}", goal),
      cwd: ctx.projectPath,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    ctx.store.createSpec({
      project_id: ctx.projectId,
      content: result.output,
      ai_generated: true,
    });

    // Also write to FileStore if available
    if (ctx.fileStore) {
      const modules = splitSpecIntoModules(result.output);
      const moduleNames: string[] = [];
      for (const [name, content] of modules) {
        ctx.fileStore.writeSpecModule(name, content);
        moduleNames.push(name);
      }
      ctx.fileStore.writeSpecIndex(moduleNames);
      ctx.fileStore.commitSpec();
    }

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

    // Also write to FileStore if available
    if (ctx.fileStore) {
      const planMd = buildPlanMarkdown(steps);
      ctx.fileStore.writePlanRaw(planMd);
    }

    return { success: true, output: `Created ${steps.length} plan steps` };
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
    const deployConfig = ctx.config.deploy ?? {};
    const cwd = ctx.projectPath;

    // Check if we're resuming after human confirmation
    const phaseState = ctx.store.getPhaseState(ctx.projectId, "deploy");
    const inputData = phaseState?.input_data ? JSON.parse(phaseState.input_data) : null;

    if (inputData?.confirmed) {
      return this.executePushAndRelease(ctx, deployConfig, cwd);
    }

    // --- Pre-confirmation flow ---

    // Step 1: Verify build
    if (deployConfig.verifyBuild !== false) {
      const buildCmd = deployConfig.buildCommand || "npm run build";
      ctx.emit({ type: "log", projectId: ctx.projectId, message: `Verifying build: ${buildCmd}`, level: "info" });

      const parts = buildCmd.split(" ");
      const buildResult = await execCommand(parts[0], parts.slice(1), cwd);
      if (buildResult.exitCode !== 0) {
        return { success: false, error: `Build verification failed:\n${buildResult.stderr || buildResult.stdout}` };
      }
      ctx.emit({ type: "log", projectId: ctx.projectId, message: "Build verified successfully", level: "info" });
    }

    // Step 2: Check git status
    const statusResult = await execCommand("git", ["status", "--porcelain"], cwd);
    if (statusResult.stdout.trim().length > 0) {
      const files = statusResult.stdout.trim().split("\n").slice(0, 10).join("\n");
      return { success: false, error: `Working tree has uncommitted changes:\n${files}` };
    }

    // Step 3: Get branch
    const branchResult = await execCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    if (branchResult.exitCode !== 0) {
      return { success: false, error: "Failed to determine current branch" };
    }
    const branch = deployConfig.branch || branchResult.stdout.trim();

    // Step 4: Get remote URL
    const remote = deployConfig.remote || "origin";
    const remoteResult = await execCommand("git", ["remote", "get-url", remote], cwd);
    const remoteUrl = remoteResult.exitCode === 0 ? remoteResult.stdout.trim() : "(unknown)";

    // Step 5: Get recent commits
    const logResult = await execCommand("git", ["log", "--oneline", "-5"], cwd);
    const recentCommits = logResult.exitCode === 0 ? logResult.stdout.trim() : "(no commits)";

    // Step 6: Check gh auth
    const shouldCreateRelease = deployConfig.createRelease !== false;
    let ghReady = false;
    if (shouldCreateRelease) {
      const ghResult = await execCommand("gh", ["auth", "status"], cwd);
      ghReady = ghResult.exitCode === 0;
      if (!ghReady) {
        return { success: false, error: "gh CLI is not authenticated. Run `gh auth login` or set deploy.createRelease to false." };
      }
    }

    // Step 7: Get version
    let version = "0.0.0";
    try {
      const pkg = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf-8"));
      version = pkg.version || "0.0.0";
    } catch { /* no package.json */ }

    const tagPrefix = deployConfig.tagPrefix ?? "v";
    const tag = `${tagPrefix}${version}`;

    // Build confirmation prompt
    const lines = [
      "Ready to deploy:",
      `  Remote: ${remote} (${remoteUrl})`,
      `  Branch: ${branch}`,
      `  Version: ${version}`,
      "",
      "Recent commits:",
      ...recentCommits.split("\n").map((l: string) => `  ${l}`),
      "",
    ];
    if (shouldCreateRelease) {
      lines.push(`Will push to remote and create GitHub release ${tag}.`);
    } else {
      lines.push("Will push to remote (no release).");
    }
    lines.push("", 'Type "yes" to confirm deployment.');

    return {
      success: true,
      requiresHumanInput: true,
      humanPrompt: lines.join("\n"),
    };
  }

  private async executePushAndRelease(
    ctx: PhaseHandlerContext,
    deployConfig: DeployConfig,
    cwd: string,
  ): Promise<PhaseResult> {
    const remote = deployConfig.remote || "origin";

    // Get branch
    const branchResult = await execCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    const branch = deployConfig.branch || (branchResult.exitCode === 0 ? branchResult.stdout.trim() : "main");

    // Push
    ctx.emit({ type: "log", projectId: ctx.projectId, message: `Pushing to ${remote}/${branch}...`, level: "info" });
    const pushResult = await execCommand("git", ["push", remote, branch], cwd);
    if (pushResult.exitCode !== 0) {
      return { success: false, error: `git push failed:\n${pushResult.stderr}` };
    }
    ctx.emit({ type: "log", projectId: ctx.projectId, message: "Push successful", level: "info" });

    // Create release
    const shouldCreateRelease = deployConfig.createRelease !== false;
    let releaseWarning: string | undefined;

    if (shouldCreateRelease) {
      let version = "0.0.0";
      try {
        const pkg = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf-8"));
        version = pkg.version || "0.0.0";
      } catch { /* no package.json */ }

      const tagPrefix = deployConfig.tagPrefix ?? "v";
      const tag = `${tagPrefix}${version}`;

      ctx.emit({ type: "log", projectId: ctx.projectId, message: `Creating GitHub release ${tag}...`, level: "info" });
      const releaseResult = await execCommand("gh", [
        "release", "create", tag,
        "--title", tag,
        "--notes", `Release ${tag}`,
      ], cwd);

      if (releaseResult.exitCode !== 0) {
        releaseWarning = `Release creation failed: ${releaseResult.stderr}`;
        ctx.emit({ type: "log", projectId: ctx.projectId, message: releaseWarning, level: "warn" });
      } else {
        ctx.emit({ type: "log", projectId: ctx.projectId, message: `Release ${tag} created`, level: "info" });
      }
    }

    const output = releaseWarning
      ? `Deployed to ${remote}/${branch} (release failed: ${releaseWarning})`
      : `Deployed to ${remote}/${branch}`;
    return { success: true, output };
  }
}

// ---- Helper: split spec text into modules by ## headings ----
function splitSpecIntoModules(text: string): [string, string][] {
  const modules: [string, string][] = [];
  const parts = text.split(/^(?=##\s+)/m);

  for (const part of parts) {
    const headingMatch = part.match(/^##\s+(.+)/);
    if (headingMatch) {
      const title = headingMatch[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const content = part.replace(/^##\s+.+\n?/, "").trim();
      if (title && content) {
        modules.push([`${title}.md`, content]);
      }
    }
  }

  // If no ## headings found, treat entire text as "overview"
  if (modules.length === 0 && text.trim()) {
    modules.push(["overview.md", text.trim()]);
  }

  return modules;
}

// ---- Helper: build plan markdown from step data ----
function buildPlanMarkdown(steps: Array<{ phase: string; title: string; description: string }>): string {
  const byPhase = new Map<string, Array<{ title: string; description: string }>>();
  for (const step of steps) {
    const list = byPhase.get(step.phase) ?? [];
    list.push({ title: step.title, description: step.description });
    byPhase.set(step.phase, list);
  }

  const lines: string[] = ["# Plan", ""];
  for (const [phase, items] of byPhase) {
    lines.push(`## ${phase.charAt(0).toUpperCase() + phase.slice(1)}`);
    for (const item of items) {
      lines.push(`- [ ] ${item.title}`);
      lines.push(`  ${item.description}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ---- Helper: execute autonomous phase (dev/test/review) ----
async function executeAutonomousPhase(
  ctx: PhaseHandlerContext,
  phaseType: string,
): Promise<PhaseResult> {
  const readySteps = ctx.store.getReadyPlanSteps(ctx.projectId, phaseType as ProjectPhase);

  if (readySteps.length === 0) {
    const allSteps = ctx.store.getPlanSteps(ctx.projectId)
      .filter((s) => s.phase === phaseType);

    if (allSteps.length === 0) {
      return { success: true, output: `No plan steps for ${phaseType} phase, skipping.` };
    }
    if (allSteps.every((s) => s.status === "done")) {
      return { success: true, output: `All ${phaseType} steps completed.` };
    }
    return { success: false, error: `No ready steps for ${phaseType} phase. Dependencies not met.` };
  }

  const results: string[] = [];
  for (const step of readySteps) {
    ctx.store.updatePlanStepStatus(step.id, "in_progress");

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

  return { success: true, output: results.join("\n") };
}
