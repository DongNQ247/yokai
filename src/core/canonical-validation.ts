/**
 * Canonical State Validation — Stage B of the 2-stage validation pipeline.
 *
 * Validates the *resulting* Specification AFTER the Engine has applied
 * a SpecificationUpdate in-memory. If this validation fails, the mutation
 * is rolled back and NOT committed to the canonical spec or history.
 *
 * Invariant enforced here:
 *   "No invalid canonical state may ever be persisted."
 */
import type { Specification } from "../models/specification.js";
import type { ValidationError, ValidationResult } from "./proposal-validation.js";

// ---------------------------------------------------------------------------
// Individual canonical checks
// ---------------------------------------------------------------------------

/**
 * FEATURE requirements that are ASSUMED or CONFIRMED must have at least one
 * acceptance criterion. CANDIDATE features are still being evaluated and
 * may not have criteria yet.
 */
function checkFeatureTestability(spec: Specification): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const req of spec.requirements) {
    if (
      req.type === "FEATURE" &&
      (req.status === "ASSUMED" || req.status === "CONFIRMED") &&
      req.acceptance_criteria.length === 0
    ) {
      errors.push({
        code: "MISSING_ACCEPTANCE_CRITERIA",
        message: `FEATURE "${req.id}" ("${req.title}") in status "${req.status}" must have at least one acceptance criterion.`,
        field: `requirements.${req.id}.acceptance_criteria`,
      });
    }
  }
  return errors;
}

/**
 * All dependency IDs must reference requirements that exist and are not REJECTED.
 */
function checkDependencyGraph(spec: Specification): ValidationError[] {
  const errors: ValidationError[] = [];
  const validIds = new Set(
    spec.requirements
      .filter((r) => r.status !== "REJECTED")
      .map((r) => r.id),
  );

  for (const req of spec.requirements) {
    for (const dep of req.dependencies) {
      if (!validIds.has(dep)) {
        errors.push({
          code: "INVALID_DEPENDENCY",
          message: `Requirement "${req.id}" depends on "${dep}" which does not exist or is REJECTED.`,
          field: `requirements.${req.id}.dependencies`,
        });
      }
    }
  }
  return errors;
}

/**
 * An ASSUMED requirement must not logically contradict a CONFIRMED requirement.
 * Currently implemented as a duplicate-description check; will be enhanced
 * when LLM-based semantic checking is introduced.
 */
function checkContradictions(spec: Specification): ValidationError[] {
  const errors: ValidationError[] = [];
  const confirmedDescriptions = new Map<string, string>();

  for (const req of spec.requirements) {
    if (req.status === "CONFIRMED") {
      confirmedDescriptions.set(req.description.toLowerCase().trim(), req.id);
    }
  }

  for (const req of spec.requirements) {
    if (req.status === "ASSUMED") {
      const key = req.description.toLowerCase().trim();
      const conflictingId = confirmedDescriptions.get(key);
      if (conflictingId && conflictingId !== req.id) {
        errors.push({
          code: "POSSIBLE_CONTRADICTION",
          message: `ASSUMED requirement "${req.id}" has an identical description to CONFIRMED requirement "${conflictingId}". This may indicate a contradiction or duplicate.`,
          field: `requirements.${req.id}`,
        });
      }
    }
  }
  return errors;
}

/**
 * Specification must not have blocking questions still open when
 * status is READY_FOR_EXECUTION or ACCEPTED.
 */
function checkBlockingQuestions(spec: Specification): ValidationError[] {
  const errors: ValidationError[] = [];
  const isBlocked =
    spec.metadata.status === "READY_FOR_EXECUTION" ||
    spec.metadata.status === "ACCEPTED";

  if (isBlocked) {
    for (const q of spec.open_questions) {
      if (q.blocking) {
        errors.push({
          code: "UNRESOLVED_BLOCKING_QUESTION",
          message: `Blocking question "${q.id}" ("${q.topic}") must be resolved before the specification can be ${spec.metadata.status}.`,
          field: `open_questions.${q.id}`,
        });
      }
    }
  }
  return errors;
}

/**
 * Every requirement's provenance must be present.
 */
function checkProvenance(spec: Specification): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const req of spec.requirements) {
    if (!req.provenance || !req.provenance.source) {
      errors.push({
        code: "MISSING_PROVENANCE",
        message: `Requirement "${req.id}" is missing provenance.`,
        field: `requirements.${req.id}.provenance`,
      });
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Stage B: Validate the resulting Specification after applying a proposal.
 * If this fails, the Engine must rollback and not persist the mutation.
 */
export function validateCanonicalState(spec: Specification): ValidationResult {
  const errors: ValidationError[] = [
    ...checkFeatureTestability(spec),
    ...checkDependencyGraph(spec),
    ...checkContradictions(spec),
    ...checkBlockingQuestions(spec),
    ...checkProvenance(spec),
  ];

  return { valid: errors.length === 0, errors };
}
