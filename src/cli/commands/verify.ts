import chalk from "chalk";
import { YokaiStore } from "../../store/index.js";
import { loadEngine } from "../context.js";
import { printSection, printError, printWarning, printSuccess, createSpinner } from "../ui.js";
import { runVerificationCommand } from "../../core/verification.js";

export async function verifyCommand() {
  printSection("Verification");
  const store = new YokaiStore();
  const config = store.readConfig();
  const testCommand = config.verification?.test_command;

  if (!testCommand) {
    printError("No test command configured.");
    console.log(
      chalk.dim(
        `Please add a test command to your .yokai/config.yaml:\n` +
        `verification:\n` +
        `  test_command: "npm test"\n`
      )
    );
    process.exit(1);
  }

  const engine = loadEngine(store);
  if (!engine) {
    printError("Yokai is not initialized. Run `yokai init` first.");
    process.exit(1);
  }

  const spec = engine.getSpecification();

  if (spec.metadata.status !== "ACCEPTED") {
    printError(`Cannot verify a specification in status: ${spec.metadata.status}`);
    console.log(chalk.dim("The specification must be ACCEPTED before verification can be run."));
    process.exit(1);
  }

  const spinner = createSpinner(`Running verification command: ${chalk.cyan(testCommand)}`);
  
  try {
    const result = await runVerificationCommand(testCommand, store.projectRoot);
    
    if (result.ok) {
      spinner.stop(chalk.green("  ✓ Verification passed."));
    } else {
      spinner.stop(chalk.red("  ✗ Verification failed."));
    }

    const { events } = engine.recordVerification(testCommand, result);
    store.commitTransaction(engine.getSpecification(), events, spec.metadata.updated_at);

    if (result.ok) {
      printSuccess("All criteria verified successfully.");
    } else {
      printError("Verification command returned an error.");
      if (result.errors) {
        for (const err of result.errors) {
          console.log(chalk.red(`  • ${err}`));
        }
      }
      console.log();
      console.log(chalk.dim("Command output:"));
      console.log(chalk.dim(result.log));
    }
    
    // Explicitly exit with the appropriate code so CI systems can fail
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    spinner.stop(chalk.red("  ✗ Verification encountered a system error."));
    const message = err instanceof Error ? err.message : String(err);
    printError(message);
    process.exit(1);
  }
}
