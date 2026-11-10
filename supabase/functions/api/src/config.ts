import type { Env } from "./types.ts";

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Reads settings from environment variables. Only ANTHROPIC_API_KEY is required. */
export function readEnv(get: (name: string) => string | undefined): Env {
  return {
    anthropicApiKey: get("ANTHROPIC_API_KEY") ?? "",
    modelLesson: get("COTSI_MODEL_LESSON") || "claude-sonnet-5-5",
    modelPlan: get("COTSI_MODEL_PLAN") || "claude-opus-5-5",
    modelResearch: get("COTSI_MODEL_RESEARCH") || "claude-opus-5-5",
    dailyBudgetUsd: num(get("COTSI_DAILY_BUDGET_USD"), 10),
    userDailyUsd: num(get("COTSI_USER_DAILY_USD"), 1.5),
    jobAnalysesPerDay: num(get("COTSI_JOB_ANALYSES_PER_DAY"), 1),
    allowedOrigins: (get("COTSI_ALLOWED_ORIGINS") || "https://cotsi.siddheshthapa.com")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    // Supabase stops a free-plan function at 150 seconds, so give up a little earlier.
    requestTimeoutMs: num(get("COTSI_REQUEST_TIMEOUT_MS"), 140_000),
    devAuth: get("COTSI_DEV_AUTH") === "1",
  };
}
