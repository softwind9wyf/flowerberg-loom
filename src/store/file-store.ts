import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve, basename } from "path";
import { parseFrontmatter, serializeFrontmatter, readParsedFile, writeParsedFile } from "./frontmatter.js";
import { execCommand } from "../orchestrator/exec.js";

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
  }

  /** Check if .fbloom/ directory exists */
  exists(): boolean {
    return existsSync(this.basePath);
  }

  /**
   * Scan .fbloom/ files and return import metadata.
   * Used to create a DB record from an existing .fbloom directory.
   */
  scanForImport(): ImportedProjectData {
    const projectPath = this.getProjectPath();
    const name = basename(projectPath);
    const goal = this.readGoal();
    const specModules = this.listSpecModules();
    const planSections = this.readPlan();

    // Determine the furthest completed phase based on what files exist
    let currentPhase = "goal";
    if (planSections.length > 0) {
      currentPhase = "plan";
      // Check if any dev steps are done
      const devSection = planSections.find(s => s.phase.toLowerCase() === "dev");
      if (devSection?.items.some(i => i.checked)) {
        currentPhase = "dev";
      }
    } else if (specModules.length > 0) {
      currentPhase = "spec";
    } else if (goal) {
      currentPhase = "goal";
    }

    // Build phase statuses from file presence
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

    // If we have goal, mark goal phase as done
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
    this.tryAutoCommit("set goal");
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
    // Fire-and-forget async commit
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
    // Section heading: ## Dev
    const sectionMatch = line.match(/^##\s+(.+)/);
    if (sectionMatch) {
      currentSection = { phase: sectionMatch[1].trim(), items: [] };
      sections.push(currentSection);
      currentItem = null;
      continue;
    }

    // Checkbox: - [ ] or - [x]
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

    // HTML comment with id: <!-- id: xxx -->
    const idMatch = line.match(/<!--\s*fbloom-id:\s*(.+?)\s*-->/);
    if (idMatch && currentItem) {
      currentItem.id = idMatch[1].trim();
      continue;
    }

    // Description line (indented under checkbox)
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
