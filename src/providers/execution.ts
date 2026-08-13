import type { Specification } from "../models/specification.js";

/**
 * ExecutionContext provides all necessary information for an ExecutionProvider
 * to execute the accepted specification on the target repository.
 */
export interface ExecutionContext {
  /** The ACCEPTED specification */
  specification: Specification;
  
  /** Raw content of relevant repository files */
  repository_context?: string | undefined;
  
  /** 
   * Optional: If provided, the provider should only execute this specific requirement.
   * If omitted, the provider should execute the entire specification.
   */
  requirement_id?: string | undefined;
  
  /** Working directory for the execution (usually the project root) */
  cwd: string;
}

/**
 * ExecutionResult represents the outcome of an execution attempt.
 */
export interface ExecutionResult {
  /** True if execution succeeded completely, false otherwise */
  ok: boolean;
  
  /** List of absolute or relative file paths that were modified/created */
  files_changed: string[];
  
  /** Text log of the execution process (e.g. LLM output, agent reasoning) */
  log: string;
  
  /** Array of error messages if ok is false */
  errors?: string[];
}

/**
 * ExecutionProvider interface.
 * 
 * While the ModelProvider proposes changes to the Specification,
 * the ExecutionProvider executes an ACCEPTED Specification against the repository.
 */
export interface ExecutionProvider {
  /**
   * Executes the specification by modifying the repository source code.
   */
  execute(ctx: ExecutionContext): Promise<ExecutionResult>;
}
