import { YokaiStore } from "../../store/index.js";
import { createCodexCliExecutionProvider } from "../../providers/codex/execution.js";
import { runCommand, type RunOptions } from "./run.js";

export interface CodexRunOptions {
  req?: string | undefined;
}

export async function codexRunCommand(options: CodexRunOptions): Promise<void> {
  const store = new YokaiStore();
  const config = store.readConfig();
  const provider = createCodexCliExecutionProvider({
    command: config.codex?.command,
    sandbox: config.codex?.sandbox,
    approvalMode: config.codex?.approval_mode,
    json: config.codex?.json,
    ephemeral: config.codex?.ephemeral,
    extraArgs: config.codex?.extra_args,
  });

  const runOptions: RunOptions = {
    provider,
    sectionTitle: "Codex Execution",
    initialMessage: options.req
      ? `Executing requirement ${options.req} with Codex CLI...`
      : "Executing specification with Codex CLI (this may take a while)...",
  };

  if (options.req !== undefined) {
    runOptions.req = options.req;
  }

  await runCommand(runOptions);
}
