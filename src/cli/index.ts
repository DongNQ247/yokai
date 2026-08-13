#!/usr/bin/env node
/**
 * Yokai CLI — entry point.
 *
 * Commands:
 *   yokai "<intent>"    — analyze intent and draft specification
 *   yokai refine        — interactive Q&A to refine the specification
 *   yokai spec          — display the current specification
 *   yokai approve       — accept the specification for execution
 */
import dns from "node:dns";
import { program } from "commander";
import { intentCommand } from "./commands/intent.js";
import { initCommand } from "./commands/init.js";
import { refineCommand } from "./commands/refine.js";
import { specCommand } from "./commands/spec.js";
import { approveCommand } from "./commands/approve.js";
import { runCommand } from "./commands/run.js";
import { codexRunCommand } from "./commands/codex.js";

// Fix Node.js 18+ native fetch IPv6 ECONNRESET issues with Google APIs
dns.setDefaultResultOrder("ipv4first");

program
  .name("yokai")
  .description("Human Intent Compiler — bridge human intent to coding agents via a verifiable Specification.")
  .version("0.1.0");

// ── yokai init ─────────────────────────────────────────────────────────────
program
  .command("init")
  .description("Initialize Yokai in the current directory (config, .gitignore)")
  .action(async () => {
    await initCommand();
  });

// ── yokai "<intent>" ────────────────────────────────────────────────────────
program
  .argument("[intent]", "Raw user intent to analyze")
  .action(async (intent: string | undefined) => {
    if (!intent) {
      program.help();
      return;
    }
    await intentCommand(intent);
  });

// ── yokai refine ────────────────────────────────────────────────────────────
program
  .command("refine")
  .description("Interactively answer queued questions to refine the specification")
  .action(async () => {
    await refineCommand();
  });

// ── yokai spec ──────────────────────────────────────────────────────────────
program
  .command("spec")
  .description("Display the current specification")
  .option("-v, --verbose", "Show full details including provenance and acceptance criteria")
  .option("--yaml", "Dump the raw YAML specification")
  .option("--history", "Show recent history events")
  .action(async (options: { verbose?: boolean; yaml?: boolean; history?: boolean }) => {
    await specCommand(options);
  });

// ── yokai approve ───────────────────────────────────────────────────────────
program
  .command("approve")
  .description("Accept the specification for execution (DRAFT → ACCEPTED)")
  .action(async () => {
    await approveCommand();
  });

// ── yokai run ───────────────────────────────────────────────────────────────
program
  .command("run")
  .description("Execute the ACCEPTED specification to generate code")
  .option("--req <id>", "Execute a specific requirement by ID")
  .action(async (options: { req?: string }) => {
    await runCommand(options);
  });

// ── yokai codex run ────────────────────────────────────────────────────────
const codex = program
  .command("codex")
  .description("Run Yokai execution workflows through the local Codex CLI");

codex
  .command("run")
  .description("Execute the ACCEPTED specification using Codex CLI")
  .option("--req <id>", "Execute a specific requirement by ID")
  .action(async (options: { req?: string }) => {
    await codexRunCommand(options);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
