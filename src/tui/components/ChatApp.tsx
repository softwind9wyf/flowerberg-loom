import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import { StatusBar } from "./StatusBar.js";
import { MessageList } from "./MessageList.js";
import { CommandInput } from "./CommandInput.js";
import { GoalEditor } from "./GoalEditor.js";
import { createRegistry, type ChatMessage, type CommandContext } from "../commands/registry.js";
import { FileStore } from "../../store/file-store.js";
import { SessionStore } from "../../store/session-store.js";
import type { AppConfig } from "../../types/config.js";
import type { Project } from "../../types/project.js";
import type { AgentInterface } from "../../types/agent.js";

function buildGlobalContext(project: Project | null, fileStore: FileStore | null): string {
  const lines: string[] = [
    "## 关于 fbloom",
    "你正在 fbloom 中辅助用户。fbloom 是一个 AI 驱动的开发生命周期编排工具，按以下 7 个阶段推进项目：",
    "",
    "  1. goal — 明确项目目标（当前阶段）",
    "  2. spec — 根据目标拆分功能规格模块",
    "  3. plan — 生成实施计划（分步骤 checklist）",
    "  4. dev  — 调用编程工具（Claude Code / Open Code / Kimi Code 等）执行开发",
    "  5. test — 自动测试",
    "  6. review — 代码审查",
    "  7. deploy — 部署",
    "",
    "项目数据存储在项目根目录的 .fbloom/ 目录下：",
    "  .fbloom/goal.md       — 项目目标",
    "  .fbloom/specs/*.md    — 规格模块文档",
    "  .fbloom/plan.md       — 实施计划",
    "  .fbloom/config.json   — 项目配置",
    "",
    "**重要**：你只需要帮助用户完成当前阶段的工作。不要越权创建其他阶段的产出物。",
    "",
  ];

  if (project) {
    lines.push("## 当前项目");
    lines.push(`- 名称：${project.name}`);
    lines.push(`- 当前阶段：${project.current_phase}`);
    lines.push(`- 状态：${project.status}`);
    const goal = fileStore?.readGoal() ?? project.goal;
    if (goal) {
      lines.push(`- 目标：${goal}`);
    }
    lines.push("");
  }

  // Append project-level context.md if it exists
  const projectContext = fileStore?.readContext();
  if (projectContext) {
    lines.push("## 项目自定义上下文");
    lines.push(projectContext);
    lines.push("");
  }

  return lines.join("\n");
}

const GOAL_CHAT_ROLE_PROMPT = `你是一个项目管理顾问，正在辅助用户完成 fbloom 的 **goal 阶段**。

你的职责：
- 帮助用户明确和细化项目目标
- 引导用户思考核心价值、目标用户、关键功能
- 如果用户描述模糊，主动提问澄清
- goal 应该简洁、明确、可执行，1-3 句话
- 随着讨论深入，逐步精炼 goal
- **不要**创建 spec、plan 等其他阶段的产出物

每次回复后，在分隔线 "---" 之后给出你当前建议的 goal 文本：

格式示例：
你的分析和建议...

---

GOAL: 精炼后的 goal 文本`;

interface ChatAppProps {
  fileStore: FileStore;
  config: AppConfig;
  agent: AgentInterface | null;
  initialProject?: Project;
}

export function ChatApp({ fileStore: mainFileStore, config, agent, initialProject }: ChatAppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 24;
  const terminalWidth = stdout?.columns ?? 80;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const welcome = initialProject
      ? `Welcome back! Resumed project "${initialProject.name}" from .fbloom/. Type /help for commands.`
      : "Welcome to flowerberg-loom. Type /help to see available commands.";
    return [
      { role: "system", content: welcome, timestamp: new Date().toISOString() },
    ];
  });
  const [project, setProject] = useState<Project | null>(initialProject ?? null);
  const [sessionStore, setSessionStore] = useState<SessionStore | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalEditContent, setGoalEditContent] = useState("");
  const [editingContext, setEditingContext] = useState(false);
  const [chatMode, setChatMode] = useState<"normal" | "goal" | "spec">("normal");
  const [lastGoalProposal, setLastGoalProposal] = useState<string>("");
  const [lastSpecProposal, setLastSpecProposal] = useState<string>("");
  const [specChatModule, setSpecChatModule] = useState<string>("");
  const registry = createRegistry();
  const agentRef = useRef(agent);

  // Keep agent ref up to date
  useEffect(() => { agentRef.current = agent; }, [agent]);

  // Sync sessionStore with project
  useEffect(() => {
    if (project?.project_path) {
      setSessionStore(new SessionStore(
        project.project_path,
        { maxChars: 20000, keepRecent: 4 },
        async (oldMessages) => {
          const a = agentRef.current;
          if (!a) return oldMessages.map((m) => `[${m.role}]: ${m.content.slice(0, 200)}`).join("\n");
          const result = await a.run({
            type: "code",
            prompt: `请用简洁的中文总结以下对话的关键要点，保留所有重要决策和结论：\n\n${
              oldMessages.map((m) => `[${m.role}]: ${m.content}`).join("\n\n")
            }`,
            systemPrompt: "你是一个对话摘要助手。请简洁地总结对话要点，保留关键信息和决策。",
            cwd: project.project_path,
          });
          return result.success ? result.output : oldMessages.map((m) => `[${m.role}]: ${m.content.slice(0, 200)}`).join("\n");
        },
      ));
    } else {
      setSessionStore(null);
    }
  }, [project?.project_path]);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
    setScrollOffset(0);
  }, []);

  const refreshProject = useCallback(() => {
    const state = mainFileStore.readState();
    if (state) {
      const goal = mainFileStore.readGoal();
      setProject({
        name: state.name,
        description: "",
        current_phase: state.current_phase,
        status: state.status,
        project_path: mainFileStore.getProjectPath(),
        goal,
        created_at: state.created_at,
        updated_at: state.updated_at,
        completed_at: state.completed_at ?? null,
      });
    }
  }, [mainFileStore]);

  const startGoalEdit = useCallback((content: string) => {
    setGoalEditContent(content);
    setEditingGoal(true);
  }, []);

  const enterGoalChat = useCallback(() => {
    if (!sessionStore) return;
    const globalCtx = buildGlobalContext(project, mainFileStore);
    sessionStore.getOrCreate("goal", "Goal Discussion", globalCtx + "\n" + GOAL_CHAT_ROLE_PROMPT);
    setChatMode("goal");
    setLastGoalProposal("");
  }, [sessionStore]);

  const exitGoalChat = useCallback((save: boolean) => {
    if (save && lastGoalProposal && project) {
      mainFileStore.writeGoal(lastGoalProposal);
      mainFileStore.updateProjectMeta({ current_phase: mainFileStore.readState()?.current_phase });
      refreshProject();
      addMessage({ role: "system", content: `Goal saved: ${lastGoalProposal}`, timestamp: new Date().toISOString() });
    } else if (save && !lastGoalProposal) {
      addMessage({ role: "system", content: "No goal proposal from AI yet. Keep chatting first.", timestamp: new Date().toISOString() });
      return;
    } else {
      addMessage({ role: "system", content: "Goal chat cancelled.", timestamp: new Date().toISOString() });
    }
    setChatMode("normal");
    setLastGoalProposal("");
  }, [lastGoalProposal, project, mainFileStore, refreshProject, addMessage]);

  const enterSpecChat = useCallback((moduleName: string) => {
    if (!sessionStore) return;
    const globalCtx = buildGlobalContext(project, mainFileStore);
    const currentContent = mainFileStore.readSpecModule(moduleName)?.content ?? "";
    const systemPrompt = globalCtx + `\n你是一个软件架构师，正在辅助用户完成 fbloom 的 **spec 阶段**，具体是模块 "${moduleName}" 的规格讨论。

你的职责：
- 帮助用户细化和完善这个模块的规格
- 讨论接口定义、数据结构、边界条件、错误处理等
- 如果用户描述模糊，主动提问澄清
- **不要**讨论其他模块或创建其他阶段的产出物

每次回复后，在分隔线 "---" 之后给出你当前建议的完整 spec 文本：

格式示例：
你的分析和建议...

---

SPEC: 完整的模块 spec 文本

当前模块已有内容：
${currentContent || "（新模块，暂无内容）"}`;
    sessionStore.getOrCreate(`spec-${moduleName}`, `Spec: ${moduleName}`, systemPrompt);
    setChatMode("spec");
    setSpecChatModule(moduleName);
    setLastSpecProposal("");
  }, [sessionStore, project]);

  const exitSpecChat = useCallback((save: boolean) => {
    if (save && lastSpecProposal) {
      mainFileStore.writeSpecModule(specChatModule, lastSpecProposal);
      addMessage({ role: "system", content: `Spec saved: ${specChatModule}`, timestamp: new Date().toISOString() });
    } else if (save && !lastSpecProposal) {
      addMessage({ role: "system", content: "No spec proposal from AI yet. Keep chatting first.", timestamp: new Date().toISOString() });
      return;
    } else {
      addMessage({ role: "system", content: "Spec chat cancelled.", timestamp: new Date().toISOString() });
    }
    setChatMode("normal");
    setLastSpecProposal("");
    setSpecChatModule("");
  }, [lastSpecProposal, specChatModule, mainFileStore, addMessage]);

  const handleGoalSave = useCallback((content: string) => {
    mainFileStore.writeGoal(content);
    refreshProject();
    setEditingGoal(false);
    addMessage({ role: "system", content: "Goal saved.", timestamp: new Date().toISOString() });
  }, [mainFileStore, refreshProject, addMessage]);

  const handleGoalCancel = useCallback(() => {
    setEditingGoal(false);
    addMessage({ role: "system", content: "Goal edit cancelled.", timestamp: new Date().toISOString() });
  }, [addMessage]);

  const startContextEdit = useCallback((content: string) => {
    setGoalEditContent(content);
    setEditingContext(true);
  }, []);

  const handleContextSave = useCallback((content: string) => {
    mainFileStore.writeContext(content);
    setEditingContext(false);
    addMessage({ role: "system", content: "Context saved to .fbloom/context.md", timestamp: new Date().toISOString() });
  }, [mainFileStore, addMessage]);

  const handleContextCancel = useCallback(() => {
    setEditingContext(false);
    addMessage({ role: "system", content: "Context edit cancelled.", timestamp: new Date().toISOString() });
  }, [addMessage]);

  const handleSubmit = useCallback(async (text: string) => {
    if (text.startsWith("/")) {
      const parts = text.slice(1).split(/\s+/);
      const cmdName = parts[0].toLowerCase();
      const args = parts.slice(1);

      addMessage({ role: "user", content: text, timestamp: new Date().toISOString() });

      const cmd = registry.get(cmdName);
      if (!cmd) {
        addMessage({ role: "system", content: `Unknown command: /${cmdName}. Type /help for available commands.`, timestamp: new Date().toISOString() });
        return;
      }

      const ctx: CommandContext = {
        args,
        fileStore: mainFileStore,
        config,
        agent,
        project,
        addMessage,
        refreshStatus: refreshProject,
        startGoalEdit,
        startContextEdit,
        enterGoalChat,
        enterSpecChat,
        exitSpecChat,
        exitGoalChat,
      };

      try {
        await cmd.handler(ctx);
        if (["init", "goal"].includes(cmdName)) {
          refreshProject();
        }
      } catch (err) {
        if (err instanceof Error && err.message === "__QUIT__") {
          addMessage({ role: "system", content: "Goodbye!", timestamp: new Date().toISOString() });
          setTimeout(() => exit(), 100);
          return;
        }
        addMessage({ role: "system", content: `Error: ${err instanceof Error ? err.message : String(err)}`, timestamp: new Date().toISOString() });
      }
    } else {
      // Free-form text → AI chat
      addMessage({ role: "user", content: text, timestamp: new Date().toISOString() });

      if (!agent) {
        addMessage({ role: "system", content: "AI agent not available. Configure ai.api_key first.", timestamp: new Date().toISOString() });
        return;
      }

      try {
        let systemPrompt: string | undefined;
        let prompt = text;
        let sessionMessages: Array<{ role: "user" | "assistant"; content: string }> | undefined;

        if (chatMode === "goal" && sessionStore) {
          const globalCtx = buildGlobalContext(project, mainFileStore);
          systemPrompt = globalCtx + "\n" + GOAL_CHAT_ROLE_PROMPT;
          prompt = `用户说：${text}\n\n请分析并给出你的建议。`;
          sessionMessages = sessionStore.getMessages("goal");
        } else if (chatMode === "spec" && sessionStore) {
          const sessionId = `spec-${specChatModule}`;
          sessionMessages = sessionStore.getMessages(sessionId);
          const session = sessionStore.get(sessionId);
          systemPrompt = session?.systemPrompt;
          prompt = `用户说：${text}\n\n请分析并给出你的建议。`;
        }

        const result = await agent.run({
          type: "code",
          prompt,
          ...(systemPrompt ? { systemPrompt } : {}),
          ...(sessionMessages ? { messages: sessionMessages } : {}),
          cwd: project?.project_path ?? process.cwd(),
        });
        if (result.success) {
          // Persist to session
          if (chatMode === "goal" && sessionStore) {
            sessionStore.addUserMessage("goal", prompt);
            sessionStore.addAssistantMessage("goal", result.output);
            await sessionStore.compressIfNeeded("goal");

            const goalMatch = result.output.match(/---\s*\nGOAL:\s*([\s\S]*?)(?:\n*$)/);
            if (goalMatch) {
              setLastGoalProposal(goalMatch[1].trim());
            }
          } else if (chatMode === "spec" && sessionStore) {
            const sessionId = `spec-${specChatModule}`;
            sessionStore.addUserMessage(sessionId, prompt);
            sessionStore.addAssistantMessage(sessionId, result.output);
            await sessionStore.compressIfNeeded(sessionId);

            const specMatch = result.output.match(/---\s*\nSPEC:\s*([\s\S]*?)(?:\n*$)/);
            if (specMatch) {
              setLastSpecProposal(specMatch[1].trim());
            }
          }
          addMessage({ role: "assistant", content: result.output, timestamp: new Date().toISOString() });
        } else {
          addMessage({ role: "system", content: `Agent error: ${result.error}`, timestamp: new Date().toISOString() });
        }
      } catch (err) {
        addMessage({ role: "system", content: `Agent error: ${err instanceof Error ? err.message : String(err)}`, timestamp: new Date().toISOString() });
      }
    }
  }, [registry, mainFileStore, config, agent, project, addMessage, refreshProject, exit, chatMode, enterGoalChat, exitGoalChat, enterSpecChat, exitSpecChat, sessionStore, specChatModule]);

  // Layout: status bar (3 rows) + messages + input (3 rows)
  const messageHeight = Math.max(terminalHeight - 6, 5);

  return (
    <Box flexDirection="column" height={terminalHeight}>
      <StatusBar project={project} chatMode={chatMode} />
      <Box flexDirection="column" flexGrow={1}>
        <MessageList messages={messages} height={messageHeight} scrollOffset={scrollOffset} width={terminalWidth} />
      </Box>
      {editingGoal ? (
        <GoalEditor
          initialContent={goalEditContent}
          onSave={handleGoalSave}
          onCancel={handleGoalCancel}
        />
      ) : editingContext ? (
        <GoalEditor
          initialContent={goalEditContent}
          onSave={handleContextSave}
          onCancel={handleContextCancel}
        />
      ) : (
        <CommandInput onSubmit={handleSubmit} />
      )}
    </Box>
  );
}
