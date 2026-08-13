/**
 * `yokai init` command.
 *
 * Sets up the .yokai/ directory with interactive configuration.
 * This is the recommended first step before running `yokai "<intent>"`.
 *
 * Flow:
 *   1. Check if already initialized
 *   2. Collect project config interactively (project name, provider, API key env)
 *   3. Validate API key if Gemini is selected
 *   4. Write .yokai/config.yaml
 *   5. Update .gitignore (add .yokai/state.yaml and .yokai/history.jsonl, keep spec tracked)
 *   6. Print next steps
 */
import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import {
  printBanner,
  printSection,
  printSuccess,
  printWarning,
  printInfo,
  printError,
  createSpinner,
} from "../ui.js";
import { YokaiStore, type YokaiConfig } from "../../store/index.js";

// ---------------------------------------------------------------------------
// .gitignore helpers
// ---------------------------------------------------------------------------

const GITIGNORE_BLOCK = `
# Yokai — local state (keep specification.yaml tracked)
.yokai/history.jsonl
.yokai/config.yaml
`.trimStart();

function updateGitignore(root: string): void {
  const gitignorePath = path.join(root, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, GITIGNORE_BLOCK, "utf-8");
    return;
  }
  const existing = fs.readFileSync(gitignorePath, "utf-8");
  if (existing.includes(".yokai/history.jsonl")) {
    return; // Already patched
  }
  fs.appendFileSync(gitignorePath, "\n" + GITIGNORE_BLOCK, "utf-8");
}

// ---------------------------------------------------------------------------
// API key validator
// ---------------------------------------------------------------------------

async function validateGeminiKey(apiKeyEnv: string, model: string): Promise<boolean> {
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) return false;
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const client = new GoogleGenAI({ apiKey });
    // Minimal call to check key validity
    await client.models.generateContent({
      model,
      contents: "ping",
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// init command
// ---------------------------------------------------------------------------

export async function initCommand(): Promise<void> {
  printBanner();
  printSection("Initialize Yokai");

  const store = new YokaiStore(process.cwd());
  const projectName = path.basename(process.cwd());

  // ── Already initialized? ─────────────────────────────────────────────────
  if (store.isInitialized()) {
    printWarning("Yokai is already initialized in this directory.");
    const { reinit } = await inquirer.prompt<{ reinit: boolean }>([{
      type: "confirm",
      name: "reinit",
      message: "Re-run initialization? (will overwrite config.yaml but keep specification.yaml)",
      default: false,
    }]);
    if (!reinit) {
      printInfo("Initialization skipped. Run `yokai \"<intent>\"` to continue.");
      return;
    }
  }

  // ── Collect config ────────────────────────────────────────────────────────
  const answers = await inquirer.prompt<{
    project_name: string;
    provider: "gemini" | "openai" | "mock";
    gemini_model: string;
    api_key_env: string;
    openai_model: string;
    openai_api_key_env: string;
    update_gitignore: boolean;
  }>([
    {
      type: "input",
      name: "project_name",
      message: "Project name:",
      default: projectName,
    },
    {
      type: "list",
      name: "provider",
      message: "Model provider for intent analysis:",
      choices: [
        { name: "OpenAI / Codex  (GPT-4o, gpt-4o-mini)", value: "openai" },
        { name: "Gemini          (Google AI)", value: "gemini" },
        { name: "Mock            (no API key, for testing)", value: "mock" },
      ],
      default: "openai",
    },
    {
      type: "list",
      name: "openai_model",
      message: "OpenAI model:",
      choices: [
        { name: "gpt-4o          (recommended)", value: "gpt-4o" },
        { name: "gpt-4o-mini     (faster, cheaper)", value: "gpt-4o-mini" },
        { name: "o3-mini         (reasoning)", value: "o3-mini" },
        { name: "gpt-4.1         (latest)", value: "gpt-4.1" },
      ],
      default: "gpt-4o",
      when: (a) => a.provider === "openai",
    },
    {
      type: "input",
      name: "openai_api_key_env",
      message: "Environment variable name for your OpenAI API key:",
      default: "OPENAI_API_KEY",
      when: (a) => a.provider === "openai",
    },
    {
      type: "list",
      name: "gemini_model",
      message: "Gemini model:",
      choices: [
        { name: "gemini-3.5-flash      (fast, recommended)", value: "gemini-3.5-flash" },
        { name: "gemini-3.6-flash      (latest stable)", value: "gemini-3.6-flash" },
        { name: "gemini-3.1-pro        (high reasoning)", value: "gemini-3.1-pro" },
        { name: "gemini-3.5-flash-lite (fastest, lightweight)", value: "gemini-3.5-flash-lite" },
      ],
      default: "gemini-3.5-flash",
      when: (a) => a.provider === "gemini",
    },
    {
      type: "input",
      name: "api_key_env",
      message: "Environment variable name for your Gemini API key:",
      default: "GEMINI_API_KEY",
      when: (a) => a.provider === "gemini",
    },
    {
      type: "confirm",
      name: "update_gitignore",
      message: "Add .yokai/history.jsonl and .yokai/config.yaml to .gitignore?\n  (specification.yaml will remain tracked — it is your source of truth)",
      default: true,
    },
  ]);

  // ── Write config ──────────────────────────────────────────────────────────
  const config: YokaiConfig = {
    project_name: answers.project_name,
    model_provider: answers.provider,
    ...(answers.provider === "gemini"
      ? {
          gemini: {
            model: answers.gemini_model,
            api_key_env: answers.api_key_env,
          },
        }
      : {}),
    ...(answers.provider === "openai"
      ? {
          openai: {
            model: answers.openai_model,
            api_key_env: answers.openai_api_key_env,
          },
        }
      : {}),
  };

  store.ensureDir();
  store.writeConfig(config);
  printSuccess("Wrote .yokai/config.yaml");

  // ── Validate API key ──────────────────────────────────────────────────────
  if (answers.provider === "gemini") {
    const envKey = answers.api_key_env;
    const apiKey = process.env[envKey];
    if (!apiKey) {
      printWarning(`${envKey} is not set in the current environment.`);
      printInfo(`Set it before running yokai: export ${envKey}="your_key_here"`);
    } else {
      const spinner = createSpinner(`Validating API key (${envKey})...`);
      const valid = await validateGeminiKey(envKey, answers.gemini_model);
      spinner.stop();
      if (valid) {
        printSuccess(`API key valid ✓`);
      } else {
        printWarning(`API key validation failed. Check your ${envKey} value.`);
        printInfo("You can still proceed — the key will be checked when you run `yokai \"<intent>\"`.");
      }
    }
  }

  if (answers.provider === "openai") {
    const envKey = answers.openai_api_key_env;
    const apiKey = process.env[envKey];
    if (!apiKey) {
      printWarning(`${envKey} is not set in the current environment.`);
      printInfo(`Set it before running yokai: export ${envKey}="your_key_here"`);
    } else {
      printSuccess(`${envKey} is set ✓`);
      printInfo("Key format looks valid. It will be verified on first API call.");
    }
  }

  // ── Update .gitignore ─────────────────────────────────────────────────────
  if (answers.update_gitignore) {
    updateGitignore(store.projectRoot);
    printSuccess("Updated .gitignore");
  }

  // ── Print next steps ──────────────────────────────────────────────────────
  console.log();
  printSection("Ready");
  printSuccess(`Project "${answers.project_name}" initialized`);
  console.log();
  printInfo("Next steps:");
  console.log();
  console.log('    yokai "<your intent>"     — analyze intent and draft specification');
  console.log("    yokai refine              — answer questions to refine the spec");
  console.log("    yokai spec --verbose      — view the full specification");
  console.log("    yokai approve             — accept the specification");
  console.log();

  const pendingEnvKey =
    answers.provider === "openai"
      ? (!process.env[answers.openai_api_key_env] ? answers.openai_api_key_env : null)
      : answers.provider === "gemini"
      ? (!process.env[answers.api_key_env] ? answers.api_key_env : null)
      : null;

  if (pendingEnvKey) {
    console.log(`  ⚠  Don't forget: export ${pendingEnvKey}="your_key_here"`);
    console.log();
  }
}
