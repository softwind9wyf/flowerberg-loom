import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../store/index.js";
import { PhaseStateMachine } from "../state-machine.js";
import type { ProjectPhase } from "../../types/project.js";

describe("PhaseStateMachine", () => {
  let store: Store;
  let projectId: string;
  let sm: PhaseStateMachine;

  beforeEach(() => {
    store = new Store(":memory:");
    const p = store.createProject({
      name: "sm-test",
      description: "state machine test",
      project_path: "/tmp",
    });
    projectId = p.id;
    sm = new PhaseStateMachine(store, projectId);
  });

  describe("initial state", () => {
    it("starts at goal phase", () => {
      expect(sm.getCurrentPhase()).toBe("goal");
    });

    it("cannot advance when phase is not done", () => {
      expect(sm.canAdvance()).toBe(false);
    });

    it("is not complete initially", () => {
      expect(sm.isComplete()).toBe(false);
    });
  });

  describe("phase transitions", () => {
    it("advances through all phases in order", () => {
      const expectedOrder: ProjectPhase[] = ["spec", "plan", "dev", "test", "review", "deploy"];

      // Start and complete goal phase
      sm.startPhase("goal");
      sm.completePhase("goal");
      expect(sm.canAdvance()).toBe(true);

      for (const expected of expectedOrder) {
        const next = sm.advance();
        expect(next).toBe(expected);
        expect(sm.getCurrentPhase()).toBe(expected);

        // Complete this phase to allow advancing
        sm.startPhase(expected);
        sm.completePhase(expected);
      }
    });

    it("returns null after deploy is complete", () => {
      // Fast-forward through all phases
      const allPhases: ProjectPhase[] = ["goal", "spec", "plan", "dev", "test", "review", "deploy"];
      for (const phase of allPhases) {
        sm.startPhase(phase);
        sm.completePhase(phase);
        sm.advance();
      }

      expect(sm.isComplete()).toBe(true);
      expect(sm.advance()).toBeNull();
    });
  });

  describe("needsHumanInput", () => {
    it("requires human input for goal (human)", () => {
      expect(sm.needsHumanInput()).toBe(true);
    });

    it("requires human input for spec (hybrid)", () => {
      sm.startPhase("goal");
      sm.completePhase("goal");
      sm.advance(); // → spec
      expect(sm.getCurrentPhase()).toBe("spec");
      expect(sm.needsHumanInput()).toBe(true);
    });

    it("does not require human input for autonomous phases", () => {
      // Advance to plan (autonomous)
      for (const phase of ["goal", "spec"] as ProjectPhase[]) {
        sm.startPhase(phase);
        sm.completePhase(phase);
        sm.advance();
      }
      expect(sm.getCurrentPhase()).toBe("plan");
      expect(sm.needsHumanInput()).toBe(false);
    });

    it("requires human input for deploy (hybrid)", () => {
      const phases: ProjectPhase[] = ["goal", "spec", "plan", "dev", "test", "review"];
      for (const phase of phases) {
        sm.startPhase(phase);
        sm.completePhase(phase);
        sm.advance();
      }
      expect(sm.getCurrentPhase()).toBe("deploy");
      expect(sm.needsHumanInput()).toBe(true);
    });
  });

  describe("canAdvance", () => {
    it("returns false when phase is pending", () => {
      expect(sm.canAdvance()).toBe(false);
    });

    it("returns false when phase is in_progress", () => {
      sm.startPhase("goal");
      expect(sm.canAdvance()).toBe(false);
    });

    it("returns true when phase is done", () => {
      sm.startPhase("goal");
      sm.completePhase("goal");
      expect(sm.canAdvance()).toBe(true);
    });
  });

  describe("failPhase", () => {
    it("marks phase as failed with error", () => {
      sm.startPhase("goal");
      sm.failPhase("goal", "user cancelled");
      const ps = sm.getPhaseState("goal");
      expect(ps!.status).toBe("failed");
      expect(ps!.error_message).toBe("user cancelled");
    });
  });

  describe("waitForHumanInput / provideHumanInput", () => {
    it("transitions to waiting_input and back to in_progress", () => {
      sm.startPhase("goal");
      sm.waitForHumanInput("What is your goal?");
      let ps = sm.getPhaseState("goal");
      expect(ps!.status).toBe("waiting_input");

      sm.provideHumanInput("Build a CLI tool");
      ps = sm.getPhaseState("goal");
      expect(ps!.status).toBe("in_progress");
      expect(ps!.input_data).toBe(JSON.stringify({ input: "Build a CLI tool" }));
    });
  });

  describe("getInteraction", () => {
    it("returns correct interaction mode per phase", () => {
      const interactions = {
        goal: "human" as const,
        spec: "hybrid" as const,
        plan: "autonomous" as const,
        dev: "autonomous" as const,
        test: "autonomous" as const,
        review: "autonomous" as const,
        deploy: "hybrid" as const,
      };

      for (const [phase, expected] of Object.entries(interactions)) {
        // Jump to the phase
        const idx = ["goal", "spec", "plan", "dev", "test", "review", "deploy"].indexOf(phase);
        const phasesToAdvance = ["goal", "spec", "plan", "dev", "test", "review"].slice(0, idx);
        let sm2: PhaseStateMachine;
        {
          const p2 = store.createProject({ name: `int-${phase}`, description: "", project_path: "/tmp" });
          sm2 = new PhaseStateMachine(store, p2.id);
        }
        for (const ph of phasesToAdvance as ProjectPhase[]) {
          sm2.startPhase(ph);
          sm2.completePhase(ph);
          sm2.advance();
        }
        expect(sm2.getInteraction()).toBe(expected);
      }
    });
  });

  describe("getAllPhaseStates", () => {
    it("returns all 7 phase states", () => {
      const states = sm.getAllPhaseStates();
      expect(states).toHaveLength(7);
      states.forEach((s) => expect(s.status).toBe("pending"));
    });
  });

  describe("edge cases", () => {
    it("defaults to goal for nonexistent project", () => {
      const orphanSm = new PhaseStateMachine(store, "nonexistent-id");
      expect(orphanSm.getCurrentPhase()).toBe("goal");
    });
  });
});
