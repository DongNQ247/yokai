/**
 * `yokai refine` command — interactive Q&A loop.
 *
 * Flow:
 *   1. Load existing specification
 *   2. Sort open questions by EIV score (blocking first, then highest score)
 *   3. For each question: display context → collect user answer
 *   4. Call ModelProvider.proposeSpecificationUpdate() with the answer
 *   5. Apply the proposal and persist
 *   6. Continue until no questions remain or user stops
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
  createSpinner,
  renderSpecification,
} from "../ui.js";
import { YokaiStore } from "../../store/index.js";
import { inspectRepository } from "../../inspector/index.js";
import { resolveProvider, loadEngine, commitResult } from "../context.js";
import type { ModelContext } from "../../providers/interface.js";
import type { Question } from "../../models/question.js";

// ---------------------------------------------------------------------------
// Question renderer
// ---------------------------------------------------------------------------

function renderQuestion(q: Question, index: number, total: number): void {
  const blockingBadge = q.blocking ? chalk.red.bold(" [BLOCKING]") : "";
  const impactBadge = q.impact === "HIGH"
    ? chalk.yellow(` [${q.impact}]`)
    : chalk.dim(` [${q.impact}]`);
  const eivBadge = chalk.dim(` EIV: ${q.priority.score.toFixed(2)}`);

  console.log();
  console.log(chalk.hex("#7C3AED").bold(`  Question ${index}/${total}`) + blockingBadge + impactBadge + eivBadge);
  console.log(chalk.bold(`  Topic: ${q.topic}`));
  console.log(chalk.dim(`  ${q.context}`));
  if (q.suggested_answer) {
    console.log(chalk.dim(`  Suggested: ${q.suggested_answer}`));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Inquirer prompt builders
// ---------------------------------------------------------------------------

async function promptQuestion(q: Question): Promise<string> {
  switch (q.type) {
    case "BOOLEAN": {
      const { answer } = await inquirer.prompt<{ answer: boolean }>([{
        type: "confirm",
        name: "answer",
        message: q.context.split("\n")[0] ?? q.topic,
        default: q.suggested_answer?.toLowerCase() === "yes",
      }]);
      return answer ? "yes" : "no";
    }

    case "SINGLE_CHOICE": {
      const choices = q.options ?? [];
      const { answer } = await inquirer.prompt<{ answer: string }>([{
        type: "list",
        name: "answer",
        message: "Select an option:",
        choices: [...choices, new inquirer.Separator(), "Other (type below)"],
        default: q.suggested_answer,
      }]);
      if (answer === "Other (type below)") {
        const { custom } = await inquirer.prompt<{ custom: string }>([{
          type: "input",
          name: "custom",
          message: "Enter your answer:",
        }]);
        return custom;
      }
      return answer;
    }

    case "MULTIPLE_CHOICE": {
      const choices = q.options ?? [];
      const { answers } = await inquirer.prompt<{ answers: string[] }>([{
        type: "checkbox",
        name: "answers",
        message: "Select all that apply:",
        choices,
      }]);
      return answers.join(", ");
    }

    case "OPEN_ENDED":
    default: {
      const { answer } = await inquirer.prompt<{ answer: string }>([{
        type: "input",
        name: "answer",
        message: "Your answer:",
        default: q.suggested_answer,
      }]);
      return answer;
    }
  }
}

// ---------------------------------------------------------------------------
// refine command
// ---------------------------------------------------------------------------

export async function refineCommand(): Promise<void> {
  printBanner();

  const store = new YokaiStore(process.cwd());
  const engine = loadEngine(store);
  if (!engine) return;

  const spec = engine.getSpecification();
  const allQuestions = [...spec.open_questions];

  if (allQuestions.length === 0) {
    printSection("Refine");
    printInfo("No open questions. Your specification is ready.");
    printInfo("Run `yokai spec` to review it, then `yokai approve` to accept.");
    return;
  }

  // Sort: blocking first, then by EIV score descending
  const sorted = allQuestions.sort((a, b) => {
    if (a.blocking && !b.blocking) return -1;
    if (!a.blocking && b.blocking) return 1;
    return b.priority.score - a.priority.score;
  });

  printSection("Refine — Interactive Q&A");
  printInfo(`${sorted.length} question(s) to answer (highest impact first)`);
  printInfo("Press Ctrl+C at any time to save progress and exit.");

  const repoCtx = inspectRepository(store.projectRoot);
  const provider = await resolveProvider(store);

  let answered = 0;

  for (let i = 0; i < sorted.length; i++) {
    const q = sorted[i]!;

    // Re-check if question still exists in current spec (might have been resolved)
    const currentSpec = engine.getSpecification();
    if (!currentSpec.open_questions.find((oq) => oq.id === q.id)) continue;

    renderQuestion(q, i + 1, sorted.length);

    let userAnswer: string;
    try {
      userAnswer = await promptQuestion(q);
    } catch {
      // Ctrl+C or interrupt
      console.log();
      printWarning("Session interrupted. Progress saved.");
      break;
    }

    if (!userAnswer.trim()) {
      printInfo("Skipping question...");
      continue;
    }

    // Call provider to update spec based on answer
    const spinner = createSpinner("Processing answer...");
    try {
      const ctx: ModelContext = {
        specification: engine.getSpecification(),
        repository_context: repoCtx.full,
        user_input: `Question: ${q.topic}\nAnswer: ${userAnswer}`,
      };

      const proposal = await provider.proposeSpecificationUpdate(ctx);

      // Always include the question resolution explicitly
      if (!proposal.resolve_questions) {
        proposal.resolve_questions = [];
      }
      // Ensure the resolution is included even if the model missed it
      if (!proposal.resolve_questions.some((r) => r.question_id === q.id)) {
        proposal.resolve_questions.push({ question_id: q.id, answer: userAnswer });
      }

      spinner.stop();

      const result = engine.apply(proposal);
      commitResult(engine, result, store);

      if (result.ok) {
        answered++;
        printSuccess(`Answer recorded.`);
      } else {
        printWarning("Answer could not be fully applied. Moving on.");
      }
    } catch (err) {
      spinner.stop();
      printError(err instanceof Error ? err.message : String(err));
    }

    // Ask if user wants to continue after each answer
    if (i < sorted.length - 1) {
      const remaining = engine.getSpecification().open_questions.length;
      if (remaining === 0) break;

      const { cont } = await inquirer.prompt<{ cont: boolean }>([{
        type: "confirm",
        name: "cont",
        message: `${remaining} question(s) remaining. Continue?`,
        default: true,
      }]);
      if (!cont) break;
    }
  }

  // Final status
  const finalSpec = engine.getSpecification();
  console.log();
  printSection("Refine — Complete");
  printSuccess(`${answered} question(s) answered`);

  const remaining = finalSpec.open_questions.length;
  const blockingLeft = finalSpec.open_questions.filter((q) => q.blocking).length;

  if (remaining > 0) {
    printWarning(`${remaining} question(s) still open${blockingLeft > 0 ? ` (${blockingLeft} blocking)` : ""}`);
    printInfo("Run `yokai refine` again to continue.");
  } else {
    printSuccess("All questions resolved!");
    printInfo("Run `yokai spec` to review, then `yokai approve` to accept.");
  }

  renderSpecification(finalSpec);
  console.log();
}
