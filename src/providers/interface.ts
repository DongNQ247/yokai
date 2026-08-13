/**
 * ModelProvider interface.
 *
 * The ModelProvider is the abstraction layer between Yokai's deterministic
 * core and any LLM backend (Gemini, Codex, Claude, local model, etc.).
 *
 * Contract:
 *   - The provider PROPOSES changes; it never mutates state directly.
 *   - All proposals are returned as SpecificationUpdate objects.
 *   - The Specification Engine decides whether to apply them.
 *   - The LLM is never the source of truth.
 */
import type { Specification } from "../models/specification.js";
import type { SpecificationUpdate } from "../models/update.js";

/** Context provided to every provider call. */
export interface ModelContext {
  /** The current canonical specification. */
  specification: Specification;
  /** Raw content of relevant repository files (language, deps, etc.). */
  repository_context?: string | undefined;
  /** The raw user input for this turn (if any). */
  user_input?: string | undefined;
  /** Optional correlation ID to group related history events. */
  correlation_id?: string | undefined;
}

/**
 * The ModelProvider interface.
 * All LLM integrations must implement this contract.
 */
export interface ModelProvider {
  /**
   * Analyse raw user intent plus repository context, then propose initial
   * requirements, questions, and decisions as a SpecificationUpdate.
   */
  analyzeIntent(ctx: ModelContext): Promise<SpecificationUpdate>;

  /**
   * Given the current spec, propose questions that would resolve
   * the highest-value ambiguities.
   */
  proposeQuestions(ctx: ModelContext): Promise<SpecificationUpdate>;

  /**
   * Given the current spec and context, propose any updates
   * (modifications, new requirements, resolved questions, etc.).
   */
  proposeSpecificationUpdate(ctx: ModelContext): Promise<SpecificationUpdate>;
}
