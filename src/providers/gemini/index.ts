/**
 * Gemini ModelProvider implementation.
 *
 * Uses the @google/generative-ai SDK to call Gemini with structured JSON output.
 * All calls return SpecificationUpdate proposals — the Engine decides whether to apply them.
 *
 * API Key: GEMINI_API_KEY env variable (or configured in .yokai/config.yaml)
 */
import { GoogleGenAI } from "@google/genai";
import type { ModelProvider, ModelContext } from "../interface.js";
import type { SpecificationUpdate } from "../../models/update.js";
import {
  SYSTEM_PROMPT_BASE,
  ANALYZE_INTENT_PROMPT,
  PROPOSE_QUESTIONS_PROMPT,
  REFINE_WITH_ANSWER_PROMPT,
} from "./prompts.js";

// ---------------------------------------------------------------------------
// JSON response schema for Gemini structured output
// ---------------------------------------------------------------------------

// We ask Gemini to produce a JSON object and parse it manually,
// since the SpecificationUpdate schema is complex and recursive schema
// validation is better handled by our own Engine (Stage A).
const RESPONSE_MIME_TYPE = "application/json";

// ---------------------------------------------------------------------------
// GeminiProvider
// ---------------------------------------------------------------------------

export interface GeminiProviderConfig {
  apiKey: string;
  model?: string | undefined;
}

export class GeminiProvider implements ModelProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(config: GeminiProviderConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    // Default to latest fast model
    this.model = config.model ?? "gemini-3.5-flash";
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

  private async callModel(prompt: string): Promise<SpecificationUpdate> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PROMPT_BASE,
          responseMimeType: RESPONSE_MIME_TYPE,
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
      });
      const text = response.text;

      if (!text) {
        throw new Error("Empty response from model");
      }

      // Strip markdown code fences if present
      const cleaned = text
        .replace(/^```(?:json)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();

      try {
        return JSON.parse(cleaned) as SpecificationUpdate;
      } catch (parseError) {
        // Fallback: try appending "}" in case the model forgot the final bracket (common LLM quirk)
        try {
          return JSON.parse(cleaned + "\n}") as SpecificationUpdate;
        } catch (fallbackError) {
          // Dump the raw text to a debug file to see why it failed
          const fs = await import("fs");
          const path = await import("path");
          const debugPath = path.join(process.cwd(), ".yokai", "debug_failed_json.txt");
          if (fs.existsSync(path.dirname(debugPath))) {
            fs.writeFileSync(debugPath, cleaned, "utf-8");
          }
          throw new Error(`JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}. Raw output saved to .yokai/debug_failed_json.txt`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`GeminiProvider: Failed to parse model response — ${message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // ModelProvider interface
  // ---------------------------------------------------------------------------

  async analyzeIntent(ctx: ModelContext): Promise<SpecificationUpdate> {
    const prompt = [
      ANALYZE_INTENT_PROMPT,
      "",
      ctx.repository_context ?? "",
      "",
      `## User Intent`,
      ctx.user_input ?? ctx.specification.intent.raw_input,
      "",
      this.buildSpecContext(ctx),
    ].join("\n");

    return this.callModel(prompt);
  }

  async proposeQuestions(ctx: ModelContext): Promise<SpecificationUpdate> {
    const prompt = [
      PROPOSE_QUESTIONS_PROMPT,
      "",
      ctx.repository_context ?? "",
      "",
      this.buildSpecContext(ctx),
    ].join("\n");

    return this.callModel(prompt);
  }

  async proposeSpecificationUpdate(ctx: ModelContext): Promise<SpecificationUpdate> {
    const userInput = ctx.user_input ?? "";
    const prompt = [
      REFINE_WITH_ANSWER_PROMPT,
      "",
      ctx.repository_context ?? "",
      "",
      this.buildSpecContext(ctx),
      "",
      `## User Input / Answer`,
      userInput,
    ].join("\n");

    return this.callModel(prompt);
  }
}

// ---------------------------------------------------------------------------
// Factory: create provider from env / config
// ---------------------------------------------------------------------------

export function createGeminiProvider(options: {
  apiKeyEnv?: string;
  model?: string;
}): GeminiProvider {
  const envKey = options.apiKeyEnv ?? "GEMINI_API_KEY";
  const apiKey = process.env[envKey];
  if (!apiKey) {
    throw new Error(
      `Yokai: Gemini API key not found. Set the ${envKey} environment variable.`
    );
  }
  return new GeminiProvider({ apiKey, model: options.model });
}
