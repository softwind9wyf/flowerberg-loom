import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { Task, Subtask, LogEntry, TaskStatus } from "../types/task.js";
import type { Project, ProjectPhase, ProjectStatus, PhaseState, PhaseStateStatus } from "../types/project.js";
import type { SpecDocument, SpecStatus } from "../types/spec.js";
import type { PlanStep, PlanStepStatus } from "../types/plan.js";

// --- Migration SQL ---

const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO schema_version (rowid, version) VALUES (1, 0);

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

const MIGRATION_002 = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  current_phase TEXT NOT NULL DEFAULT 'goal',
  status TEXT NOT NULL DEFAULT 'active',
  project_path TEXT NOT NULL,
  goal TEXT,
  goal_metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS phase_states (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TEXT,
  completed_at TEXT,
  input_data TEXT,
  output_data TEXT,
  error_message TEXT,
  UNIQUE(project_id, phase)
);

CREATE TABLE IF NOT EXISTS spec_documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  ai_generated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  parent_version_id TEXT REFERENCES spec_documents(id)
);

CREATE TABLE IF NOT EXISTS plan_steps (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  depends_on TEXT NOT NULL DEFAULT '[]',
  assigned_agent TEXT,
  result TEXT,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT
);
`;

// Add columns to existing tables (safe in SQLite — ALTER TABLE ADD COLUMN is supported)
const MIGRATION_003 = `
-- Use try-catch approach via exec since ALTER TABLE ADD COLUMN may fail if column exists
-- We handle this by checking column existence first in JS code
`;

const MIGRATION_004 = `
CREATE TABLE IF NOT EXISTS project_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase TEXT,
  agent TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_project_logs_project ON project_logs(project_id, created_at DESC);
`;

const MIGRATIONS: { version: number; sql: string; postSql?: (db: Database.Database) => void }[] = [
  { version: 1, sql: MIGRATION_001 },
  { version: 2, sql: MIGRATION_002 },
  {
    version: 3,
    sql: MIGRATION_003,
    postSql: (db) => {
      const taskCols = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
      const colNames = taskCols.map((c) => c.name);
      if (!colNames.includes("project_id")) {
        db.exec("ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id)");
      }
      if (!colNames.includes("plan_step_id")) {
        db.exec("ALTER TABLE tasks ADD COLUMN plan_step_id TEXT REFERENCES plan_steps(id)");
      }

      db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_plan_steps_project ON plan_steps(project_id, sequence)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_phase_states_project ON phase_states(project_id)");
    },
  },
  { version: 4, sql: MIGRATION_004 },
];

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
    this.runMigrations();
  }

  private runMigrations(): void {
    for (const migration of MIGRATIONS) {
      this.db.exec(migration.sql);
      if (migration.postSql) {
        migration.postSql(this.db);
      }
      this.db.prepare("UPDATE schema_version SET version = ? WHERE rowid = 1").run(migration.version);
    }
  }

  // --- Projects ---

  createProject(data: {
    name: string;
    description: string;
    project_path: string;
    goal?: string;
    goal_metadata?: string;
  }): Project {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO projects (id, name, description, project_path, goal, goal_metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.description, data.project_path, data.goal ?? null, data.goal_metadata ?? null);

    // Initialize all phase states
    const insertPhase = this.db.prepare(`
      INSERT INTO phase_states (id, project_id, phase, status)
      VALUES (?, ?, ?, 'pending')
    `);
    const phases: ProjectPhase[] = ["goal", "spec", "plan", "dev", "test", "review", "deploy"];
    for (const phase of phases) {
      insertPhase.run(randomUUID(), id, phase);
    }

    return {
      id,
      name: data.name,
      description: data.description,
      current_phase: "goal",
      status: "active",
      project_path: data.project_path,
      goal: data.goal ?? null,
      goal_metadata: data.goal_metadata ?? null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
  }

  getProject(id: string): Project | undefined {
    return this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined;
  }

  getProjectByName(name: string): Project | undefined {
    return this.db.prepare("SELECT * FROM projects WHERE name = ?").get(name) as Project | undefined;
  }

  listProjects(): Project[] {
    return this.db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as Project[];
  }

  updateProject(id: string, data: Partial<Pick<Project, "name" | "description" | "current_phase" | "status" | "goal" | "goal_metadata" | "completed_at">>): void {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(data)) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
    if (sets.length === 0) return;
    sets.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);
    this.db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  }

  // --- Phase States ---

  getPhaseState(projectId: string, phase: ProjectPhase): PhaseState | undefined {
    return this.db.prepare(
      "SELECT * FROM phase_states WHERE project_id = ? AND phase = ?"
    ).get(projectId, phase) as PhaseState | undefined;
  }

  getAllPhaseStates(projectId: string): PhaseState[] {
    return this.db.prepare(
      "SELECT * FROM phase_states WHERE project_id = ? ORDER BY phase"
    ).all(projectId) as PhaseState[];
  }

  setPhaseState(
    projectId: string,
    phase: ProjectPhase,
    status: PhaseStateStatus,
    data?: { input_data?: string; output_data?: string; error_message?: string },
  ): void {
    const existing = this.getPhaseState(projectId, phase);
    const now = new Date().toISOString();

    if (!existing) return;

    const updates: string[] = ["status = ?"];
    const values: unknown[] = [status];

    if (status === "in_progress" && !existing.started_at) {
      updates.push("started_at = ?");
      values.push(now);
    }
    if (status === "done" || status === "failed") {
      updates.push("completed_at = ?");
      values.push(now);
    }
    if (data?.input_data !== undefined) {
      updates.push("input_data = ?");
      values.push(data.input_data);
    }
    if (data?.output_data !== undefined) {
      updates.push("output_data = ?");
      values.push(data.output_data);
    }
    if (data?.error_message !== undefined) {
      updates.push("error_message = ?");
      values.push(data.error_message);
    }

    values.push(existing.id);
    this.db.prepare(
      `UPDATE phase_states SET ${updates.join(", ")} WHERE id = ?`
    ).run(...values);
  }

  // --- Spec Documents ---

  createSpec(data: {
    project_id: string;
    content: string;
    ai_generated: boolean;
    parent_version_id?: string;
  }): SpecDocument {
    const id = randomUUID();
    const now = new Date().toISOString();

    // Get next version number
    const latest = this.db.prepare(
      "SELECT version FROM spec_documents WHERE project_id = ? ORDER BY version DESC LIMIT 1"
    ).get(data.project_id) as { version: number } | undefined;
    const version = (latest?.version ?? 0) + 1;

    this.db.prepare(`
      INSERT INTO spec_documents (id, project_id, version, content, status, ai_generated, parent_version_id)
      VALUES (?, ?, ?, ?, 'draft', ?, ?)
    `).run(id, data.project_id, version, data.content, data.ai_generated ? 1 : 0, data.parent_version_id ?? null);

    return {
      id,
      project_id: data.project_id,
      version,
      content: data.content,
      status: "draft",
      ai_generated: data.ai_generated,
      created_at: now,
      updated_at: now,
      parent_version_id: data.parent_version_id ?? null,
    };
  }

  getLatestSpec(projectId: string): SpecDocument | undefined {
    return this.db.prepare(
      "SELECT * FROM spec_documents WHERE project_id = ? ORDER BY version DESC LIMIT 1"
    ).get(projectId) as SpecDocument | undefined;
  }

  getSpecHistory(projectId: string): SpecDocument[] {
    return this.db.prepare(
      "SELECT * FROM spec_documents WHERE project_id = ? ORDER BY version ASC"
    ).all(projectId) as SpecDocument[];
  }

  updateSpecStatus(id: string, status: SpecStatus): void {
    this.db.prepare("UPDATE spec_documents SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), id);
  }

  // --- Plan Steps ---

  createPlanStep(data: {
    project_id: string;
    phase: ProjectPhase;
    sequence: number;
    title: string;
    description: string;
    depends_on?: string[];
    assigned_agent?: string;
  }): PlanStep {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO plan_steps (id, project_id, phase, sequence, title, description, depends_on, assigned_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.project_id, data.phase, data.sequence, data.title, data.description,
      JSON.stringify(data.depends_on ?? []),
      data.assigned_agent ?? null);

    return {
      id,
      project_id: data.project_id,
      phase: data.phase,
      sequence: data.sequence,
      title: data.title,
      description: data.description,
      status: "pending",
      depends_on: data.depends_on ?? [],
      assigned_agent: data.assigned_agent ?? null,
      result: null,
      error_message: null,
      started_at: null,
      completed_at: null,
    };
  }

  getPlanSteps(projectId: string, phase?: ProjectPhase): PlanStep[] {
    if (phase) {
      return this.db.prepare(
        "SELECT * FROM plan_steps WHERE project_id = ? AND phase = ? ORDER BY sequence"
      ).all(projectId, phase) as PlanStep[];
    }
    return this.db.prepare(
      "SELECT * FROM plan_steps WHERE project_id = ? ORDER BY phase, sequence"
    ).all(projectId) as PlanStep[];
  }

  updatePlanStepStatus(id: string, status: PlanStepStatus, result?: string, error?: string): void {
    const now = new Date().toISOString();
    const updates: string[] = ["status = ?"];
    const values: unknown[] = [status];

    if (status === "in_progress") {
      updates.push("started_at = ?");
      values.push(now);
    }
    if (status === "done" || status === "failed") {
      updates.push("completed_at = ?");
      values.push(now);
    }
    if (result !== undefined) {
      updates.push("result = ?");
      values.push(result);
    }
    if (error !== undefined) {
      updates.push("error_message = ?");
      values.push(error);
    }

    values.push(id);
    this.db.prepare(`UPDATE plan_steps SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }

  getReadyPlanSteps(projectId: string, phase: ProjectPhase): PlanStep[] {
    const steps = this.getPlanSteps(projectId, phase);
    return steps.filter((s) => {
      if (s.status !== "pending") return false;
      const deps: string[] = typeof s.depends_on === "string"
        ? JSON.parse(s.depends_on as unknown as string)
        : s.depends_on;
      if (deps.length === 0) return true;
      return deps.every((depId) => {
        const dep = steps.find((x) => x.id === depId);
        return dep?.status === "done";
      });
    });
  }

  // --- Tasks (legacy, kept for backward compat) ---

  createTask(task: Omit<Task, "id" | "created_at" | "updated_at" | "retry_count" | "project_id" | "plan_step_id" | "error_message"> & { project_id?: string | null; plan_step_id?: string | null }): Task {
    const id = randomUUID();
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, title, description, status, version, project_path, parent_task_id, max_retries, project_id, plan_step_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, task.title, task.description, task.status, task.version, task.project_path,
      task.parent_task_id, task.max_retries, task.project_id ?? null, task.plan_step_id ?? null);
    return { ...task, id, created_at: now, updated_at: now, retry_count: 0, project_id: task.project_id ?? null, plan_step_id: task.plan_step_id ?? null, error_message: null } as Task;
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

  // --- Subtasks (legacy, kept for backward compat) ---

  createSubtask(subtask: Omit<Subtask, "id" | "created_at" | "updated_at" | "error_message">): Subtask {
    const id = randomUUID();
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO subtasks (id, task_id, type, title, description, status, assigned_agent, result, depends_on)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, subtask.task_id, subtask.type, subtask.title, subtask.description,
      subtask.status, subtask.assigned_agent, subtask.result, JSON.stringify(subtask.depends_on));
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

  addProjectLog(projectId: string, agent: string, level: LogEntry["level"], message: string, phase?: string): void {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO project_logs (id, project_id, phase, agent, level, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, projectId, phase ?? null, agent, level, message);
  }

  getProjectLogs(projectId: string, limit = 100): Array<{ id: string; project_id: string; phase: string | null; agent: string; level: string; message: string; created_at: string }> {
    return this.db.prepare(
      "SELECT * FROM project_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?"
    ).all(projectId, limit) as Array<{ id: string; project_id: string; phase: string | null; agent: string; level: string; message: string; created_at: string }>;
  }

  getLogs(taskId: string, limit = 100): LogEntry[] {
    return this.db.prepare(
      "SELECT * FROM logs WHERE task_id = ? ORDER BY created_at DESC LIMIT ?"
    ).all(taskId, limit) as LogEntry[];
  }

  // --- Versions ---

  createVersion(version: Omit<import("../types/task.js").Version, "id" | "created_at">): import("../types/task.js").Version {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO versions (id, name, branch, worktree_path, base_branch, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, version.name, version.branch, version.worktree_path, version.base_branch, version.status);
    return { ...version, id, created_at: new Date().toISOString() };
  }

  listVersions(): import("../types/task.js").Version[] {
    return this.db.prepare("SELECT * FROM versions ORDER BY created_at DESC").all() as import("../types/task.js").Version[];
  }

  updateVersionStatus(id: string, status: import("../types/task.js").Version["status"]): void {
    this.db.prepare("UPDATE versions SET status = ? WHERE id = ?").run(status, id);
  }

  close(): void {
    this.db.close();
  }
}
