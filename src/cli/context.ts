/**
 * Shared command context and utilities for Yokai CLI commands.
 */
import type { ModelProvider } from "../providers/interface.js";
import { YokaiStore } from "../store/index.js";
import { inspectRepository } from "../inspector/index.js";
import { SpecificationEngine, createSpecification } from "../core/engine.js";
import type { Specification } from "../models/specification.js";
import type { HistoryEvent } from "../models/history.js";
import { printError, printWarning } from "./ui.js";

export interface CommandContext {
  store: YokaiStore;
  provider: ModelProvider;
  repoContext: string;
}

/**
 * Load the Specification Engine from persisted state.
 * Returns null and prints an error if the project is not initialized.
 */
export function loadEngine(store: YokaiStore): SpecificationEngine | null {
  const spec = store.readSpecification();
  if (!spec) {
    printError("No specification found. Run `yokai \"<your intent>\"` first.");
    return null;
  }
  const history = store.readHistory();
  return new SpecificationEngine(spec, history);
}

/**
 * Applies an Engine result: if successful, persists the new spec using OCC and
 * updates the engine's in-memory state. Returns false on failure.
 */
export function commitResult(
  engine: SpecificationEngine,
  result: { ok: boolean; specification?: Specification; events: HistoryEvent[]; errors?: string[] },
  store: YokaiStore,
  { printErrors = true }: { printErrors?: boolean } = {}
): result is { ok: true; specification: Specification; events: HistoryEvent[] } {
  if (!result.ok) {
    if (printErrors && result.errors) {
      for (const e of result.errors) printError(e);
    }
    return false;
  }
  
  const previousUpdatedAt = engine.getSpecification().metadata.updated_at;
  
  try {
    store.commitTransaction(result.specification!, result.events, previousUpdatedAt);
    engine.commit(result.specification!, result.events);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  
  return true;
}

/**
 * Resolves the ModelProvider based on .yokai/config.yaml.
 * Falls back to MockProvider in test environments.
 */
export async function resolveProvider(store: YokaiStore): Promise<ModelProvider> {
  const config = store.readConfig();

  if (config.model_provider === "mock") {
    const { MockProvider } = await import("../providers/mock/index.js");
    return new MockProvider();
  }

  if (config.model_provider === "openai") {
    const { createOpenAIProvider } = await import("../providers/openai/index.js");
    const apiKeyEnv = config.openai?.api_key_env ?? "OPENAI_API_KEY";
    const model = config.openai?.model;
    const baseURL = config.openai?.base_url;
    try {
      return createOpenAIProvider({
        apiKeyEnv,
        ...(model !== undefined ? { model } : {}),
        ...(baseURL !== undefined ? { baseURL } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      printError(msg);
      process.exit(1);
    }
  }

  // Default: Gemini
  const { createGeminiProvider } = await import("../providers/gemini/index.js");
  const apiKeyEnv = config.gemini?.api_key_env ?? "GEMINI_API_KEY";
  const model = config.gemini?.model;
  try {
    return createGeminiProvider({ apiKeyEnv, ...(model !== undefined ? { model } : {}) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printError(msg);
    process.exit(1);
  }
}

/**
 * Build full repository context string from inspector output.
 */
export function buildRepoContext(store: YokaiStore): string {
  const ctx = inspectRepository(store.projectRoot);
  return ctx.full;
}
