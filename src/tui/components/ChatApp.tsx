import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import { StatusBar } from "./StatusBar.js";
import { MessageList } from "./MessageList.js";
import { CommandInput } from "./CommandInput.js";
import { GoalEditor } from "./GoalEditor.js";
import { createRegistry, type ChatMessage, type CommandContext } from "../commands/registry.js";
import type { Store } from "../../store/index.js";
import { FileStore } from "../../store/file-store.js";
import type { AppConfig } from "../../types/config.js";
import type { Project } from "../../types/project.js";
import type { AgentInterface } from "../../types/agent.js";

interface ChatAppProps {
  store: Store;
  config: AppConfig;
  agent: AgentInterface | null;
  initialProject?: Project;
}

export function ChatApp({ store, config, agent, initialProject }: ChatAppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 24;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const welcome = initialProject
      ? `Welcome back! Resumed project "${initialProject.name}" from .fbloom/. Type /help for commands.`
      : "Welcome to flowerberg-loom. Type /help to see available commands.";
    return [
      { role: "system", content: welcome, timestamp: new Date().toISOString() },
    ];
  });
  const [project, setProject] = useState<Project | null>(initialProject ?? null);
  const [fileStore, setFileStore] = useState<FileStore | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalEditContent, setGoalEditContent] = useState("");
  const registry = createRegistry();

  // Sync fileStore with project
  useEffect(() => {
    if (project?.project_path) {
      setFileStore(new FileStore(project.project_path, config.deploy?.verifyBuild !== false));
    } else {
      setFileStore(null);
    }
  }, [project?.id, project?.project_path]);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
    setScrollOffset(0);
  }, []);

  const refreshProject = useCallback(() => {
    if (project) {
      const updated = store.getProject(project.id);
      if (updated) setProject(updated);
    }
  }, [project, store]);

  const startGoalEdit = useCallback((content: string) => {
    setGoalEditContent(content);
    setEditingGoal(true);
  }, []);

  const handleGoalSave = useCallback((content: string) => {
    if (project && fileStore) {
      fileStore.writeGoal(content);
      store.updateProject(project.id, { goal: content });
      refreshProject();
    }
    setEditingGoal(false);
    addMessage({ role: "system", content: "Goal saved.", timestamp: new Date().toISOString() });
  }, [project, fileStore, store, refreshProject, addMessage]);

  const handleGoalCancel = useCallback(() => {
    setEditingGoal(false);
    addMessage({ role: "system", content: "Goal edit cancelled.", timestamp: new Date().toISOString() });
  }, [addMessage]);

  const handleSubmit = useCallback(async (text: string) => {
    if (text.startsWith("/")) {
      const parts = text.slice(1).split(/\s+/);
      const cmdName = parts[0].toLowerCase();
      const args = parts.slice(1);

      // Add user message showing the command
      addMessage({ role: "user", content: text, timestamp: new Date().toISOString() });

      const cmd = registry.get(cmdName);
      if (!cmd) {
        addMessage({ role: "system", content: `Unknown command: /${cmdName}. Type /help for available commands.`, timestamp: new Date().toISOString() });
        return;
      }

      const ctx: CommandContext = {
        args,
        store,
        fileStore,
        config,
        agent,
        project,
        addMessage,
        refreshStatus: refreshProject,
        startGoalEdit,
      };

      try {
        await cmd.handler(ctx);
        // If command modified project, refresh
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
      // Free-form text → AI chat (for now, echo back)
      addMessage({ role: "user", content: text, timestamp: new Date().toISOString() });

      if (!agent) {
        addMessage({ role: "system", content: "AI agent not available. Start a project lifecycle first.", timestamp: new Date().toISOString() });
        return;
      }

      try {
        const result = await agent.run({
          type: "code",
          prompt: text,
          cwd: project?.project_path ?? process.cwd(),
        });
        if (result.success) {
          addMessage({ role: "assistant", content: result.output, timestamp: new Date().toISOString() });
        } else {
          addMessage({ role: "system", content: `Agent error: ${result.error}`, timestamp: new Date().toISOString() });
        }
      } catch (err) {
        addMessage({ role: "system", content: `Agent error: ${err instanceof Error ? err.message : String(err)}`, timestamp: new Date().toISOString() });
      }
    }
  }, [registry, store, fileStore, config, agent, project, addMessage, refreshProject, exit]);

  // Layout: status bar (3 rows) + messages + input (3 rows)
  const messageHeight = Math.max(terminalHeight - 6, 5);

  return (
    <Box flexDirection="column" height={terminalHeight}>
      <StatusBar project={project} />
      <Box flexDirection="column" flexGrow={1}>
        <MessageList messages={messages} height={messageHeight} scrollOffset={scrollOffset} />
      </Box>
      {editingGoal ? (
        <GoalEditor
          initialContent={goalEditContent}
          onSave={handleGoalSave}
          onCancel={handleGoalCancel}
        />
      ) : (
        <CommandInput onSubmit={handleSubmit} />
      )}
    </Box>
  );
}
