import { Command } from "commander";
import { resolve } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import type { AppConfig } from "../types.js";
import { Store } from "../store/index.js";
import { Orchestrator } from "../orchestrator/index.js";
import { startTUI } from "../tui/index.js";

const DEFAULT_CONFIG_PATH = resolve(homedir(), ".config/flowerberg-devflow/config.json");
const DEFAULT_DB_PATH = resolve(homedir(), ".config/flowerberg-devflow/devflow.db");

function loadConfig(): AppConfig {
  const configPath = process.env.DEVFLOW_CONFIG || DEFAULT_CONFIG_PATH;

  let fileConfig: Partial<AppConfig> = {};
  if (existsSync(configPath)) {
    fileConfig = JSON.parse(readFileSync(configPath, "utf-8"));
  }

  // Auto-detect claude CLI path
  const claudePath = fileConfig.claude_path || "claude";

  const config: AppConfig = {
    claude_path: claudePath,
    model_coder: fileConfig.model_coder || "sonnet",
    model_reviewer: fileConfig.model_reviewer || "opus",
    model_orchestrator: fileConfig.model_orchestrator || "opus",
    max_parallel_agents: fileConfig.max_parallel_agents || 3,
    default_max_retries: fileConfig.default_max_retries || 3,
    deploy: fileConfig.deploy || {
      host: "",
      port: 22,
      user: "",
      path: "",
    },
  };

  return config;
}

function getStore(): Store {
  const dbPath = process.env.DEVFLOW_DB || DEFAULT_DB_PATH;
  return new Store(dbPath);
}

function saveConfig(configPath: string, config: Partial<AppConfig>): void {
  const dir = resolve(configPath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let existing: Partial<AppConfig> = {};
  if (existsSync(configPath)) {
    existing = JSON.parse(readFileSync(configPath, "utf-8"));
  }

  const merged = { ...existing, ...config };
  writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");
  console.log(`Config saved to ${configPath}`);
}

const program = new Command();

program
  .name("devflow")
  .description("flowerberg-devflow — autonomous AI development pipeline")
  .version("0.1.0");

// Default: launch TUI dashboard
program
  .command("dashboard")
  .alias("ui")
  .description("Launch the TUI dashboard (default)")
  .action(() => {
    const config = loadConfig();
    const store = getStore();
    const orchestrator = new Orchestrator(config, store);
    startTUI(orchestrator);
  });

// Submit a new task
program
  .command("submit")
  .description("Submit a new development task")
  .argument("<description>", "Task description")
  .option("-p, --project <path>", "Project path", process.cwd())
  .option("-v, --version <name>", "Version branch name", "main")
  .option("-t, --title <title>", "Task title (defaults to first 50 chars of description)")
  .action(async (description: string, opts: { project: string; version: string; title?: string }) => {
    const config = loadConfig();
    const store = getStore();
    const orchestrator = new Orchestrator(config, store);

    const projectPath = resolve(opts.project);
    const title = opts.title || description.slice(0, 50);

    const task = await orchestrator.submit(title, description, projectPath, opts.version);
    console.log(`Task submitted: ${task.id}`);
    console.log(`Title: ${task.title}`);
    console.log(`Status: ${task.status}`);
    console.log(`\nRun "devflow status ${task.id}" to check progress.`);
    console.log(`Run "devflow dashboard" to see all tasks.`);
  });

// List all tasks
program
  .command("list")
  .alias("ls")
  .description("List all tasks")
  .action(() => {
    const store = getStore();
    const tasks = store.listTasks();

    if (tasks.length === 0) {
      console.log("No tasks found.");
      return;
    }

    for (const task of tasks) {
      const subtasks = store.getSubtasks(task.id);
      const done = subtasks.filter((s) => s.status === "done").length;
      console.log(
        `${task.status.padEnd(12)} | ${task.id.slice(0, 8)} | ${task.title}${subtasks.length > 0 ? ` (${done}/${subtasks.length})` : ""}`
      );
    }
  });

// Show task status
program
  .command("status")
  .description("Show detailed task status")
  .argument("<taskId>", "Task ID")
  .action((taskId: string) => {
    const store = getStore();
    const task = store.getTask(taskId);
    if (!task) {
      const tasks = store.listTasks().filter((t) => t.id.startsWith(taskId));
      if (tasks.length === 1) {
        return showTaskDetail(store, tasks[0]);
      }
      console.error(`Task not found: ${taskId}`);
      process.exit(1);
    }
    showTaskDetail(store, task);
  });

function showTaskDetail(store: Store, task: ReturnType<Store["getTask"]>): void {
  if (!task) return;
  const subtasks = store.getSubtasks(task.id);
  const logs = store.getLogs(task.id, 20);

  console.log(`\nTask: ${task.title}`);
  console.log(`ID: ${task.id}`);
  console.log(`Status: ${task.status}`);
  console.log(`Version: ${task.version}`);
  console.log(`Project: ${task.project_path}`);
  console.log(`Created: ${task.created_at}`);
  if (task.error_message) console.log(`Error: ${task.error_message}`);

  if (subtasks.length > 0) {
    console.log("\nSubtasks:");
    for (const s of subtasks) {
      console.log(`  ${s.status.padEnd(12)} | [${s.type}] ${s.title}`);
    }
  }

  if (logs.length > 0) {
    console.log("\nRecent logs:");
    for (const l of logs.slice(0, 10)) {
      console.log(`  [${l.level}] ${l.message}`);
    }
  }
}

// Configure settings
program
  .command("config")
  .description("Configure devflow settings")
  .option("--claude-path <path>", "Set claude CLI path")
  .option("--model-coder <model>", "Set coder model")
  .option("--model-reviewer <model>", "Set reviewer model")
  .option("--model-orchestrator <model>", "Set orchestrator model")
  .option("--deploy-host <host>", "Set deploy host")
  .option("--deploy-user <user>", "Set deploy user")
  .option("--deploy-path <path>", "Set deploy path")
  .action((opts) => {
    const configPath = process.env.DEVFLOW_CONFIG || DEFAULT_CONFIG_PATH;
    const updates: Partial<AppConfig> = {};

    if (opts.claudePath) updates.claude_path = opts.claudePath;
    if (opts.modelCoder) updates.model_coder = opts.modelCoder;
    if (opts.modelReviewer) updates.model_reviewer = opts.modelReviewer;
    if (opts.modelOrchestrator) updates.model_orchestrator = opts.modelOrchestrator;

    const deployUpdates: Record<string, string> = {};
    if (opts.deployHost) deployUpdates.host = opts.deployHost;
    if (opts.deployUser) deployUpdates.user = opts.deployUser;
    if (opts.deployPath) deployUpdates.path = opts.deployPath;
    if (Object.keys(deployUpdates).length > 0) {
      updates.deploy = deployUpdates as AppConfig["deploy"];
    }

    if (Object.keys(updates).length === 0) {
      console.log("Current config:");
      if (existsSync(configPath)) {
        console.log(readFileSync(configPath, "utf-8"));
      } else {
        console.log("(no config file found)");
        console.log(`\nConfig path: ${configPath}`);
        console.log("\nDefaults:");
        console.log(`  claude_path: claude`);
        console.log(`  model_coder: sonnet`);
        console.log(`  model_reviewer: opus`);
        console.log(`  model_orchestrator: opus`);
      }
      return;
    }

    saveConfig(configPath, updates);
  });

// Default action: show help if no command
program.action(() => {
  program.help();
});

program.parse();
