/**
 * `yokai approve` command.
 *
 * Moves the Specification from DRAFT → ACCEPTED.
 *
 * Key invariant enforced here:
 *   ASSUMED requirements remain ASSUMED after approval.
 *   The Specification lifecycle is independent of individual Requirement lifecycles.
 *
 * If there are ASSUMED requirements, the user is shown a summary and asked
 * to explicitly confirm they accept the specification with those assumptions.
 */
import inquirer from "inquirer";
import chalk from "chalk";
import {
  printBanner,
  printSection,
  printSuccess,
  printWarning,
  printInfo,
  printError,
} from "../ui.js";
import { YokaiStore } from "../../store/index.js";
import { loadEngine, commitResult } from "../context.js";

export async function approveCommand(): Promise<void> {
  printBanner();
  printSection("Approve Specification");

  const store = new YokaiStore(process.cwd());
  const engine = loadEngine(store);
  if (!engine) return;

  const spec = engine.getSpecification();

  // ── Check for blocking questions ─────────────────────────────────────────
  const blockingQuestions = spec.open_questions.filter((q) => q.blocking);
  if (blockingQuestions.length > 0) {
    printError("Cannot approve: blocking questions must be resolved first.");
    console.log();
    for (const q of blockingQuestions) {
      console.log(`  ${chalk.red("✗")} ${chalk.bold(q.id)} — ${q.topic}`);
      console.log(chalk.dim(`      ${q.context}`));
    }
    console.log();
    printInfo("Run `yokai refine` to resolve these questions.");
    process.exit(1);
  }

  // ── Summarize the specification before approval ───────────────────────────
  const requirements = spec.requirements.filter(
    (r) => !["REJECTED", "SUPERSEDED"].includes(r.status)
  );
  const confirmed = requirements.filter((r) => r.status === "CONFIRMED");
  const assumed = requirements.filter((r) => r.status === "ASSUMED");
  const candidates = requirements.filter((r) => r.status === "CANDIDATE");
  const openQ = spec.open_questions.length;

  console.log();
  console.log(`  ${chalk.bold("Summary")}`);
  console.log(`  ${chalk.green("●")} ${confirmed.length} requirement(s) explicitly CONFIRMED`);
  console.log(`  ${chalk.yellow("●")} ${assumed.length} requirement(s) ASSUMED (not explicitly confirmed)`);
  if (candidates.length > 0) {
    console.log(`  ${chalk.gray("●")} ${candidates.length} requirement(s) still CANDIDATE`);
  }
  if (openQ > 0) {
    console.log(`  ${chalk.yellow("●")} ${openQ} non-blocking question(s) open`);
  }

  // ── Show ASSUMED requirements that user hasn't explicitly confirmed ───────
  if (assumed.length > 0) {
    console.log();
    printWarning("The following requirements are ASSUMED (not explicitly confirmed by you):");
    for (const req of assumed) {
      console.log(`  ${chalk.yellow("~")} ${chalk.bold(req.id)} — ${req.title}`);
      console.log(chalk.dim(`      ${req.description}`));
      console.log(chalk.dim(`      source: ${req.provenance.source} (${req.provenance.confidence} confidence)`));
    }
    console.log();
    printInfo("Approving the specification does NOT confirm these requirements.");
    printInfo("They will remain ASSUMED in the specification record.");
  }

  // ── Confirm with user ────────────────────────────────────────────────────
  console.log();
  const { confirmed: userConfirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: "confirm",
      name: "confirmed",
      message: assumed.length > 0
        ? `Accept this specification including ${assumed.length} ASSUMED requirement(s)?`
        : "Accept this specification?",
      default: false,
    },
  ]);

  if (!userConfirmed) {
    printInfo("Approval cancelled. Specification remains DRAFT.");
    process.exit(0);
  }

  // ── Apply approval through Engine ─────────────────────────────────────────
  const result = engine.approve();

  if (!commitResult(result, store)) {
    process.exit(1);
  }

  // ── Success ───────────────────────────────────────────────────────────────
  console.log();
  printSuccess("Specification ACCEPTED.");
  if (assumed.length > 0) {
    printWarning(`${assumed.length} ASSUMED requirement(s) recorded in the specification.`);
    printInfo("These assumptions are visible in .yokai/specification.yaml");
  }
  printInfo("Full history recorded in .yokai/history.jsonl");
  console.log();
}
