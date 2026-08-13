/**
 * JSON parsing utilities shared by all model providers.
 */

/**
 * Extracts the first well-formed JSON object or array from `text`.
 * Handles trailing garbage that some models append after the closing brace
 * (e.g. Gemini occasionally emits `  ]\n}` after a valid root object).
 * Falls back to the original string if no balanced structure is found.
 */
export function extractFirstJson(text: string): string {
  const startChar = text[0];
  const endChar = startChar === "{" ? "}" : startChar === "[" ? "]" : null;
  if (!endChar) return text;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === "\"") { inString = !inString; continue; }
    if (inString) continue;

    if (ch === startChar) depth++;
    else if (ch === endChar) {
      depth--;
      if (depth === 0) return text.slice(0, i + 1);
    }
  }
  return text; // fallback: return as-is
}

/**
 * Strips markdown code fences from a model response string.
 * Does NOT use the /m flag so that `$` matches end-of-string only.
 */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}
