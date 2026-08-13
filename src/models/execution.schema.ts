import { z } from "zod";

export const FileChangeSchema = z.object({
  path: z.string().describe("The relative path of the file to modify or create"),
  content: z.string().describe("The full new content of the file"),
});

export const ExecutionResponseSchema = z.object({
  files: z.array(FileChangeSchema).describe("List of files modified or created by the execution"),
  reasoning: z.string().describe("A brief explanation of how the requirements were fulfilled"),
}).strict();

export type FileChange = z.infer<typeof FileChangeSchema>;
export type ExecutionResponse = z.infer<typeof ExecutionResponseSchema>;

/**
 * Validates and parses raw JSON from the LLM into an ExecutionResponse.
 * 
 * @throws {z.ZodError} If validation fails.
 */
export function parseExecutionResponse(data: unknown): ExecutionResponse {
  return ExecutionResponseSchema.parse(data) as ExecutionResponse;
}
