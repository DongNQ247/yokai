/**
 * SpecificationUpdate: the only mechanism by which the LLM may propose
 * changes to the canonical Specification.
 *
 * The LLM outputs a SpecificationUpdate. The Specification Engine is the
 * only component authorised to apply this proposal after validation.
 *
 * Design rules:
 *  - Flat structure: no nested SpecificationUpdate (no recursive update graph)
 *  - Every mutation carries an explicit `reason` for provenance & history
 *  - The Engine resolves QuestionResolutions into the appropriate state
 *    transitions; the LLM does NOT encode that logic
 */
import type { Requirement, RequirementStatus, AcceptanceCriteria } from "./requirement.js";
import type { Question } from "./question.js";
import type { Decision } from "./specification.js";

// ---------------------------------------------------------------------------
// Patch types (explicit, typed mutations)
// ---------------------------------------------------------------------------

/**
 * Describes the fields that may be patched on an existing Requirement.
 * Every patch must include a `reason` to maintain full audit history.
 */
export interface RequirementPatch {
  id: string;
  changes: {
    title?: string | undefined;
    description?: string | undefined;
    status?: RequirementStatus | undefined;
    dependencies?: string[] | undefined;
  };
  /** Human-readable explanation of why this change was proposed. */
  reason: string;
}

/**
 * Replaces an existing requirement with one or more new requirements.
 * Typically used when a CONFIRMED requirement is revised (→ SUPERSEDED)
 * and new requirements are derived from it.
 */
export interface SupersedeOperation {
  /** ID of the existing requirement to mark as SUPERSEDED. */
  old_id: string;
  new_requirements: Requirement[];
  reason: string;
}

/**
 * Records a user's answer to a queued Question.
 * The Engine is responsible for deriving state transitions from this answer.
 */
export interface QuestionResolution {
  question_id: string;
  answer: string;
}

/** Adds AcceptanceCriteria to an existing Requirement. */
export interface AcceptanceCriteriaAddition {
  requirement_id: string;
  criteria: AcceptanceCriteria[];
}

// ---------------------------------------------------------------------------
// SpecificationUpdate (flat, non-recursive)
// ---------------------------------------------------------------------------

/**
 * A structured proposal from the ModelProvider.
 *
 * The Specification Engine applies this proposal after a 2-stage validation:
 *   1. Proposal Validation  — checks schema, enums, referenced IDs, transitions
 *   2. Canonical Validation — checks semantic consistency of the resulting state
 *
 * If canonical validation fails, the mutation is rolled back and the event
 * is NOT committed to history.
 */
export interface SpecificationUpdate {
  add_requirements?: Requirement[] | undefined;
  modify_requirements?: RequirementPatch[] | undefined;
  supersede_requirements?: SupersedeOperation[] | undefined;
  resolve_questions?: QuestionResolution[] | undefined;
  add_decisions?: Decision[] | undefined;
  add_acceptance_criteria?: AcceptanceCriteriaAddition[] | undefined;
  add_open_questions?: Question[] | undefined;
}
