import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AcceptanceCriteria, Requirement } from "../../models/requirement.js";
import type { ExecutionContext, ExecutionProvider, ExecutionResult } from "../execution.js";

export interface CodexCliExecutionProviderConfig {
  command?: string | undefined;
  sandbox?: string | undefined;
  approvalMode?: string | undefined;
  json?: boolean | undefined;
  ephemeral?: boolean | undefined;
  extraArgs?: string[] | undefined;
}

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface FileSnapshot {
  status: string;
  hash: string | null;
}

/**
 * Executes an accepted Yokai specification through the local Codex CLI.
 *
 * Unlike JSON-content providers, Codex mutates the repository directly. Yokai
 * snapshots the Git worktree before and after execution to produce an audit log.
 */
export class CodexCliExecutionProvider implements ExecutionProvider {
  private command: string;
  private sandbox: string | undefined;
  private approvalMode: string | undefined;
  private json: boolean;
  private ephemeral: boolean;
  private extraArgs: string[];

  constructor(config: CodexCliExecutionProviderConfig = {}) {
    this.command = config.command ?? "codex";
    this.sandbox = config.sandbox;
    this.approvalMode = config.approvalMode;
    this.json = config.json ?? true;
    this.ephemeral = config.ephemeral ?? true;
    this.extraArgs = config.extraArgs ?? [];
  }

  async execute(ctx: ExecutionContext): Promise<ExecutionResult> {
    const reqsToExecute = ctx.requirement_id
      ? ctx.specification.requirements.filter((r) => r.id === ctx.requirement_id)
      : ctx.specification.requirements.filter((r) => r.status === "CONFIRMED" || r.status === "ASSUMED");

    if (reqsToExecute.length === 0) {
      return {
        ok: false,
        files_changed: [],
        log: "No requirements to execute.",
        errors: ["No valid requirements found for execution."],
      };
    }

    const before = snapshotChangedFiles(ctx.cwd);
    const args = this.buildArgs();
    const prompt = buildPrompt(ctx, reqsToExecute);

    try {
      const result = await runCommand(this.command, args, prompt, ctx.cwd);
      const after = snapshotChangedFiles(ctx.cwd);
      const filesChanged = diffSnapshots(before, after);
      const log = formatCodexLog(result);

      if (result.exitCode !== 0) {
        return {
          ok: false,
          files_changed: filesChanged,
          log,
          errors: [`Codex CLI exited with code ${result.exitCode ?? "unknown"}.`],
        };
      }

      return {
        ok: true,
        files_changed: filesChanged,
        log,
      };
    } catch (err) {
      const after = snapshotChangedFiles(ctx.cwd);
      const filesChanged = diffSnapshots(before, after);
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        files_changed: filesChanged,
        log: "Execution failed before Codex CLI completed.",
        errors: [`CodexCliExecutionProvider failed: ${message}`],
      };
    }
  }

  private buildArgs(): string[] {
    const args = ["exec"];
    if (this.json) args.push("--json");
    if (this.ephemeral) args.push("--ephemeral");
    if (this.sandbox) args.push("--sandbox", this.sandbox);
    if (this.approvalMode) args.push("--approval-mode", this.approvalMode);
    args.push(...this.extraArgs);
    args.push("Execute the Yokai accepted specification from stdin. Modify the repository directly and finish with a concise implementation summary.");
    return args;
  }
}

export function createCodexCliExecutionProvider(options: CodexCliExecutionProviderConfig = {}): CodexCliExecutionProvider {
  return new CodexCliExecutionProvider(options);
}

function buildPrompt(ctx: ExecutionContext, requirements: Requirement[]): string {
  const requirementText = requirements.map(formatRequirement).join("\n\n");

  return [
    "# Yokai Execution Task",
    "",
    "You are running as the implementation agent for an ACCEPTED Yokai specification.",
    "Modify the repository directly to satisfy the requirements below.",
    "Preserve unrelated user changes. Run relevant validation commands when practical.",
    "",
    "## Specification",
    `Project: ${ctx.specification.metadata.project_name}`,
    `Intent: ${ctx.specification.intent.refined_goal ?? ctx.specification.intent.raw_input}`,
    "",
    "## Requirements to Execute",
    requirementText,
    "",
    "## Repository Context",
    ctx.repository_context ?? "(none)",
  ].join("\n");
}

function formatRequirement(req: Requirement): string {
  const criteria = req.acceptance_criteria.length > 0
    ? req.acceptance_criteria.map(formatAcceptanceCriteria).join("\n")
    : "No explicit acceptance criteria.";

  return [
    `[${req.id}] ${req.title}`,
    `Type: ${req.type}`,
    `Status: ${req.status}`,
    `Description: ${req.description}`,
    `Dependencies: ${req.dependencies.length > 0 ? req.dependencies.join(", ") : "none"}`,
    "Acceptance Criteria:",
    criteria,
  ].join("\n");
}

function formatAcceptanceCriteria(criteria: AcceptanceCriteria): string {
  return `- Given ${criteria.given}; When ${criteria.when}; Then ${criteria.then}`;
}

function runCommand(command: string, args: string[], stdin: string, cwd: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
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
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });

    child.stdin.end(stdin);
  });
}

function formatCodexLog(result: CommandResult): string {
  const parts = [
    result.stdout.trim() ? `stdout:\n${result.stdout.trim()}` : "",
    result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : "",
  ].filter(Boolean);
  return parts.join("\n\n") || "Codex CLI completed without output.";
}

function snapshotChangedFiles(cwd: string): Map<string, FileSnapshot> {
  const status = gitStatus(cwd);
  const snapshot = new Map<string, FileSnapshot>();

  for (const [filePath, code] of status.entries()) {
    snapshot.set(filePath, {
      status: code,
      hash: hashFile(cwd, filePath),
    });
  }

  return snapshot;
}

function gitStatus(cwd: string): Map<string, string> {
  const result = spawnSyncText("git", ["status", "--porcelain=v1", "--untracked-files=all"], cwd);
  const entries = new Map<string, string>();
  if (result.exitCode !== 0) return entries;

  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2);
    const filePath = parsePorcelainPath(line.slice(3));
    if (filePath) entries.set(filePath, status);
  }

  return entries;
}

function spawnSyncText(command: string, args: string[], cwd: string): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
  });

  return {
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function parsePorcelainPath(rawPath: string): string {
  const renameSeparator = " -> ";
  const renameIndex = rawPath.indexOf(renameSeparator);
  const pathPart = renameIndex >= 0 ? rawPath.slice(renameIndex + renameSeparator.length) : rawPath;
  return pathPart.replace(/^"|"$/g, "");
}

function hashFile(cwd: string, relativePath: string): string | null {
  const absolutePath = path.resolve(cwd, relativePath);
  const root = path.resolve(cwd);
  if (absolutePath !== root && !absolutePath.startsWith(root + path.sep)) return null;
  if (!fs.existsSync(absolutePath)) return null;
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) return null;
  return createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
}

function diffSnapshots(before: Map<string, FileSnapshot>, after: Map<string, FileSnapshot>): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths]
    .filter((filePath) => {
      const prev = before.get(filePath);
      const next = after.get(filePath);
      return prev?.status !== next?.status || prev?.hash !== next?.hash;
    })
    .sort();
}
