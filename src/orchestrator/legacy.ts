/**
 * Legacy task-based Orchestrator — used by `fbloom submit`.
 * For project-based orchestration, use ProjectOrchestrator instead.
 */
import { EventEmitter } from "events";
import type { Task, Subtask, TaskStatus, AppConfig } from "../types.js";
import { Store } from "../store/index.js";
import { ClaudeCodeAgent } from "../agents/claude-cli.js";
import type { AgentInterface } from "../types/agent.js";

interface DecomposedSubtask {
  type: string;
  title: string;
  description: string;
  depends_on: number[];
}

export type OrchestratorEvent =
  | { type: "task_status"; taskId: string; status: TaskStatus }
  | { type: "subtask_status"; taskId: string; subtaskId: string; status: TaskStatus }
  | { type: "log"; taskId: string; message: string; level: "info" | "warn" | "error" }
  | { type: "error"; taskId: string; error: string };

export class Orchestrator extends EventEmitter {
  private store: Store;
  private agent: AgentInterface;
  private config: AppConfig;
  private activeTasks = new Set<string>();

  constructor(config: AppConfig, store: Store) {
    super();
    this.config = config;
    this.store = store;
    this.agent = new ClaudeCodeAgent(config);
  }

  async submit(title: string, description: string, projectPath: string, version = "main"): Promise<Task> {
    const task = this.store.createTask({
      title,
      description,
      status: "pending",
      version,
      project_path: projectPath,
      parent_task_id: null,
      max_retries: this.config.default_max_retries,
    });

    this.store.addLog(task.id, "orchestrator", "info", `Task created: ${title}`);
    this.emitEvent({ type: "task_status", taskId: task.id, status: "pending" });

    this.processTask(task.id).catch((err) => {
      this.emitEvent({
        type: "error",
        taskId: task.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return task;
  }

  private async processTask(taskId: string): Promise<void> {
    if (this.activeTasks.has(taskId)) return;
    this.activeTasks.add(taskId);

    try {
      const task = this.store.getTask(taskId)!;

      await this.transition(taskId, "decomposing");
      this.log(taskId, "info", "Analyzing project and decomposing task...");

      const decomposeResult = await this.agent.decompose({
        prompt: task.description,
        cwd: task.project_path,
      });
      if (!decomposeResult.success) {
        await this.failTask(taskId, `Decomposition failed: ${decomposeResult.error}`);
        return;
      }

      const subtasks = this.parseSubtasks(decomposeResult.output);
      if (!subtasks || subtasks.length === 0) {
        await this.failTask(taskId, "Failed to parse subtasks from AI response");
        return;
      }

      const createdIds: string[] = [];
      for (const st of subtasks) {
        const deps = st.depends_on
          .filter((i) => i < createdIds.length)
          .map((i) => createdIds[i]);
        const created = this.store.createSubtask({
          task_id: taskId,
          type: st.type as Subtask["type"],
          title: st.title,
          description: st.description,
          status: "pending",
          assigned_agent: null,
          result: null,
          depends_on: deps,
        });
        createdIds.push(created.id);
      }

      this.log(taskId, "info", `Created ${subtasks.length} subtasks`);
      await this.transition(taskId, "coding");

      await this.executeSubtasks(taskId);
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  private async executeSubtasks(taskId: string): Promise<void> {
    const maxIterations = 50;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      const all = this.store.getSubtasks(taskId);

      if (all.every((s) => s.status === "done")) {
        await this.transition(taskId, "done");
        this.log(taskId, "info", "All subtasks completed successfully!");
        return;
      }

      const failed = all.find((s) => s.status === "failed");
      if (failed) {
        await this.failTask(taskId, `Subtask "${failed.title}" failed`);
        return;
      }

      const ready = this.store.getReadySubtasks(taskId);
      if (ready.length === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      for (const subtask of ready) {
        await this.executeSubtask(taskId, subtask);
      }
    }

    await this.failTask(taskId, "Max iterations reached");
  }

  private async executeSubtask(taskId: string, subtask: Subtask): Promise<void> {
    const statusMap: Record<string, TaskStatus> = {
      code: "coding",
      test: "testing",
      review: "reviewing",
      deploy: "deploying",
    };
    const newStatus = statusMap[subtask.type] || "coding";
    this.store.updateSubtaskStatus(subtask.id, newStatus);
    this.emitEvent({ type: "subtask_status", taskId, subtaskId: subtask.id, status: newStatus });
    this.log(taskId, "info", `[${subtask.type}] ${subtask.title}`);

    const siblings = this.store.getSubtasks(taskId);
    const contextParts: string[] = [];
    for (const depId of JSON.parse(subtask.depends_on as unknown as string) as string[]) {
      const dep = siblings.find((s) => s.id === depId);
      if (dep?.result) {
        contextParts.push(`--- Completed: "${dep.title}" ---\n${dep.result}`);
      }
    }
    const context = contextParts.length > 0 ? contextParts.join("\n\n") : undefined;

    const task = this.store.getTask(taskId)!;

    const result = await this.agent.run({
      type: subtask.type as Subtask["type"],
      prompt: subtask.description,
      cwd: task.project_path,
      context,
    });

    if (!result.success) {
      this.store.updateSubtaskStatus(subtask.id, "failed", result.error, result.error);
      this.log(taskId, "error", `Failed: ${subtask.title} — ${result.error}`);
      return;
    }

    this.store.updateSubtaskStatus(subtask.id, "done", result.output);
    this.emitEvent({ type: "subtask_status", taskId, subtaskId: subtask.id, status: "done" });
    this.log(taskId, "info", `Done: ${subtask.title}`);
  }

  private parseSubtasks(output: string): DecomposedSubtask[] | null {
    try {
      const jsonMatch = output.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]) as DecomposedSubtask[];
    } catch {
      return null;
    }
  }

  private async transition(taskId: string, status: TaskStatus): Promise<void> {
    this.store.updateTaskStatus(taskId, status);
    this.emitEvent({ type: "task_status", taskId, status });
  }

  private async failTask(taskId: string, error: string): Promise<void> {
    const retryCount = this.store.incrementRetry(taskId);
    const task = this.store.getTask(taskId)!;
    this.log(taskId, "error", error);

    if (retryCount < task.max_retries) {
      this.log(taskId, "info", `Retrying (${retryCount}/${task.max_retries})...`);
      this.store.updateTaskStatus(taskId, "pending");
      this.emitEvent({ type: "task_status", taskId, status: "pending" });
      setTimeout(() => this.processTask(taskId), 5000);
    } else {
      this.store.updateTaskStatus(taskId, "failed", error);
      this.emitEvent({ type: "task_status", taskId, status: "failed" });
    }
  }

  private log(taskId: string, level: "info" | "warn" | "error", message: string): void {
    this.store.addLog(taskId, "orchestrator", level, message);
    this.emitEvent({ type: "log", taskId, message, level });
  }

  private emitEvent(event: OrchestratorEvent): void {
    this.emit("event", event);
  }

  getStatus(taskId: string) {
    const task = this.store.getTask(taskId);
    if (!task) return null;
    return {
      task,
      subtasks: this.store.getSubtasks(taskId),
      logs: this.store.getLogs(taskId),
    };
  }

  listTasks() {
    return this.store.listTasks();
  }

  getStore(): Store {
    return this.store;
  }
}
