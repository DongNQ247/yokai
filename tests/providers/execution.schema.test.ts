import { describe, it, expect } from "vitest";
import { parseExecutionResponse } from "../../src/models/execution.schema.js";

describe("ExecutionResponse Zod Schema", () => {
  it("parses a valid ExecutionResponse", () => {
    const valid = {
      files: [
        { path: "src/index.ts", content: "console.log('hello');\n" },
        { path: "README.md", content: "# Hello\n" },
      ],
      reasoning: "Created index.ts and README.md as requested.",
    };
    
    const parsed = parseExecutionResponse(valid);
    expect(parsed.files).toHaveLength(2);
    expect(parsed.files[0]?.path).toBe("src/index.ts");
    expect(parsed.reasoning).toBe("Created index.ts and README.md as requested.");
  });

  it("fails if required fields are missing", () => {
    const invalid = {
      files: [
        { path: "src/index.ts" }, // missing content
      ],
    };

    expect(() => parseExecutionResponse(invalid)).toThrowError(/Invalid input/);
  });

  it("rejects unknown fields based on strict mode", () => {
    const invalid = {
      files: [],
      reasoning: "Empty",
      unknown_field: "this should fail",
    };

    expect(() => parseExecutionResponse(invalid)).toThrowError(/Unrecognized key/);
  });
});
