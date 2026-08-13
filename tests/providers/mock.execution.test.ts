import { describe, it, expect } from "vitest";
import { MockExecutionProvider } from "../../src/providers/mock/execution.js";
import { createSpecification } from "../../src/core/engine.js";
import type { ExecutionContext } from "../../src/providers/execution.js";

describe("MockExecutionProvider", () => {
  it("returns mock result for full specification execution", async () => {
    const spec = createSpecification("Test", "Intent");
    const provider = new MockExecutionProvider();
    
    const ctx: ExecutionContext = {
      specification: spec,
      cwd: process.cwd(),
    };

    const result = await provider.execute(ctx);
    expect(result.ok).toBe(true);
    expect(result.files_changed).toContain("src/example.ts");
    expect(result.log).toContain("completed successfully");
  });

  it("returns error if requested requirement_id is not found", async () => {
    const spec = createSpecification("Test", "Intent");
    const provider = new MockExecutionProvider();
    
    const ctx: ExecutionContext = {
      specification: spec,
      requirement_id: "REQ-999",
      cwd: process.cwd(),
    };

    const result = await provider.execute(ctx);
    expect(result.ok).toBe(false);
    expect(result.files_changed).toHaveLength(0);
    expect(result.errors?.[0]).toContain("not found");
  });

  it("returns mock result for specific requirement execution", async () => {
    const spec = createSpecification("Test", "Intent");
    spec.requirements.push({
      id: "REQ-001",
      type: "FEATURE",
      title: "Test Req",
      description: "Test Desc",
      status: "CONFIRMED",
      provenance: { source: "USER_EXPLICIT", confidence: "ABSOLUTE" },
      dependencies: [],
      acceptance_criteria: [],
    });

    const provider = new MockExecutionProvider();
    
    const ctx: ExecutionContext = {
      specification: spec,
      requirement_id: "REQ-001",
      cwd: process.cwd(),
    };

    const result = await provider.execute(ctx);
    expect(result.ok).toBe(true);
    expect(result.log).toContain("Mock execution of requirement REQ-001 completed");
  });
});
