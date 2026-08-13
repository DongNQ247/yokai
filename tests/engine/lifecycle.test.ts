/**
 * Full lifecycle test — Phase 1C critical milestone.
 *
 * Proves the complete Yokai specification lifecycle runs correctly
 * WITHOUT any real LLM call:
 *
 *   Intent
 *     ↓ MockProvider.analyzeIntent()
 *   SpecificationUpdate (proposal)
 *     ↓ Stage A: Proposal Validation
 *   Validate
 *     ↓ Apply (in-memory)
 *   Stage B: Canonical Validation
 *     ↓ Commit
 *   Canonical Specification + History
 *     ↓ yokai approve
 *   ACCEPTED Specification
 *
 * If this test suite passes, Yokai has demonstrated that:
 *   1. The Engine correctly gates all mutations behind validation.
 *   2. ASSUMED requirements remain ASSUMED after approval.
 *   3. The history log captures the full causal chain.
 *   4. No LLM is required for the core lifecycle.
 */
import { describe, it, expect } from "vitest";
import { SpecificationEngine, createSpecification } from "../../src/core/engine.js";
import { MockProvider } from "../../src/providers/mock/index.js";
import type { SpecificationUpdate } from "../../src/models/update.js";
import type { ModelContext } from "../../src/providers/interface.js";

// ---------------------------------------------------------------------------
// Fixture: a realistic first proposal from the MockProvider
// ---------------------------------------------------------------------------

const INITIAL_PROPOSAL: SpecificationUpdate = {
  add_requirements: [
    {
      id: "REQ-001",
      type: "FEATURE",
      title: "User Authentication",
      description: "Users must be able to log in using email and password.",
      status: "ASSUMED",
      provenance: {
        source: "USER_EXPLICIT",
        reference: "raw_intent:initial",
        confidence: "HIGH",
      },
      dependencies: [],
      acceptance_criteria: [
        {
          given: "A user has valid credentials",
          when: "The user submits the login form",
          then: "The user is authenticated and redirected to the dashboard",
        },
      ],
    },
    {
      id: "REQ-002",
      type: "BUSINESS_RULE",
      title: "Password Complexity",
      description: "Passwords must be at least 8 characters long.",
      status: "ASSUMED",
      provenance: {
        source: "AGENT_ASSUMPTION",
        reference: "agent-reason:industry standard password policy",
        confidence: "MEDIUM",
      },
      dependencies: ["REQ-001"],
      acceptance_criteria: [],
    },
  ],
  add_open_questions: [
    {
      id: "Q-001",
      topic: "Authentication Provider",
      context: "No existing auth library was detected in the repository. Should we use a third-party provider or build custom auth?",
      type: "SINGLE_CHOICE",
      options: ["Third-party (e.g., Auth0, Supabase)", "Custom JWT implementation"],
      suggested_answer: "Third-party (e.g., Auth0, Supabase)",
      impact: "HIGH",
      blocking: true,
      priority: { score: 0.92, reason: "Affects architecture and security model" },
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Yokai Full Lifecycle (no LLM)", () => {
  it("creates a blank specification from raw intent", () => {
    const spec = createSpecification("my-app", "Add authentication to the app");
    expect(spec.version).toBe("0.1");
    expect(spec.metadata.status).toBe("DRAFT");
    expect(spec.intent.raw_input).toBe("Add authentication to the app");
    expect(spec.requirements).toHaveLength(0);
  });

  it("applies a valid MockProvider proposal and commits to history", async () => {
    const spec = createSpecification("my-app", "Add authentication to the app");
    const engine = new SpecificationEngine(spec);
    const mock = new MockProvider({ analyzeIntent: INITIAL_PROPOSAL });

    const ctx: ModelContext = { specification: engine.getSpecification() };
    const proposal = await mock.analyzeIntent(ctx);
    const result = engine.apply(proposal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const applied = result.specification;
    expect(applied.requirements).toHaveLength(2);
    expect(applied.open_questions).toHaveLength(1);
    expect(applied.requirements[0]?.id).toBe("REQ-001");
    expect(applied.requirements[0]?.status).toBe("ASSUMED");
  });

  it("records events in history for each mutation", async () => {
    const spec = createSpecification("my-app", "Add authentication to the app");
    const engine = new SpecificationEngine(spec);
    const mock = new MockProvider({ analyzeIntent: INITIAL_PROPOSAL });

    const ctx: ModelContext = { specification: engine.getSpecification() };
    const proposal = await mock.analyzeIntent(ctx);
    engine.apply(proposal);

    const history = engine.getHistory();
    const types = history.map((e) => e.type);

    expect(types).toContain("update.proposed");
    expect(types).toContain("update.validated");
    expect(types).toContain("requirement.created");
    expect(types).toContain("question.created");
    expect(types).toContain("update.applied");
  });

  it("confirms a requirement via modify_requirements with explicit state transition", () => {
    const spec = createSpecification("my-app", "Add authentication");
    const engine = new SpecificationEngine(spec);

    // First, add a requirement in ASSUMED state
    engine.apply({ add_requirements: [INITIAL_PROPOSAL.add_requirements![0]!] });

    // Then confirm it
    const confirmUpdate: SpecificationUpdate = {
      modify_requirements: [
        {
          id: "REQ-001",
          changes: { status: "CONFIRMED" },
          reason: "User explicitly confirmed this requirement during review",
        },
      ],
    };

    const result = engine.apply(confirmUpdate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const req = result.specification.requirements.find((r) => r.id === "REQ-001");
    expect(req?.status).toBe("CONFIRMED");
  });

  it("resolves a blocking question and removes it from open_questions", () => {
    const spec = createSpecification("my-app", "Add authentication");
    const engine = new SpecificationEngine(spec);

    engine.apply(INITIAL_PROPOSAL);

    const resolution: SpecificationUpdate = {
      resolve_questions: [
        { question_id: "Q-001", answer: "Third-party (e.g., Auth0, Supabase)" },
      ],
    };

    const result = engine.apply(resolution);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.specification.open_questions).toHaveLength(0);
  });

  it("approves the specification after blocking questions are resolved", () => {
    const spec = createSpecification("my-app", "Add authentication");
    const engine = new SpecificationEngine(spec);

    engine.apply(INITIAL_PROPOSAL);
    engine.apply({
      resolve_questions: [{ question_id: "Q-001", answer: "Supabase" }],
    });

    const result = engine.approve();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.specification.metadata.status).toBe("ACCEPTED");
  });

  it("ASSUMED requirements remain ASSUMED after specification approval", () => {
    const spec = createSpecification("my-app", "Add authentication");
    const engine = new SpecificationEngine(spec);

    engine.apply(INITIAL_PROPOSAL);
    engine.apply({
      resolve_questions: [{ question_id: "Q-001", answer: "Supabase" }],
    });
    engine.approve();

    const finalSpec = engine.getSpecification();
    const assumed = finalSpec.requirements.filter((r) => r.status === "ASSUMED");
    expect(assumed.length).toBeGreaterThan(0); // ASSUMED still ASSUMED after approval
    expect(finalSpec.metadata.status).toBe("ACCEPTED");
  });

  it("blocks approval when blocking questions remain open", () => {
    const spec = createSpecification("my-app", "Add authentication");
    const engine = new SpecificationEngine(spec);

    // Apply proposal WITH blocking question — do NOT resolve it
    engine.apply(INITIAL_PROPOSAL);

    const result = engine.approve();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/blocking question/i);
  });

  it("rejects a proposal with an invalid state transition", () => {
    const spec = createSpecification("my-app", "Add authentication");
    const engine = new SpecificationEngine(spec);

    engine.apply({ add_requirements: [INITIAL_PROPOSAL.add_requirements![0]!] });

    // Try to jump from ASSUMED → SUPERSEDED (invalid transition)
    const badUpdate: SpecificationUpdate = {
      modify_requirements: [
        {
          id: "REQ-001",
          changes: { status: "SUPERSEDED" },
          reason: "Attempting illegal transition",
        },
      ],
    };

    const result = engine.apply(badUpdate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("INVALID_TRANSITION"))).toBe(true);

    // Canonical spec must be unchanged
    const finalSpec = engine.getSpecification();
    expect(finalSpec.requirements.find((r) => r.id === "REQ-001")?.status).toBe("ASSUMED");
  });

  it("rejects a proposal that references a non-existent requirement ID", () => {
    const spec = createSpecification("my-app", "Add authentication");
    const engine = new SpecificationEngine(spec);

    const badUpdate: SpecificationUpdate = {
      modify_requirements: [
        { id: "REQ-DOES-NOT-EXIST", changes: { status: "CONFIRMED" }, reason: "Test" },
      ],
    };

    const result = engine.apply(badUpdate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("UNKNOWN_ID"))).toBe(true);
  });

  it("maintains full correlation_id chain across a refinement cycle", async () => {
    const spec = createSpecification("my-app", "Add authentication");
    const engine = new SpecificationEngine(spec);
    const cid = "cycle-test-001";

    const mock = new MockProvider({ analyzeIntent: INITIAL_PROPOSAL });
    const ctx: ModelContext = { specification: engine.getSpecification(), correlation_id: cid };
    const proposal = await mock.analyzeIntent(ctx);
    engine.apply(proposal, cid);

    const history = engine.getHistory();
    const cycleEvents = history.filter((e) => e.correlation_id === cid);
    expect(cycleEvents.length).toBeGreaterThan(0);
    expect(cycleEvents.every((e) => e.correlation_id === cid)).toBe(true);
  });

  it("supersedes a requirement and creates new ones in its place", () => {
    const spec = createSpecification("my-app", "Add authentication");
    const engine = new SpecificationEngine(spec);

    // Add REQ-001 in ASSUMED state (correct initial state)
    engine.apply({
      add_requirements: [
        {
          id: "REQ-001",
          type: "FEATURE",
          title: "Basic Auth",
          description: "Simple username/password auth.",
          status: "ASSUMED",
          provenance: { source: "USER_EXPLICIT", confidence: "ABSOLUTE" },
          dependencies: [],
          acceptance_criteria: [
            { given: "Valid user", when: "Logs in", then: "Redirected to dashboard" },
          ],
        },
      ],
    });

    // Confirm it via the proper state transition
    engine.apply({
      modify_requirements: [
        {
          id: "REQ-001",
          changes: { status: "CONFIRMED" },
          reason: "User confirmed basic auth requirement",
        },
      ],
    });

    // Now supersede it with a new requirement
    const supersedeUpdate: SpecificationUpdate = {
      supersede_requirements: [
        {
          old_id: "REQ-001",
          reason: "User wants SSO instead of basic auth",
          new_requirements: [
            {
              id: "REQ-003",
              type: "FEATURE",
              title: "SSO Authentication",
              description: "Single Sign-On via third-party provider.",
              status: "CANDIDATE",
              provenance: { source: "USER_EXPLICIT", confidence: "HIGH" },
              dependencies: [],
              acceptance_criteria: [],
            },
          ],
        },
      ],
    };

    const result = engine.apply(supersedeUpdate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const old = result.specification.requirements.find((r) => r.id === "REQ-001");
    const newReq = result.specification.requirements.find((r) => r.id === "REQ-003");

    expect(old?.status).toBe("SUPERSEDED");
    expect(newReq?.status).toBe("CANDIDATE");
  });
});
