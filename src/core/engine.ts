/**
 * Specification Engine — the only component authorised to mutate
 * the canonical Specification.
 *
 * Architecture:
 *
 *   SpecificationUpdate (from ModelProvider)
 *         ↓
 *   Stage A: Proposal Validation
 *         ↓
 *   Apply (in-memory clone)
 *         ↓
 *   Stage B: Canonical State Validation
 *         ↓
 *   Commit → append to history
 *   (if canonical validation fails → rollback, log rejection event)
 *
 * The Engine never calls the LLM. It enforces the invariant:
 *   "No invalid canonical state may ever be persisted."
 */
import type { Specification, SpecificationStatus } from "../models/specification.js";
import type { SpecificationUpdate } from "../models/update.js";
import type { Requirement } from "../models/requirement.js";
import type {
  HistoryEvent,
  UpdateEventData,
  RequirementEventData,
  QuestionResolvedData,
  SpecificationApprovedData,
  ExecutionEventData,
} from "../models/history.js";
import type { ExecutionResult } from "../providers/execution.js";
import { validateProposal } from "./proposal-validation.js";
import { validateCanonicalState } from "./canonical-validation.js";
import type { ValidationResult } from "./proposal-validation.js";

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Deep-clone a Specification so mutations never affect the canonical state. */
function cloneSpec(spec: Specification): Specification {
  return JSON.parse(JSON.stringify(spec)) as Specification;
}

// ---------------------------------------------------------------------------
// Engine result types
// ---------------------------------------------------------------------------

export interface EngineSuccess {
  ok: true;
  specification: Specification;
  events: HistoryEvent[];
}

export interface EngineFailure {
  ok: false;
  errors: string[];
  events: HistoryEvent[];
}

export type EngineResult = EngineSuccess | EngineFailure;

// ---------------------------------------------------------------------------
// Apply logic (in-memory, on a clone)
// ---------------------------------------------------------------------------

function applyUpdate(
  spec: Specification,
  update: SpecificationUpdate,
  correlationId: string,
): { spec: Specification; events: HistoryEvent[] } {
  const events: HistoryEvent[] = [];

  // --- add_requirements ---
  for (const req of update.add_requirements ?? []) {
    spec.requirements.push(req);
    events.push({
      id: generateId("evt"),
      type: "requirement.created",
      timestamp: nowIso(),
      actor: "ENGINE",
      correlation_id: correlationId,
      data: {
        id: req.id,
        title: req.title,
        to_status: req.status,
      } satisfies RequirementEventData,
    });
  }

  // --- modify_requirements ---
  for (const patch of update.modify_requirements ?? []) {
    const req = spec.requirements.find((r) => r.id === patch.id);
    if (!req) continue; // already guarded by proposal validation

    const fromStatus = req.status;
    if (patch.changes.title !== undefined) req.title = patch.changes.title;
    if (patch.changes.description !== undefined) req.description = patch.changes.description;
    if (patch.changes.dependencies !== undefined) req.dependencies = patch.changes.dependencies;
    if (patch.changes.status !== undefined) {
      req.status = patch.changes.status;
      events.push({
        id: generateId("evt"),
        type: "requirement.modified",
        timestamp: nowIso(),
        actor: "ENGINE",
        correlation_id: correlationId,
        data: {
          id: req.id,
          from_status: fromStatus,
          to_status: req.status,
          reason: patch.reason,
        } satisfies RequirementEventData,
      });
    } else {
      events.push({
        id: generateId("evt"),
        type: "requirement.modified",
        timestamp: nowIso(),
        actor: "ENGINE",
        correlation_id: correlationId,
        data: { id: req.id, reason: patch.reason } satisfies RequirementEventData,
      });
    }
  }

  // --- supersede_requirements ---
  for (const op of update.supersede_requirements ?? []) {
    const old = spec.requirements.find((r) => r.id === op.old_id);
    if (!old) continue;
    old.status = "SUPERSEDED";
    events.push({
      id: generateId("evt"),
      type: "requirement.superseded",
      timestamp: nowIso(),
      actor: "ENGINE",
      correlation_id: correlationId,
      data: { id: old.id, reason: op.reason } satisfies RequirementEventData,
    });
    for (const newReq of op.new_requirements) {
      spec.requirements.push(newReq);
      events.push({
        id: generateId("evt"),
        type: "requirement.created",
        timestamp: nowIso(),
        actor: "ENGINE",
        correlation_id: correlationId,
        data: { id: newReq.id, title: newReq.title, to_status: newReq.status } satisfies RequirementEventData,
      });
    }
  }

  // --- resolve_questions ---
  for (const res of update.resolve_questions ?? []) {
    const idx = spec.open_questions.findIndex((q) => q.id === res.question_id);
    if (idx === -1) continue;
    spec.open_questions.splice(idx, 1);
    events.push({
      id: generateId("evt"),
      type: "question.resolved",
      timestamp: nowIso(),
      actor: "USER",
      correlation_id: correlationId,
      data: { question_id: res.question_id, answer: res.answer } satisfies QuestionResolvedData,
    });
  }

  // --- add_decisions ---
  for (const decision of update.add_decisions ?? []) {
    spec.decisions.push(decision);
    events.push({
      id: generateId("evt"),
      type: "decision.recorded",
      timestamp: nowIso(),
      actor: "ENGINE",
      correlation_id: correlationId,
      data: { id: decision.id, context: decision.context },
    });
  }

  // --- add_acceptance_criteria ---
  for (const addition of update.add_acceptance_criteria ?? []) {
    const req = spec.requirements.find((r) => r.id === addition.requirement_id);
    if (!req) continue;
    req.acceptance_criteria.push(...addition.criteria);
  }

  // --- add_open_questions ---
  for (const question of update.add_open_questions ?? []) {
    spec.open_questions.push(question);
    events.push({
      id: generateId("evt"),
      type: "question.created",
      timestamp: nowIso(),
      actor: "MODEL",
      correlation_id: correlationId,
      data: {
        id: question.id,
        topic: question.topic,
        blocking: question.blocking,
      },
    });
  }

  // Update spec timestamp
  spec.metadata.updated_at = nowIso();

  return { spec, events };
}

// ---------------------------------------------------------------------------
// Specification Engine
// ---------------------------------------------------------------------------

export class SpecificationEngine {
  private spec: Specification;
  private history: HistoryEvent[];

  constructor(spec: Specification, history: HistoryEvent[] = []) {
    this.spec = cloneSpec(spec);
    this.history = [...history];
  }

  /**
   * Apply a SpecificationUpdate proposal through the 2-stage validation pipeline.
   *
   * Stage A: Proposal Validation (structural / referential)
   * Stage B: Canonical State Validation (semantic / invariants)
   *
   * Rolls back if Stage B fails. Only commits on full success.
   */
  apply(update: SpecificationUpdate, correlationId?: string): EngineResult {
    const cid = correlationId ?? generateId("cycle");
    const proposalEvents: HistoryEvent[] = [];

    // Record the proposal arrival
    proposalEvents.push({
      id: generateId("evt"),
      type: "update.proposed",
      timestamp: nowIso(),
      actor: "MODEL",
      correlation_id: cid,
      data: {
        add_count: update.add_requirements?.length ?? 0,
        modify_count: update.modify_requirements?.length ?? 0,
        supersede_count: update.supersede_requirements?.length ?? 0,
        resolve_count: update.resolve_questions?.length ?? 0,
      } satisfies UpdateEventData,
    });

    // --- Stage A: Proposal Validation ---
    const proposalResult: ValidationResult = validateProposal(update, this.spec);
    if (!proposalResult.valid) {
      const rejectionEvent: HistoryEvent<UpdateEventData> = {
        id: generateId("evt"),
        type: "update.rejected",
        timestamp: nowIso(),
        actor: "ENGINE",
        correlation_id: cid,
        data: { errors: proposalResult.errors.map((e) => `[${e.code}] ${e.message}`) },
      };
      return {
        ok: false,
        errors: proposalResult.errors.map((e) => `[${e.code}] ${e.message}`),
        events: [...proposalEvents, rejectionEvent],
      };
    }

    proposalEvents.push({
      id: generateId("evt"),
      type: "update.validated",
      timestamp: nowIso(),
      actor: "ENGINE",
      correlation_id: cid,
      data: {},
    });

    // --- Apply on in-memory clone ---
    const candidate = cloneSpec(this.spec);
    const { spec: mutated, events: mutationEvents } = applyUpdate(candidate, update, cid);

    // --- Stage B: Canonical State Validation ---
    const canonicalResult: ValidationResult = validateCanonicalState(mutated);
    if (!canonicalResult.valid) {
      // Rollback — do not touch this.spec
      const rejectionEvent: HistoryEvent<UpdateEventData> = {
        id: generateId("evt"),
        type: "update.rejected",
        timestamp: nowIso(),
        actor: "ENGINE",
        correlation_id: cid,
        data: { errors: canonicalResult.errors.map((e) => `[${e.code}] ${e.message}`) },
      };
      return {
        ok: false,
        errors: canonicalResult.errors.map((e) => `[${e.code}] ${e.message}`),
        events: [...proposalEvents, ...mutationEvents, rejectionEvent],
      };
    }

    // --- Commit ---
    const commitTimestamp = mutated.metadata.updated_at;
    const commitEvent: HistoryEvent = {
      id: generateId("evt"),
      type: "update.applied",
      timestamp: commitTimestamp,
      actor: "ENGINE",
      correlation_id: cid,
      data: {},
    };

    return {
      ok: true,
      specification: mutated,
      events: [...proposalEvents, ...mutationEvents, commitEvent],
    };
  }

  /**
   * Commits an applied result to the engine's in-memory state.
   * This should be called only AFTER successful persistence to the store.
   */
  commit(spec: Specification, newEvents: HistoryEvent[]): void {
    this.spec = cloneSpec(spec);
    this.history.push(...newEvents);
  }

  /**
   * Approve the specification: DRAFT → ACCEPTED.
   * Does NOT change any Requirement status. ASSUMED requirements remain ASSUMED.
   */
  approve(): EngineResult {
    const cid = generateId("cycle");

    if (this.spec.metadata.status === "ACCEPTED") {
      return { ok: false, errors: ["Specification is already ACCEPTED."], events: [] };
    }

    // Check for blocking questions before accepting
    const blockingQuestions = this.spec.open_questions.filter((q) => q.blocking);
    if (blockingQuestions.length > 0) {
      const ids = blockingQuestions.map((q) => q.id).join(", ");
      return {
        ok: false,
        errors: [`Cannot approve: blocking questions must be resolved first: ${ids}`],
        events: [],
      };
    }

    const clonedSpec = cloneSpec(this.spec);
    const prevStatus: SpecificationStatus = clonedSpec.metadata.status;
    clonedSpec.metadata.status = "ACCEPTED";
    clonedSpec.metadata.updated_at = nowIso();

    const assumedCount = clonedSpec.requirements.filter((r) => r.status === "ASSUMED").length;

    const event: HistoryEvent<SpecificationApprovedData> = {
      id: generateId("evt"),
      type: "specification.approved",
      timestamp: clonedSpec.metadata.updated_at,
      actor: "USER",
      correlation_id: cid,
      data: {
        version: clonedSpec.version,
        requirement_count: clonedSpec.requirements.length,
        assumed_count: assumedCount,
      },
    };

    // Warn in the result data if there are still ASSUMED requirements
    const warnings =
      assumedCount > 0
        ? [`Specification ACCEPTED with ${assumedCount} ASSUMED requirement(s). These remain unconfirmed. Previous status: ${prevStatus}.`]
        : [];

    return {
      ok: true,
      specification: clonedSpec,
      events: [event],
      // Note: warnings are embedded in events data; callers should surface them
      ...(warnings.length > 0 ? { warnings } : {}),
    } as EngineSuccess & { warnings?: string[] };
  }

  /** Returns the current canonical Specification (immutable copy). */
  getSpecification(): Specification {
    return cloneSpec(this.spec);
  }

  /**
   * Records the outcome of an execution run to history.
   * Does not mutate the canonical Specification state.
   */
  recordExecution(result: ExecutionResult, correlationId?: string): { events: HistoryEvent[] } {
    const cid = correlationId ?? generateId("exec");
    const events: HistoryEvent[] = [];

    events.push({
      id: generateId("evt"),
      type: "execution.started",
      timestamp: nowIso(), // Ideally passed in, but we approximate here
      actor: "SYSTEM",
      correlation_id: cid,
      data: {},
    });

    const completionType = result.ok ? "execution.completed" : "execution.failed";
    const data: ExecutionEventData = {
      files_changed: result.files_changed.length > 0 ? result.files_changed : undefined,
      log: result.log ? result.log : undefined,
      errors: result.errors && result.errors.length > 0 ? result.errors : undefined,
    };

    events.push({
      id: generateId("evt"),
      type: completionType,
      timestamp: nowIso(),
      actor: "SYSTEM",
      correlation_id: cid,
      data,
    });

    return { events };
  }

  /**
   * Records the outcome of a verification run to history.
   * Does not mutate the canonical Specification state.
   */
  recordVerification(
    command: string,
    result: { ok: boolean; log: string; errors?: string[] },
    correlationId?: string
  ): { events: HistoryEvent[] } {
    const cid = correlationId ?? generateId("verify");
    const events: HistoryEvent[] = [];

    events.push({
      id: generateId("evt"),
      type: "verification.started",
      timestamp: nowIso(),
      actor: "SYSTEM",
      correlation_id: cid,
      data: { test_command: command },
    });

    const completionType = result.ok ? "verification.completed" : "verification.failed";
    events.push({
      id: generateId("evt"),
      type: completionType,
      timestamp: nowIso(),
      actor: "SYSTEM",
      correlation_id: cid,
      data: {
        test_command: command,
        ok: result.ok,
        log: result.log ? result.log : undefined,
        errors: result.errors && result.errors.length > 0 ? result.errors : undefined,
      },
    });

    return { events };
  }

  /** Returns the full history event log (immutable copy). */
  getHistory(): HistoryEvent[] {
    return [...this.history];
  }
}

// ---------------------------------------------------------------------------
// Factory: create a blank Specification
// ---------------------------------------------------------------------------

export function createSpecification(projectName: string, rawIntent: string): Specification {
  const now = nowIso();
  return {
    version: "0.1",
    metadata: {
      project_name: projectName,
      created_at: now,
      updated_at: now,
      status: "DRAFT",
    },
    intent: { raw_input: rawIntent },
    actors: [],
    requirements: [],
    decisions: [],
    open_questions: [],
    out_of_scope: [],
  };
}
