/**
 * History Event model.
 *
 * `.yokai/history.jsonl` is an append-only event log.
 * No event is ever deleted or modified — only new events are appended.
 *
 * `correlation_id` groups all events that belong to the same
 * refinement cycle (a single `yokai "<intent>"` or `yokai refine` run),
 * enabling causal tracing of agent behavior.
 *
 * `actor` distinguishes the origin of each action:
 *   USER   — explicit human action (e.g., answering a question, approving)
 *   MODEL  — LLM proposal (e.g., proposed requirements, questions)
 *   ENGINE — deterministic engine applying/validating a proposal
 *   SYSTEM — infrastructure events (e.g., session start/stop)
 */

export type HistoryActor = "USER" | "MODEL" | "ENGINE" | "SYSTEM";

export type HistoryEventType =
  | "session.started"
  | "requirement.created"
  | "requirement.modified"
  | "requirement.confirmed"
  | "requirement.rejected"
  | "requirement.superseded"
  | "question.created"
  | "question.resolved"
  | "user.answered"
  | "decision.recorded"
  | "update.proposed"
  | "update.validated"
  | "update.rejected"
  | "update.applied"
  | "specification.approved";

export interface HistoryEvent<T = unknown> {
  id: string;
  type: HistoryEventType;
  timestamp: string; // ISO 8601
  actor: HistoryActor;
  /**
   * Groups related events from the same refinement cycle.
   * E.g., a user intent → model proposal → engine apply all share one ID.
   */
  correlation_id?: string | undefined;
  data: T;
}

// ---------------------------------------------------------------------------
// Typed event data payloads
// ---------------------------------------------------------------------------

export interface RequirementEventData {
  id: string;
  title?: string | undefined;
  from_status?: string | undefined;
  to_status?: string | undefined;
  reason?: string | undefined;
}

export interface QuestionEventData {
  id: string;
  topic: string;
  blocking: boolean;
}

export interface QuestionResolvedData {
  question_id: string;
  answer: string;
}

export interface UpdateEventData {
  add_count?: number | undefined;
  modify_count?: number | undefined;
  supersede_count?: number | undefined;
  resolve_count?: number | undefined;
  errors?: string[] | undefined;
}

export interface SpecificationApprovedData {
  version: string;
  requirement_count: number;
  assumed_count: number;
}
