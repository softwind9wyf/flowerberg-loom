import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { Task, Subtask, LogEntry, Version, TaskStatus } from "../types.js";

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  version TEXT NOT NULL DEFAULT 'main',
  project_path TEXT NOT NULL,
  parent_task_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_agent TEXT,
  result TEXT,
  depends_on TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  subtask_id TEXT,
  agent TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  branch TEXT NOT NULL,
  worktree_path TEXT,
  base_branch TEXT NOT NULL DEFAULT 'main',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export class Store {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(MIGRATIONS);
  }

  // --- Tasks ---

  createTask(task: Omit<Task, "id" | "created_at" | "updated_at" | "retry_count">): Task {
    const id = randomUUID();
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, title, description, status, version, project_path, parent_task_id, max_retries)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, task.title, task.description, task.status, task.version, task.project_path, task.parent_task_id, task.max_retries);
    return { ...task, id, created_at: now, updated_at: now, retry_count: 0 } as Task;
  }

  getTask(id: string): Task | undefined {
    return this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined;
  }

  listTasks(): Task[] {
    return this.db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all() as Task[];
  }

  updateTaskStatus(id: string, status: TaskStatus, errorMessage?: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE tasks SET status = ?, updated_at = ?, error_message = ? WHERE id = ?
    `).run(status, now, errorMessage ?? null, id);
  }

  incrementRetry(id: string): number {
    this.db.prepare(`
      UPDATE tasks SET retry_count = retry_count + 1, updated_at = ? WHERE id = ?
    `).run(new Date().toISOString(), id);
    const task = this.getTask(id);
    return task?.retry_count ?? 0;
  }

  // --- Subtasks ---

  createSubtask(subtask: Omit<Subtask, "id" | "created_at" | "updated_at" | "error_message">): Subtask {
    const id = randomUUID();
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO subtasks (id, task_id, type, title, description, status, assigned_agent, result, depends_on)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, subtask.task_id, subtask.type, subtask.title, subtask.description, subtask.status, subtask.assigned_agent, subtask.result, JSON.stringify(subtask.depends_on));
    return { ...subtask, id, created_at: now, updated_at: now, error_message: null } as Subtask;
  }

  getSubtasks(taskId: string): Subtask[] {
    return this.db.prepare("SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at").all(taskId) as Subtask[];
  }

  updateSubtaskStatus(id: string, status: TaskStatus, result?: string, errorMessage?: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE subtasks SET status = ?, updated_at = ?, result = ?, error_message = ? WHERE id = ?
    `).run(status, now, result ?? null, errorMessage ?? null, id);
  }

  getReadySubtasks(taskId: string): Subtask[] {
    const subtasks = this.getSubtasks(taskId);
    return subtasks.filter((s) => {
      if (s.status !== "pending") return false;
      const deps: string[] = JSON.parse(s.depends_on as unknown as string);
      if (deps.length === 0) return true;
      return deps.every((depId) => {
        const dep = subtasks.find((x) => x.id === depId);
        return dep?.status === "done";
      });
    });
  }

  // --- Logs ---

  addLog(taskId: string, agent: string, level: LogEntry["level"], message: string, subtaskId?: string): void {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO logs (id, task_id, subtask_id, agent, level, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, taskId, subtaskId ?? null, agent, level, message);
  }

  getLogs(taskId: string, limit = 100): LogEntry[] {
    return this.db.prepare(
      "SELECT * FROM logs WHERE task_id = ? ORDER BY created_at DESC LIMIT ?"
    ).all(taskId, limit) as LogEntry[];
  }

  // --- Versions ---

  createVersion(version: Omit<Version, "id" | "created_at">): Version {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO versions (id, name, branch, worktree_path, base_branch, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, version.name, version.branch, version.worktree_path, version.base_branch, version.status);
    return { ...version, id, created_at: new Date().toISOString() };
  }

  listVersions(): Version[] {
    return this.db.prepare("SELECT * FROM versions ORDER BY created_at DESC").all() as Version[];
  }

  updateVersionStatus(id: string, status: Version["status"]): void {
    this.db.prepare("UPDATE versions SET status = ? WHERE id = ?").run(status, id);
  }

  close(): void {
    this.db.close();
  }
}
