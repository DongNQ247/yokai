/**
 * Public model exports.
 * Import from "@yokai/models" or "src/models/index.ts".
 */

export type { Provenance, ProvenanceSource, ConfidenceLevel } from "./provenance.js";

export type {
  Requirement,
  RequirementType,
  RequirementStatus,
  AcceptanceCriteria,
} from "./requirement.js";
export { isValidTransition, TERMINAL_STATES } from "./requirement.js";

export type { Question, QuestionType, QuestionImpact, QuestionPriority } from "./question.js";

export type {
  Specification,
  SpecificationMetadata,
  SpecificationStatus,
  Decision,
  Intent,
  Actor,
} from "./specification.js";

export type {
  SpecificationUpdate,
  RequirementPatch,
  SupersedeOperation,
  QuestionResolution,
  AcceptanceCriteriaAddition,
} from "./update.js";

export type {
  HistoryEvent,
  HistoryActor,
  HistoryEventType,
  RequirementEventData,
  QuestionEventData,
  QuestionResolvedData,
  UpdateEventData,
  SpecificationApprovedData,
} from "./history.js";

export type { FileChange, ExecutionResponse } from "./execution.schema.js";
export { ExecutionResponseSchema, FileChangeSchema, parseExecutionResponse } from "./execution.schema.js";
