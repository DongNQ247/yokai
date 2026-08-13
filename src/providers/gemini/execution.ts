import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import type { ExecutionProvider, ExecutionContext, ExecutionResult } from "../execution.js";
import { parseExecutionResponse } from "../../models/execution.schema.js";
import { extractFirstJson, stripCodeFences } from "../json-utils.js";

const SYSTEM_PROMPT_EXECUTION = `You are Yokai, an advanced AI execution agent.
Your objective is to read a detailed Software Specification and write the actual code to fulfill its requirements.
You MUST output your response strictly as a JSON object matching the requested schema.
Your response will be parsed programmatically. Do NOT include markdown code fences (\`\`\`json) or any conversational text.

Schema:
{
  "files": [
    {
      "path": "src/example.ts",
      "content": "Full content of the file..."
    }
  ],
  "reasoning": "Brief explanation of how requirements were fulfilled"
}

Important Rules:
1. "path" must be relative to the repository root.
2. "content" must be the FULL, complete, and valid file content. Do NOT use placeholders, truncation, or snippets.
3. If a requirement modifies an existing file, you must output the full new content of that file.
`;

export interface GeminiExecutionProviderConfig {
  apiKey: string;
  model?: string | undefined;
}

export class GeminiExecutionProvider implements ExecutionProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(config: GeminiExecutionProviderConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.model = config.model ?? "gemini-3.5-flash";
  }

  async execute(ctx: ExecutionContext): Promise<ExecutionResult> {
    const spec = ctx.specification;
    const reqsToExecute = ctx.requirement_id 
      ? spec.requirements.filter(r => r.id === ctx.requirement_id)
      : spec.requirements.filter(r => r.status === "CONFIRMED" || r.status === "ASSUMED");

    if (reqsToExecute.length === 0) {
      return {
        ok: false,
        files_changed: [],
        log: "No requirements to execute.",
        errors: ["No valid requirements found for execution."],
      };
    }

    const reqsContext = reqsToExecute.map(r => `[${r.id}] ${r.title}\n${r.description}`).join("\n\n");

    const prompt = [
      `## Repository Context`,
      ctx.repository_context ?? "(none)",
      ``,
      `## Requirements to Execute`,
      reqsContext,
      ``,
      `Write the necessary code to implement these requirements.`,
    ].join("\n");

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PROMPT_EXECUTION,
          responseMimeType: "application/json",
          temperature: 0.1, // Low temperature for code generation
          maxOutputTokens: 8192,
        },
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from model");
      // Strip markdown code fences and extract first valid JSON object.
      const cleaned = extractFirstJson(stripCodeFences(text));

      const parsed = parseExecutionResponse(JSON.parse(cleaned));
      
      const filesChanged: string[] = [];
      
      // Write files to disk
      for (const file of parsed.files) {
        const absolutePath = path.resolve(ctx.cwd, file.path);
        
        // Security check: ensure we don't write outside cwd
        const root = path.resolve(ctx.cwd);
        if (absolutePath !== root && !absolutePath.startsWith(root + path.sep)) {
          console.warn(`Skipping invalid path outside cwd: ${file.path}`);
          continue;
        }

        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, file.content, "utf-8");
        filesChanged.push(file.path);
      }

      return {
        ok: true,
        files_changed: filesChanged,
        log: parsed.reasoning,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        files_changed: [],
        log: "Execution failed due to an error.",
        errors: [`GeminiExecutionProvider failed: ${message}`],
      };
    }
  }
}

export function createGeminiExecutionProvider(options: {
  apiKeyEnv?: string;
  model?: string;
}): GeminiExecutionProvider {
  const envKey = options.apiKeyEnv ?? "GEMINI_API_KEY";
  const apiKey = process.env[envKey];
  if (!apiKey) {
    throw new Error(
      `Yokai: Gemini API key not found. Set the ${envKey} environment variable.`
    );
  }
  return new GeminiExecutionProvider({ apiKey, model: options.model });
}
