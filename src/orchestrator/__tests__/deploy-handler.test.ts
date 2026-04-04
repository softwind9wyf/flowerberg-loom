import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { DeployPhaseHandler, type PhaseHandlerContext } from "../phase-handler.js";
import { FileStore } from "../../store/file-store.js";
import type { AppConfig } from "../../types/config.js";

// Mock execCommand
vi.mock("../exec.js", () => ({
  execCommand: vi.fn(),
}));

import { execCommand } from "../exec.js";
const mockedExec = vi.mocked(execCommand);

let testDir: string;
let fileStore: FileStore;

function createCtx(overrides?: Partial<PhaseHandlerContext>): PhaseHandlerContext {
  fileStore.initProject("test-project");
  fileStore.writeGoal("Build something");

  return {
    projectPath: testDir,
    goal: "Build something",
    fileStore,
    agent: {
      run: vi.fn().mockResolvedValue({ success: true, output: "ok" }),
      decompose: vi.fn().mockResolvedValue([]),
      isAvailable: vi.fn().mockResolvedValue(true),
    },
    config: {
      claude_path: "claude",
      default_agent: { type: "claude-cli", path: "claude" },
      agents: [],
      max_parallel_agents: 3,
      default_max_retries: 3,
      deploy: {
        remote: "origin",
        branch: "main",
        createRelease: true,
        tagPrefix: "v",
        buildCommand: "npm run build",
        verifyBuild: true,
      },
    },
    getPhaseOutput: () => null,
    emit: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  testDir = join(tmpdir(), `fbloom-deploy-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(testDir, { recursive: true });
  fileStore = new FileStore(testDir, false);
  vi.clearAllMocks();
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe("DeployPhaseHandler", () => {
  let handler: DeployPhaseHandler;

  beforeEach(() => {
    handler = new DeployPhaseHandler();
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
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    // Create a minimal package.json
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ version: "1.0.0" }));

    const result = await handler.execute(ctx);
    expect(result.success).toBe(true);
    expect(result.requiresHumanInput).toBe(true);
    expect(result.humanPrompt).toContain("Ready to deploy");
  });

  it("fails when build verification fails", async () => {
    const ctx = createCtx();

    mockedExec.mockImplementation(async (cmd, args) => {
      if (cmd === "npm" && args[0] === "run" && args[1] === "build") {
        return { stdout: "", stderr: "Build failed!", exitCode: 1 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await handler.execute(ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Build verification failed");
  });

  it("fails when working tree has uncommitted changes", async () => {
    const ctx = createCtx();

    mockedExec.mockImplementation(async (cmd, args) => {
      if (cmd === "npm") {
        return { stdout: "built!", stderr: "", exitCode: 0 };
      }
      if (cmd === "git" && args[0] === "status") {
        return { stdout: "M src/foo.ts\n?? bar.ts\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await handler.execute(ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain("uncommitted changes");
  });

  it("fails when gh is not authenticated but createRelease is true", async () => {
    const ctx = createCtx();

    mockedExec.mockImplementation(async (cmd, args) => {
      if (cmd === "npm") return { stdout: "ok", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "status") return { stdout: "", stderr: "", exitCode: 0 };
      if (cmd === "gh" && args[0] === "auth") return { stdout: "", stderr: "not auth", exitCode: 1 };
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await handler.execute(ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain("gh CLI is not authenticated");
  });

  it("pushes and creates release after confirmation", async () => {
    const ctx = createCtx();

    // Set deploy phase state to simulate "confirmed" input
    fileStore.initProject("test-project");
    fileStore.setPhaseState("deploy", "in_progress", {
      input_data: JSON.stringify({ confirmed: true }),
    });

    mockedExec.mockImplementation(async (cmd, args) => {
      if (cmd === "git" && args[0] === "rev-parse") {
        return { stdout: "main\n", stderr: "", exitCode: 0 };
      }
      if (cmd === "git" && args[0] === "push") {
        return { stdout: "pushed!", stderr: "", exitCode: 0 };
      }
      if (cmd === "gh" && args[0] === "release") {
        return { stdout: "release created!", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    // Need to override the fileStore in ctx to use our setup
    const confirmedCtx = { ...ctx, fileStore };

    writeFileSync(join(testDir, "package.json"), JSON.stringify({ version: "2.0.0" }));

    const result = await handler.execute(confirmedCtx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("Deployed to");
  });

  it("skips build verification when verifyBuild is false", async () => {
    const ctx = createCtx({
      config: {
        ...createCtx().config,
        deploy: { ...createCtx().config.deploy, verifyBuild: false },
      },
    });

    mockedExec.mockImplementation(async (cmd, args) => {
      if (cmd === "git" && args[0] === "status") return { stdout: "", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "rev-parse") return { stdout: "main\n", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "remote") return { stdout: "url\n", stderr: "", exitCode: 0 };
      if (cmd === "git" && args[0] === "log") return { stdout: "log\n", stderr: "", exitCode: 0 };
      if (cmd === "gh" && args[0] === "auth") return { stdout: "", stderr: "", exitCode: 0 };
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await handler.execute(ctx);
    expect(result.success).toBe(true);
    // Should not have called npm run build
    const npmCalls = mockedExec.mock.calls.filter(c => c[0] === "npm");
    expect(npmCalls.length).toBe(0);
  });
});
