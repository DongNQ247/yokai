import { z } from "zod";
import type { SpecificationUpdate } from "./update.js";

// Requirement Status Enum
const RequirementStatusSchema = z.enum([
  "CANDIDATE",
  "ASSUMED",
  "QUESTION_PENDING",
  "CONFIRMED",
  "REJECTED",
  "SUPERSEDED",
]);

// Acceptance Criteria
const AcceptanceCriteriaSchema = z.object({
  given: z.string(),
  when: z.string(),
  then: z.string(),
});

// Requirement Patch
const RequirementPatchSchema = z.object({
  id: z.string(),
  changes: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    status: RequirementStatusSchema.optional(),
    dependencies: z.array(z.string()).optional(),
  }).strict(), // Ensure no extra unknown fields are passed in changes
  reason: z.string(),
});

// Requirement
const RequirementSchema = z.object({
  id: z.string(),
  type: z.enum(["FEATURE", "BUSINESS_RULE", "CONSTRAINT", "NON_FUNCTIONAL"]),
  title: z.string(),
  description: z.string(),
  status: RequirementStatusSchema,
  provenance: z.object({
    source: z.enum(["USER_EXPLICIT", "USER_CLARIFICATION", "REPOSITORY_INFERENCE", "AGENT_ASSUMPTION"]),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH", "ABSOLUTE"]),
    reference: z.string().optional(),
  }),
  dependencies: z.array(z.string()).default([]),
  acceptance_criteria: z.array(AcceptanceCriteriaSchema).default([]),
});

// Supersede Operation
const SupersedeOperationSchema = z.object({
  old_id: z.string(),
  new_requirements: z.array(RequirementSchema),
  reason: z.string(),
});

// Question Resolution
const QuestionResolutionSchema = z.object({
  question_id: z.string(),
  answer: z.string(),
});

// Decision
const DecisionSchema = z.object({
  id: z.string(),
  context: z.string(),
  decision: z.string(),
  rationale: z.string(),
  provenance: z.object({
    source: z.enum(["USER_EXPLICIT", "USER_CLARIFICATION", "REPOSITORY_INFERENCE", "AGENT_ASSUMPTION"]),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH", "ABSOLUTE"]),
    reference: z.string().optional(),
  }),
});

// Acceptance Criteria Addition
const AcceptanceCriteriaAdditionSchema = z.object({
  requirement_id: z.string(),
  criteria: z.array(AcceptanceCriteriaSchema),
});

// Question
const QuestionSchema = z.object({
  id: z.string(),
  topic: z.string(),
  context: z.string(),
  type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "OPEN_ENDED", "BOOLEAN"]),
  options: z.array(z.string()).optional(),
  suggested_answer: z.string().optional(),
  impact: z.enum(["HIGH", "MEDIUM", "LOW"]),
  blocking: z.boolean(),
  priority: z.object({
    score: z.number(),
    reason: z.string(),
  }),
});

// Specification Update Schema
export const SpecificationUpdateSchema = z.object({
  add_requirements: z.array(RequirementSchema).optional(),
  modify_requirements: z.array(RequirementPatchSchema).optional(),
  supersede_requirements: z.array(SupersedeOperationSchema).optional(),
  resolve_questions: z.array(QuestionResolutionSchema).optional(),
  add_decisions: z.array(DecisionSchema).optional(),
  add_acceptance_criteria: z.array(AcceptanceCriteriaAdditionSchema).optional(),
  add_open_questions: z.array(QuestionSchema).optional(),
}).strict(); // Reject extra fields entirely

/**
 * Validates and parses raw JSON from the LLM into a SpecificationUpdate.
 * Strips unknown fields only if explicitly allowed, but here we use strict
 * to force the LLM to adhere to the requested schema.
 * 
 * @throws {z.ZodError} If validation fails.
 */
export function parseSpecificationUpdate(data: unknown): SpecificationUpdate {
  return SpecificationUpdateSchema.parse(data) as SpecificationUpdate;
}
