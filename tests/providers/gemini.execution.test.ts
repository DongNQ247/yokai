import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { GeminiExecutionProvider } from "../../src/providers/gemini/execution.js";
import { createSpecification } from "../../src/core/engine.js";
import type { ExecutionContext } from "../../src/providers/execution.js";

// Mock the @google/genai module
vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            files: [
              { path: "test_output.ts", content: "export const TEST = true;" }
            ],
            reasoning: "Generated test file."
          })
        })
      };
    }
  };
});

const TEST_DIR = path.join(process.cwd(), ".test_gemini_execution");

describe("GeminiExecutionProvider", () => {
  let provider: GeminiExecutionProvider;

  beforeEach(() => {
    provider = new GeminiExecutionProvider({ apiKey: "test-key" });
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("fails if no requirements are eligible for execution", async () => {
    const spec = createSpecification("Test", "Intent");
    // Empty spec, no requirements
    
    const ctx: ExecutionContext = {
      specification: spec,
      cwd: TEST_DIR,
    };

    const result = await provider.execute(ctx);
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toContain("No valid requirements");
  });

  it("executes successfully and writes files to disk", async () => {
    const spec = createSpecification("Test", "Intent");
    spec.requirements.push({
      id: "REQ-001",
      type: "FEATURE",
      title: "Test",
      description: "Test",
      status: "CONFIRMED", // Eligible
      provenance: { source: "USER_EXPLICIT", confidence: "ABSOLUTE" },
      dependencies: [],
      acceptance_criteria: [],
    });
    
    const ctx: ExecutionContext = {
      specification: spec,
      cwd: TEST_DIR,
    };

    const result = await provider.execute(ctx);
    expect(result.ok).toBe(true);
    expect(result.files_changed).toContain("test_output.ts");
    expect(result.log).toBe("Generated test file.");

    // Verify file was written
    const writtenPath = path.join(TEST_DIR, "test_output.ts");
    expect(fs.existsSync(writtenPath)).toBe(true);
    expect(fs.readFileSync(writtenPath, "utf-8")).toBe("export const TEST = true;");
  });
});
