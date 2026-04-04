import { Command } from "commander";
import { resolve } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import type { AppConfig } from "../types/config.js";
import { Store } from "../store/index.js";
import { ProjectOrchestrator } from "../orchestrator/project.js";
import { AgentFactory } from "../agents/factory.js";
import { startProjectTUI, startChatTUI } from "../tui/index.js";
import { FileStore } from "../store/file-store.js";
import type { Project, ProjectPhase } from "../types/project.js";

const DEFAULT_CONFIG_PATH = resolve(homedir(), ".config/fbloom/config.json");
const GLOBAL_FBLOOM_CONFIG = resolve(homedir(), ".fbloom/config.json");
const DEFAULT_DB_PATH = resolve(homedir(), ".config/fbloom/loom.db");

function loadJsonFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function loadConfig(): AppConfig {
  // Load configs in priority order: legacy ~/.config/fbloom → global ~/.fbloom
  const legacyConfig = loadJsonFile(DEFAULT_CONFIG_PATH);
  const globalConfig = loadJsonFile(GLOBAL_FBLOOM_CONFIG);

  // Merge: global ~/.fbloom overrides legacy ~/.config/fbloom
  const fileConfig = { ...legacyConfig, ...globalConfig } as Partial<AppConfig>;

  const claudePath = fileConfig.claude_path || fileConfig.default_agent?.path || "claude";

  const config: AppConfig = {
    claude_path: claudePath,
    default_agent: {
      type: "claude-cli",
      path: claudePath,
    },
    agents: fileConfig.agents || [{ type: "claude-cli", path: claudePath }],
    max_parallel_agents: fileConfig.max_parallel_agents || 3,
    default_max_retries: fileConfig.default_max_retries || 3,
    deploy: fileConfig.deploy || {},
    ai: fileConfig.ai,
  };

  return config;
}

/** Load AI config with project-level override from .fbloom/config.json */
export function loadAiConfig(projectPath?: string): AppConfig["ai"] {
  // Start with global config
  const config = loadConfig();
  let ai = config.ai;

  // Override with project-level .fbloom/config.json
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

function createStore(): Store {
  const dbPath = process.env.DEVFLOW_DB || DEFAULT_DB_PATH;
  ensureDir(dbPath);
  return new Store(dbPath);
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("fbloom")
    .description("flowerberg-loom — AI-powered development lifecycle loom")
    .version("0.2.0");

  // ---- Project commands ----

  program
    .command("init")
    .description("Create a new project")
    .argument("<name>", "Project name")
    .option("-p, --path <path>", "Project directory", process.cwd())
    .option("-d, --description <desc>", "Project description", "")
    .action((name: string, opts: { path: string; description: string }) => {
      const store = createStore();
      const config = loadConfig();
      const orchestrator = new ProjectOrchestrator(config, store);

      try {
        const project = orchestrator.createProject(name, resolve(opts.path), opts.description);
        console.log(`Project created: ${project.name} (id: ${project.id})`);
        console.log(`Path: ${project.project_path}`);
        console.log(`\nStart with: fbloom start ${project.id}`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      } finally {
        store.close();
      }
    });

  program
    .command("projects")
    .description("List all projects")
    .action(() => {
      const store = createStore();

      try {
        const projects = store.listProjects();
        if (projects.length === 0) {
          console.log("No projects yet. Use: fbloom init <name>");
          return;
        }

        console.log("Projects:\n");
        for (const p of projects) {
          const statusIcon = p.status === "completed" ? "✓" : p.status === "failed" ? "✗" : "●";
          console.log(`  ${statusIcon} ${p.name} (${p.id.slice(0, 8)})`);
          console.log(`    Phase: ${p.current_phase} | Status: ${p.status}`);
          if (p.goal) console.log(`    Goal: ${p.goal.slice(0, 80)}${p.goal.length > 80 ? "..." : ""}`);
          console.log("");
        }
      } finally {
        store.close();
      }
    });

  program
    .command("start")
    .description("Start or resume a project lifecycle")
    .argument("<projectId>", "Project ID (or unique prefix)")
    .action((projectId: string) => {
      const store = createStore();
      const config = loadConfig();
      const orchestrator = new ProjectOrchestrator(config, store);

      try {
        // Find project by ID or prefix
        const project = store.listProjects().find((p) => p.id.startsWith(projectId));
        if (!project) {
          console.error(`Project not found: ${projectId}`);
          process.exit(1);
        }

        console.log(`Starting project: ${project.name}`);
        console.log(`Phase: ${project.current_phase} | Status: ${project.status}`);

        if (!project.goal) {
          console.log("\nNo goal set. Use: fbloom goal <projectId> <goal>");
          console.log("Or use the dashboard: fbloom dashboard");
          return;
        }

        orchestrator.startProject(project.id);
        console.log("Project started. Use `fbloom dashboard` to monitor progress.");
      } finally {
        // Don't close store — orchestrator is running async
      }
    });

  program
    .command("goal")
    .description("Set project goal")
    .argument("<projectId>", "Project ID (or unique prefix)")
    .argument("<goal>", "Project goal description")
    .action((projectId: string, goal: string) => {
      const store = createStore();
      const config = loadConfig();
      const orchestrator = new ProjectOrchestrator(config, store);

      try {
        const project = store.listProjects().find((p) => p.id.startsWith(projectId));
        if (!project) {
          console.error(`Project not found: ${projectId}`);
          process.exit(1);
        }

        orchestrator.setGoal(project.id, goal);
        console.log(`Goal set for project ${project.name}`);
      } finally {
        store.close();
      }
    });

  program
    .command("input")
    .description("Provide human input for the current phase")
    .argument("<projectId>", "Project ID (or unique prefix)")
    .argument("<value>", "Input value")
    .action((projectId: string, value: string) => {
      const store = createStore();
      const config = loadConfig();
      const orchestrator = new ProjectOrchestrator(config, store);

      try {
        const project = store.listProjects().find((p) => p.id.startsWith(projectId));
        if (!project) {
          console.error(`Project not found: ${projectId}`);
          process.exit(1);
        }

        orchestrator.provideInput(project.id, value);
        console.log(`Input provided for project ${project.name}`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      } finally {
        store.close();
      }
    });

  program
    .command("status")
    .description("Show project status")
    .argument("<projectId>", "Project ID (or unique prefix)")
    .action((projectId: string) => {
      const store = createStore();

      try {
        const project = store.listProjects().find((p) => p.id.startsWith(projectId));
        if (!project) {
          console.error(`Project not found: ${projectId}`);
          process.exit(1);
        }

        const phaseStates = store.getAllPhaseStates(project.id);
        const spec = store.getLatestSpec(project.id);
        const planSteps = store.getPlanSteps(project.id);

        console.log(`\nProject: ${project.name} (${project.id})`);
        console.log(`Status: ${project.status} | Current Phase: ${project.current_phase}`);
        if (project.goal) console.log(`Goal: ${project.goal}`);

        console.log("\nPhases:");
        for (const ps of phaseStates) {
          const icon = ps.status === "done" ? "✓" : ps.status === "failed" ? "✗" : ps.status === "in_progress" ? "▶" : ps.status === "waiting_input" ? "⏸" : "○";
          console.log(`  ${icon} ${ps.phase}: ${ps.status}`);
        }

        if (spec) {
          console.log(`\nSpec: version ${spec.version} (${spec.status})`);
        }

        if (planSteps.length > 0) {
          const done = planSteps.filter((s) => s.status === "done").length;
          console.log(`\nPlan: ${done}/${planSteps.length} steps completed`);
          for (const step of planSteps) {
            const icon = step.status === "done" ? "✓" : step.status === "failed" ? "✗" : step.status === "in_progress" ? "▶" : "○";
            console.log(`  ${icon} [${step.phase}] ${step.title}`);
          }
        }
      } finally {
        store.close();
      }
    });

  // ---- Migrate ----

  program
    .command("migrate")
    .description("Migrate project data from SQLite to file-based storage")
    .argument("<projectId>", "Project ID (or unique prefix)")
    .action((projectId: string) => {
      const store = createStore();

      try {
        const project = store.listProjects().find((p) => p.id.startsWith(projectId));
        if (!project) {
          console.error(`Project not found: ${projectId}`);
          process.exit(1);
        }

        store.migrateProjectData(project.id, project.project_path);
        console.log(`Migrated project "${project.name}" to file-based storage (.fbloom/)`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      } finally {
        store.close();
      }
    });

  // ---- Dashboard (TUI) ----

  program
    .command("dashboard")
    .description("Open interactive TUI dashboard")
    .action(() => {
      const store = createStore();
      const config = loadConfig();
      const orchestrator = new ProjectOrchestrator(config, store);
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

      const configPath = process.env.DEVFLOW_CONFIG || DEFAULT_CONFIG_PATH;
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
    const store = createStore();
    const cwd = process.cwd();

    // Resolve AI config: global ~/.fbloom/config.json → project .fbloom/config.json
    const ai = loadAiConfig(cwd);
    const config = loadConfig();
    config.ai = ai;

    const agentFactory = new AgentFactory();
    const agent = agentFactory.getDefault(config);

    let initialProject: Project | undefined;

    // Auto-detect: check if .fbloom/ exists in cwd
    const fs = new FileStore(cwd, false);
    if (fs.exists()) {
      // Try to find existing project by path
      let project = store.getProjectByPath(cwd);
      if (!project) {
        // Import from .fbloom/ files
        const data = fs.scanForImport();
        project = store.createProject({
          name: data.name,
          description: "",
          project_path: cwd,
          goal: data.goal,
        });
        // Set phase statuses based on file presence
        for (const [phase, status] of Object.entries(data.phaseStatuses)) {
          if (status === "done") {
            store.setPhaseState(project.id, phase as ProjectPhase, "done");
          }
        }
        store.updateProject(project.id, { current_phase: data.currentPhase as ProjectPhase });
        project = store.getProject(project.id);
      }
      initialProject = project ?? undefined;
    }

    startChatTUI(store, config, agent, initialProject);
  });

  return program;
}

// Always run — this is the CLI entry point
createProgram().parse();
