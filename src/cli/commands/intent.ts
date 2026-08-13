/**
 * `yokai "<intent>"` command.
 *
 * Flow:
 *   1. Inspect repository for context signals
 *   2. Create a new Specification (or reuse existing one)
 *   3. Call ModelProvider.analyzeIntent()
 *   4. Apply the proposal through the Specification Engine
 *   5. Persist to .yokai/specification.yaml + history.jsonl
 *   6. Render a summary of what was created
 */
import path from "path";
import {
  printBanner,
  printSection,
  printSuccess,
  printWarning,
  printInfo,
  printError,
  createSpinner,
  renderSpecification,
} from "../ui.js";
import { YokaiStore } from "../../store/index.js";
import { SpecificationEngine, createSpecification } from "../../core/engine.js";
import { inspectRepository } from "../../inspector/index.js";
import { resolveProvider, commitResult } from "../context.js";
import type { ModelContext } from "../../providers/interface.js";

export async function intentCommand(rawIntent: string): Promise<void> {
  printBanner();

  const store = new YokaiStore(process.cwd());
  store.ensureDir();

  // ── 1. Repository inspection ────────────────────────────────────────────
  printSection("Inspecting repository");
  const repoCtx = inspectRepository(store.projectRoot);

  if (repoCtx.signals.length > 0) {
    printSuccess(`Detected ${repoCtx.signals.length} signal(s) from repository`);
    printInfo(repoCtx.summary);
  } else {
    printInfo("No existing codebase signals detected — starting fresh");
  }

  // ── 2. Load or create Specification ─────────────────────────────────────
  let spec = store.readSpecification();
  let engine: SpecificationEngine;

  if (spec) {
    printSuccess("Loaded existing specification");
    engine = new SpecificationEngine(spec, store.readHistory());
  } else {
    // Prefer project_name from config (set by `yokai init`), fall back to cwd
    const config = store.readConfig();
    const projectName = config.project_name ?? path.basename(process.cwd());
    spec = createSpecification(projectName, rawIntent);
    engine = new SpecificationEngine(spec);
    store.commitTransaction(spec, [], undefined);
    printSuccess(`Initialized new specification for "${projectName}"`);
  }

  // ── 3. Resolve provider ──────────────────────────────────────────────────
  const provider = await resolveProvider(store);

  // ── 4. Analyze intent ────────────────────────────────────────────────────
  printSection("Analyzing intent");
  const spinner = createSpinner("Thinking...");

  let proposal;
  try {
    const ctx: ModelContext = {
      specification: engine.getSpecification(),
      repository_context: repoCtx.full,
      user_input: rawIntent,
    };
    proposal = await provider.analyzeIntent(ctx);
    spinner.stop();
  } catch (err) {
    spinner.stop();
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // ── 5. Apply proposal through Engine ─────────────────────────────────────
  const result = engine.apply(proposal);

  if (!commitResult(engine, result, store)) {
    console.log();
    printWarning("The proposal contained invalid operations and was rejected.");
    printWarning("This is a LLM formatting issue — not a fatal error.");
    printInfo("Run `yokai refine` to continue refining the specification.");
    process.exit(1);
  }

  // ── 6. Render summary ────────────────────────────────────────────────────
  const finalSpec = engine.getSpecification();
  const reqCount = finalSpec.requirements.length;
  const qCount = finalSpec.open_questions.length;
  const blockingCount = finalSpec.open_questions.filter((q) => q.blocking).length;

  printSuccess(`Added ${reqCount} requirement(s)`);
  if (qCount > 0) {
    printWarning(`${qCount} question(s) queued${blockingCount > 0 ? ` (${blockingCount} blocking)` : ""}`);
  }

  renderSpecification(finalSpec);

  console.log();
  if (qCount > 0) {
    printInfo("Run `yokai refine` to answer questions and improve the specification.");
  } else {
    printInfo("Run `yokai spec` to view the full specification.");
    printInfo("Run `yokai approve` when ready to accept it.");
  }
  console.log();
}
