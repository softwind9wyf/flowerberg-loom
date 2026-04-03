import { execFile } from "child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export function execCommand(
  command: string,
  args: string[],
  cwd?: string,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        exitCode: error ? (typeof error.code === "number" ? error.code : 1) : 0,
      });
    });
  });
}
