import type {
  Project,
  ProjectPhase,
  ProjectStatus,
  PhaseState,
  PhaseStateStatus,
  PhaseInteraction,
} from "../types/project.js";
import { PHASE_ORDER, PHASE_INTERACTION } from "../types/project.js";
import type { Store } from "../store/index.js";

export interface PhaseResult {
  success: boolean;
  output?: string;
  error?: string;
  requiresHumanInput?: boolean;
  humanPrompt?: string;
}

export class PhaseStateMachine {
  private store: Store;
  private projectId: string;

  constructor(store: Store, projectId: string) {
    this.store = store;
    this.projectId = projectId;
  }

  /** Get the project's current phase */
  getCurrentPhase(): ProjectPhase {
    const project = this.store.getProject(this.projectId);
    return project?.current_phase ?? "goal";
  }

  /** Get phase state for a specific phase */
  getPhaseState(phase: ProjectPhase): PhaseState | undefined {
    return this.store.getPhaseState(this.projectId, phase);
  }

  /** Get all phase states */
  getAllPhaseStates(): PhaseState[] {
    return this.store.getAllPhaseStates(this.projectId);
  }

  /** Check if current phase needs human input */
  needsHumanInput(): boolean {
    const phase = this.getCurrentPhase();
    return PHASE_INTERACTION[phase] !== "autonomous";
  }

  /** Check if we can advance to the next phase */
  canAdvance(): boolean {
    const phaseState = this.getPhaseState(this.getCurrentPhase());
    return phaseState?.status === "done";
  }

  /** Check if all phases are done */
  isComplete(): boolean {
    const current = this.getCurrentPhase();
    const phaseState = this.getPhaseState(current);
    return current === "deploy" && phaseState?.status === "done";
  }

  /** Advance to the next phase. Returns the new phase or null if complete. */
  advance(): ProjectPhase | null {
    const current = this.getCurrentPhase();
    const currentIdx = PHASE_ORDER.indexOf(current);

    if (currentIdx === -1 || currentIdx >= PHASE_ORDER.length - 1) {
      // All phases done
      this.store.updateProject(this.projectId, { status: "completed" });
      return null;
    }

    const nextPhase = PHASE_ORDER[currentIdx + 1];
    this.store.updateProject(this.projectId, { current_phase: nextPhase });
    return nextPhase;
  }

  /** Mark phase as waiting for human input */
  waitForHumanInput(prompt: string): void {
    const phase = this.getCurrentPhase();
    this.store.setPhaseState(this.projectId, phase, "waiting_input", {
      output_data: JSON.stringify({ prompt }),
    });
  }

  /** Provide human input and resume */
  provideHumanInput(input: string): void {
    const phase = this.getCurrentPhase();
    const phaseState = this.getPhaseState(phase);

    // Store the input
    this.store.setPhaseState(this.projectId, phase, phaseState?.status === "waiting_input" ? "in_progress" : "pending", {
      input_data: JSON.stringify({ input }),
    });
  }

  /** Start a phase */
  startPhase(phase: ProjectPhase): void {
    this.store.setPhaseState(this.projectId, phase, "in_progress");
  }

  /** Complete a phase */
  completePhase(phase: ProjectPhase, output?: string): void {
    this.store.setPhaseState(this.projectId, phase, "done", {
      output_data: output ?? undefined,
    });
  }

  /** Fail a phase */
  failPhase(phase: ProjectPhase, error: string): void {
    this.store.setPhaseState(this.projectId, phase, "failed", {
      error_message: error,
    });
  }

  /** Get the interaction mode for current phase */
  getInteraction(): PhaseInteraction {
    return PHASE_INTERACTION[this.getCurrentPhase()];
  }
}
