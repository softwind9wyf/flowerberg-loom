import type {
  ProjectPhase,
  ProjectStatus,
  PhaseStateInfo,
  PhaseInteraction,
} from "../types/project.js";
import { PHASE_ORDER, PHASE_INTERACTION } from "../types/project.js";
import type { FileStore } from "../store/file-store.js";

export interface PhaseResult {
  success: boolean;
  output?: string;
  error?: string;
  requiresHumanInput?: boolean;
  humanPrompt?: string;
}

export class PhaseStateMachine {
  private fileStore: FileStore;

  constructor(fileStore: FileStore) {
    this.fileStore = fileStore;
  }

  /** Get the project's current phase */
  getCurrentPhase(): ProjectPhase {
    const state = this.fileStore.readState();
    return state?.current_phase ?? "goal";
  }

  /** Get phase state for a specific phase */
  getPhaseState(phase: ProjectPhase): PhaseStateInfo | undefined {
    return this.fileStore.getPhaseStateInfo(phase);
  }

  /** Get all phase states */
  getAllPhaseStates(): PhaseStateInfo[] {
    return this.fileStore.getAllPhaseStates();
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
      this.fileStore.updateProjectMeta({ status: "completed", completed_at: new Date().toISOString() });
      return null;
    }

    const nextPhase = PHASE_ORDER[currentIdx + 1];
    this.fileStore.updateProjectMeta({ current_phase: nextPhase });
    return nextPhase;
  }

  /** Mark phase as waiting for human input */
  waitForHumanInput(prompt: string): void {
    const phase = this.getCurrentPhase();
    this.fileStore.setPhaseState(phase, "waiting_input", {
      output_data: JSON.stringify({ prompt }),
    });
  }

  /** Provide human input and resume */
  provideHumanInput(input: string): void {
    const phase = this.getCurrentPhase();
    const phaseState = this.getPhaseState(phase);

    this.fileStore.setPhaseState(phase, phaseState?.status === "waiting_input" ? "in_progress" : "pending", {
      input_data: JSON.stringify({ input }),
    });
  }

  /** Start a phase */
  startPhase(phase: ProjectPhase): void {
    this.fileStore.setPhaseState(phase, "in_progress");
  }

  /** Complete a phase */
  completePhase(phase: ProjectPhase, output?: string): void {
    this.fileStore.setPhaseState(phase, "done", {
      output_data: output ?? undefined,
    });
  }

  /** Fail a phase */
  failPhase(phase: ProjectPhase, error: string): void {
    this.fileStore.setPhaseState(phase, "failed", {
      error_message: error,
    });
  }

  /** Get the interaction mode for current phase */
  getInteraction(): PhaseInteraction {
    return PHASE_INTERACTION[this.getCurrentPhase()];
  }
}
