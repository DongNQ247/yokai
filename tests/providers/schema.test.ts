import { describe, it, expect } from "vitest";
import { parseSpecificationUpdate } from "../../src/models/update.schema.js";

describe("SpecificationUpdate Zod Schema", () => {
  it("parses a valid SpecificationUpdate", () => {
    const valid = {
      add_requirements: [
        {
          id: "REQ-001",
          type: "FEATURE",
          title: "Test",
          description: "Desc",
          status: "ASSUMED",
          provenance: { source: "AGENT_ASSUMPTION", confidence: "HIGH" },
          dependencies: [],
          acceptance_criteria: [],
        },
      ],
      resolve_questions: [{ question_id: "Q-001", answer: "A" }],
    };
    
    const parsed = parseSpecificationUpdate(valid);
    expect(parsed.add_requirements?.length).toBe(1);
    expect(parsed.resolve_questions?.length).toBe(1);
  });

  it("fails on invalid status enum", () => {
    const invalid = {
      add_requirements: [
        {
          id: "REQ-001",
          type: "FEATURE",
          title: "Test",
          description: "Desc",
          status: "INVALID_STATUS", // Should fail
          provenance: { source: "AGENT_ASSUMPTION", confidence: "HIGH" },
          dependencies: [],
          acceptance_criteria: [],
        },
      ],
    };
    
    expect(() => parseSpecificationUpdate(invalid)).toThrowError(/Invalid option/);
  });

  it("fails on missing required fields", () => {
    const invalid = {
      add_requirements: [
        {
          id: "REQ-001",
          // missing title, description, etc.
        },
      ],
    };
    
    expect(() => parseSpecificationUpdate(invalid)).toThrowError(/Invalid input/);
  });

  it("strips or rejects unknown fields based on strict mode", () => {
    const invalid = {
      resolve_questions: [{ question_id: "Q-001", answer: "A" }],
      some_hallucinated_field: "test",
    };
    
    expect(() => parseSpecificationUpdate(invalid)).toThrowError(/Unrecognized key.*some_hallucinated_field/);
  });
});
