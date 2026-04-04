import { installSkills } from "./skills.js";

try {
  const result = installSkills();
  console.log(`Installed ${result.installed.length} fbloom skill files to ${result.targetDir}:`);
  for (const f of result.installed) {
    console.log(`  - ${f}`);
  }
  console.log("\nAvailable in Claude Code:");
  console.log("  /fbloom-init <name>   — Initialize a fbloom project");
  console.log("  /fbloom-goal           — Define project goal");
  console.log("  /fbloom-spec           — Generate specifications");
  console.log("  /fbloom-plan           — Create implementation plan");
  console.log("  /fbloom-context        — Manage project context");
  console.log("  /fbloom-skill          — Generate skill bridge file");
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  console.error("Run this command in your project directory.");
  process.exit(1);
}
