import type { ExecutionProvider, ExecutionContext, ExecutionResult } from "../execution.js";

/**
 * MockExecutionProvider is used for testing and validation.
 * It does not mutate the disk or call any real LLM.
 */
export class MockExecutionProvider implements ExecutionProvider {
  private mockResult: ExecutionResult;

  constructor(mockResult?: Partial<ExecutionResult>) {
    this.mockResult = {
      ok: true,
      files_changed: ["src/example.ts"],
      log: "Mock execution completed successfully.",
      ...mockResult,
    };
  }

  async execute(ctx: ExecutionContext): Promise<ExecutionResult> {
    if (ctx.requirement_id) {
      // Simulate executing a specific requirement
      const req = ctx.specification.requirements.find(r => r.id === ctx.requirement_id);
      if (!req) {
        return {
          ok: false,
          files_changed: [],
          log: `Failed to find requirement ${ctx.requirement_id}`,
          errors: [`Requirement ${ctx.requirement_id} not found in specification`],
        };
      }
      return {
        ...this.mockResult,
        log: `Mock execution of requirement ${ctx.requirement_id} completed.`,
      };
    }
    
    // Simulate executing the entire spec
    return this.mockResult;
  }
}
