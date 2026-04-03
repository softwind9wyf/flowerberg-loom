import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../index.js";

describe("Store", () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(":memory:");
  });

  // --- Projects ---

  describe("createProject / getProject", () => {
    it("creates a project and retrieves it", () => {
      const p = store.createProject({
        name: "test-project",
        description: "A test project",
        project_path: "/tmp/test",
      });
      expect(p.name).toBe("test-project");
      expect(p.current_phase).toBe("goal");
      expect(p.status).toBe("active");

      const retrieved = store.getProject(p.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(p.id);
      expect(retrieved!.name).toBe("test-project");
    });

    it("creates project with goal", () => {
      const p = store.createProject({
        name: "with-goal",
        description: "",
        project_path: "/tmp/g",
        goal: "Build something",
        goal_metadata: '{"priority":"high"}',
      });
      expect(p.goal).toBe("Build something");
      const retrieved = store.getProject(p.id);
      expect(retrieved!.goal).toBe("Build something");
      expect(retrieved!.goal_metadata).toBe('{"priority":"high"}');
    });

    it("initializes all 7 phase states", () => {
      const p = store.createProject({
        name: "phases",
        description: "",
        project_path: "/tmp",
      });
      const phases = store.getAllPhaseStates(p.id);
      expect(phases).toHaveLength(7);
      phases.forEach((ps) => expect(ps.status).toBe("pending"));
    });
  });

  describe("getProjectByName", () => {
    it("finds project by name", () => {
      store.createProject({ name: "unique", description: "", project_path: "/tmp" });
      const found = store.getProjectByName("unique");
      expect(found).toBeDefined();
      expect(found!.name).toBe("unique");
    });

    it("returns undefined for unknown name", () => {
      expect(store.getProjectByName("nope")).toBeUndefined();
    });
  });

  describe("listProjects", () => {
    it("returns all projects", () => {
      store.createProject({ name: "first", description: "", project_path: "/tmp/1" });
      store.createProject({ name: "second", description: "", project_path: "/tmp/2" });
      const list = store.listProjects();
      expect(list).toHaveLength(2);
      const names = list.map((p) => p.name);
      expect(names).toContain("first");
      expect(names).toContain("second");
    });
  });

  describe("updateProject", () => {
    it("updates specified fields", () => {
      const p = store.createProject({ name: "upd", description: "old", project_path: "/tmp" });
      store.updateProject(p.id, { description: "new", status: "paused" });
      const updated = store.getProject(p.id);
      expect(updated!.description).toBe("new");
      expect(updated!.status).toBe("paused");
    });

    it("no-ops with empty data", () => {
      const p = store.createProject({ name: "noop", description: "same", project_path: "/tmp" });
      store.updateProject(p.id, {});
      const retrieved = store.getProject(p.id);
      expect(retrieved!.description).toBe("same");
    });
  });

  describe("getProject for unknown id", () => {
    it("returns undefined", () => {
      expect(store.getProject("nonexistent")).toBeUndefined();
    });
  });

  // --- Phase States ---

  describe("setPhaseState / getPhaseState", () => {
    it("transitions phase status and tracks timestamps", () => {
      const p = store.createProject({ name: "ph", description: "", project_path: "/tmp" });

      store.setPhaseState(p.id, "goal", "in_progress");
      let ps = store.getPhaseState(p.id, "goal");
      expect(ps!.status).toBe("in_progress");
      expect(ps!.started_at).toBeTruthy();

      store.setPhaseState(p.id, "goal", "done", { output_data: "goal set" });
      ps = store.getPhaseState(p.id, "goal");
      expect(ps!.status).toBe("done");
      expect(ps!.completed_at).toBeTruthy();
      expect(ps!.output_data).toBe("goal set");
    });

    it("records error on failure", () => {
      const p = store.createProject({ name: "fail", description: "", project_path: "/tmp" });
      store.setPhaseState(p.id, "dev", "in_progress");
      store.setPhaseState(p.id, "dev", "failed", { error_message: "boom" });
      const ps = store.getPhaseState(p.id, "dev");
      expect(ps!.status).toBe("failed");
      expect(ps!.error_message).toBe("boom");
    });

    it("stores input_data", () => {
      const p = store.createProject({ name: "input", description: "", project_path: "/tmp" });
      store.setPhaseState(p.id, "spec", "waiting_input", { input_data: '{"waiting":true}' });
      const ps = store.getPhaseState(p.id, "spec");
      expect(ps!.status).toBe("waiting_input");
      expect(ps!.input_data).toBe('{"waiting":true}');
    });
  });

  // --- Spec Documents ---

  describe("createSpec / getLatestSpec / getSpecHistory", () => {
    it("creates specs with auto-incrementing versions", () => {
      const p = store.createProject({ name: "spec", description: "", project_path: "/tmp" });

      const s1 = store.createSpec({ project_id: p.id, content: "v1", ai_generated: false });
      expect(s1.version).toBe(1);
      expect(s1.status).toBe("draft");

      const s2 = store.createSpec({ project_id: p.id, content: "v2", ai_generated: true, parent_version_id: s1.id });
      expect(s2.version).toBe(2);
      expect(s2.parent_version_id).toBe(s1.id);
    });

    it("getLatestSpec returns highest version", () => {
      const p = store.createProject({ name: "latest", description: "", project_path: "/tmp" });
      store.createSpec({ project_id: p.id, content: "first", ai_generated: false });
      store.createSpec({ project_id: p.id, content: "second", ai_generated: true });

      const latest = store.getLatestSpec(p.id);
      expect(latest!.content).toBe("second");
      expect(latest!.version).toBe(2);
    });

    it("getSpecHistory returns all versions in order", () => {
      const p = store.createProject({ name: "hist", description: "", project_path: "/tmp" });
      store.createSpec({ project_id: p.id, content: "a", ai_generated: false });
      store.createSpec({ project_id: p.id, content: "b", ai_generated: false });

      const history = store.getSpecHistory(p.id);
      expect(history).toHaveLength(2);
      expect(history[0].version).toBe(1);
      expect(history[1].version).toBe(2);
    });

    it("updateSpecStatus changes status", () => {
      const p = store.createProject({ name: "upd-spec", description: "", project_path: "/tmp" });
      const s = store.createSpec({ project_id: p.id, content: "c", ai_generated: true });
      store.updateSpecStatus(s.id, "approved");

      const latest = store.getLatestSpec(p.id);
      expect(latest!.status).toBe("approved");
    });
  });

  // --- Plan Steps ---

  describe("createPlanStep / getPlanSteps / updatePlanStepStatus", () => {
    it("creates and retrieves plan steps", () => {
      const p = store.createProject({ name: "plan", description: "", project_path: "/tmp" });
      const step = store.createPlanStep({
        project_id: p.id,
        phase: "dev",
        sequence: 1,
        title: "Setup project",
        description: "Init project structure",
      });
      expect(step.status).toBe("pending");

      const steps = store.getPlanSteps(p.id, "dev");
      expect(steps).toHaveLength(1);
      expect(steps[0].title).toBe("Setup project");
    });

    it("filters plan steps by phase", () => {
      const p = store.createProject({ name: "multi-phase", description: "", project_path: "/tmp" });
      store.createPlanStep({ project_id: p.id, phase: "dev", sequence: 1, title: "D1", description: "" });
      store.createPlanStep({ project_id: p.id, phase: "test", sequence: 1, title: "T1", description: "" });

      expect(store.getPlanSteps(p.id, "dev")).toHaveLength(1);
      expect(store.getPlanSteps(p.id)).toHaveLength(2);
    });

    it("updates step status with timestamps", () => {
      const p = store.createProject({ name: "step-upd", description: "", project_path: "/tmp" });
      const step = store.createPlanStep({ project_id: p.id, phase: "dev", sequence: 1, title: "S1", description: "" });

      store.updatePlanStepStatus(step.id, "in_progress");
      let steps = store.getPlanSteps(p.id, "dev");
      expect(steps[0].status).toBe("in_progress");
      expect(steps[0].started_at).toBeTruthy();

      store.updatePlanStepStatus(step.id, "done", "completed successfully");
      steps = store.getPlanSteps(p.id, "dev");
      expect(steps[0].status).toBe("done");
      expect(steps[0].result).toBe("completed successfully");
      expect(steps[0].completed_at).toBeTruthy();
    });
  });

  describe("getReadyPlanSteps", () => {
    it("returns only pending steps with all deps done", () => {
      const p = store.createProject({ name: "deps", description: "", project_path: "/tmp" });
      const s1 = store.createPlanStep({ project_id: p.id, phase: "dev", sequence: 1, title: "S1", description: "" });
      const s2 = store.createPlanStep({
        project_id: p.id, phase: "dev", sequence: 2, title: "S2", description: "",
        depends_on: [s1.id],
      });

      // s1 not done → s2 not ready
      expect(store.getReadyPlanSteps(p.id, "dev")).toHaveLength(1);
      expect(store.getReadyPlanSteps(p.id, "dev")[0].id).toBe(s1.id);

      // s1 done → s2 ready
      store.updatePlanStepStatus(s1.id, "done");
      const ready = store.getReadyPlanSteps(p.id, "dev");
      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe(s2.id);
    });
  });

  // --- Project Logs ---

  describe("addProjectLog / getProjectLogs", () => {
    it("stores and retrieves project logs", () => {
      const p = store.createProject({ name: "log-proj", description: "", project_path: "/tmp" });
      store.addProjectLog(p.id, "claude", "info", "phase started", "dev");
      store.addProjectLog(p.id, "claude", "warn", "slow response", "dev");

      const logs = store.getProjectLogs(p.id);
      expect(logs).toHaveLength(2);
      const levels = logs.map((l) => l.level);
      expect(levels).toContain("info");
      expect(levels).toContain("warn");
    });

    it("respects limit parameter", () => {
      const p = store.createProject({ name: "limit", description: "", project_path: "/tmp" });
      for (let i = 0; i < 5; i++) {
        store.addProjectLog(p.id, "a", "info", `msg ${i}`);
      }
      expect(store.getProjectLogs(p.id, 3)).toHaveLength(3);
    });
  });
});
