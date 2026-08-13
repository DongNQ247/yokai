/**
 * Proposal Validation — Stage A of the 2-stage validation pipeline.
 *
 * Validates the structural and referential integrity of a SpecificationUpdate
 * BEFORE the Engine attempts to apply it. This catches LLM hallucinations
 * (bad IDs, invalid enum values, illegal state transitions) early.
 *
 * If proposal validation fails, the update is rejected immediately
 * and no mutation attempt is made on the Specification.
 */
import type { SpecificationUpdate, RequirementPatch, SupersedeOperation } from "../models/update.js";
import type { Specification } from "../models/specification.js";
import type { Requirement } from "../models/requirement.js";
import { isValidTransition, TERMINAL_STATES } from "../models/requirement.js";

export interface ValidationError {
  code: string;
  message: string;
  field?: string | undefined;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ---------------------------------------------------------------------------
// Individual validators
// ---------------------------------------------------------------------------

function validateAddRequirements(
  items: Requirement[],
  spec: Specification,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const existingIds = new Set(spec.requirements.map((r) => r.id));
  const seenInUpdate = new Set<string>();

  for (const req of items) {
    if (!req.id) {
      errors.push({ code: "MISSING_ID", message: "Requirement is missing an id.", field: "add_requirements" });
    } else if (existingIds.has(req.id)) {
      errors.push({ code: "DUPLICATE_ID", message: `Requirement id "${req.id}" already exists in the specification.`, field: `add_requirements.${req.id}` });
    } else if (seenInUpdate.has(req.id)) {
      errors.push({ code: "DUPLICATE_IN_UPDATE", message: `Requirement id "${req.id}" appears more than once in this update.`, field: `add_requirements.${req.id}` });
    }
    seenInUpdate.add(req.id);

    if (!req.title) {
      errors.push({ code: "MISSING_TITLE", message: `Requirement "${req.id}" is missing a title.`, field: `add_requirements.${req.id}.title` });
    }
    if (!req.description) {
      errors.push({ code: "MISSING_DESCRIPTION", message: `Requirement "${req.id}" is missing a description.`, field: `add_requirements.${req.id}.description` });
    }
    if (!req.provenance) {
      errors.push({ code: "MISSING_PROVENANCE", message: `Requirement "${req.id}" is missing provenance.`, field: `add_requirements.${req.id}.provenance` });
    }
    // New requirements must start in CANDIDATE or ASSUMED (never CONFIRMED/SUPERSEDED/REJECTED)
    const VALID_INITIAL_STATUSES: string[] = ["CANDIDATE", "ASSUMED", "QUESTION_PENDING"];
    if (!VALID_INITIAL_STATUSES.includes(req.status)) {
      errors.push({ code: "INVALID_INITIAL_STATUS", message: `New requirement "${req.id}" must start in CANDIDATE, ASSUMED, or QUESTION_PENDING — got "${req.status}".`, field: `add_requirements.${req.id}.status` });
    }
  }
  return errors;
}

function validateModifyRequirements(
  patches: RequirementPatch[],
  spec: Specification,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const existingById = new Map(spec.requirements.map((r) => [r.id, r]));
  const seenInUpdate = new Set<string>();

  for (const patch of patches) {
    if (!patch.id) {
      errors.push({ code: "MISSING_ID", message: "RequirementPatch is missing an id.", field: "modify_requirements" });
      continue;
    }
    if (seenInUpdate.has(patch.id)) {
      errors.push({ code: "DUPLICATE_PATCH", message: `Multiple patches for requirement "${patch.id}" in same update.`, field: `modify_requirements.${patch.id}` });
    }
    seenInUpdate.add(patch.id);

    const existing = existingById.get(patch.id);
    if (!existing) {
      errors.push({ code: "UNKNOWN_ID", message: `Requirement "${patch.id}" not found in the specification.`, field: `modify_requirements.${patch.id}` });
      continue;
    }
    if (TERMINAL_STATES.has(existing.status)) {
      errors.push({ code: "TERMINAL_STATE", message: `Requirement "${patch.id}" is in terminal state "${existing.status}" and cannot be modified.`, field: `modify_requirements.${patch.id}` });
    }
    if (!patch.reason) {
      errors.push({ code: "MISSING_REASON", message: `Patch for "${patch.id}" must include a reason.`, field: `modify_requirements.${patch.id}.reason` });
    }

    // Validate status transition if proposed
    if (patch.changes.status !== undefined) {
      if (!isValidTransition(existing.status, patch.changes.status)) {
        errors.push({
          code: "INVALID_TRANSITION",
          message: `Invalid status transition for "${patch.id}": ${existing.status} → ${patch.changes.status}`,
          field: `modify_requirements.${patch.id}.changes.status`,
        });
      }
    }
  }
  return errors;
}

function validateSupersedeOperations(
  ops: SupersedeOperation[],
  spec: Specification,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const existingById = new Map(spec.requirements.map((r) => [r.id, r]));

  for (const op of ops) {
    if (!op.old_id) {
      errors.push({ code: "MISSING_OLD_ID", message: "SupersedeOperation is missing old_id.", field: "supersede_requirements" });
      continue;
    }
    const existing = existingById.get(op.old_id);
    if (!existing) {
      errors.push({ code: "UNKNOWN_ID", message: `Requirement "${op.old_id}" not found.`, field: `supersede_requirements.${op.old_id}` });
      continue;
    }
    if (!isValidTransition(existing.status, "SUPERSEDED")) {
      errors.push({ code: "INVALID_TRANSITION", message: `Cannot supersede "${op.old_id}": ${existing.status} → SUPERSEDED is invalid.`, field: `supersede_requirements.${op.old_id}` });
    }
    if (!op.reason) {
      errors.push({ code: "MISSING_REASON", message: `SupersedeOperation for "${op.old_id}" must include a reason.`, field: `supersede_requirements.${op.old_id}.reason` });
    }
    if (!op.new_requirements || op.new_requirements.length === 0) {
      errors.push({ code: "MISSING_NEW_REQUIREMENTS", message: `SupersedeOperation for "${op.old_id}" must provide at least one new requirement.`, field: `supersede_requirements.${op.old_id}.new_requirements` });
    }
  }
  return errors;
}

function validateResolveQuestions(
  resolutions: { question_id: string; answer: string }[],
  spec: Specification,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const openIds = new Set(spec.open_questions.map((q) => q.id));

  for (const res of resolutions) {
    if (!res.question_id) {
      errors.push({ code: "MISSING_QUESTION_ID", message: "QuestionResolution missing question_id.", field: "resolve_questions" });
    } else if (!openIds.has(res.question_id)) {
      errors.push({ code: "UNKNOWN_QUESTION", message: `Question "${res.question_id}" not found in open_questions.`, field: `resolve_questions.${res.question_id}` });
    }
    if (!res.answer) {
      errors.push({ code: "MISSING_ANSWER", message: `Resolution for "${res.question_id}" has an empty answer.`, field: `resolve_questions.${res.question_id}.answer` });
    }
  }
  return errors;
}

function validateAcceptanceCriteriaAdditions(
  additions: { requirement_id: string; criteria: unknown[] }[],
  spec: Specification,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const existingById = new Map(spec.requirements.map((r) => [r.id, r]));

  for (const addition of additions) {
    const existing = existingById.get(addition.requirement_id);
    if (!existing) {
      errors.push({ code: "UNKNOWN_ID", message: `Requirement "${addition.requirement_id}" not found.`, field: `add_acceptance_criteria.${addition.requirement_id}` });
    }
    if (!addition.criteria || addition.criteria.length === 0) {
      errors.push({ code: "EMPTY_CRITERIA", message: `AcceptanceCriteriaAddition for "${addition.requirement_id}" has no criteria.`, field: `add_acceptance_criteria.${addition.requirement_id}.criteria` });
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Stage A: Validate a SpecificationUpdate proposal before applying it.
 * Returns a ValidationResult; if `valid: false`, the Engine must reject
 * the proposal and record an `update.rejected` history event.
 */
export function validateProposal(
  update: SpecificationUpdate,
  spec: Specification,
): ValidationResult {
  const errors: ValidationError[] = [];

  if (update.add_requirements) {
    errors.push(...validateAddRequirements(update.add_requirements, spec));
  }
  if (update.modify_requirements) {
    errors.push(...validateModifyRequirements(update.modify_requirements, spec));
  }
  if (update.supersede_requirements) {
    errors.push(...validateSupersedeOperations(update.supersede_requirements, spec));
  }
  if (update.resolve_questions) {
    errors.push(...validateResolveQuestions(update.resolve_questions, spec));
  }
  if (update.add_acceptance_criteria) {
    errors.push(...validateAcceptanceCriteriaAdditions(update.add_acceptance_criteria, spec));
  }

  return { valid: errors.length === 0, errors };
}
