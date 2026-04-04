import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join, resolve, basename } from "path";
import { parseFrontmatter, serializeFrontmatter, readParsedFile, writeParsedFile } from "./frontmatter.js";
import { execCommand } from "../orchestrator/exec.js";
import type { ProjectPhase, ProjectStatus, PhaseStateStatus, PhaseStateInfo, ProjectState } from "../types/project.js";
import { PHASE_ORDER } from "../types/project.js";

// --- Types ---

export interface SpecModule {
  name: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface PlanItem {
  id: string;
  checked: boolean;
  title: string;
  description: string;
}

export interface PlanSection {
  phase: string;
  items: PlanItem[];
}

export interface ImportedProjectData {
  name: string;
  projectPath: string;
  goal?: string;
  currentPhase: string;
  phaseStatuses: Record<string, string>;
  hasPlan: boolean;
  hasSpec: boolean;
}

export interface LogEntry {
  ts: string;
  level: "info" | "warn" | "error" | "debug";
  agent: string;
  phase?: string;
  message: string;
}

// --- FileStore ---

export class FileStore {
  private basePath: string;
  private autoCommit: boolean;

  constructor(projectPath: string, autoCommit = true) {
    this.basePath = join(resolve(projectPath), ".fbloom");
    this.autoCommit = autoCommit;
  }

  // --- Directory init ---

  init(): void {
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
    if (!existsSync(join(this.basePath, "spec"))) {
      mkdirSync(join(this.basePath, "spec"), { recursive: true });
    }
    if (!existsSync(join(this.basePath, "logs"))) {
      mkdirSync(join(this.basePath, "logs"), { recursive: true });
    }
  }

  /** Check if .fbloom/ directory exists */
  exists(): boolean {
    return existsSync(this.basePath);
  }

  // --- State (state.json) ---

  /** Read project state from state.json */
  readState(): ProjectState | null {
    const filePath = join(this.basePath, "state.json");
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      return null;
    }
  }

  /** Write project state to state.json */
  writeState(state: ProjectState): void {
    this.init();
    writeFileSync(
      join(this.basePath, "state.json"),
      JSON.stringify(state, null, 2) + "\n",
    );
  }

  /** Initialize a new project with state.json */
  initProject(name: string): ProjectState {
    this.init();
    const now = new Date().toISOString();
    const phases: Partial<Record<ProjectPhase, PhaseStateInfo>> = {};
    for (const phase of PHASE_ORDER) {
      phases[phase] = { status: "pending", started_at: null, completed_at: null, input_data: null, output_data: null, error_message: null };
    }

    const state: ProjectState = {
      name,
      current_phase: "goal",
      status: "active",
      created_at: now,
      updated_at: now,
      completed_at: null,
      phases,
    };
    this.writeState(state);
    this.tryAutoCommit("init project");
    return state;
  }

  /** Rebuild state.json from existing files (scanForImport) */
  rebuildState(): ProjectState | null {
    const name = basename(this.getProjectPath());
    const goal = this.readGoal();
    const specModules = this.listSpecModules();
    const planSections = this.readPlan();

    let currentPhase: ProjectPhase = "goal";
    if (planSections.length > 0) {
      currentPhase = "plan";
      const devSection = planSections.find(s => s.phase.toLowerCase() === "dev");
      if (devSection?.items.some(i => i.checked)) {
        currentPhase = "dev";
      }
    } else if (specModules.length > 0) {
      currentPhase = "spec";
    }

    const now = new Date().toISOString();
    const phases: Partial<Record<ProjectPhase, PhaseStateInfo>> = {};
    for (const phase of PHASE_ORDER) {
      const phaseIdx = PHASE_ORDER.indexOf(phase);
      const currentIdx = PHASE_ORDER.indexOf(currentPhase);
      phases[phase] = {
        status: phaseIdx < currentIdx ? "done" : phaseIdx === currentIdx && goal ? "done" : "pending",
        started_at: phaseIdx <= currentIdx ? now : null,
        completed_at: phaseIdx < currentIdx || (phaseIdx === currentIdx && goal) ? now : null,
        input_data: null,
        output_data: null,
        error_message: null,
      };
    }

    const state: ProjectState = {
      name,
      current_phase: currentPhase,
      status: "active",
      created_at: now,
      updated_at: now,
      completed_at: null,
      phases,
    };
    this.writeState(state);
    return state;
  }

  /** Get or create state — reads state.json, rebuilds if missing */
  getOrCreateState(): ProjectState {
    let state = this.readState();
    if (!state) {
      state = this.rebuildState();
    }
    if (!state) {
      state = this.initProject(basename(this.getProjectPath()));
    }
    return state;
  }

  /** Update project metadata in state.json */
  updateProjectMeta(updates: Partial<Pick<ProjectState, "name" | "current_phase" | "status" | "completed_at">>): void {
    const state = this.getOrCreateState();
    this.writeState({ ...state, ...updates, updated_at: new Date().toISOString() });
  }

  // --- Phase State ---

  /** Get phase state info */
  getPhaseStateInfo(phase: ProjectPhase): PhaseStateInfo | undefined {
    const state = this.readState();
    return state?.phases[phase];
  }

  /** Set phase state */
  setPhaseState(
    phase: ProjectPhase,
    status: PhaseStateStatus,
    data?: { input_data?: string; output_data?: string; error_message?: string },
  ): void {
    const state = this.getOrCreateState();
    const now = new Date().toISOString();
    const existing = state.phases[phase] ?? { status: "pending" as PhaseStateStatus, started_at: null, completed_at: null, input_data: null, output_data: null, error_message: null };

    const updated: PhaseStateInfo = {
      ...existing,
      status,
      started_at: status === "in_progress" && !existing.started_at ? now : existing.started_at,
      completed_at: status === "done" || status === "failed" ? now : existing.completed_at,
    };

    if (data?.input_data !== undefined) updated.input_data = data.input_data;
    if (data?.output_data !== undefined) updated.output_data = data.output_data;
    if (data?.error_message !== undefined) updated.error_message = data.error_message;

    state.phases[phase] = updated;
    state.updated_at = now;
    this.writeState(state);
  }

  /** Get all phase states as an array */
  getAllPhaseStates(): Array<{ phase: ProjectPhase; status: PhaseStateStatus; started_at: string | null; completed_at: string | null; input_data: string | null; output_data: string | null; error_message: string | null }> {
    const state = this.readState();
    if (!state) return [];
    return PHASE_ORDER.map(phase => {
      const info = state.phases[phase] ?? { status: "pending" as PhaseStateStatus };
      return {
        phase,
        status: info.status,
        started_at: info.started_at ?? null,
        completed_at: info.completed_at ?? null,
        input_data: info.input_data ?? null,
        output_data: info.output_data ?? null,
        error_message: info.error_message ?? null,
      };
    });
  }

  // --- Logging ---

  /** Append a log entry */
  addLog(agent: string, level: "info" | "warn" | "error" | "debug", message: string, phase?: string): void {
    this.init();
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      agent,
      ...(phase ? { phase } : {}),
      message,
    };
    const logFile = join(this.basePath, "logs", "project.jsonl");
    appendFileSync(logFile, JSON.stringify(entry) + "\n");
  }

  /** Get recent log entries */
  getLogs(limit = 100): LogEntry[] {
    const logFile = join(this.basePath, "logs", "project.jsonl");
    if (!existsSync(logFile)) return [];
    const lines = readFileSync(logFile, "utf-8").trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean) as LogEntry[];
  }

  // --- Goal ---

  readGoal(): string | null {
    const filePath = join(this.basePath, "goal.md");
    if (!existsSync(filePath)) return null;
    return readParsedFile(filePath).content;
  }

  writeGoal(content: string): void {
    this.init();
    const metadata: Record<string, unknown> = {
      status: "active",
      updated: new Date().toISOString(),
    };
    if (!existsSync(join(this.basePath, "goal.md"))) {
      metadata.created = new Date().toISOString();
    }
    writeParsedFile(join(this.basePath, "goal.md"), metadata, content);
    // Also update state.json goal tracking
    const state = this.readState();
    if (state) {
      state.updated_at = new Date().toISOString();
      this.writeState(state);
    }
    this.tryAutoCommit("set goal");
  }

  // --- Context ---

  readContext(): string | null {
    const filePath = join(this.basePath, "context.md");
    if (!existsSync(filePath)) return null;
    return readParsedFile(filePath).content;
  }

  writeContext(content: string): void {
    this.init();
    writeParsedFile(join(this.basePath, "context.md"), {}, content);
    this.tryAutoCommit("update context");
  }

  // --- Spec ---

  listSpecModules(): string[] {
    const specDir = join(this.basePath, "spec");
    if (!existsSync(specDir)) return [];
    return readdirSync(specDir)
      .filter((f) => f.endsWith(".md") && f !== "_index.md")
      .sort();
  }

  readSpecModule(name: string): SpecModule | null {
    const filePath = join(this.basePath, "spec", name);
    if (!existsSync(filePath)) return null;
    const parsed = readParsedFile(filePath);
    return {
      name,
      content: parsed.content,
      metadata: parsed.metadata,
    };
  }

  writeSpecModule(name: string, content: string, metadata?: Record<string, unknown>): void {
    this.init();
    const filePath = join(this.basePath, "spec", name);
    const existing = existsSync(filePath) ? readParsedFile(filePath).metadata : {};
    const merged: Record<string, unknown> = {
      ...existing,
      ...metadata,
      updated: new Date().toISOString(),
    };
    if (!existsSync(filePath)) {
      merged.created = new Date().toISOString();
      merged.ai_generated = true;
    }
    writeParsedFile(filePath, merged, content);
  }

  writeSpecIndex(modules: string[], metadata?: Record<string, unknown>): void {
    this.init();
    const moduleList = modules.map((m) => `- [${m.replace(".md", "")}](${m})`).join("\n");
    const content = `# Specification\n\n## Modules\n${moduleList}\n`;
    const existing = existsSync(join(this.basePath, "spec", "_index.md"))
      ? readParsedFile(join(this.basePath, "spec", "_index.md")).metadata
      : {};
    writeParsedFile(
      join(this.basePath, "spec", "_index.md"),
      { ...existing, ...metadata, updated: new Date().toISOString() },
      content,
    );
  }

  getFullSpec(): string {
    const modules = this.listSpecModules();
    const parts: string[] = [];
    for (const name of modules) {
      const mod = this.readSpecModule(name);
      if (mod) {
        parts.push(`## ${name.replace(".md", "")}\n\n${mod.content}`);
      }
    }
    return parts.join("\n\n");
  }

  commitSpec(): void {
    this.tryAutoCommit("update spec");
  }

  // --- Plan ---

  readPlan(): PlanSection[] {
    const filePath = join(this.basePath, "plan.md");
    if (!existsSync(filePath)) return [];
    const text = readFileSync(filePath, "utf-8");
    return parsePlan(text);
  }

  writePlan(sections: PlanSection[]): void {
    this.init();
    const content = serializePlan(sections);
    writeParsedFile(
      join(this.basePath, "plan.md"),
      { updated: new Date().toISOString() },
      content,
    );
    this.tryAutoCommit("update plan");
  }

  writePlanRaw(content: string): void {
    this.init();
    writeParsedFile(
      join(this.basePath, "plan.md"),
      { created: new Date().toISOString(), updated: new Date().toISOString() },
      content,
    );
    this.tryAutoCommit("create plan");
  }

  markStepDone(sectionIdx: number, stepIdx: number): void {
    const sections = this.readPlan();
    if (sections[sectionIdx]?.items[stepIdx]) {
      sections[sectionIdx].items[stepIdx].checked = true;
      this.writePlan(sections);
    }
  }

  getNextPendingStep(phase: string): PlanItem | null {
    const sections = this.readPlan();
    const section = sections.find((s) => s.phase.toLowerCase() === phase.toLowerCase());
    if (!section) return null;
    return section.items.find((i) => !i.checked) ?? null;
  }

  getPlanProgress(): { total: number; done: number } {
    const sections = this.readPlan();
    let total = 0;
    let done = 0;
    for (const s of sections) {
      for (const item of s.items) {
        total++;
        if (item.checked) done++;
      }
    }
    return { total, done };
  }

  /**
   * Scan .fbloom/ files and return import metadata.
   * Used to rebuild state from existing files.
   */
  scanForImport(): ImportedProjectData {
    const projectPath = this.getProjectPath();
    const name = basename(projectPath);
    const goal = this.readGoal();
    const specModules = this.listSpecModules();
    const planSections = this.readPlan();

    let currentPhase = "goal";
    if (planSections.length > 0) {
      currentPhase = "plan";
      const devSection = planSections.find(s => s.phase.toLowerCase() === "dev");
      if (devSection?.items.some(i => i.checked)) {
        currentPhase = "dev";
      }
    } else if (specModules.length > 0) {
      currentPhase = "spec";
    }

    const phaseStatuses: Record<string, string> = {};
    const phases = ["goal", "spec", "plan", "dev", "test", "review", "deploy"];
    const completedUpTo = phases.indexOf(currentPhase);
    for (let i = 0; i < phases.length; i++) {
      if (i < completedUpTo) {
        phaseStatuses[phases[i]] = "done";
      } else if (i === completedUpTo) {
        phaseStatuses[phases[i]] = goal ? "done" : "pending";
      } else {
        phaseStatuses[phases[i]] = "pending";
      }
    }

    if (goal) {
      phaseStatuses["goal"] = "done";
    }

    return {
      name,
      projectPath,
      goal: goal ?? undefined,
      currentPhase,
      phaseStatuses,
      hasPlan: planSections.length > 0,
      hasSpec: specModules.length > 0,
    };
  }

  // --- Git ---

  async commitAll(message: string): Promise<void> {
    await execCommand("git", ["add", ".fbloom/"], this.getProjectPath());
    const status = await execCommand("git", ["status", "--porcelain", ".fbloom/"], this.getProjectPath());
    if (status.stdout.trim().length > 0) {
      await execCommand("git", ["commit", "-m", `[fbloom] ${message}`], this.getProjectPath());
    }
  }

  async getDiff(from: string, to: string): Promise<string> {
    const result = await execCommand("git", ["diff", from, to, "--", ".fbloom/"], this.getProjectPath());
    return result.stdout;
  }

  async getLog(limit = 20): Promise<string> {
    const result = await execCommand("git", ["log", "--oneline", `-${limit}`, "--", ".fbloom/"], this.getProjectPath());
    return result.stdout;
  }

  // --- Helpers ---

  getProjectPath(): string {
    return resolve(this.basePath, "..");
  }

  private tryAutoCommit(message: string): void {
    if (!this.autoCommit) return;
    this.commitAll(message).catch(() => {
      // Silently fail if not a git repo or commit fails
    });
  }
}

// --- Plan Parsing ---

function parsePlan(text: string): PlanSection[] {
  const { content } = parseFrontmatter(text);
  const lines = content.split("\n");
  const sections: PlanSection[] = [];
  let currentSection: PlanSection | null = null;
  let currentItem: PlanItem | null = null;

  for (const line of lines) {
    const sectionMatch = line.match(/^##\s+(.+)/);
    if (sectionMatch) {
      currentSection = { phase: sectionMatch[1].trim(), items: [] };
      sections.push(currentSection);
      currentItem = null;
      continue;
    }

    const checkMatch = line.match(/^-\s+\[([ xX])\]\s+(.+)/);
    if (checkMatch && currentSection) {
      const checked = checkMatch[1].toLowerCase() === "x";
      const title = checkMatch[2].trim();
      currentItem = {
        id: generateStepId(),
        checked,
        title,
        description: "",
      };
      currentSection.items.push(currentItem);
      continue;
    }

    const idMatch = line.match(/<!--\s*fbloom-id:\s*(.+?)\s*-->/);
    if (idMatch && currentItem) {
      currentItem.id = idMatch[1].trim();
      continue;
    }

    if (currentItem && line.match(/^\s{2,}/)) {
      currentItem.description += (currentItem.description ? "\n" : "") + line.trim();
    }
  }

  return sections;
}

function serializePlan(sections: PlanSection[]): string {
  const lines: string[] = ["# Plan\n"];
  for (const section of sections) {
    lines.push(`## ${section.phase}\n`);
    for (const item of section.items) {
      const check = item.checked ? "[x]" : "[ ]";
      lines.push(`- ${check} ${item.title}`);
      lines.push(`  <!-- fbloom-id: ${item.id} -->`);
      if (item.description) {
        for (const descLine of item.description.split("\n")) {
          lines.push(`  ${descLine}`);
        }
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

let stepCounter = 0;
function generateStepId(): string {
  return `step-${++stepCounter}`;
}
