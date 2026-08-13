/**
 * MockProvider — a deterministic ModelProvider for testing.
 *
 * This provider returns hardcoded SpecificationUpdates without calling any LLM.
 * Its purpose is to prove that the entire Yokai lifecycle
 * (intent → proposal → validation → apply → history → approve)
 * works correctly independently of any real AI model.
 *
 * "Yokai is not a wrapper around a model."
 *
 * Usage in tests:
 *   const mock = new MockProvider({ analyzeIntent: myFixedUpdate });
 *   const result = await mock.analyzeIntent(ctx);
 */
import type { ModelProvider, ModelContext } from "../interface.js";
import type { SpecificationUpdate } from "../../models/update.js";

export interface MockProviderConfig {
  analyzeIntent?: SpecificationUpdate | undefined;
  proposeQuestions?: SpecificationUpdate | undefined;
  proposeSpecificationUpdate?: SpecificationUpdate | undefined;
}

const EMPTY_UPDATE: SpecificationUpdate = {};

export class MockProvider implements ModelProvider {
  private config: MockProviderConfig;

  constructor(config: MockProviderConfig = {}) {
    this.config = config;
  }

  async analyzeIntent(_ctx: ModelContext): Promise<SpecificationUpdate> {
    return Promise.resolve(this.config.analyzeIntent ?? EMPTY_UPDATE);
  }

  async proposeQuestions(_ctx: ModelContext): Promise<SpecificationUpdate> {
    return Promise.resolve(this.config.proposeQuestions ?? EMPTY_UPDATE);
  }

  async proposeSpecificationUpdate(_ctx: ModelContext): Promise<SpecificationUpdate> {
    return Promise.resolve(this.config.proposeSpecificationUpdate ?? EMPTY_UPDATE);
  }
}
