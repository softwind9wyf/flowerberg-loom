import { readdirSync, copyFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

export interface SkillInstallResult {
  installed: string[];
  targetDir: string;
}

/**
 * Install fbloom skill files to .claude/commands/
 * @param projectRoot - The target project directory (defaults to cwd)
 * @param skillsDirOverride - Override skills source directory (for testing)
 */
export function installSkills(
  projectRoot: string = process.cwd(),
  skillsDirOverride?: string
): SkillInstallResult {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const skillsDir = skillsDirOverride ?? resolve(__dirname, "skills");

  if (!existsSync(skillsDir)) {
    throw new Error(`Skills directory not found: ${skillsDir}`);
  }

  const targetDir = resolve(projectRoot, ".claude", "commands");
  mkdirSync(targetDir, { recursive: true });

  const skillFiles = readdirSync(skillsDir).filter((f) => f.endsWith(".md"));
  const installed: string[] = [];

  for (const file of skillFiles) {
    const srcPath = join(skillsDir, file);
    const destPath = join(targetDir, file);
    copyFileSync(srcPath, destPath);
    installed.push(file);
  }

  return { installed, targetDir };
}
