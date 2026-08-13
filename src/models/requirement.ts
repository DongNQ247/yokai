/**
 * Requirement domain model.
 *
 * A Requirement is the atomic unit of the Specification.
 * Its lifecycle (RequirementStatus) is independent of the
 * Specification lifecycle (SpecificationStatus).
 */
import type { Provenance } from "./provenance.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RequirementType =
  | "FEATURE"
  | "BUSINESS_RULE"
  | "CONSTRAINT"
  | "NON_FUNCTIONAL";

/**
 * State machine:
 *
 *   CANDIDATE
 *     ├─ agent assumes / repo inference → ASSUMED
 *     └─ needs clarification           → QUESTION_PENDING
 *
 *   QUESTION_PENDING
 *     └─ user answers                  → CONFIRMED
 *
 *   ASSUMED
 *     ├─ user explicitly confirms      → CONFIRMED
 *     └─ user rejects                  → REJECTED
 *
 *   CONFIRMED
 *     └─ user changes intent           → SUPERSEDED
 *
 *   REJECTED   (terminal)
 *   SUPERSEDED (terminal)
 */
export type RequirementStatus =
  | "CANDIDATE"
  | "ASSUMED"
  | "QUESTION_PENDING"
  | "CONFIRMED"
  | "REJECTED"
  | "SUPERSEDED";

/** BDD-style acceptance criterion (Given / When / Then). */
export interface AcceptanceCriteria {
  given: string;
  when: string;
  then: string;
}

/** A single, verifiable requirement in the Specification. */
export interface Requirement {
  /** Unique identifier, e.g. "REQ-001" or "FEAT-AUTH-001". */
  id: string;
  type: RequirementType;
  title: string;
  description: string;
  status: RequirementStatus;
  provenance: Provenance;
  /** IDs of requirements that must be satisfied before this one. */
  dependencies: string[];
  acceptance_criteria: AcceptanceCriteria[];
}

// ---------------------------------------------------------------------------
// Valid state transitions (enforced by the Specification Engine)
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<RequirementStatus, RequirementStatus[]> = {
  CANDIDATE: ["ASSUMED", "QUESTION_PENDING"],
  ASSUMED: ["CONFIRMED", "REJECTED"],
  QUESTION_PENDING: ["CONFIRMED"],
  CONFIRMED: ["SUPERSEDED"],
  REJECTED: [],
  SUPERSEDED: [],
};

/**
 * Returns true if the transition from `from` → `to` is allowed
 * by the Requirement state machine.
 */
export function isValidTransition(
  from: RequirementStatus,
  to: RequirementStatus,
): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed !== undefined && (allowed as RequirementStatus[]).includes(to);
}

/** Terminal states — a requirement in these states cannot be mutated further. */
export const TERMINAL_STATES: Set<RequirementStatus> = new Set([
  "REJECTED",
  "SUPERSEDED",
]);
