// Spending guard. Every Claude call is priced from its token usage and added to two
// daily counters: one per learner and one for the whole site. When either is over its
// cap, new calls are refused until the next day (UTC).

import type { Store } from "./store.ts";

export const GLOBAL_USER = "_global";

// USD per million tokens. Cache writes are 1.25x input (5-minute TTL).
const PRICES: Record<string, { in: number; out: number; cacheRead: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01 },
  "claude-fable-5-2": { in: 8, out: 40, cacheRead: 0.2 },
};
const FALLBACK_PRICE = { in: 5, out: 25, cacheRead: 0.5 }; // unknown model: assume Opus-class
const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches

export type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

export function costOf(model: string, usage: Usage): number {
  const p = PRICES[model] ?? FALLBACK_PRICE;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  return (input * p.in + write * p.in * 1.25 + read * p.cacheRead + output * p.out) / 1_000_000 + searches * WEB_SEARCH_USD;
}

export type Limits = {
  dailyBudgetUsd: number;
  userDailyUsd: number;
  jobAnalysesPerDay: number;
};

export function dayKey(now: Date): string {
  return `usage:${now.toISOString().slice(0, 10)}`;
}

export type BudgetStatus = {
  ok: boolean;
  reason?: "site_full" | "user_limit" | "analysis_limit";
  message?: string;
  userSpent: number;
  userCap: number;
};

export async function checkBudget(
  store: Store,
  user: string,
  limits: Limits,
  now: Date,
  kind: "reply" | "analysis" = "reply",
): Promise<BudgetStatus> {
  const key = dayKey(now);
  const [site, mine] = await Promise.all([
    store.get<Record<string, number>>(GLOBAL_USER, key),
    store.get<Record<string, number>>(user, key),
  ]);
  const userSpent = mine?.cost ?? 0;
  const base = { userSpent, userCap: limits.userDailyUsd };
  if ((site?.cost ?? 0) >= limits.dailyBudgetUsd) {
    return {
      ...base,
      ok: false,
      reason: "site_full",
      message: "Cotsi is at capacity for today. Your progress is saved. Please come back tomorrow.",
    };
  }
  if (userSpent >= limits.userDailyUsd) {
    return {
      ...base,
      ok: false,
      reason: "user_limit",
      message: "You've reached today's learning limit. Sleep on it: what you learned sticks better after a break. See you tomorrow.",
    };
  }
  if (kind === "analysis" && (mine?.analyses ?? 0) >= limits.jobAnalysesPerDay) {
    return {
      ...base,
      ok: false,
      reason: "analysis_limit",
      message: "You've already run a CV analysis today. You can run a new one tomorrow.",
    };
  }
  return { ...base, ok: true };
}

export async function recordSpend(
  store: Store,
  user: string,
  now: Date,
  costUsd: number,
  extra: Record<string, number> = {},
): Promise<void> {
  const key = dayKey(now);
  await Promise.all([
    store.bump(GLOBAL_USER, key, { cost: costUsd, calls: 1 }),
    store.bump(user, key, { cost: costUsd, calls: 1, ...extra }),
  ]);
}
