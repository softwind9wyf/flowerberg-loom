import { EventEmitter } from "events";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { existsSync } from "fs";
import type { Task, Subtask, TaskStatus, AppConfig } from "../types.js";
import { Store } from "../store/index.js";
import { AgentRunner } from "../agents/index.js";

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
  private agent: AgentRunner;
  private config: AppConfig;
  private running = false;
  private activeTasks = new Set<string>();

  constructor(config: AppConfig, store: Store) {
    super();
    this.config = config;
    this.store = store;
    this.agent = new AgentRunner(config);
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

    // Start processing in background
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
      // Step 1: Decompose
      await this.transition(taskId, "decomposing");
      const task = this.store.getTask(taskId)!;
      this.log(taskId, "info", "Decomposing task into subtasks...");

      const result = await this.agent.decompose(task.description);
      if (!result.success) {
        await this.failTask(taskId, `Decomposition failed: ${result.error}`);
        return;
      }

      const subtasks = this.parseSubtasks(result.output);
      if (!subtasks || subtasks.length === 0) {
        await this.failTask(taskId, "Failed to parse subtasks from AI response");
        return;
      }

      // Create subtasks in store
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

      // Step 2: Execute subtasks in dependency order
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

      // All done?
      if (all.every((s) => s.status === "done")) {
        await this.transition(taskId, "done");
        this.log(taskId, "info", "All subtasks completed successfully!");
        return;
      }

      // Any permanent failure?
      const failed = all.find((s) => s.status === "failed");
      if (failed) {
        await this.failTask(taskId, `Subtask "${failed.title}" failed`);
        return;
      }

      // Get ready subtasks
      const ready = this.store.getReadySubtasks(taskId);
      if (ready.length === 0) {
        // Nothing ready but not all done — wait
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      // Execute ready subtasks (sequentially for now, parallel later)
      for (const subtask of ready) {
        await this.executeSubtask(taskId, subtask);
      }
    }

    await this.failTask(taskId, "Max iterations reached");
  }

  private async executeSubtask(taskId: string, subtask: Subtask): Promise<void> {
    this.store.updateSubtaskStatus(subtask.id, subtask.type === "review" ? "reviewing" : subtask.type === "test" ? "testing" : "coding");
    this.emitEvent({ type: "subtask_status", taskId, subtaskId: subtask.id, status: "coding" });
    this.log(taskId, "info", `[${subtask.type}] ${subtask.title}`);

    // Gather context from completed sibling subtasks
    const siblings = this.store.getSubtasks(taskId);
    const contextParts: string[] = [];
    for (const depId of JSON.parse(subtask.depends_on as unknown as string) as string[]) {
      const dep = siblings.find((s) => s.id === depId);
      if (dep?.result) contextParts.push(`--- Result from "${dep.title}" ---\n${dep.result}`);
    }

    const task = this.store.getTask(taskId)!;
    const context = [
      `Project path: ${task.project_path}`,
      ...contextParts,
    ].join("\n\n");

    const result = await this.agent.run(subtask.type as Subtask["type"], subtask.description, context);

    if (!result.success) {
      this.store.updateSubtaskStatus(subtask.id, "failed", result.error, result.error);
      this.log(taskId, "error", `Failed: ${subtask.title} — ${result.error}`);
      return;
    }

    // If this is a code task, write files
    if (subtask.type === "code") {
      await this.writeCodeFiles(task.project_path, result.output);
    }

    this.store.updateSubtaskStatus(subtask.id, "done", result.output);
    this.emitEvent({ type: "subtask_status", taskId, subtaskId: subtask.id, status: "done" });
    this.log(taskId, "info", `Done: ${subtask.title}`);
  }

  private async writeCodeFiles(projectPath: string, codeOutput: string): Promise<void> {
    // Parse "### File: path" blocks from code output
    const fileRegex = /### File: (.+)\n```[\w]*\n([\s\S]*?)```/g;
    let match;
    while ((match = fileRegex.exec(codeOutput)) !== null) {
      const filePath = join(projectPath, match[1].trim());
      const content = match[2];
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      await writeFile(filePath, content, "utf-8");
    }
  }

  private parseSubtasks(output: string): DecomposedSubtask[] | null {
    try {
      // Try to find JSON array in the response
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
      // Retry after a delay
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
