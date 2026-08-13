/**
 * `yokai spec` command — renders the current canonical specification.
 *
 * Options:
 *   --verbose / -v   Show full details including provenance, criteria, decisions
 *   --yaml           Dump the raw YAML specification
 *   --history        Show recent history events
 */
import { dump as yamlDump } from "js-yaml";
import chalk from "chalk";
import {
  printBanner,
  printSection,
  printError,
  printInfo,
  renderSpecification,
} from "../ui.js";
import { YokaiStore } from "../../store/index.js";

export interface SpecCommandOptions {
  verbose?: boolean;
  yaml?: boolean;
  history?: boolean;
}

export async function specCommand(options: SpecCommandOptions = {}): Promise<void> {
  const store = new YokaiStore(process.cwd());

  if (!store.isInitialized()) {
    printError("No specification found. Run `yokai \"<your intent>\"` first.");
    process.exit(1);
  }

  const spec = store.readSpecification();
  if (!spec) {
    printError("Failed to read specification.");
    process.exit(1);
  }

  if (options.yaml) {
    // Raw YAML dump
    console.log(yamlDump(spec, { lineWidth: 120, noRefs: true }));
    return;
  }

  if (options.history) {
    const events = store.readHistory();
    printBanner();
    printSection("History Log");

    if (events.length === 0) {
      printInfo("No history events yet.");
      return;
    }

    const recent = events.slice(-20); // Last 20 events
    for (const evt of recent) {
      const actor = chalk.dim(`[${evt.actor}]`);
      const time = chalk.dim(new Date(evt.timestamp).toLocaleTimeString());
      const corrId = evt.correlation_id ? chalk.dim(` (${evt.correlation_id.slice(0, 12)})`) : "";
      console.log(`  ${actor} ${time}${corrId} ${chalk.hex("#7C3AED")(evt.type)}`);
    }

    if (events.length > 20) {
      printInfo(`(Showing last 20 of ${events.length} events. Full log: .yokai/history.jsonl)`);
    }
    console.log();
    return;
  }

  printBanner();
  renderSpecification(spec, options.verbose);
  console.log();

  if (!options.verbose) {
    printInfo("Run `yokai spec --verbose` for full details including provenance and acceptance criteria.");
  }
}
