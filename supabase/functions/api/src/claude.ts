// One wrapper around the Claude Messages API: streaming, optional web search,
// optional JSON-schema output, resume on pause_turn, and cost accounting.

import Anthropic from "@anthropic-ai/sdk";
import { costOf, type Usage } from "./budget.ts";

export type SystemBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };
export type ChatMessage = { role: "user" | "assistant"; content: unknown };

export type RunOpts = {
  model: string;
  system: SystemBlock[];
  messages: ChatMessage[];
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  webSearch?: { maxUses: number };
  jsonSchema?: Record<string, unknown>;
  onText?: (delta: string) => void;
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
  /** Which canned reply to use when MOCK_CLAUDE=1. */
  mock?: string;
};

export type Source = { url: string; title: string };

export type RunResult = {
  text: string;
  stopReason: string | null;
  refused: boolean;
  costUsd: number;
  model: string;
  sources: Source[];
  searches: number;
};

export type ClaudeRunner = (opts: RunOpts) => Promise<RunResult>;

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_CONTINUATIONS = 3;

export function makeClaude(apiKey: string): ClaudeRunner {
  const client = new Anthropic({ apiKey, maxRetries: 2 });

  return async function run(opts: RunOpts): Promise<RunResult> {
    let messages = opts.messages;
    let text = "";
    let costUsd = 0;
    let searches = 0;
    let stopReason: string | null = null;
    let servedBy = opts.model;
    const sources = new Map<string, Source>();
    let useFallbacks = true;

    for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
      // deno-lint-ignore no-explicit-any
      const params: any = {
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages,
        cache_control: { type: "ephemeral" },
      };
      if (opts.effort || opts.jsonSchema) {
        params.output_config = {
          ...(opts.effort ? { effort: opts.effort } : {}),
          ...(opts.jsonSchema ? { format: { type: "json_schema", schema: opts.jsonSchema } } : {}),
        };
      }
      if (opts.webSearch) {
        params.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: opts.webSearch.maxUses }];
      }
      if (useFallbacks) {
        // If a safety classifier declines, the API retries on a fallback model in the same call.
        params.betas = [FALLBACK_BETA];
        params.fallbacks = "default";
      }

      // deno-lint-ignore no-explicit-any
      let final: any;
      try {
        const stream = client.beta.messages.stream(params, { signal: opts.signal });
        const toolJson = new Map<number, string>();
        for await (const ev of stream) {
          if (ev.type === "content_block_delta") {
            // deno-lint-ignore no-explicit-any
            const d = ev.delta as any;
            if (d.type === "text_delta") {
              text += d.text;
              opts.onText?.(d.text);
            } else if (d.type === "input_json_delta" && toolJson.has(ev.index)) {
              toolJson.set(ev.index, toolJson.get(ev.index) + d.partial_json);
            }
          } else if (ev.type === "content_block_start") {
            // deno-lint-ignore no-explicit-any
            const b = ev.content_block as any;
            if (b.type === "server_tool_use") {
              toolJson.set(ev.index, "");
              opts.onStatus?.("Searching the web…");
            }
          } else if (ev.type === "content_block_stop" && toolJson.has(ev.index)) {
            try {
              const q = JSON.parse(toolJson.get(ev.index) || "{}").query;
              if (typeof q === "string" && q) opts.onStatus?.(`Searching: ${q}`);
            } catch {
              // partial tool input; the generic status above is enough
            }
            toolJson.delete(ev.index);
          }
        }
        final = await stream.finalMessage();
      } catch (err) {
        if (useFallbacks && err instanceof Anthropic.BadRequestError && /fallback|beta/i.test(err.message)) {
          useFallbacks = false; // this account or model doesn't take the fallbacks parameter
          turn--;
          continue;
        }
        throw err;
      }

      const usage = final.usage as Usage;
      servedBy = final.model ?? servedBy;
      costUsd += costOf(servedBy, usage);
      searches += usage.server_tool_use?.web_search_requests ?? 0;
      stopReason = final.stop_reason ?? null;

      for (const block of final.content ?? []) {
        if (block.type === "text") {
          for (const c of block.citations ?? []) {
            if (c.url && !sources.has(c.url)) sources.set(c.url, { url: c.url, title: c.title || c.url });
          }
        }
      }

      if (stopReason === "pause_turn" && turn < MAX_CONTINUATIONS) {
        // The server-side search loop paused; resend with the partial turn and it resumes.
        messages = [...messages, { role: "assistant", content: final.content }];
        continue;
      }
      break;
    }

    return {
      text,
      stopReason,
      refused: stopReason === "refusal",
      costUsd,
      model: servedBy,
      sources: [...sources.values()],
      searches,
    };
  };
}

/** Friendly message for the learner when a Claude call fails. */
export function describeError(err: unknown): { status: number; message: string } {
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "Cotsi is very busy right now. Please try again in a minute." };
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return { status: 500, message: "Cotsi's AI connection isn't set up correctly. Please tell the site owner." };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { status: 400, message: "That request couldn't be processed. Try rephrasing, or a smaller file." };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 503, message: "Couldn't reach the AI service. Please try again." };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 503, message: "The AI service had a problem. Please try again in a moment." };
  }
  if (err instanceof Anthropic.APIUserAbortError || (err instanceof Error && err.name === "AbortError")) {
    return { status: 504, message: "That took too long. Please try again." };
  }
  return { status: 500, message: "Something went wrong. Please try again." };
}
