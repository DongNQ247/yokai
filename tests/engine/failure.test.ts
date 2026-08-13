import { describe, it, expect } from "vitest";
import { SpecificationEngine, createSpecification } from "../../src/core/engine.js";
import type { SpecificationUpdate } from "../../src/models/update.js";

describe("SpecificationEngine Failure Paths", () => {
  it("rejects updates referencing missing requirement IDs and does not mutate state", () => {
    const spec = createSpecification("TestProject", "intent");
    const engine = new SpecificationEngine(spec);

    const update: SpecificationUpdate = {
      modify_requirements: [
        {
          id: "REQ-DOES-NOT-EXIST",
          changes: { title: "New Title" },
          reason: "Testing missing ID",
        },
      ],
    };

    const result = engine.apply(update);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("UNKNOWN_ID"))).toBe(true);
    }

    // Verify engine state is NOT mutated
    expect(engine.getSpecification().requirements.length).toBe(0);
    expect(engine.getHistory().length).toBe(0); // Because we didn't commit
  });

  it("rejects invalid status transitions (Stage B)", () => {
    const spec = createSpecification("TestProject", "intent");
    spec.requirements.push({
      id: "REQ-001",
      type: "FEATURE",
      title: "Test Req",
      description: "Desc",
      status: "SUPERSEDED",
      provenance: { source: "USER_EXPLICIT", confidence: "HIGH" },
      dependencies: [],
      acceptance_criteria: [],
    });
    
    const engine = new SpecificationEngine(spec);

    const update: SpecificationUpdate = {
      modify_requirements: [
        {
          id: "REQ-001",
          changes: { status: "CONFIRMED" }, // Invalid transition from SUPERSEDED
          reason: "Try to revive",
        },
      ],
    };

    const result = engine.apply(update);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("INVALID_TRANSITION") || e.includes("TERMINAL_STATE"))).toBe(true);
    }

    // Spec must not be mutated
    expect(engine.getSpecification().requirements[0]?.status).toBe("SUPERSEDED");
  });

  it("commits successfully when valid", () => {
    const spec = createSpecification("TestProject", "intent");
    const engine = new SpecificationEngine(spec);

    const update: SpecificationUpdate = {
      add_requirements: [
        {
          id: "REQ-001",
          type: "FEATURE",
          title: "New Req",
          description: "Desc",
          status: "ASSUMED",
          provenance: { source: "AGENT_ASSUMPTION", confidence: "HIGH" },
          dependencies: [],
          acceptance_criteria: [
            { given: "A", when: "B", then: "C" }
          ],
        },
      ],
    };

    const result = engine.apply(update);
    expect(result.ok).toBe(true);

    if (result.ok) {
      engine.commit(result.specification, result.events);
      expect(engine.getSpecification().requirements.length).toBe(1);
      expect(engine.getHistory().length).toBe(4); // Proposed + Validated + Created + Applied
    }
  });
});
