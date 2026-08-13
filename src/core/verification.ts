import { spawn } from "node:child_process";

export interface VerificationResult {
  ok: boolean;
  log: string;
  errors?: string[];
}

export function runVerificationCommand(
  command: string,
  cwd: string
): Promise<VerificationResult> {
  return new Promise((resolve) => {
    // We run the command via shell so things like "npm test" or "pytest" work naturally
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      resolve({
        ok: false,
        log: stdout + stderr,
        errors: [`Failed to spawn command: ${err.message}`],
      });
    });

    child.on("close", (code) => {
      const log = [
        stdout.trim() ? `STDOUT:\n${stdout.trim()}` : "",
        stderr.trim() ? `STDERR:\n${stderr.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      if (code !== 0) {
        resolve({
          ok: false,
          log: log || "Command failed with no output.",
          errors: [`Command exited with code ${code ?? "unknown"}`],
        });
      } else {
        resolve({
          ok: true,
          log: log || "Command succeeded with no output.",
        });
      }
    });
  });
}
