import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSpecification } from "../../src/core/engine.js";
import { CodexCliExecutionProvider } from "../../src/providers/codex/execution.js";
import type { ExecutionContext } from "../../src/providers/execution.js";

const { spawnMock, spawnSyncMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  spawnSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  spawnSync: spawnSyncMock,
}));

describe("CodexCliExecutionProvider", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    spawnSyncMock.mockReset();
  });

  it("runs codex exec with the accepted specification and reports changed files", async () => {
    spawnSyncMock
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" })
      .mockReturnValueOnce({ status: 0, stdout: " M src/index.ts\n?? src/new.ts\n", stderr: "" });

    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdin: PassThrough;
        stdout: PassThrough;
        stderr: PassThrough;
      };
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();

      queueMicrotask(() => {
        child.stdout.emit("data", "{\"type\":\"final\",\"message\":\"done\"}\n");
        child.emit("close", 0);
      });

      return child;
    });

    const spec = createSpecification("Test", "Add a feature");
    spec.metadata.status = "ACCEPTED";
    spec.requirements.push({
      id: "REQ-001",
      type: "FEATURE",
      title: "Create feature",
      description: "Implement the feature.",
      status: "CONFIRMED",
      provenance: { source: "USER_EXPLICIT", confidence: "ABSOLUTE" },
      dependencies: [],
      acceptance_criteria: [
        {
          given: "a user opens the app",
          when: "the feature runs",
          then: "the expected result is shown",
        },
      ],
    });

    const provider = new CodexCliExecutionProvider({
      command: "codex",
      sandbox: "workspace-write",
      json: true,
      ephemeral: true,
    });

    const ctx: ExecutionContext = {
      specification: spec,
      repository_context: "src/index.ts",
      cwd: process.cwd(),
    };

    const result = await provider.execute(ctx);

    expect(result.ok).toBe(true);
    expect(result.files_changed).toEqual(["src/index.ts", "src/new.ts"]);
    expect(result.log).toContain("done");

    expect(spawnMock).toHaveBeenCalledWith(
      "codex",
      expect.arrayContaining(["exec", "--json", "--ephemeral", "--sandbox", "workspace-write"]),
      expect.objectContaining({ cwd: process.cwd() }),
    );
  });

  it("returns an error when codex exits unsuccessfully", async () => {
    spawnSyncMock
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" })
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" });

    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdin: PassThrough;
        stdout: PassThrough;
        stderr: PassThrough;
      };
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();

      queueMicrotask(() => {
        child.stderr.emit("data", "failed");
        child.emit("close", 1);
      });

      return child;
    });

    const spec = createSpecification("Test", "Add a feature");
    spec.metadata.status = "ACCEPTED";
    spec.requirements.push({
      id: "REQ-001",
      type: "FEATURE",
      title: "Create feature",
      description: "Implement the feature.",
      status: "CONFIRMED",
      provenance: { source: "USER_EXPLICIT", confidence: "ABSOLUTE" },
      dependencies: [],
      acceptance_criteria: [],
    });

    const provider = new CodexCliExecutionProvider();
    const result = await provider.execute({ specification: spec, cwd: process.cwd() });

    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toContain("exited with code 1");
    expect(result.log).toContain("failed");
  });
});
