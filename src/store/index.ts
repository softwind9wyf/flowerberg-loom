import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { Project, ProjectPhase, PhaseState, PhaseStateStatus } from "../types/project.js";
import type { SpecDocument, SpecStatus } from "../types/spec.js";
import type { PlanStep, PlanStepStatus } from "../types/plan.js";

// --- Migration SQL ---

const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO schema_version (rowid, version) VALUES (1, 0);
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

CREATE INDEX IF NOT EXISTS idx_plan_steps_project ON plan_steps(project_id, sequence);
CREATE INDEX IF NOT EXISTS idx_phase_states_project ON phase_states(project_id);
`;

const MIGRATION_003 = `
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

const MIGRATION_004 = `
ALTER TABLE projects ADD COLUMN data_mode TEXT NOT NULL DEFAULT 'file';
`;

const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: MIGRATION_001 },
  { version: 2, sql: MIGRATION_002 },
  { version: 3, sql: MIGRATION_003 },
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
      data_mode: "file",
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

  updateProject(id: string, data: Partial<Pick<Project, "name" | "description" | "current_phase" | "status" | "goal" | "goal_metadata" | "completed_at" | "data_mode">>): void {
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

  // --- Project Logs ---

  addProjectLog(projectId: string, agent: string, level: "info" | "warn" | "error" | "debug", message: string, phase?: string): void {
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

  close(): void {
    this.db.close();
  }

  // --- Migration helpers ---

  migrateProjectData(projectId: string, projectPath: string): void {
    const project = this.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    // Import FileStore lazily to avoid circular deps at module level
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FileStore } = require("../store/file-store.js") as { FileStore: typeof import("../store/file-store.js").FileStore };
    const fs = new FileStore(projectPath, false);

    // 1. Goal
    if (project.goal) {
      fs.writeGoal(project.goal);
    }

    // 2. Spec
    const spec = this.getLatestSpec(projectId);
    if (spec) {
      const modules = splitSpecTextIntoModules(spec.content);
      const moduleNames: string[] = [];
      for (const [name, content] of modules) {
        fs.writeSpecModule(name, content);
        moduleNames.push(name);
      }
      fs.writeSpecIndex(moduleNames);
      fs.commitSpec();
    }

    // 3. Plan
    const steps = this.getPlanSteps(projectId);
    if (steps.length > 0) {
      const byPhase = new Map<string, Array<{ title: string; description: string; status: string }>>();
      for (const step of steps) {
        const list = byPhase.get(step.phase) ?? [];
        list.push({ title: step.title, description: step.description, status: step.status });
        byPhase.set(step.phase, list);
      }
      const lines: string[] = ["# Plan", ""];
      for (const [phase, items] of byPhase) {
        lines.push(`## ${phase.charAt(0).toUpperCase() + phase.slice(1)}`);
        for (const item of items) {
          const check = item.status === "done" ? "[x]" : "[ ]";
          lines.push(`- ${check} ${item.title}`);
          lines.push(`  ${item.description}`);
        }
        lines.push("");
      }
      fs.writePlanRaw(lines.join("\n"));
    }

    // Mark migrated
    this.updateProject(projectId, { data_mode: "file" } as unknown as Partial<Pick<Project, "data_mode">>);
  }
}

// Helper: split spec text by ## headings into named modules
function splitSpecTextIntoModules(text: string): [string, string][] {
  const modules: [string, string][] = [];
  const parts = text.split(/^(?=##\s+)/m);

  for (const part of parts) {
    const headingMatch = part.match(/^##\s+(.+)/);
    if (headingMatch) {
      const title = headingMatch[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const content = part.replace(/^##\s+.+\n?/, "").trim();
      if (title && content) {
        modules.push([`${title}.md`, content]);
      }
    }
  }

  if (modules.length === 0 && text.trim()) {
    modules.push(["overview.md", text.trim()]);
  }

  return modules;
}
