import { Command } from "commander";
import { resolve, dirname } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import type { AppConfig } from "../types/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));
import { ProjectOrchestrator } from "../orchestrator/project.js";
import { AgentFactory } from "../agents/factory.js";
import { startProjectTUI, startChatTUI } from "../tui/index.js";
import { FileStore } from "../store/file-store.js";
import type { Project, ProjectPhase } from "../types/project.js";
import { installSkills } from "./skills.js";

const GLOBAL_FBLOOM_CONFIG = resolve(homedir(), ".fbloom/config.json");

function loadJsonFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function loadConfig(): AppConfig {
  const globalConfig = loadJsonFile(GLOBAL_FBLOOM_CONFIG) as Partial<AppConfig>;

  const claudePath = globalConfig.claude_path || globalConfig.default_agent?.path || "claude";

  const config: AppConfig = {
    claude_path: claudePath,
    default_agent: {
      type: "claude-cli",
      path: claudePath,
    },
    agents: globalConfig.agents || [{ type: "claude-cli", path: claudePath }],
    max_parallel_agents: globalConfig.max_parallel_agents || 3,
    default_max_retries: globalConfig.default_max_retries || 3,
    deploy: globalConfig.deploy || {},
    ai: globalConfig.ai,
  };

  return config;
}

/** Load AI config with project-level override from .fbloom/config.json */
export function loadAiConfig(projectPath?: string): AppConfig["ai"] {
  const config = loadConfig();
  let ai = config.ai;

  if (projectPath) {
    const projectConfigPath = resolve(projectPath, ".fbloom/config.json");
    const projectConfig = loadJsonFile(projectConfigPath);
    if (projectConfig.ai && typeof projectConfig.ai === "object") {
      ai = { ...ai, ...(projectConfig.ai as AppConfig["ai"]) };
    }
  }

  return ai;
}

function ensureDir(filePath: string): void {
  const dir = resolve(filePath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("fbloom")
    .description("flowerberg-loom — AI-powered development lifecycle loom")
    .version(pkg.version);

  // ---- Project commands ----

  program
    .command("init")
    .description("Create a new project in the given directory")
    .argument("<path>", "Project directory (use . for current dir)")
    .option("-d, --description <desc>", "Project description", "")
    .action((targetPath: string, opts: { description: string }) => {
      const projectPath = resolve(targetPath);

      // Create directory if it doesn't exist
      if (!existsSync(projectPath)) {
        mkdirSync(projectPath, { recursive: true });
      }

      const config = loadConfig();
      const orchestrator = new ProjectOrchestrator(config);

      try {
        const { project } = orchestrator.createProject(projectPath, opts.description);
        console.log(`Project created: ${project.name}`);
        console.log(`Path: ${project.project_path}`);

        // Install fbloom skills to .claude/commands/
        try {
          const skillResult = installSkills(projectPath);
          if (skillResult.installed.length > 0) {
            console.log(`\nSkills installed (${skillResult.installed.length}):`);
            for (const f of skillResult.installed) {
              console.log(`  - ${f}`);
            }
          }
        } catch (skillErr) {
          console.log(`\n(Skills not installed: ${skillErr instanceof Error ? skillErr.message : String(skillErr)})`);
        }

        console.log(`\nRun "fbloom" in the project directory to start.`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  program
    .command("install-skills")
    .description("Install fbloom skills to .claude/commands/ in the given directory")
    .argument("[path]", "Project directory (use . for current dir)", ".")
    .action((targetPath: string) => {
      const projectPath = resolve(targetPath);

      try {
        const result = installSkills(projectPath);
        if (result.installed.length > 0) {
          console.log(`Installed ${result.installed.length} fbloom skill files to ${result.targetDir}:`);
          for (const f of result.installed) {
            console.log(`  - ${f}`);
          }
          console.log("\nAvailable in Claude Code:");
          console.log("  /fbloom-init <name>   — Initialize a fbloom project");
          console.log("  /fbloom-goal           — Define project goal");
          console.log("  /fbloom-spec           — Generate specifications");
          console.log("  /fbloom-plan           — Create implementation plan");
          console.log("  /fbloom-context        — Manage project context");
          console.log("  /fbloom-skill          — Generate skill bridge file");
          console.log("  /fbloom-on             — Enable spec-first rule");
          console.log("  /fbloom-off            — Disable spec-first rule");
        } else {
          console.log("No skill files found to install.");
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  program
    .command("status")
    .description("Show project status for current or specified directory")
    .argument("[path]", "Project directory (default: current dir)", ".")
    .action((targetPath: string) => {
      const projectPath = resolve(targetPath);
      const fileStore = new FileStore(projectPath, false);

      if (!fileStore.exists()) {
        console.error(`No .fbloom/ directory found at ${projectPath}`);
        process.exit(1);
      }

      const state = fileStore.getOrCreateState();
      const goal = fileStore.readGoal();
      const phaseStates = fileStore.getAllPhaseStates();
      const planSections = fileStore.readPlan();

      console.log(`\nProject: ${state.name}`);
      console.log(`Status: ${state.status} | Current Phase: ${state.current_phase}`);
      if (goal) console.log(`Goal: ${goal}`);

      console.log("\nPhases:");
      for (const ps of phaseStates) {
        const icon = ps.status === "done" ? "✓" : ps.status === "failed" ? "✗" : ps.status === "in_progress" ? "▶" : ps.status === "waiting_input" ? "⏸" : "○";
        console.log(`  ${icon} ${ps.phase}: ${ps.status}`);
      }

      if (planSections.length > 0) {
        let total = 0;
        let done = 0;
        for (const s of planSections) {
          for (const item of s.items) {
            total++;
            if (item.checked) done++;
          }
        }
        console.log(`\nPlan: ${done}/${total} steps completed`);
        for (const s of planSections) {
          for (const step of s.items) {
            const icon = step.checked ? "✓" : "○";
            console.log(`  ${icon} [${s.phase}] ${step.title}`);
          }
        }
      }
    });

  program
    .command("goal")
    .description("Set project goal")
    .argument("<goal>", "Project goal description")
    .action((goal: string) => {
      const cwd = process.cwd();
      const fileStore = new FileStore(cwd, false);

      if (!fileStore.exists()) {
        console.error(`No .fbloom/ directory found. Run "fbloom init ." first.`);
        process.exit(1);
      }

      const config = loadConfig();
      const orchestrator = new ProjectOrchestrator(config);
      orchestrator.setGoal(fileStore, goal);
      console.log(`Goal saved for project ${fileStore.readState()?.name}`);
    });

  // ---- Dashboard (TUI) ----

  program
    .command("dashboard")
    .description("Open interactive TUI dashboard")
    .action(() => {
      const config = loadConfig();
      const orchestrator = new ProjectOrchestrator(config);
      startProjectTUI(orchestrator);
    });

  // ---- Config ----

  program
    .command("config")
    .description("Show or edit configuration")
    .option("--show", "Show current config")
    .option("--set-agent <type>", "Set default agent type")
    .option("--set-path <path>", "Set default agent path")
    .action((opts: { show?: boolean; setAgent?: string; setPath?: string }) => {
      if (opts.show || (!opts.setAgent && !opts.setPath)) {
        const config = loadConfig();
        console.log(JSON.stringify(config, null, 2));
        return;
      }

      const configPath = GLOBAL_FBLOOM_CONFIG;
      let config: AppConfig = loadConfig();

      if (opts.setAgent) {
        config.default_agent.type = opts.setAgent as AppConfig["default_agent"]["type"];
      }
      if (opts.setPath) {
        config.default_agent.path = opts.setPath;
        config.claude_path = opts.setPath;
      }

      ensureDir(configPath);
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`Config saved to ${configPath}`);
    });

  // Default action: auto-detect .fbloom/ and launch Chat TUI
  program.action(() => {
    const cwd = process.cwd();

    // Resolve AI config: global ~/.fbloom/config.json → project .fbloom/config.json
    const ai = loadAiConfig(cwd);
    const config = loadConfig();
    config.ai = ai;

    const agentFactory = new AgentFactory();
    const agent = agentFactory.getDefault(config);

    let initialProject: Project | undefined;

    // Auto-detect: check if .fbloom/ exists in cwd
    const fileStore = new FileStore(cwd, config.deploy?.verifyBuild !== false);
    if (fileStore.exists()) {
      // Ensure state.json exists (rebuild if needed)
      const state = fileStore.getOrCreateState();
      const goal = fileStore.readGoal();
      initialProject = {
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

    startChatTUI(fileStore, config, agent, initialProject);
  });

  return program;
}

// Always run — this is the CLI entry point
createProgram().parse();
