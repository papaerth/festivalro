import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { extractJSON } from "@/lib/utils";

export const AI_MODEL = process.env.LUMEROVIA_AI_MODEL || "claude-opus-5-5";

let client: Anthropic | null = null;

export function hasAI(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());
}

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export class AIUnavailableError extends Error {}

/**
 * Ask Claude for a JSON answer and validate it against a zod schema.
 * Throws AIUnavailableError when no API key is configured so callers can fall back.
 */
export async function askJSON<S extends z.ZodTypeAny>(system: string, user: string, schema: S, maxTokens = 8000): Promise<z.infer<S>> {
  if (!hasAI()) throw new AIUnavailableError("ANTHROPIC_API_KEY is not configured");
  const anthropic = getClient();
  // Server-side refusal fallback: if the primary model declines, the API re-runs the
  // same request on the fallback model within the same call.
  const response = await anthropic.beta.messages.create({
    model: AI_MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
    output_config: { effort: "medium" },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error(`AI declined the request${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : ""}`);
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const parsed = extractJSON(text);
  return schema.parse(parsed);
}
