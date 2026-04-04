import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { FileStore } from "../file-store.js";
import { parseFrontmatter, serializeFrontmatter } from "../frontmatter.js";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `fbloom-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

// --- Frontmatter ---

describe("frontmatter", () => {
  it("parses file with frontmatter", () => {
    const text = `---
status: approved
version: 3
---

# Hello
Content here`;
    const result = parseFrontmatter(text);
    expect(result.metadata.status).toBe("approved");
    expect(result.metadata.version).toBe(3);
    expect(result.content).toBe("# Hello\nContent here");
  });

  it("parses file without frontmatter", () => {
    const text = "# Just markdown\nNo frontmatter.";
    const result = parseFrontmatter(text);
    expect(result.metadata).toEqual({});
    expect(result.content).toBe("# Just markdown\nNo frontmatter.");
  });

  it("serializes frontmatter", () => {
    const result = serializeFrontmatter({ status: "draft", count: 5 }, "# Title\nBody");
    expect(result).toContain("status: draft");
    expect(result).toContain("count: 5");
    expect(result).toContain("# Title\nBody");
  });

  it("round-trips parse/serialize", () => {
    const original = `---
status: active
---

# Goal
Build something`;
    const parsed = parseFrontmatter(original);
    const serialized = serializeFrontmatter(parsed.metadata, parsed.content);
    const reparsed = parseFrontmatter(serialized);
    expect(reparsed.metadata.status).toBe("active");
    expect(reparsed.content).toBe("# Goal\nBuild something");
  });
});

// --- FileStore ---

describe("FileStore", () => {
  let store: FileStore;

  beforeEach(() => {
    store = new FileStore(testDir, false); // no auto-commit in tests
  });

  describe("goal", () => {
    it("reads null when no goal exists", () => {
      expect(store.readGoal()).toBeNull();
    });

    it("writes and reads goal", () => {
      store.writeGoal("Build a CLI tool");
      expect(store.readGoal()).toBe("Build a CLI tool");
    });

    it("overwrites goal", () => {
      store.writeGoal("First goal");
      store.writeGoal("Second goal");
      expect(store.readGoal()).toBe("Second goal");
    });
  });

  describe("spec", () => {
    it("lists empty modules initially", () => {
      expect(store.listSpecModules()).toEqual([]);
    });

    it("writes and reads spec modules", () => {
      store.writeSpecModule("overview.md", "# Overview\nThis is the project overview.");
      store.writeSpecModule("architecture.md", "# Architecture\nMonorepo structure.");
      store.writeSpecIndex(["overview.md", "architecture.md"]);

      const modules = store.listSpecModules();
      expect(modules).toHaveLength(2);
      expect(modules).toContain("overview.md");
      expect(modules).toContain("architecture.md");

      const overview = store.readSpecModule("overview.md");
      expect(overview!.content).toContain("This is the project overview");
    });

    it("getFullSpec concatenates all modules", () => {
      store.writeSpecModule("overview.md", "Overview content");
      store.writeSpecModule("api.md", "API content");

      const full = store.getFullSpec();
      expect(full).toContain("Overview content");
      expect(full).toContain("API content");
    });

    it("returns null for non-existent module", () => {
      expect(store.readSpecModule("nope.md")).toBeNull();
    });
  });

  describe("plan", () => {
    it("reads empty plan initially", () => {
      expect(store.readPlan()).toEqual([]);
    });

    it("writes and reads plan", () => {
      const sections = [
        {
          phase: "Dev",
          items: [
            { id: "s1", checked: false, title: "Setup project", description: "Init dirs" },
            { id: "s2", checked: true, title: "Add CLI", description: "" },
          ],
        },
        {
          phase: "Test",
          items: [
            { id: "s3", checked: false, title: "Unit tests", description: "" },
          ],
        },
      ];
      store.writePlan(sections);

      const read = store.readPlan();
      expect(read).toHaveLength(2);
      expect(read[0].phase).toBe("Dev");
      expect(read[0].items).toHaveLength(2);
      expect(read[0].items[0].title).toBe("Setup project");
      expect(read[0].items[0].checked).toBe(false);
      expect(read[0].items[1].title).toBe("Add CLI");
      expect(read[0].items[1].checked).toBe(true);
      expect(read[1].phase).toBe("Test");
    });

    it("marks step done", () => {
      const sections = [
        {
          phase: "Dev",
          items: [
            { id: "s1", checked: false, title: "Step 1", description: "" },
            { id: "s2", checked: false, title: "Step 2", description: "" },
          ],
        },
      ];
      store.writePlan(sections);
      store.markStepDone(0, 0);

      const read = store.readPlan();
      expect(read[0].items[0].checked).toBe(true);
      expect(read[0].items[1].checked).toBe(false);
    });

    it("getNextPendingStep returns first unchecked", () => {
      const sections = [
        {
          phase: "Dev",
          items: [
            { id: "s1", checked: true, title: "Done", description: "" },
            { id: "s2", checked: false, title: "Pending", description: "" },
          ],
        },
      ];
      store.writePlan(sections);

      const step = store.getNextPendingStep("dev");
      expect(step).not.toBeNull();
      expect(step!.title).toBe("Pending");
    });

    it("getPlanProgress counts correctly", () => {
      const sections = [
        {
          phase: "Dev",
          items: [
            { id: "s1", checked: true, title: "A", description: "" },
            { id: "s2", checked: false, title: "B", description: "" },
            { id: "s3", checked: true, title: "C", description: "" },
          ],
        },
      ];
      store.writePlan(sections);

      const progress = store.getPlanProgress();
      expect(progress.total).toBe(3);
      expect(progress.done).toBe(2);
    });

    it("writePlanRaw preserves markdown format", () => {
      store.writePlanRaw("# Plan\n\n## Dev\n- [ ] Setup\n- [x] Done\n");
      const sections = store.readPlan();
      expect(sections).toHaveLength(1);
      expect(sections[0].items[0].checked).toBe(false);
      expect(sections[0].items[1].checked).toBe(true);
    });
  });
});
