/**
 * Provenance: tracks the origin and confidence of every fact
 * in the canonical Specification.
 *
 * An AGENT_ASSUMPTION must never be indistinguishable from a
 * USER_EXPLICIT requirement — provenance makes this visible.
 */

export type ProvenanceSource =
  | "USER_EXPLICIT"       // Stated directly in user's raw intent
  | "USER_CLARIFICATION"  // Provided when user answered a queued Question
  | "REPOSITORY_INFERENCE"// Inferred by inspecting the codebase
  | "AGENT_ASSUMPTION";   // Assumed by the LLM from general knowledge

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH" | "ABSOLUTE";

export interface Provenance {
  source: ProvenanceSource;
  /**
   * A pointer to the origin of this fact.
   * Examples:
   *  - "event:evt_abc123"       (user clarification linked to a HistoryEvent)
   *  - "file:src/db/schema.ts:15" (repository inference with line ref)
   *  - "commit:a1b2c3d"         (repository inference at a specific commit)
   *  - "agent-reason:Payment provider implied by existing Stripe SDK"
   */
  reference?: string | undefined;
  confidence: ConfidenceLevel;
}
