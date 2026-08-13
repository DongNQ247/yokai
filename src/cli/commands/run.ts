import chalk from "chalk";
import { YokaiStore } from "../../store/index.js";
import { loadEngine, resolveExecutionProvider, buildRepoContext } from "../context.js";
import type { ExecutionContext, ExecutionProvider } from "../../providers/execution.js";
import { printBanner, printSection, printError, printWarning, printSuccess, createSpinner } from "../ui.js";

export interface RunOptions {
  req?: string; // Optional: execute a specific requirement
  provider?: ExecutionProvider | undefined;
  sectionTitle?: string | undefined;
  initialMessage?: string | undefined;
}

export async function runCommand(options: RunOptions) {
  printBanner();
  printSection(options.sectionTitle ?? "Execution");
  const store = new YokaiStore();

  const engine = loadEngine(store);
  if (!engine) return process.exit(1);

  const spec = engine.getSpecification();

  if (spec.metadata.status === "DRAFT") {
    printError("The specification is in DRAFT state.");
    printWarning("You must review and approve it using `yokai approve` before running execution.");
    return process.exit(1);
  }

  console.log();
  const initialText = options.initialMessage ?? (options.req
      ? `Executing requirement ${options.req}...` 
      : "Executing specification (this may take a while)...");
  let spinner = createSpinner(initialText);

  try {
    const provider = options.provider ?? await resolveExecutionProvider(store);
    const repoContext = buildRepoContext(store);

    const ctx: ExecutionContext = {
      specification: spec,
      repository_context: repoContext,
      cwd: store.projectRoot,
      requirement_id: options.req,
    };

    // 1. Execute
    const result = await provider.execute(ctx);

    // 2. Record history event
    spinner.stop();
    spinner = createSpinner("Recording execution audit log...");
    const { events } = engine.recordExecution(result);
    
    // We only commit history here; spec itself is unmodified.
    store.commitTransaction(spec, events, spec.metadata.updated_at);
    
    // We also update in-memory history, though we exit immediately after
    engine.commit(spec, events);

    spinner.stop();

    if (result.ok) {
      printSuccess("Execution completed successfully!");
      if (result.files_changed.length > 0) {
        console.log(chalk.bold("\n  Files Modified/Created:"));
        for (const file of result.files_changed) {
          console.log(chalk.green(`    + ${file}`));
        }
      } else {
        console.log(chalk.yellow("\n  No files were changed."));
      }
      
      if (result.log) {
        console.log("\n  " + chalk.bold("Execution Reasoning:"));
        console.log(chalk.dim(result.log.split("\n").map(l => `    ${l}`).join("\n")));
      }
    } else {
      printError("Execution failed.");
      if (result.errors) {
        for (const err of result.errors) {
          console.log(chalk.red(`  - ${err}`));
        }
      }
      if (result.log) {
        console.log("\n  " + chalk.bold("Execution Log:"));
        console.log(chalk.dim(result.log.split("\n").map(l => `    ${l}`).join("\n")));
      }
      process.exit(1);
    }

  } catch (err) {
    spinner.stop();
    printError("Execution encountered a fatal error.");
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
