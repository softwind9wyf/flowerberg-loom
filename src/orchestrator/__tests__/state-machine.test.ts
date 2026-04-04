import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PhaseStateMachine } from "../state-machine.js";
import { FileStore } from "../../store/file-store.js";
import type { ProjectPhase } from "../../types/project.js";

let testDir: string;
let fileStore: FileStore;

beforeEach(() => {
  testDir = join(tmpdir(), `fbloom-sm-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(testDir, { recursive: true });
  fileStore = new FileStore(testDir, false);
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe("PhaseStateMachine", () => {
  let sm: PhaseStateMachine;

  beforeEach(() => {
    fileStore.initProject("test-project");
    sm = new PhaseStateMachine(fileStore);
  });

  describe("initial state", () => {
    it("starts at goal phase", () => {
      expect(sm.getCurrentPhase()).toBe("goal");
    });

    it("is not complete", () => {
      expect(sm.isComplete()).toBe(false);
    });

    it("cannot advance", () => {
      expect(sm.canAdvance()).toBe(false);
    });
  });

  describe("phase transitions", () => {
    it("advances through all phases", () => {
      const phases: ProjectPhase[] = ["goal", "spec", "plan", "dev", "test", "review", "deploy"];
      for (const phase of phases) {
        expect(sm.getCurrentPhase()).toBe(phase);
        sm.startPhase(phase);
        sm.completePhase(phase);
        const next = sm.advance();
        if (phase === "deploy") {
          expect(next).toBeNull();
          expect(sm.isComplete()).toBe(true);
        } else {
          expect(next).toBeTruthy();
        }
      }
    });

    it("is complete after deploy", () => {
      const phases: ProjectPhase[] = ["goal", "spec", "plan", "dev", "test", "review", "deploy"];
      for (const phase of phases) {
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
      expect(ps?.status).toBe("failed");
      expect(ps?.error_message).toBe("user cancelled");
    });
  });

  describe("waitForHumanInput / provideHumanInput", () => {
    it("transitions to waiting_input and back to in_progress", () => {
      sm.startPhase("goal");
      sm.waitForHumanInput("What is your goal?");
      let ps = sm.getPhaseState("goal");
      expect(ps?.status).toBe("waiting_input");

      sm.provideHumanInput("Build a CLI");
      ps = sm.getPhaseState("goal");
      expect(ps?.status).toBe("in_progress");
    });
  });

  describe("getInteraction", () => {
    it("returns correct interaction modes", () => {
      expect(sm.getInteraction()).toBe("human");
    });
  });
});
