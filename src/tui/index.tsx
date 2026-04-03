import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp, render } from "ink";
import type { Task, Subtask, LogEntry, TaskStatus } from "../types.js";
import type { Orchestrator, OrchestratorEvent } from "../orchestrator/index.js";

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

function TaskCard({
  task,
  subtasks,
  isSelected,
}: {
  task: Task;
  subtasks: Subtask[];
  isSelected: boolean;
}) {
  const done = subtasks.filter((s) => s.status === "done").length;
  const total = subtasks.length;
  const barWidth = 20;
  const filled = total > 0 ? Math.round((done / total) * barWidth) : 0;
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);

  return (
    <Box
      flexDirection="column"
      borderStyle={isSelected ? "double" : "round"}
      borderColor={isSelected ? "cyan" : "gray"}
      paddingX={1}
      marginBottom={1}
    >
      <Box>
        <Text bold color="white">
          {task.title}
        </Text>
        <Text> </Text>
        <StatusBadge status={task.status} />
      </Box>
      <Text dimColor>{task.description.slice(0, 80)}{task.description.length > 80 ? "..." : ""}</Text>
      {total > 0 && (
        <Box>
          <Text dimColor>[</Text>
          <Text color="green">{bar}</Text>
          <Text dimColor>] </Text>
          <Text>
            {done}/{total} subtasks
          </Text>
        </Box>
      )}
      <Text dimColor>
        v:{task.version} | {new Date(task.created_at).toLocaleString()}
      </Text>
    </Box>
  );
}

function TaskDetail({
  task,
  subtasks,
  logs,
  onBack,
}: {
  task: Task;
  subtasks: Subtask[];
  logs: LogEntry[];
  onBack: () => void;
}) {
  useInput((input) => {
    if (input === "q" || input === "Escape") onBack();
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          📋 {task.title}
        </Text>
        <Text> </Text>
        <StatusBadge status={task.status} />
      </Box>

      <Text dimColor marginBottom={1}>
        {task.description}
      </Text>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline>
          Subtasks
        </Text>
        {subtasks.map((s) => (
          <Box key={s.id} marginLeft={1}>
            <StatusBadge status={s.status} />
            <Text>
              {" "}
              [{s.type}] {s.title}
            </Text>
          </Box>
        ))}
        {subtasks.length === 0 && (
          <Text dimColor marginLeft={1}>
            No subtasks yet
          </Text>
        )}
      </Box>

      <Box flexDirection="column">
        <Text bold underline>
          Recent Logs
        </Text>
        {logs.slice(0, 15).map((log) => (
          <Box key={log.id} marginLeft={1}>
            <Text dimColor>
              {new Date(log.created_at).toLocaleTimeString()}
            </Text>
            <Text
              color={
                log.level === "error"
                  ? "red"
                  : log.level === "warn"
                    ? "yellow"
                    : "white"
              }
            >
              {" "}
              {log.message}
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press q to go back</Text>
      </Box>
    </Box>
  );
}

function Dashboard({ orchestrator }: { orchestrator: Orchestrator }) {
  const { exit } = useApp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [detailSubtasks, setDetailSubtasks] = useState<Subtask[]>([]);
  const [detailLogs, setDetailLogs] = useState<LogEntry[]>([]);
  const [liveLogs, setLiveLogs] = useState<{ taskId: string; msg: string }[]>([]);

  // Poll task list
  useEffect(() => {
    const refresh = () => setTasks(orchestrator.listTasks());
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [orchestrator]);

  // Listen to events for live logs
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

  // Refresh detail view
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
    if (detailTaskId) return; // handled by TaskDetail
    switch (input) {
      case "q":
        exit();
        break;
      case "j":
      case "down":
        setSelectedIdx((i) => Math.min(i + 1, tasks.length - 1));
        break;
      case "k":
      case "up":
        setSelectedIdx((i) => Math.max(i - 1, 0));
        break;
      case "d":
      case "Enter":
        if (tasks[selectedIdx]) setDetailTaskId(tasks[selectedIdx].id);
        break;
    }
  });

  if (detailTaskId) {
    const task = tasks.find((t) => t.id === detailTaskId);
    if (!task) return <Text>Task not found</Text>;
    return (
      <TaskDetail
        task={task}
        subtasks={detailSubtasks}
        logs={detailLogs}
        onBack={() => setDetailTaskId(null)}
      />
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          flowerberg-devflow
        </Text>
        <Text dimColor> — autonomous dev pipeline</Text>
      </Box>

      {tasks.length === 0 ? (
        <Text dimColor>No tasks yet. Use: devflow submit "your task description"</Text>
      ) : (
        tasks.map((task, idx) => (
          <TaskCard
            key={task.id}
            task={task}
            subtasks={orchestrator.getStatus(task.id)?.subtasks ?? []}
            isSelected={idx === selectedIdx}
          />
        ))
      )}

      {liveLogs.length > 0 && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="dim" paddingX={1}>
          <Text dimColor underline>
            Live
          </Text>
          {liveLogs.map((l, i) => (
            <Text key={i} dimColor>
              {l.msg}
            </Text>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          j/k: navigate | d: detail | q: quit
        </Text>
      </Box>
    </Box>
  );
}

export function startTUI(orchestrator: Orchestrator): void {
  render(<Dashboard orchestrator={orchestrator} />);
}
