/**
 * UI utilities for Yokai CLI.
 * Uses chalk for color and a consistent visual language.
 */
import chalk, { type ChalkInstance } from "chalk";
import type { Specification } from "../models/specification.js";
import type { ValidationError } from "../core/proposal-validation.js";
import type { HistoryEvent } from "../models/history.js";

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------
const theme = {
  primary: chalk.hex("#7C3AED"),    // Purple — Yokai brand
  success: chalk.hex("#10B981"),    // Green
  warning: chalk.hex("#F59E0B"),    // Amber
  error: chalk.hex("#EF4444"),      // Red
  muted: chalk.hex("#6B7280"),      // Gray
  bold: chalk.bold,
  dim: chalk.dim,
};

// ---------------------------------------------------------------------------
// Yokai banner / header
// ---------------------------------------------------------------------------

export function printBanner(): void {
  console.log();
  console.log(theme.primary.bold("  ██╗   ██╗ ██████╗ ██╗  ██╗ █████╗ ██╗"));
  console.log(theme.primary.bold("  ╚██╗ ██╔╝██╔═══██╗██║ ██╔╝██╔══██╗██║"));
  console.log(theme.primary.bold("   ╚████╔╝ ██║   ██║█████╔╝ ███████║██║"));
  console.log(theme.primary.bold("    ╚██╔╝  ██║   ██║██╔═██╗ ██╔══██║██║"));
  console.log(theme.primary.bold("     ██║   ╚██████╔╝██║  ██╗██║  ██║██║"));
  console.log(theme.primary.bold("     ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝"));
  console.log(theme.muted("  Human Intent Compiler — v0.1.0"));
  console.log();
}

export function printSection(title: string): void {
  console.log();
  console.log(theme.primary.bold(`▸ ${title}`));
  console.log(theme.muted("─".repeat(50)));
}

export function printSuccess(msg: string): void {
  console.log(theme.success("  ✓ ") + msg);
}

export function printWarning(msg: string): void {
  console.log(theme.warning("  ⚠ ") + msg);
}

export function printError(msg: string): void {
  console.log(theme.error("  ✗ ") + msg);
}

export function printInfo(msg: string): void {
  console.log(theme.muted("  • ") + msg);
}

export function printErrors(errors: ValidationError[]): void {
  for (const e of errors) {
    printError(`[${e.code}] ${e.message}`);
    if (e.field) console.log(theme.muted(`      field: ${e.field}`));
  }
}

// ---------------------------------------------------------------------------
// Specification renderer
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<string, ChalkInstance> = {
  CANDIDATE: chalk.hex("#6B7280"),
  ASSUMED: chalk.hex("#F59E0B"),
  QUESTION_PENDING: chalk.hex("#3B82F6"),
  CONFIRMED: chalk.hex("#10B981"),
  REJECTED: chalk.hex("#EF4444"),
  SUPERSEDED: chalk.hex("#9CA3AF"),
};

const STATUS_ICON: Record<string, string> = {
  CANDIDATE: "○",
  ASSUMED: "~",
  QUESTION_PENDING: "?",
  CONFIRMED: "✓",
  REJECTED: "✗",
  SUPERSEDED: "↪",
};

export function renderSpecification(spec: Specification, verbose = false): void {
  printSection("Specification");
  console.log(`  ${theme.bold("Project:")} ${spec.metadata.project_name}`);
  console.log(`  ${theme.bold("Status:")}  ${renderSpecStatus(spec.metadata.status)}`);
  console.log(`  ${theme.bold("Intent:")}  ${theme.dim(spec.intent.raw_input)}`);
  if (spec.intent.refined_goal) {
    console.log(`  ${theme.bold("Goal:")}    ${spec.intent.refined_goal}`);
  }

  // Requirements by type
  const byType: Record<string, typeof spec.requirements> = {};
  for (const req of spec.requirements) {
    if (!byType[req.type]) byType[req.type] = [];
    byType[req.type]!.push(req);
  }

  for (const [type, reqs] of Object.entries(byType)) {
    console.log();
    console.log(`  ${theme.primary(type.replace("_", " "))}`);
    for (const req of reqs) {
      const icon = STATUS_ICON[req.status] ?? "•";
      const color = STATUS_COLOR[req.status] ?? chalk.white;
      console.log(`    ${color(icon)} ${theme.bold(req.id)} — ${req.title}`);
      if (verbose) {
        console.log(theme.dim(`        ${req.description}`));
        console.log(theme.muted(`        provenance: ${req.provenance.source} (${req.provenance.confidence})`));
        if (req.acceptance_criteria.length) {
          console.log(theme.muted("        acceptance criteria:"));
          for (const ac of req.acceptance_criteria) {
            console.log(theme.muted(`          Given: ${ac.given}`));
            console.log(theme.muted(`          When:  ${ac.when}`));
            console.log(theme.muted(`          Then:  ${ac.then}`));
          }
        }
      }
    }
  }

  // Open questions
  if (spec.open_questions.length > 0) {
    console.log();
    console.log(`  ${theme.warning("OPEN QUESTIONS")}`);
    for (const q of spec.open_questions) {
      const blocking = q.blocking ? theme.error(" [BLOCKING]") : "";
      console.log(`    ${theme.warning("?")} ${theme.bold(q.id)} — ${q.topic}${blocking}`);
      if (verbose) {
        console.log(theme.dim(`        ${q.context}`));
        if (q.options) {
          console.log(theme.muted(`        options: ${q.options.join(", ")}`));
        }
        console.log(theme.muted(`        impact: ${q.impact} | EIV score: ${q.priority.score.toFixed(2)}`));
      }
    }
  }

  // Decisions
  if (spec.decisions.length > 0 && verbose) {
    console.log();
    console.log(`  ${theme.primary("DECISIONS")}`);
    for (const d of spec.decisions) {
      console.log(`    ${theme.bold("•")} ${d.decision}`);
      console.log(theme.muted(`        context: ${d.context}`));
    }
  }

  // Out of scope
  if (spec.out_of_scope.length > 0 && verbose) {
    console.log();
    console.log(`  ${theme.muted("OUT OF SCOPE")}`);
    for (const item of spec.out_of_scope) {
      console.log(theme.muted(`    - ${item}`));
    }
  }

  // Summary stats
  console.log();
  const counts = {
    total: spec.requirements.filter((r) => !["REJECTED", "SUPERSEDED"].includes(r.status)).length,
    confirmed: spec.requirements.filter((r) => r.status === "CONFIRMED").length,
    assumed: spec.requirements.filter((r) => r.status === "ASSUMED").length,
    candidate: spec.requirements.filter((r) => r.status === "CANDIDATE").length,
  };
  console.log(theme.muted(
    `  ${counts.total} requirements — ` +
    `${theme.success.visible(`${counts.confirmed} confirmed`)}, ` +
    `${theme.warning.visible(`${counts.assumed} assumed`)}, ` +
    `${chalk.gray(`${counts.candidate} candidate`)}`
  ));
}

function renderSpecStatus(status: string): string {
  const map: Record<string, string> = {
    DRAFT: chalk.yellow("DRAFT"),
    READY_FOR_EXECUTION: chalk.blue("READY FOR EXECUTION"),
    ACCEPTED: chalk.green("ACCEPTED"),
  };
  return map[status] ?? status;
}

// ---------------------------------------------------------------------------
// Spinner (minimal, no external dep)
// ---------------------------------------------------------------------------

const SPIN_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function createSpinner(text: string, model?: string): { stop: (finalMsg?: string) => void } {
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(
      `\r${theme.primary(SPIN_FRAMES[i % SPIN_FRAMES.length]!)} ${theme.dim(text)}`
    );
    i++;
  }, 80);

  return {
    stop: (finalMsg?: string) => {
      clearInterval(interval);
      process.stdout.write("\r" + " ".repeat(text.length + 4) + "\r");
      if (finalMsg) console.log(finalMsg);
    },
  };
}
