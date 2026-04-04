import type { Store } from "../../store/index.js";
import type { FileStore } from "../../store/file-store.js";
import type { AppConfig } from "../../types/config.js";
import type { Project } from "../../types/project.js";
import type { AgentInterface } from "../../types/agent.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface CommandContext {
  args: string[];
  store: Store;
  fileStore: FileStore | null;
  config: AppConfig;
  agent: AgentInterface | null;
  project: Project | null;
  addMessage: (msg: ChatMessage) => void;
  refreshStatus: () => void;
  startGoalEdit?: (content: string) => void;
}

export interface SlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  usage: string;
  handler: (ctx: CommandContext) => Promise<void>;
}

export class SlashCommandRegistry {
  private commands = new Map<string, SlashCommand>();

  register(cmd: SlashCommand): void {
    this.commands.set(cmd.name, cmd);
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        this.commands.set(alias, cmd);
      }
    }
  }

  get(name: string): SlashCommand | undefined {
    return this.commands.get(name);
  }

  list(): SlashCommand[] {
    const seen = new Set<string>();
    const result: SlashCommand[] = [];
    for (const cmd of this.commands.values()) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name);
        result.push(cmd);
      }
    }
    return result;
  }
}

export function createRegistry(): SlashCommandRegistry {
  const registry = new SlashCommandRegistry();

  // /help
  registry.register({
    name: "help",
    description: "Show available commands",
    usage: "/help",
    handler: async (ctx) => {
      const lines = ["Available commands:", ""];
      for (const cmd of registry.list()) {
        lines.push(`  ${cmd.usage.padEnd(30)} ${cmd.description}`);
      }
      lines.push("", "Non-/ text is sent to the AI agent as free conversation.");
      ctx.addMessage({ role: "system", content: lines.join("\n"), timestamp: new Date().toISOString() });
    },
  });

  // /status
  registry.register({
    name: "status",
    aliases: ["s"],
    description: "Show project status",
    usage: "/status",
    handler: async (ctx) => {
      if (!ctx.project) {
        ctx.addMessage({ role: "system", content: "No project selected. Use /init <name> first.", timestamp: new Date().toISOString() });
        return;
      }
      const p = ctx.project;
      const phaseStates = ctx.store.getAllPhaseStates(p.id);
      const goal = ctx.fileStore?.readGoal() ?? p.goal ?? "(not set)";
      const progress = ctx.fileStore?.getPlanProgress();
      const lines = [
        `Project: ${p.name} (${p.id.slice(0, 8)})`,
        `Status: ${p.status} | Phase: ${p.current_phase}`,
        `Goal: ${goal}`,
        "",
        "Phases:",
      ];
      for (const ps of phaseStates) {
        const icon = ps.status === "done" ? "✓" : ps.status === "failed" ? "✗" : ps.status === "in_progress" ? "▶" : ps.status === "waiting_input" ? "⏸" : "○";
        lines.push(`  ${icon} ${ps.phase}: ${ps.status}`);
      }
      if (progress && progress.total > 0) {
        lines.push("", `Plan: ${progress.done}/${progress.total} steps completed`);
      }
      ctx.addMessage({ role: "system", content: lines.join("\n"), timestamp: new Date().toISOString() });
    },
  });

  // /init
  registry.register({
    name: "init",
    description: "Create a new project",
    usage: "/init <name>",
    handler: async (ctx) => {
      const name = ctx.args[0];
      if (!name) {
        ctx.addMessage({ role: "system", content: "Usage: /init <name>", timestamp: new Date().toISOString() });
        return;
      }
      // Use the current working directory as project path
      const projectPath = process.cwd();
      const existing = ctx.store.getProjectByName(name);
      if (existing) {
        ctx.addMessage({ role: "system", content: `Project "${name}" already exists (id: ${existing.id.slice(0, 8)})`, timestamp: new Date().toISOString() });
        return;
      }
      const project = ctx.store.createProject({ name, description: "", project_path: projectPath });
      ctx.addMessage({ role: "system", content: `Project created: ${name} (id: ${project.id.slice(0, 8)})\nPath: ${projectPath}\n\nSet a goal with: /goal <description>`, timestamp: new Date().toISOString() });
    },
  });

  // /goal
  registry.register({
    name: "goal",
    aliases: ["g"],
    description: "Set, view, or edit project goal",
    usage: "/goal [edit|text]",
    handler: async (ctx) => {
      if (!ctx.project) {
        ctx.addMessage({ role: "system", content: "No project selected. Use /init <name> first.", timestamp: new Date().toISOString() });
        return;
      }
      if (ctx.args[0] === "edit") {
        const currentGoal = ctx.fileStore?.readGoal() ?? ctx.project.goal ?? "";
        if (ctx.startGoalEdit) {
          ctx.startGoalEdit(currentGoal);
        } else {
          ctx.addMessage({ role: "system", content: "Goal editor not available.", timestamp: new Date().toISOString() });
        }
        return;
      }
      if (ctx.args.length === 0) {
        const goal = ctx.fileStore?.readGoal() ?? ctx.project.goal ?? "(not set)";
        ctx.addMessage({ role: "system", content: `Goal: ${goal}`, timestamp: new Date().toISOString() });
        return;
      }
      const goalText = ctx.args.join(" ");
      ctx.store.updateProject(ctx.project.id, { goal: goalText });
      ctx.fileStore?.writeGoal(goalText);
      ctx.addMessage({ role: "system", content: `Goal set: ${goalText}`, timestamp: new Date().toISOString() });
    },
  });

  // /spec
  registry.register({
    name: "spec",
    description: "View specification modules",
    usage: "/spec [module-name]",
    handler: async (ctx) => {
      if (!ctx.fileStore) {
        ctx.addMessage({ role: "system", content: "No file store available.", timestamp: new Date().toISOString() });
        return;
      }
      const modules = ctx.fileStore.listSpecModules();
      if (modules.length === 0) {
        ctx.addMessage({ role: "system", content: "No spec generated yet. Start the project lifecycle first.", timestamp: new Date().toISOString() });
        return;
      }
      if (ctx.args.length > 0) {
        const modName = ctx.args[0].endsWith(".md") ? ctx.args[0] : `${ctx.args[0]}.md`;
        const mod = ctx.fileStore.readSpecModule(modName);
        if (!mod) {
          ctx.addMessage({ role: "system", content: `Module "${modName}" not found. Available: ${modules.join(", ")}`, timestamp: new Date().toISOString() });
          return;
        }
        ctx.addMessage({ role: "system", content: `── ${modName} ──\n\n${mod.content}`, timestamp: new Date().toISOString() });
        return;
      }
      const lines = ["Spec modules:", ""];
      for (const m of modules) {
        lines.push(`  ${m}`);
      }
      lines.push("", "Use /spec <module-name> to view a specific module.");
      ctx.addMessage({ role: "system", content: lines.join("\n"), timestamp: new Date().toISOString() });
    },
  });

  // /plan
  registry.register({
    name: "plan",
    aliases: ["p"],
    description: "View or update plan",
    usage: "/plan [done <section> <step>]",
    handler: async (ctx) => {
      if (!ctx.fileStore) {
        ctx.addMessage({ role: "system", content: "No file store available.", timestamp: new Date().toISOString() });
        return;
      }
      if (ctx.args[0] === "done" && ctx.args.length >= 3) {
        const sectionIdx = parseInt(ctx.args[1], 10);
        const stepIdx = parseInt(ctx.args[2], 10);
        ctx.fileStore.markStepDone(sectionIdx, stepIdx);
        ctx.addMessage({ role: "system", content: `Marked step done: section ${sectionIdx}, step ${stepIdx}`, timestamp: new Date().toISOString() });
        return;
      }
      const sections = ctx.fileStore.readPlan();
      if (sections.length === 0) {
        ctx.addMessage({ role: "system", content: "No plan generated yet. Start the project lifecycle first.", timestamp: new Date().toISOString() });
        return;
      }
      const progress = ctx.fileStore.getPlanProgress();
      const lines = [`Plan (${progress.done}/${progress.total} done):`, ""];
      for (let si = 0; si < sections.length; si++) {
        const s = sections[si];
        lines.push(`## ${s.phase}`);
        for (let i = 0; i < s.items.length; i++) {
          const item = s.items[i];
          const check = item.checked ? "✓" : "○";
          lines.push(`  ${check} [${si}:${i}] ${item.title}`);
        }
        lines.push("");
      }
      lines.push("Use /plan done <section> <step> to mark a step done.");
      ctx.addMessage({ role: "system", content: lines.join("\n"), timestamp: new Date().toISOString() });
    },
  });

  // /diff
  registry.register({
    name: "diff",
    description: "View version diff",
    usage: "/diff <from> <to>",
    handler: async (ctx) => {
      if (!ctx.fileStore) {
        ctx.addMessage({ role: "system", content: "No file store available.", timestamp: new Date().toISOString() });
        return;
      }
      if (ctx.args.length < 2) {
        ctx.addMessage({ role: "system", content: "Usage: /diff <from-ref> <to-ref>", timestamp: new Date().toISOString() });
        return;
      }
      const diff = await ctx.fileStore.getDiff(ctx.args[0], ctx.args[1]);
      ctx.addMessage({ role: "system", content: diff || "No differences found.", timestamp: new Date().toISOString() });
    },
  });

  // /log
  registry.register({
    name: "log",
    aliases: ["history"],
    description: "View change history",
    usage: "/log",
    handler: async (ctx) => {
      if (!ctx.fileStore) {
        ctx.addMessage({ role: "system", content: "No file store available.", timestamp: new Date().toISOString() });
        return;
      }
      const log = await ctx.fileStore.getLog(20);
      ctx.addMessage({ role: "system", content: log || "No history found.", timestamp: new Date().toISOString() });
    },
  });

  // /quit
  registry.register({
    name: "quit",
    aliases: ["q", "exit"],
    description: "Exit the application",
    usage: "/quit",
    handler: async (ctx) => {
      // The handler signals quit by throwing a special symbol
      // ChatApp catches it and exits
      throw new Error("__QUIT__");
    },
  });

  return registry;
}
