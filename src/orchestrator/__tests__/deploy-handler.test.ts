import { describe, it, expect, beforeEach, vi } from "vitest";
import { Store } from "../../store/index.js";
import { DeployPhaseHandler, type PhaseHandlerContext } from "../phase-handler.js";
import type { AppConfig } from "../../types/config.js";
import type { ProjectEvent } from "../../types/events.js";

// Mock execCommand
vi.mock("../exec.js", () => ({
  execCommand: vi.fn(),
}));

import { execCommand } from "../exec.js";
const mockedExec = vi.mocked(execCommand);

function createStore(): Store {
  return new Store(":memory:");
}

function createCtx(overrides?: Partial<PhaseHandlerContext>): PhaseHandlerContext {
  const store = createStore();
  const p = store.createProject({ name: "deploy-test", description: "", project_path: "/tmp/project" });
  const events: ProjectEvent[] = [];

  // Set goal and complete phases up to deploy
  store.updateProject(p.id, { goal: "Build a CLI tool" });
  const phases = ["goal", "spec", "plan", "dev", "test", "review"] as const;
  for (const phase of phases) {
    store.setPhaseState(p.id, phase, "done");
    store.updateProject(p.id, { current_phase: phase });
  }
  store.updateProject(p.id, { current_phase: "deploy" });

  return {
    projectId: p.id,
    projectPath: "/tmp/project",
    goal: "Build a CLI tool",
    store,
    agent: { run: vi.fn(), decompose: vi.fn() } as unknown as PhaseHandlerContext["agent"],
    config: {
      default_agent: { type: "claude-cli", path: "claude" },
      agents: [{ type: "claude-cli", path: "claude" }],
      max_parallel_agents: 3,
      default_max_retries: 3,
      deploy: {},
    },
    getPhaseOutput: () => null,
    emit: (e) => events.push(e),
    ...overrides,
  };
}

describe("DeployPhaseHandler", () => {
  let handler: DeployPhaseHandler;

  beforeEach(() => {
    handler = new DeployPhaseHandler();
    vi.clearAllMocks();
  });

  it("verifies build and returns requiresHumanInput on first call", async () => {
    const ctx = createCtx();

    mockedExec.mockImplementation(async (cmd, args) => {
      if (cmd === "npm" && args[0] === "run" && args[1] === "build") {
        return { stdout: "built!", stderr: "", exitCode: 0 };
      }
      if (cmd === "git" && args[0] === "status") {
        return { stdout: "", stderr: "", exitCode: 0 }; // clean
      }
      if (cmd === "git" && args[0] === "rev-parse") {
        return { stdout: "main\n", stderr: "", exitCode: 0 };
      }
      if (cmd === "git" && args[0] === "remote") {
        return { stdout: "git@github.com:user/repo.git\n", stderr: "", exitCode: 0 };
      }
      if (cmd === "git" && args[0] === "log") {
        return { stdout: "abc123 fix bug\ndef456 add feature\n", stderr: "", exitCode: 0 };
      }
      if (cmd === "gh" && args[0] === "auth") {
        return { stdout: "logged in", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await handler.execute(ctx);

    expect(result.success).toBe(true);
    expect(result.requiresHumanInput).toBe(true);
    expect(result.humanPrompt).toContain("Ready to deploy");
    expect(result.humanPrompt).toContain("main");
  });

  it("fails when build verification fails", async () => {
    const ctx = createCtx();

    mockedExec.mockResolvedValue({ stdout: "", stderr: "Build error", exitCode: 1 });

    const result = await handler.execute(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Build verification failed");
  });

  it("fails when working tree is dirty", async () => {
    const ctx = createCtx();

    mockedExec.mockImplementation(async (cmd, args) => {
      if (cmd === "npm") return { stdout: "ok", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "status") {
        return { stdout: "M src/index.ts\n?? new-file.ts\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await handler.execute(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain("uncommitted changes");
  });

  it("fails when gh is not authenticated", async () => {
    const ctx = createCtx();

    mockedExec.mockImplementation(async (cmd, args) => {
      if (cmd === "npm") return { stdout: "ok", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "status") return { stdout: "", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "rev-parse") return { stdout: "main\n", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "remote") return { stdout: "git@github.com:user/repo.git\n", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "log") return { stdout: "abc123 msg\n", stderr: "", exitCode: 0 };
      if (cmd === "gh" && args[0] === "auth") {
        return { stdout: "", stderr: "not logged in", exitCode: 1 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await handler.execute(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain("gh CLI is not authenticated");
  });

  it("executes push and release after human confirmation", async () => {
    const ctx = createCtx();

    // Simulate confirmed state
    ctx.store.setPhaseState(ctx.projectId, "deploy", "in_progress");
    ctx.store.setPhaseState(ctx.projectId, "deploy", "waiting_input", {
      input_data: JSON.stringify({ confirmed: true }),
    });

    mockedExec.mockImplementation(async (cmd, args) => {
      if (cmd === "git" && args[0] === "rev-parse") return { stdout: "main\n", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "push") return { stdout: "pushed", stderr: "", exitCode: 0 };
      if (cmd === "gh" && args[0] === "release") return { stdout: "release created", stderr: "", exitCode: 0 };
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await handler.execute(ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("Deployed to origin/main");
  });

  it("returns error when git push fails", async () => {
    const ctx = createCtx();

    ctx.store.setPhaseState(ctx.projectId, "deploy", "in_progress");
    ctx.store.setPhaseState(ctx.projectId, "deploy", "waiting_input", {
      input_data: JSON.stringify({ confirmed: true }),
    });

    mockedExec.mockImplementation(async (cmd, args) => {
      if (cmd === "git" && args[0] === "rev-parse") return { stdout: "main\n", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "push") {
        return { stdout: "", stderr: "push failed: rejected", exitCode: 1 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await handler.execute(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain("git push failed");
  });

  it("returns success with warning when release fails after push", async () => {
    const ctx = createCtx();

    ctx.store.setPhaseState(ctx.projectId, "deploy", "in_progress");
    ctx.store.setPhaseState(ctx.projectId, "deploy", "waiting_input", {
      input_data: JSON.stringify({ confirmed: true }),
    });

    mockedExec.mockImplementation(async (cmd, args) => {
      if (cmd === "git" && args[0] === "rev-parse") return { stdout: "main\n", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "push") return { stdout: "pushed", stderr: "", exitCode: 0 };
      if (cmd === "gh" && args[0] === "release") {
        return { stdout: "", stderr: "release failed: tag exists", exitCode: 1 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await handler.execute(ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("release failed");
  });

  it("skips build verification when verifyBuild is false", async () => {
    const ctx = createCtx({
      config: {
        ...createCtx().config,
        deploy: { verifyBuild: false },
      },
    });

    mockedExec.mockImplementation(async (cmd, args) => {
      if (cmd === "git" && args[0] === "status") return { stdout: "", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "rev-parse") return { stdout: "main\n", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "remote") return { stdout: "git@github.com:user/repo.git\n", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "log") return { stdout: "abc123 msg\n", stderr: "", exitCode: 0 };
      if (cmd === "gh" && args[0] === "auth") return { stdout: "ok", stderr: "", exitCode: 0 };
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await handler.execute(ctx);

    expect(result.success).toBe(true);
    // npm build should NOT have been called
    const npmCalls = mockedExec.mock.calls.filter((c) => c[0] === "npm");
    expect(npmCalls).toHaveLength(0);
  });

  it("skips release check when createRelease is false", async () => {
    const ctx = createCtx({
      config: {
        ...createCtx().config,
        deploy: { createRelease: false, verifyBuild: false },
      },
    });

    mockedExec.mockImplementation(async (cmd, args) => {
      if (cmd === "git" && args[0] === "status") return { stdout: "", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "rev-parse") return { stdout: "main\n", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "remote") return { stdout: "git@github.com:user/repo.git\n", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "log") return { stdout: "abc123 msg\n", stderr: "", exitCode: 0 };
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await handler.execute(ctx);

    expect(result.success).toBe(true);
    expect(result.humanPrompt).toContain("no release");
    // gh should NOT have been called
    const ghCalls = mockedExec.mock.calls.filter((c) => c[0] === "gh");
    expect(ghCalls).toHaveLength(0);
  });
});
