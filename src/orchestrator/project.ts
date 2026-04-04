import { EventEmitter } from "events";
import type { AppConfig } from "../types/config.js";
import type { ProjectPhase, Project } from "../types/project.js";
import type { ProjectEvent } from "../types/events.js";
import type { AgentInterface } from "../types/agent.js";
import { AgentFactory } from "../agents/factory.js";
import { PhaseStateMachine } from "./state-machine.js";
import { FileStore } from "../store/file-store.js";
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
  private config: AppConfig;
  private agentFactory: AgentFactory;
  private activeProjects = new Map<string, Promise<void>>();
  private worktrees = new Map<string, WorktreeInfo>();

  constructor(config: AppConfig) {
    super();
    this.config = config;
    this.agentFactory = new AgentFactory();
  }

  /** Create a new project in the given directory */
  createProject(projectPath: string, description = ""): { fileStore: FileStore; project: Project } {
    const name = projectPath.split("/").pop() || "untitled";
    const fileStore = new FileStore(projectPath, this.config.deploy?.verifyBuild !== false);
    fileStore.initProject(name);

    const state = fileStore.readState()!;
    const goal = fileStore.readGoal();

    const project: Project = {
      name: state.name,
      description,
      current_phase: state.current_phase,
      status: state.status,
      project_path: fileStore.getProjectPath(),
      goal,
      created_at: state.created_at,
      updated_at: state.updated_at,
      completed_at: null,
    };

    return { fileStore, project };
  }

  /** Get a project view for a given path */
  getProjectByPath(projectPath: string): Project | null {
    const fileStore = new FileStore(projectPath, false);
    if (!fileStore.exists()) return null;

    const state = fileStore.readState();
    if (!state) return null;

    const goal = fileStore.readGoal();
    return {
      name: state.name,
      description: "",
      current_phase: state.current_phase,
      status: state.status,
      project_path: fileStore.getProjectPath(),
      goal,
      created_at: state.created_at,
      updated_at: state.updated_at,
      completed_at: state.completed_at ?? null,
    };
  }

  /** Start the project lifecycle — begins at current phase */
  startProject(fileStore: FileStore): void {
    const projectPath = fileStore.getProjectPath();
    if (this.activeProjects.has(projectPath)) return;

    const promise = this.runProject(fileStore);
    this.activeProjects.set(projectPath, promise);

    promise
      .catch((err) => {
        this.emitEvent({
          type: "log",
          projectId: projectPath,
          message: `Fatal error: ${err instanceof Error ? err.message : String(err)}`,
          level: "error",
        });
      })
      .finally(() => {
        this.activeProjects.delete(projectPath);
      });
  }

  /** Provide human input for the current phase */
  provideInput(fileStore: FileStore, input: string): void {
    const sm = new PhaseStateMachine(fileStore);
    const phase = sm.getCurrentPhase();

    // Store input and resume
    sm.provideHumanInput(input);
    fileStore.addLog("human", "info", `Input provided for ${phase} phase`, phase);

    // Re-trigger execution
    this.startProject(fileStore);
  }

  /** Update project goal */
  setGoal(fileStore: FileStore, goal: string): void {
    fileStore.writeGoal(goal);
    fileStore.addLog("human", "info", `Goal set: ${goal.slice(0, 100)}`);
  }

  /** Get full status view for a project */
  getStatusView(fileStore: FileStore): ProjectStatusView | null {
    const state = fileStore.readState();
    if (!state) return null;

    const sm = new PhaseStateMachine(fileStore);
    const allStates = sm.getAllPhaseStates();
    const currentPhase = sm.getCurrentPhase();

    // Find if there's a pending human prompt
    const currentState = sm.getPhaseState(currentPhase);
    let humanPrompt: string | null = null;

    if (currentState?.status === "waiting_input" && currentState.output_data) {
      try {
        const data = JSON.parse(currentState.output_data);
        humanPrompt = data.prompt ?? null;
      } catch {
        humanPrompt = currentState.output_data ?? null;
      }
    }

    const goal = fileStore.readGoal();
    const project: Project = {
      name: state.name,
      description: "",
      current_phase: currentPhase,
      status: state.status,
      project_path: fileStore.getProjectPath(),
      goal,
      created_at: state.created_at,
      updated_at: state.updated_at,
      completed_at: state.completed_at ?? null,
    };

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

  /** Cancel/abandon a project */
  abandonProject(fileStore: FileStore): void {
    // Clean up any worktree
    const projectPath = fileStore.getProjectPath();
    const worktree = this.worktrees.get(projectPath);
    if (worktree) {
      const git = new GitWorktreeManager(projectPath);
      git.removeWorktree(worktree).catch(() => {});
      this.worktrees.delete(projectPath);
    }

    fileStore.updateProjectMeta({ status: "abandoned" });
    fileStore.addLog("system", "info", "Project abandoned");
  }

  // ---- Internal execution loop ----

  private async runProject(fileStore: FileStore): Promise<void> {
    const sm = new PhaseStateMachine(fileStore);
    const agent = this.agentFactory.getDefault(this.config);
    const projectPath = fileStore.getProjectPath();
    const state = fileStore.readState();

    this.emitEvent({
      type: "project_status",
      projectId: projectPath,
      status: state?.status ?? "active",
      phase: sm.getCurrentPhase(),
    });

    while (!sm.isComplete()) {
      const phase = sm.getCurrentPhase();
      const phaseState = sm.getPhaseState(phase);

      // If waiting for input, pause execution
      if (phaseState?.status === "waiting_input") {
        this.emitEvent({
          type: "human_input_required",
          projectId: projectPath,
          phase,
          prompt: this.extractPrompt(phaseState),
        });
        return; // Pause — will be resumed by provideInput()
      }

      // Execute the current phase
      sm.startPhase(phase);
      this.emitEvent({
        type: "phase_status",
        projectId: projectPath,
        phase,
        status: "in_progress",
      });

      fileStore.addLog("orchestrator", "info", `Starting ${phase} phase`, phase);

      const ctx: PhaseHandlerContext = {
        projectPath: this.getWorktreePath(projectPath) ?? projectPath,
        goal: fileStore.readGoal(),
        fileStore,
        agent,
        config: this.config,
        getPhaseOutput: (p: ProjectPhase) => {
          const ps = fileStore.getPhaseStateInfo(p);
          return ps?.output_data ?? null;
        },
        emit: (e) => this.emitEvent(e),
      };

      const handler = PHASE_HANDLERS[phase]();
      const result = await handler.execute(ctx);

      if (result.success) {
        if (result.requiresHumanInput) {
          // Pause for human review
          sm.waitForHumanInput(result.humanPrompt ?? "Please review and provide input");
          this.emitEvent({
            type: "human_input_required",
            projectId: projectPath,
            phase,
            prompt: result.humanPrompt ?? "Please review and provide input",
          });
          fileStore.addLog("orchestrator", "info", `${phase} phase paused for human input`, phase);
          return;
        }

        sm.completePhase(phase, result.output);
        this.emitEvent({
          type: "phase_status",
          projectId: projectPath,
          phase,
          status: "done",
        });
        fileStore.addLog("orchestrator", "info", `${phase} phase completed`, phase);

        // Handle worktree lifecycle
        if (phase === "plan") {
          await this.setupWorktree(fileStore);
        }
        if (phase === "review") {
          await this.teardownWorktree(fileStore);
        }

        // Advance to next phase
        const nextPhase = sm.advance();
        if (nextPhase) {
          this.emitEvent({
            type: "project_status",
            projectId: projectPath,
            status: "active",
            phase: nextPhase,
          });
        }
      } else {
        sm.failPhase(phase, result.error ?? "Unknown error");
        this.emitEvent({
          type: "phase_status",
          projectId: projectPath,
          phase,
          status: "failed",
        });
        fileStore.addLog("orchestrator", "error", `${phase} phase failed: ${result.error}`, phase);
        fileStore.updateProjectMeta({ status: "failed" });
        return;
      }
    }

    // All phases complete
    fileStore.updateProjectMeta({ status: "completed", completed_at: new Date().toISOString() });
    this.emitEvent({
      type: "project_status",
      projectId: projectPath,
      status: "completed",
      phase: "deploy",
    });
    fileStore.addLog("orchestrator", "info", "Project completed!");
  }

  /** Set up a git worktree for the dev phase */
  private async setupWorktree(fileStore: FileStore): Promise<void> {
    const projectPath = fileStore.getProjectPath();
    const state = fileStore.readState();
    if (!state) return;

    const git = new GitWorktreeManager(projectPath);
    const isRepo = await git.isAvailable();
    if (!isRepo) {
      fileStore.addLog("orchestrator", "warn", "Not a git repo, skipping worktree setup");
      return;
    }

    const worktree = await git.createWorktree(`loom-${state.name}`);
    this.worktrees.set(projectPath, worktree);
    fileStore.addLog("orchestrator", "info", `Created worktree at ${worktree.path} (branch: ${worktree.branch})`);
  }

  /** Merge and clean up worktree after review phase */
  private async teardownWorktree(fileStore: FileStore): Promise<void> {
    const projectPath = fileStore.getProjectPath();
    const worktree = this.worktrees.get(projectPath);
    if (!worktree) return;

    const git = new GitWorktreeManager(projectPath);
    await git.mergeAndCleanup(worktree);
    this.worktrees.delete(projectPath);
    fileStore.addLog("orchestrator", "info", `Merged worktree branch ${worktree.branch} and cleaned up`);
  }

  /** Get the working path — worktree if in dev phase, else project root */
  private getWorktreePath(projectPath: string): string | null {
    const worktree = this.worktrees.get(projectPath);
    return worktree?.path ?? null;
  }

  private extractPrompt(phaseState: { output_data?: string | null }): string {
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
