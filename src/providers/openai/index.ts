/**
 * OpenAI ModelProvider implementation.
 *
 * Uses the `openai` SDK to call GPT-4o (or any OpenAI model) with
 * structured JSON output mode. Compatible with both OpenAI API
 * and Azure OpenAI with the same interface.
 *
 * This also covers OpenAI Codex-era models and the newer GPT-4o family.
 *
 * API Key: OPENAI_API_KEY env variable (or configured in .yokai/config.yaml)
 */
import OpenAI from "openai";
import type { ModelProvider, ModelContext } from "../interface.js";
import type { SpecificationUpdate } from "../../models/update.js";
import { parseSpecificationUpdate } from "../../models/update.schema.js";
import {
  SYSTEM_PROMPT_BASE,
  ANALYZE_INTENT_PROMPT,
  PROPOSE_QUESTIONS_PROMPT,
  REFINE_WITH_ANSWER_PROMPT,
} from "../gemini/prompts.js";

export interface OpenAIProviderConfig {
  apiKey: string;
  model?: string | undefined;
  baseURL?: string | undefined; // For Azure or other OpenAI-compatible endpoints
}

export class OpenAIProvider implements ModelProvider {
  private client: OpenAI;
  private model: string;

  constructor(config: OpenAIProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
    this.model = config.model ?? "gpt-4o";
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildSpecContext(ctx: ModelContext): string {
    const spec = ctx.specification;
    const reqSummary = spec.requirements.length
      ? spec.requirements
          .map((r) => `  - [${r.status}] ${r.id}: ${r.title}`)
          .join("\n")
      : "  (none yet)";

    const questionSummary = spec.open_questions.length
      ? spec.open_questions
          .map((q) => `  - [${q.blocking ? "BLOCKING" : q.impact}] ${q.id}: ${q.topic}`)
          .join("\n")
      : "  (none)";

    return [
      `## Current Specification`,
      `Project: ${spec.metadata.project_name}`,
      `Status: ${spec.metadata.status}`,
      ``,
      `### Raw Intent`,
      spec.intent.raw_input,
      ``,
      `### Current Requirements (${spec.requirements.length})`,
      reqSummary,
      ``,
      `### Open Questions (${spec.open_questions.length})`,
      questionSummary,
    ].join("\n");
  }

  private async callModel(userMessage: string): Promise<SpecificationUpdate> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT_BASE },
        { role: "user", content: userMessage },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "{}";
    const cleaned = text
      .replace(/^```(?:json)?\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();

    try {
      const rawJson = JSON.parse(cleaned);
      return parseSpecificationUpdate(rawJson);
    } catch (parseError) {
      const fs = await import("fs");
      const path = await import("path");
      const debugPath = path.join(process.cwd(), ".yokai", "debug_failed_json.txt");
      if (fs.existsSync(path.dirname(debugPath))) {
        fs.writeFileSync(debugPath, cleaned, "utf-8");
      }
      
      let msg = String(parseError);
      if (parseError instanceof Error) {
        msg = parseError.message;
        if ("issues" in parseError) {
          msg = JSON.stringify((parseError as any).issues, null, 2);
        }
      }
      throw new Error(`OpenAIProvider JSON/Schema parse error: ${msg}\nRaw output saved to .yokai/debug_failed_json.txt`);
    }
  }

  // ---------------------------------------------------------------------------
  // ModelProvider interface
  // ---------------------------------------------------------------------------

  async analyzeIntent(ctx: ModelContext): Promise<SpecificationUpdate> {
    const message = [
      ANALYZE_INTENT_PROMPT,
      "",
      ctx.repository_context ?? "",
      "",
      `## User Intent`,
      ctx.user_input ?? ctx.specification.intent.raw_input,
      "",
      this.buildSpecContext(ctx),
    ].join("\n");

    return this.callModel(message);
  }

  async proposeQuestions(ctx: ModelContext): Promise<SpecificationUpdate> {
    const message = [
      PROPOSE_QUESTIONS_PROMPT,
      "",
      ctx.repository_context ?? "",
      "",
      this.buildSpecContext(ctx),
    ].join("\n");

    return this.callModel(message);
  }

  async proposeSpecificationUpdate(ctx: ModelContext): Promise<SpecificationUpdate> {
    const userInput = ctx.user_input ?? "";
    const message = [
      REFINE_WITH_ANSWER_PROMPT,
      "",
      ctx.repository_context ?? "",
      "",
      this.buildSpecContext(ctx),
      "",
      `## User Input / Answer`,
      userInput,
    ].join("\n");

    return this.callModel(message);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createOpenAIProvider(options: {
  apiKeyEnv?: string | undefined;
  model?: string | undefined;
  baseURL?: string | undefined;
}): OpenAIProvider {
  const envKey = options.apiKeyEnv ?? "OPENAI_API_KEY";
  const apiKey = process.env[envKey];
  if (!apiKey) {
    throw new Error(
      `Yokai: OpenAI API key not found. Set the ${envKey} environment variable.`
    );
  }
  return new OpenAIProvider({
    apiKey,
    ...(options.model !== undefined ? { model: options.model } : {}),
    ...(options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
  });
}
