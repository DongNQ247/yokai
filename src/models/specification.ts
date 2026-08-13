/**
 * Specification and Decision models.
 *
 * The Specification is the canonical source of truth for the project intent.
 * Only the Specification Engine may mutate it.
 *
 * SpecificationStatus and RequirementStatus are INDEPENDENT lifecycles:
 *   - `yokai approve` moves Specification: DRAFT → ACCEPTED
 *   - This does NOT change any Requirement status
 */
import type { Requirement } from "./requirement.js";
import type { Question } from "./question.js";
import type { Provenance } from "./provenance.js";

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

/**
 * A Decision records an architectural or product choice made during refinement.
 * Every decision must have first-class provenance.
 */
export interface Decision {
  id: string;
  context: string;
  decision: string;
  rationale: string;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// Specification lifecycle
// ---------------------------------------------------------------------------

/**
 * DRAFT              — active refinement in progress, not ready for execution
 * READY_FOR_EXECUTION — all blocking questions resolved; ready but not yet approved
 * ACCEPTED           — user has explicitly approved via `yokai approve`
 *
 * NOTE: ACCEPTED does not canonicalize ASSUMED requirements to CONFIRMED.
 * The per-requirement status is the single source of truth for each requirement's
 * confirmation state.
 */
export type SpecificationStatus =
  | "DRAFT"
  | "READY_FOR_EXECUTION"
  | "ACCEPTED";

// ---------------------------------------------------------------------------
// Intent
// ---------------------------------------------------------------------------

export interface Intent {
  raw_input: string;
  refined_goal?: string | undefined;
}

// ---------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------

export interface Actor {
  id: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Specification
// ---------------------------------------------------------------------------

export interface SpecificationMetadata {
  project_name: string;
  created_at: string;   // ISO 8601
  updated_at: string;   // ISO 8601
  status: SpecificationStatus;
}

export interface Specification {
  version: string;
  metadata: SpecificationMetadata;
  intent: Intent;
  actors: Actor[];
  requirements: Requirement[];
  decisions: Decision[];
  open_questions: Question[];
  out_of_scope: string[];
}
