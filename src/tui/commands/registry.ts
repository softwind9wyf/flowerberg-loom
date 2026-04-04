import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
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
  fileStore: FileStore;
  config: AppConfig;
  agent: AgentInterface | null;
  project: Project | null;
  addMessage: (msg: ChatMessage) => void;
  refreshStatus: () => void;
  startGoalEdit?: (content: string) => void;
  startContextEdit?: (content: string) => void;
  enterGoalChat?: () => void;
  exitGoalChat?: (save: boolean) => void;
  enterSpecChat?: (moduleName: string) => void;
  exitSpecChat?: (save: boolean) => void;
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
      const state = ctx.fileStore.readState();
      if (!state) {
        ctx.addMessage({ role: "system", content: "No project found. Use /init first.", timestamp: new Date().toISOString() });
        return;
      }
      const goal = ctx.fileStore.readGoal() ?? "(not set)";
      const phaseStates = ctx.fileStore.getAllPhaseStates();
      const progress = ctx.fileStore.getPlanProgress();
      const lines = [
        `Project: ${state.name}`,
        `Status: ${state.status} | Phase: ${state.current_phase}`,
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
    description: "Create a new project (name defaults to current directory)",
    usage: "/init [name]",
    handler: async (ctx) => {
      const projectPath = process.cwd();
      const name = ctx.args[0] || projectPath.split("/").pop() || "untitled";

      if (ctx.fileStore.exists()) {
        const existing = ctx.fileStore.readState();
        ctx.addMessage({ role: "system", content: `Project "${existing?.name}" already exists for this directory.`, timestamp: new Date().toISOString() });
        return;
      }

      ctx.fileStore.initProject(name);
      ctx.addMessage({ role: "system", content: `Project created: ${name}\nPath: ${projectPath}\n\nSet a goal with: /goal <description>`, timestamp: new Date().toISOString() });
    },
  });

  // /goal
  registry.register({
    name: "goal",
    aliases: ["g"],
    description: "Set, view, edit, or chat about project goal",
    usage: "/goal [chat|edit|save|cancel|text]",
    handler: async (ctx) => {
      const sub = ctx.args[0];

      if (sub === "chat") {
        if (!ctx.agent) {
          ctx.addMessage({ role: "system", content: "AI agent not available. Configure ai.api_key first.", timestamp: new Date().toISOString() });
          return;
        }
        if (ctx.enterGoalChat) {
          ctx.enterGoalChat();
          ctx.addMessage({ role: "system", content: "Entered goal chat mode. Discuss your project goal with AI.\nType /goal save to save the suggested goal, or /goal cancel to exit.", timestamp: new Date().toISOString() });
        }
        return;
      }

      if (sub === "save") {
        if (ctx.exitGoalChat) {
          ctx.exitGoalChat(true);
        }
        return;
      }

      if (sub === "cancel") {
        if (ctx.exitGoalChat) {
          ctx.exitGoalChat(false);
        }
        return;
      }

      if (sub === "edit") {
        const currentGoal = ctx.fileStore.readGoal() ?? ctx.project?.goal ?? "";
        if (ctx.startGoalEdit) {
          ctx.startGoalEdit(currentGoal);
        } else {
          ctx.addMessage({ role: "system", content: "Goal editor not available.", timestamp: new Date().toISOString() });
        }
        return;
      }

      if (ctx.args.length === 0) {
        const goal = ctx.fileStore.readGoal() ?? ctx.project?.goal ?? "(not set)";
        ctx.addMessage({ role: "system", content: `Goal: ${goal}`, timestamp: new Date().toISOString() });
        return;
      }

      const goalText = ctx.args.join(" ");
      ctx.fileStore.writeGoal(goalText);
      ctx.addMessage({ role: "system", content: `Goal set: ${goalText}`, timestamp: new Date().toISOString() });
    },
  });

  // /context
  registry.register({
    name: "context",
    description: "View or edit project AI context (.fbloom/context.md)",
    usage: "/context [edit]",
    handler: async (ctx) => {
      if (ctx.args[0] === "edit") {
        const current = ctx.fileStore.readContext() ?? "";
        if (ctx.startContextEdit) {
          ctx.startContextEdit(current);
        }
        return;
      }
      const content = ctx.fileStore.readContext();
      if (!content) {
        ctx.addMessage({ role: "system", content: "No context set. Use /context edit to add project-level AI context.\nThis will be injected into every AI conversation.", timestamp: new Date().toISOString() });
        return;
      }
      ctx.addMessage({ role: "system", content: `── .fbloom/context.md ──\n\n${content}`, timestamp: new Date().toISOString() });
    },
  });

  // /spec
  registry.register({
    name: "spec",
    description: "View specs, generate from goal, or chat about a module",
    usage: "/spec [generate|<module>|chat <module>]",
    handler: async (ctx) => {
      const sub = ctx.args[0];

      // /spec generate — AI generates specs from goal
      if (sub === "generate") {
        if (!ctx.agent) {
          ctx.addMessage({ role: "system", content: "AI agent not available. Configure ai.api_key first.", timestamp: new Date().toISOString() });
          return;
        }
        const goal = ctx.fileStore.readGoal() ?? ctx.project?.goal;
        if (!goal) {
          ctx.addMessage({ role: "system", content: "No goal set. Use /goal <text> or /goal chat first.", timestamp: new Date().toISOString() });
          return;
        }
        ctx.addMessage({ role: "system", content: "Generating specs from goal...", timestamp: new Date().toISOString() });

        const result = await ctx.agent.run({
          type: "code",
          prompt: `根据以下项目目标，生成完整的规格说明。

项目目标：${goal}

请生成：
1. overview — 整体架构概览，说明模块划分逻辑和依赖关系
2. 每个功能模块的独立 spec

请严格按照以下 JSON 格式输出（不要用 markdown code fence）：

[
  {
    "name": "overview",
    "content": "# 整体架构概览\n\n...完整内容..."
  },
  {
    "name": "module-name",
    "content": "# 模块名称\n\n...完整内容..."
  }
]

要求：
- overview 模块必须包含：架构图（文字描述）、模块列表及职责、模块间依赖关系
- 每个模块 spec 包含：功能描述、接口定义、数据结构、边界条件
- 模块划分要合理，每个模块职责单一
- 使用中文撰写`,
          systemPrompt: "你是一个资深软件架构师。根据项目目标拆分功能模块并撰写规格文档。输出必须是纯 JSON 数组，不要用 markdown 包裹。",
          cwd: ctx.project?.project_path ?? process.cwd(),
        });

        if (!result.success) {
          ctx.addMessage({ role: "system", content: `Spec generation failed: ${result.error}`, timestamp: new Date().toISOString() });
          return;
        }

        // Parse and write specs
        try {
          let jsonText = result.output.trim();
          const fenceMatch = jsonText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
          if (fenceMatch) jsonText = fenceMatch[1];

          const specs = JSON.parse(jsonText) as Array<{ name: string; content: string }>;
          const moduleNames: string[] = [];

          for (const spec of specs) {
            const fileName = spec.name === "overview" ? "overview.md" : `${spec.name}.md`;
            ctx.fileStore.writeSpecModule(fileName, spec.content);
            moduleNames.push(fileName);
          }
          ctx.fileStore.writeSpecIndex(moduleNames);

          const lines = ["Specs generated:", ""];
          for (const name of moduleNames) {
            lines.push(`  ✓ ${name}`);
          }
          lines.push("", `Total: ${moduleNames.length} modules`);
          lines.push("Use /spec to list, /spec <module> to view, /spec chat <module> to discuss.");
          ctx.addMessage({ role: "system", content: lines.join("\n"), timestamp: new Date().toISOString() });
        } catch (parseErr) {
          ctx.addMessage({ role: "system", content: `Failed to parse spec output. Raw response:\n${result.output.slice(0, 1000)}`, timestamp: new Date().toISOString() });
        }
        return;
      }

      // /spec chat <module> — enter spec chat mode
      if (sub === "chat" && ctx.args[1]) {
        const modName = ctx.args[1].endsWith(".md") ? ctx.args[1] : `${ctx.args[1]}.md`;
        const existingModules = ctx.fileStore.listSpecModules();
        if (!existingModules.includes(modName) && modName !== "overview.md") {
          ctx.addMessage({ role: "system", content: `Module "${modName}" not found. Available: ${existingModules.join(", ")}`, timestamp: new Date().toISOString() });
          return;
        }
        if (ctx.enterSpecChat) {
          ctx.enterSpecChat(modName);
          ctx.addMessage({ role: "system", content: `Entered spec chat for ${modName}. Discuss with AI to refine this spec.\nType /spec save to save, /spec cancel to exit.`, timestamp: new Date().toISOString() });
        }
        return;
      }

      // /spec save — save spec from chat
      if (sub === "save") {
        if (ctx.exitSpecChat) {
          ctx.exitSpecChat(true);
        }
        return;
      }

      // /spec cancel — exit spec chat
      if (sub === "cancel") {
        if (ctx.exitSpecChat) {
          ctx.exitSpecChat(false);
        }
        return;
      }

      // /spec <module> — view a specific module
      if (sub) {
        const modName = sub.endsWith(".md") ? sub : `${sub}.md`;
        const mod = ctx.fileStore.readSpecModule(modName);
        if (!mod) {
          const modules = ctx.fileStore.listSpecModules();
          ctx.addMessage({ role: "system", content: `Module "${modName}" not found. Available: ${modules.join(", ")}`, timestamp: new Date().toISOString() });
          return;
        }
        ctx.addMessage({ role: "system", content: `── ${modName} ──\n\n${mod.content}`, timestamp: new Date().toISOString() });
        return;
      }

      // /spec — list all modules
      const modules = ctx.fileStore.listSpecModules();
      if (modules.length === 0) {
        ctx.addMessage({ role: "system", content: "No spec generated yet. Use /spec generate to create from goal, or /goal chat to set a goal first.", timestamp: new Date().toISOString() });
        return;
      }
      const lines = ["Spec modules:", ""];
      for (const m of modules) {
        lines.push(`  ${m}`);
      }
      lines.push("", "Use /spec <module> to view, /spec chat <module> to discuss with AI.");
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
      const log = await ctx.fileStore.getLog(20);
      ctx.addMessage({ role: "system", content: log || "No history found.", timestamp: new Date().toISOString() });
    },
  });

  // /skill
  registry.register({
    name: "skill",
    description: "Generate skill files for coding tools (Claude Code, etc.)",
    usage: "/skill [install|update]",
    handler: async (ctx) => {
      const projectRoot = ctx.project?.project_path ?? process.cwd();

      // Read current project state
      const goal = ctx.fileStore.readGoal() ?? ctx.project?.goal ?? "(not set)";
      const specModules = ctx.fileStore.listSpecModules();
      const planSections = ctx.fileStore.readPlan();
      const context = ctx.fileStore.readContext();

      // Build spec overview
      let specSummary = "(no specs generated yet)";
      if (specModules.length > 0) {
        const lines: string[] = [];
        for (const modName of specModules) {
          const mod = ctx.fileStore.readSpecModule(modName);
          if (mod) {
            const firstLine = mod.content.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "") ?? modName;
            lines.push(`- ${modName.replace(".md", "")}: ${firstLine}`);
          }
        }
        specSummary = lines.join("\n");
      }

      // Build plan overview
      let planSummary = "(no plan generated yet)";
      const progress = ctx.fileStore.getPlanProgress();
      if (planSections.length > 0 && progress) {
        const lines: string[] = [];
        for (const s of planSections) {
          const done = s.items.filter((i) => i.checked).length;
          lines.push(`- ${s.phase}: ${done}/${s.items.length} done`);
        }
        planSummary = `${progress.done}/${progress.total} steps completed\n${lines.join("\n")}`;
      }

      // Generate Claude Code skill
      const claudeSkillContent = `# fbloom Project Context

This project is managed by fbloom (AI-powered development lifecycle orchestrator).

## Project Goal

${goal}

## Spec Modules

${specSummary}

## Implementation Plan

${planSummary}

## Project Conventions

${context ?? "(none set)"}

## Instructions

When the user asks you to work on this project:

1. Read the relevant spec files in .fbloom/spec/ for detailed requirements
2. Check .fbloom/plan.md for the implementation plan and current progress
3. Follow the project conventions from .fbloom/context.md
4. Focus on the current phase: ${ctx.project?.current_phase ?? "goal"}
5. After completing work, update the plan progress in .fbloom/plan.md if applicable

Argument: $ARGUMENTS
`;

      // Write .claude/commands/fbloom.md
      const claudeDir = join(projectRoot, ".claude", "commands");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, "fbloom.md"), claudeSkillContent, "utf-8");

      const lines = [
        "Skill files generated:",
        "",
        "  .claude/commands/fbloom.md",
        "",
        "Usage in Claude Code:",
        "  /fbloom <task>       — inject project context and start working",
        "  /fbloom spec auth    — focus on a specific spec module",
        "",
        "Workflow:",
        "  1. Use fbloom to plan (goal → spec → plan)",
        "  2. /skill to update skill files",
        "  3. Open Claude Code → /fbloom to start coding",
        "  4. Come back to fbloom to review progress",
      ];

      ctx.addMessage({ role: "system", content: lines.join("\n"), timestamp: new Date().toISOString() });
    },
  });

  // /quit
  registry.register({
    name: "quit",
    aliases: ["q", "exit"],
    description: "Exit the application",
    usage: "/quit",
    handler: async (_ctx) => {
      throw new Error("__QUIT__");
    },
  });

  return registry;
}
