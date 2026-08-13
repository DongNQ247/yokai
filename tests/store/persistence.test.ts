import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { YokaiStore } from "../../src/store/index.js";
import { createSpecification } from "../../src/core/engine.js";

const TEST_DIR = path.join(process.cwd(), ".test_yokai_store");

describe("YokaiStore Persistence and Concurrency", () => {
  let store: YokaiStore;

  beforeEach(() => {
    store = new YokaiStore(TEST_DIR);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("handles Optimistic Concurrency Control (OCC) conflicts", () => {
    const spec1 = createSpecification("Test", "intent");
    const spec2 = createSpecification("Test", "intent"); // Same spec, generated concurrently
    
    // Process 1 commits
    store.commitTransaction(spec1, [], undefined);

    // Process 2 tries to commit with undefined previousUpdatedAt (thinks it's a new spec)
    expect(() => {
      store.commitTransaction(spec2, [], undefined);
    }).toThrowError(/ConcurrencyError/);

    // Process 3 reads, then tries to commit with wrong timestamp
    const readSpec = store.readSpecification()!;
    const wrongTimestamp = new Date(Date.now() - 10000).toISOString();
    
    expect(() => {
      store.commitTransaction(readSpec, [], wrongTimestamp);
    }).toThrowError(/ConcurrencyError/);
    
    // Commit with correct timestamp should succeed
    const correctTimestamp = readSpec.metadata.updated_at;
    readSpec.metadata.status = "ACCEPTED";
    store.commitTransaction(readSpec, [], correctTimestamp);
    
    expect(store.readSpecification()?.metadata.status).toBe("ACCEPTED");
  });

  it("trims dangling history events that occur after the canonical spec updated_at", () => {
    const spec = createSpecification("Test", "intent");
    const timestampSpec = new Date("2025-01-01T12:00:00Z").toISOString();
    spec.metadata.updated_at = timestampSpec;
    
    store.commitTransaction(spec, [], undefined);
    
    // Simulate a crash: history has events later than spec
    const lateEvent1 = { id: "evt1", type: "update.proposed" as const, timestamp: new Date("2025-01-01T12:00:01Z").toISOString(), actor: "MODEL" as const, correlation_id: "1", data: {} as any };
    const validEvent = { id: "evt2", type: "update.proposed" as const, timestamp: new Date("2025-01-01T11:59:00Z").toISOString(), actor: "MODEL" as const, correlation_id: "2", data: {} as any };
    
    const storeFile = path.join(store.yokaiDirPath, "history.jsonl");
    fs.appendFileSync(storeFile, JSON.stringify(validEvent) + "\n");
    fs.appendFileSync(storeFile, JSON.stringify(lateEvent1) + "\n");
    
    // Read history should trim the late event
    const readSpec = store.readSpecification()!;
    const history = store.readHistory(readSpec);
    
    expect(history.length).toBe(1);
    expect(history[0]?.id).toBe("evt2");
  });
});
