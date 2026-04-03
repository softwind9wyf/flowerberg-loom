import { execFile } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join, resolve } from "path";
import { randomUUID } from "crypto";

export interface WorktreeInfo {
  id: string;
  path: string;
  branch: string;
  baseBranch: string;
}

export class GitWorktreeManager {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = resolve(projectPath);
  }

  /** Create a new git worktree for isolated development */
  async createWorktree(name: string, baseBranch = "main"): Promise<WorktreeInfo> {
    const id = randomUUID().slice(0, 8);
    const branch = `${name}-${id}`;
    const worktreeBase = join(this.projectPath, ".git-worktrees");

    if (!existsSync(worktreeBase)) {
      mkdirSync(worktreeBase, { recursive: true });
    }

    const worktreePath = join(worktreeBase, branch);

    // Create a new branch from base and check it out into a worktree
    await this.exec("worktree", ["add", "-b", branch, worktreePath, baseBranch]);

    return {
      id,
      path: worktreePath,
      branch,
      baseBranch,
    };
  }

  /** Merge worktree branch back into base and clean up */
  async mergeAndCleanup(worktree: WorktreeInfo): Promise<void> {
    const { path: worktreePath, branch, baseBranch } = worktree;

    // Remove the worktree first
    await this.exec("worktree", ["remove", worktreePath, "--force"]);

    // Switch to base branch and merge
    await this.exec("checkout", [baseBranch]);
    await this.exec("merge", [branch]);

    // Delete the feature branch
    try {
      await this.exec("branch", ["-d", branch]);
    } catch {
      // Branch may already be gone after merge
    }
  }

  /** Remove worktree without merging (abandon changes) */
  async removeWorktree(worktree: WorktreeInfo): Promise<void> {
    if (existsSync(worktree.path)) {
      try {
        await this.exec("worktree", ["remove", worktree.path, "--force"]);
      } catch {
        rmSync(worktree.path, { recursive: true, force: true });
      }
    }

    // Try to delete the branch
    try {
      await this.exec("branch", ["-D", worktree.branch]);
    } catch {
      // Branch may not exist
    }
  }

  /** Get current branch name */
  async getCurrentBranch(): Promise<string> {
    const result = await this.exec("rev-parse", ["--abbrev-ref", "HEAD"]);
    return result.trim();
  }

  /** Check if the repo is clean (no uncommitted changes) */
  async isClean(): Promise<boolean> {
    const result = await this.exec("status", ["--porcelain"]);
    return result.trim().length === 0;
  }

  /** Check if git is available and the path is a git repo */
  async isAvailable(): Promise<boolean> {
    try {
      await this.exec("rev-parse", ["--git-dir"]);
      return true;
    } catch {
      return false;
    }
  }

  /** Stage and commit all changes in a worktree */
  async commitAll(worktreePath: string, message: string): Promise<void> {
    await this.exec("add", ["."], worktreePath);
    await this.exec("commit", ["-m", message], worktreePath);
  }

  private exec(command: string, args: string[], cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        "git",
        [command, ...args],
        { cwd: cwd ?? this.projectPath },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`git ${command} ${args.join(" ")} failed: ${stderr || error.message}`));
          } else {
            resolve(stdout);
          }
        },
      );
    });
  }
}
