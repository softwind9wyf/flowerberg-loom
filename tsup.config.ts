import { defineConfig } from "tsup";
import { copyFileSync, mkdirSync, readdirSync } from "fs";
import { resolve } from "path";

export default defineConfig({
  entry: ["src/cli/index.tsx", "src/cli/install-skills.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: ["better-sqlite3"],
  async onSuccess() {
    // Copy skills markdown to dist/skills/ for runtime access
    const skillsDir = resolve(process.cwd(), "skills");
    const distSkillsDir = resolve(process.cwd(), "dist", "skills");
    mkdirSync(distSkillsDir, { recursive: true });
    for (const file of readdirSync(skillsDir)) {
      if (file.endsWith(".md")) {
        copyFileSync(resolve(skillsDir, file), resolve(distSkillsDir, file));
      }
    }
  },
});
