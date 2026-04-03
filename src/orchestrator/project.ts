import { EventEmitter } from "events";
import type { Store } from "../store/index.js";
import type { AppConfig } from "../types/config.js";
import type { ProjectPhase, Project } from "../types/project.js";
import type { ProjectEvent } from "../types/events.js";
import type { AgentInterface } from "../types/agent.js";
import { AgentFactory } from "../agents/factory.js";
import { PhaseStateMachine } from "./state-machine.js";
import {
  GoalPhaseHandler,
  SpecPhaseHandler,
  PlanPhaseHandler,
  DevPhaseHandler,
  TestPhaseHandler,
  ReviewPhaseHandler,
  DeployPhaseHandler,
  type PhaseHandlerContext,
} from "./phase-handler.js";
import { GitWorktreeManager, type WorktreeInfo } from "./git.js";
import { PHASE_ORDER } from "../types/project.js";

const PHASE_HANDLERS: Record<ProjectPhase, () => GoalPhaseHandler | SpecPhaseHandler | PlanPhaseHandler | DevPhaseHandler | TestPhaseHandler | ReviewPhaseHandler | DeployPhaseHandler> = {
  goal: () => new GoalPhaseHandler(),
  spec: () => new SpecPhaseHandler(),
  plan: () => new PlanPhaseHandler(),
  dev: () => new DevPhaseHandler(),
  test: () => new TestPhaseHandler(),
  review: () => new ReviewPhaseHandler(),
  deploy: () => new DeployPhaseHandler(),
};

export interface ProjectStatusView {
  project: Project;
  phaseStates: { phase: ProjectPhase; status: string; output: string | null }[];
  currentPhase: ProjectPhase;
  needsHumanInput: boolean;
  humanPrompt: string | null;
}

export class ProjectOrchestrator extends EventEmitter {
  private store: Store;
  private config: AppConfig;
  private agentFactory: AgentFactory;
  private activeProjects = new Map<string, Promise<void>>();
  private worktrees = new Map<string, WorktreeInfo>();

  constructor(config: AppConfig, store: Store) {
    super();
    this.config = config;
    this.store = store;
    this.agentFactory = new AgentFactory();
  }

  /** Create a new project */
  createProject(name: string, projectPath: string, description = ""): Project {
    const existing = this.store.getProjectByName(name);
    if (existing) {
      throw new Error(`Project "${name}" already exists (id: ${existing.id})`);
    }

    return this.store.createProject({
      name,
      description,
      project_path: projectPath,
    });
  }

  /** List all projects */
  listProjects(): Project[] {
    return this.store.listProjects();
  }

  /** Get a project by ID */
  getProject(projectId: string): Project | undefined {
    return this.store.getProject(projectId);
  }

  /** Start the project lifecycle — begins at goal phase */
  startProject(projectId: string): void {
    const project = this.store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    if (project.status !== "active") throw new Error(`Project is ${project.status}, cannot start`);

    // Don't start if already running
    if (this.activeProjects.has(projectId)) return;

    const promise = this.runProject(projectId);
    this.activeProjects.set(projectId, promise);

    promise
      .catch((err) => {
        this.emitEvent({
          type: "log",
          projectId,
          message: `Fatal error: ${err instanceof Error ? err.message : String(err)}`,
          level: "error",
        });
      })
      .finally(() => {
        this.activeProjects.delete(projectId);
      });
  }

  /** Provide human input for the current phase */
  provideInput(projectId: string, input: string): void {
    const project = this.store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const sm = new PhaseStateMachine(this.store, projectId);
    const phase = sm.getCurrentPhase();
    const phaseState = sm.getPhaseState(phase);

    if (phaseState?.status !== "waiting_input") {
      throw new Error(`Current phase "${phase}" is not waiting for input`);
    }

    // Store input and resume
    sm.provideHumanInput(input);
    this.store.addProjectLog(projectId, "human", "info", `Input provided for ${phase} phase`);

    // Re-trigger execution
    this.startProject(projectId);
  }

  /** Update project goal */
  setGoal(projectId: string, goal: string): void {
    const project = this.store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    this.store.updateProject(projectId, { goal });
    this.store.addProjectLog(projectId, "human", "info", `Goal set: ${goal.slice(0, 100)}`);
  }

  /** Get full status view for a project */
  getStatusView(projectId: string): ProjectStatusView | null {
    const project = this.store.getProject(projectId);
    if (!project) return null;

    const sm = new PhaseStateMachine(this.store, projectId);
    const allStates = sm.getAllPhaseStates();

    // Find if there's a pending human prompt
    const currentPhase = sm.getCurrentPhase();
    const currentState = sm.getPhaseState(currentPhase);
    let humanPrompt: string | null = null;

    if (currentState?.status === "waiting_input" && currentState.output_data) {
      try {
        const data = JSON.parse(currentState.output_data);
        humanPrompt = data.prompt ?? null;
      } catch {
        humanPrompt = currentState.output_data;
      }
    }

    return {
      project,
      phaseStates: allStates.map((s) => ({
        phase: s.phase,
        status: s.status,
        output: s.output_data,
      })),
      currentPhase,
      needsHumanInput: sm.needsHumanInput(),
      humanPrompt,
    };
  }

  /** Get the underlying store (for TUI use) */
  getStore(): Store {
    return this.store;
  }

  /** Cancel/abandon a project */
  abandonProject(projectId: string): void {
    const project = this.store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    // Clean up any worktree
    const worktree = this.worktrees.get(projectId);
    if (worktree) {
      const git = new GitWorktreeManager(project.project_path);
      git.removeWorktree(worktree).catch(() => {});
      this.worktrees.delete(projectId);
    }

    this.store.updateProject(projectId, { status: "abandoned" });
    this.store.addProjectLog(projectId, "system", "info", "Project abandoned");
  }

  // ---- Internal execution loop ----

  private async runProject(projectId: string): Promise<void> {
    const sm = new PhaseStateMachine(this.store, projectId);
    const agent = this.agentFactory.getDefault(this.config);
    const project = this.store.getProject(projectId)!;

    this.emitEvent({
      type: "project_status",
      projectId,
      status: project.status,
      phase: sm.getCurrentPhase(),
    });

    while (!sm.isComplete()) {
      const phase = sm.getCurrentPhase();
      const phaseState = sm.getPhaseState(phase);

      // If waiting for input, pause execution
      if (phaseState?.status === "waiting_input") {
        this.emitEvent({
          type: "human_input_required",
          projectId,
          phase,
          prompt: this.extractPrompt(phaseState),
        });
        return; // Pause — will be resumed by provideInput()
      }

      // Execute the current phase
      sm.startPhase(phase);
      this.emitEvent({
        type: "phase_status",
        projectId,
        phase,
        status: "in_progress",
      });

      this.store.addProjectLog(projectId, "orchestrator", "info", `Starting ${phase} phase`);

      const ctx: PhaseHandlerContext = {
        projectId,
        projectPath: this.getWorktreePath(projectId),
        goal: project.goal,
        store: this.store,
        agent,
        getPhaseOutput: (p: ProjectPhase) => {
          const ps = this.store.getPhaseState(projectId, p);
          return ps?.output_data ?? null;
        },
      };

      const handler = PHASE_HANDLERS[phase]();
      const result = await handler.execute(ctx);

      if (result.success) {
        if (result.requiresHumanInput) {
          // Pause for human review
          sm.waitForHumanInput(result.humanPrompt ?? "Please review and provide input");
          this.emitEvent({
            type: "human_input_required",
            projectId,
            phase,
            prompt: result.humanPrompt ?? "Please review and provide input",
          });
          this.store.addProjectLog(projectId, "orchestrator", "info", `${phase} phase paused for human input`);
          return;
        }

        sm.completePhase(phase, result.output);
        this.emitEvent({
          type: "phase_status",
          projectId,
          phase,
          status: "done",
        });
        this.store.addProjectLog(projectId, "orchestrator", "info", `${phase} phase completed`);

        // Handle worktree lifecycle for dev phase
        if (phase === "plan") {
          await this.setupWorktree(projectId);
        }

        // Advance to next phase
        const nextPhase = sm.advance();
        if (nextPhase) {
          this.emitEvent({
            type: "project_status",
            projectId,
            status: "active",
            phase: nextPhase,
          });
        }
      } else {
        sm.failPhase(phase, result.error ?? "Unknown error");
        this.emitEvent({
          type: "phase_status",
          projectId,
          phase,
          status: "failed",
        });
        this.store.addProjectLog(projectId, "orchestrator", "error", `${phase} phase failed: ${result.error}`);
        this.store.updateProject(projectId, { status: "failed" });
        return;
      }
    }

    // All phases complete
    this.store.updateProject(projectId, { status: "completed" });
    this.emitEvent({
      type: "project_status",
      projectId,
      status: "completed",
      phase: "deploy",
    });
    this.store.addProjectLog(projectId, "orchestrator", "info", "Project completed!");
  }

  /** Set up a git worktree for the dev phase */
  private async setupWorktree(projectId: string): Promise<void> {
    const project = this.store.getProject(projectId)!;

    const git = new GitWorktreeManager(project.project_path);
    const isRepo = await git.isAvailable();
    if (!isRepo) {
      this.store.addProjectLog(projectId, "orchestrator", "warn", "Not a git repo, skipping worktree setup");
      return;
    }

    const worktree = await git.createWorktree(`loom-${project.name}`);
    this.worktrees.set(projectId, worktree);
    this.store.addProjectLog(projectId, "orchestrator", "info", `Created worktree at ${worktree.path} (branch: ${worktree.branch})`);
  }

  /** Merge and clean up worktree after review phase */
  private async teardownWorktree(projectId: string): Promise<void> {
    const worktree = this.worktrees.get(projectId);
    if (!worktree) return;

    const project = this.store.getProject(projectId)!;
    const git = new GitWorktreeManager(project.project_path);

    await git.mergeAndCleanup(worktree);
    this.worktrees.delete(projectId);
    this.store.addProjectLog(projectId, "orchestrator", "info", `Merged worktree branch ${worktree.branch} and cleaned up`);
  }

  /** Get the working path — worktree if in dev phase, else project root */
  private getWorktreePath(projectId: string): string {
    const project = this.store.getProject(projectId)!;
    const worktree = this.worktrees.get(projectId);
    return worktree?.path ?? project.project_path;
  }

  private extractPrompt(phaseState: { output_data: string | null }): string {
    if (!phaseState.output_data) return "Input required";
    try {
      return JSON.parse(phaseState.output_data).prompt ?? "Input required";
    } catch {
      return phaseState.output_data;
    }
  }

  private emitEvent(event: ProjectEvent): void {
    this.emit("event", event);
  }
}
