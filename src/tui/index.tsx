import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp, render } from "ink";
import type { Project, ProjectStatus } from "../types/project.js";
import type { Task, Subtask, LogEntry, TaskStatus } from "../types.js";
import type { Orchestrator as LegacyOrchestrator, OrchestratorEvent } from "../orchestrator/index.js";
import type { ProjectOrchestrator } from "../orchestrator/project.js";
import { App } from "./components/App.js";

// ---- Legacy TUI (kept for `fbloom submit` compat) ----

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: "yellow",
  decomposing: "cyan",
  coding: "blue",
  testing: "magenta",
  reviewing: "cyan",
  deploying: "blue",
  done: "green",
  failed: "red",
};

const STATUS_ICONS: Record<TaskStatus, string> = {
  pending: "⏳",
  decomposing: "🔍",
  coding: "✏️",
  testing: "🧪",
  reviewing: "👀",
  deploying: "🚀",
  done: "✅",
  failed: "❌",
};

function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Text color={STATUS_COLORS[status]}>
      {STATUS_ICONS[status]} {status}
    </Text>
  );
}

function TaskCard({ task, subtasks, isSelected }: { task: Task; subtasks: Subtask[]; isSelected: boolean }) {
  const done = subtasks.filter((s) => s.status === "done").length;
  const total = subtasks.length;
  const barWidth = 20;
  const filled = total > 0 ? Math.round((done / total) * barWidth) : 0;
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);

  return (
    <Box flexDirection="column" borderStyle={isSelected ? "double" : "round"} borderColor={isSelected ? "cyan" : "gray"} paddingX={1} marginTop={1}>
      <Box>
        <Text bold color="white">{task.title}</Text>
        <Text> </Text>
        <StatusBadge status={task.status} />
      </Box>
      <Text dimColor>{task.description.slice(0, 80)}{task.description.length > 80 ? "..." : ""}</Text>
      {total > 0 && (
        <Box>
          <Text dimColor>[</Text>
          <Text color="green">{bar}</Text>
          <Text dimColor>] </Text>
          <Text>{done}/{total} subtasks</Text>
        </Box>
      )}
    </Box>
  );
}

function LegacyDashboard({ orchestrator }: { orchestrator: LegacyOrchestrator }) {
  const { exit } = useApp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [detailSubtasks, setDetailSubtasks] = useState<Subtask[]>([]);
  const [detailLogs, setDetailLogs] = useState<LogEntry[]>([]);
  const [liveLogs, setLiveLogs] = useState<{ taskId: string; msg: string }[]>([]);

  useEffect(() => {
    const refresh = () => setTasks(orchestrator.listTasks());
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [orchestrator]);

  useEffect(() => {
    const handler = (event: OrchestratorEvent) => {
      if (event.type === "log") {
        setLiveLogs((prev) => [...prev.slice(-5), { taskId: event.taskId, msg: event.message }]);
      }
      if (event.type === "task_status" || event.type === "subtask_status") {
        setTasks(orchestrator.listTasks());
      }
    };
    orchestrator.on("event", handler);
    return () => { orchestrator.off("event", handler); };
  }, [orchestrator]);

  useEffect(() => {
    if (!detailTaskId) return;
    const refresh = () => {
      const status = orchestrator.getStatus(detailTaskId);
      if (status) {
        setDetailSubtasks(status.subtasks);
        setDetailLogs(status.logs);
      }
    };
    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [detailTaskId, orchestrator]);

  useInput((input) => {
    if (detailTaskId) {
      if (input === "q" || "Escape") setDetailTaskId(null);
      return;
    }
    switch (input) {
      case "q": exit(); break;
      case "j": case "down": setSelectedIdx((i) => Math.min(i + 1, tasks.length - 1)); break;
      case "k": case "up": setSelectedIdx((i) => Math.max(i - 1, 0)); break;
      case "d": case "Enter":
        if (tasks[selectedIdx]) setDetailTaskId(tasks[selectedIdx].id);
        break;
    }
  });

  if (detailTaskId) {
    const task = tasks.find((t) => t.id === detailTaskId);
    if (!task) return <Text>Task not found</Text>;
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginTop={1}>
          <Text bold color="cyan">{task.title}</Text>
          <Text> </Text>
          <StatusBadge status={task.status} />
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold underline>Subtasks</Text>
          {detailSubtasks.map((s) => (
            <Box key={s.id} marginLeft={1}>
              <StatusBadge status={s.status} />
              <Text> [{s.type}] {s.title}</Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold underline>Recent Logs</Text>
          {detailLogs.slice(0, 15).map((log) => (
            <Box key={log.id} marginLeft={1}>
              <Text dimColor>{new Date(log.created_at).toLocaleTimeString()}</Text>
              <Text color={log.level === "error" ? "red" : "white"}> {log.message}</Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}><Text dimColor>Press q to go back</Text></Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
        <Text bold color="cyan">flowerberg-loom</Text>
        <Text dimColor> — dev loom (legacy)</Text>
      </Box>
      {tasks.length === 0 ? (
        <Text dimColor>No tasks yet. Use: fbloom submit "your task description"</Text>
      ) : (
        tasks.map((task, idx) => (
          <TaskCard key={task.id} task={task} subtasks={orchestrator.getStatus(task.id)?.subtasks ?? []} isSelected={idx === selectedIdx} />
        ))
      )}
      {liveLogs.length > 0 && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="dim" paddingX={1}>
          <Text dimColor underline>Live</Text>
          {liveLogs.map((l, i) => <Text key={i} dimColor>{l.msg}</Text>)}
        </Box>
      )}
      <Box marginTop={1}><Text dimColor>j/k: navigate | d: detail | q: quit</Text></Box>
    </Box>
  );
}

// ---- Public API ----

/** Start the new project-based TUI */
export function startProjectTUI(orchestrator: ProjectOrchestrator): void {
  render(<App orchestrator={orchestrator} />);
}

/** Start the legacy task-based TUI */
export function startLegacyTUI(orchestrator: LegacyOrchestrator): void {
  render(<LegacyDashboard orchestrator={orchestrator} />);
}

/** Backward compat: startTUI uses legacy dashboard */
export function startTUI(orchestrator: LegacyOrchestrator): void {
  startLegacyTUI(orchestrator);
}
