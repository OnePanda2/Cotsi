// HTTP API for the Cotsi web app. Runtime-neutral: it only needs fetch-style Request and
// Response, so the same handler runs on Supabase Edge Functions and in local tests.

import { checkBudget, dayKey, recordSpend } from "./budget.ts";
import { type ChatMessage, type ClaudeRunner, describeError, type RunResult } from "./claude.ts";
import {
  edgeSystem,
  huntSystem,
  kickoff,
  type LessonMode,
  lessonSession,
  lessonSystem,
  PROFILE_SCHEMA,
  profileSystem,
  RECOMMEND_SCHEMA,
  recommendSystem,
  recommendUser,
  researchUser,
  scanSystem,
  scanUser,
  type Signal,
  SIGNALS,
} from "./prompts.ts";
import type { Store } from "./store.ts";
import type {
  CotsiState,
  Env,
  JobDraft,
  JobPrefs,
  Prefs,
  Profile,
  Recommendations,
  StoredMessage,
  Track,
  User,
} from "./types.ts";

export type Deps = {
  env: Env;
  store: Store;
  claude: ClaudeRunner;
  /** Resolves a bearer token to a signed-in user, or null. */
  verifyToken: (token: string) => Promise<User | null>;
  /** Removes the sign-in account itself (optional; data is always deleted). */
  deleteAccount?: (userId: string) => Promise<void>;
  now?: () => Date;
  /** False while no Claude API key is set: learners can sign in, and lessons wait for launch. */
  aiReady?: boolean;
};

type UserRecord = { email: string; name: string; prefs: Prefs; createdAt: string };

const DEFAULT_PREFS: Prefs = { style: "characters", shows: "", visuals: true };
const MAX_HISTORY = 40;
const MAX_MESSAGE_CHARS = 6000;
const MAX_PDF_BASE64 = 6_000_000; // about 4.4 MB of PDF
const THREAD_ID = /^(main|plan|hunt|edge|m[1-9]\d?|review-\d{8})$/;

class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(req, deps.env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^.*?\/api(?=\/|$)/, "") || "/";
    if (path === "/health") return json(await health(deps, url.searchParams.has("deep")), 200, cors);

    const user = await authenticate(req, deps);
    const res = await route(req, path, url, user, deps);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status, cors);
    console.error("unhandled", err);
    const d = describeError(err);
    return json({ error: d.message }, d.status, cors);
  }
}

// ------------------------------------------------------------------ plumbing

/** Whether the AI key is set and the database answers. `deep` also checks the spending counter. */
async function health(deps: Deps, deep: boolean) {
  const result: Record<string, boolean> = { ok: true, ai: deps.aiReady !== false };
  try {
    await deps.store.get("_health", "ping");
    result.db = true;
  } catch (err) {
    console.error("health db", err);
    result.db = false;
  }
  if (deep) {
    try {
      await deps.store.bump("_health", "ping", { checks: 0 });
      result.counters = true;
    } catch (err) {
      console.error("health counters", err);
      result.counters = false;
    }
  }
  return result;
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = env.allowedOrigins.includes(origin) ? origin : env.allowedOrigins[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function authenticate(req: Request, deps: Deps): Promise<User> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "Please sign in.", "auth");
  const user = await deps.verifyToken(token);
  if (!user) throw new HttpError(401, "Your session has expired. Please sign in again.", "auth");
  return user;
}

async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "The request wasn't valid JSON.");
  }
}

function now(deps: Deps): Date {
  return deps.now ? deps.now() : new Date();
}

function limits(env: Env) {
  return { dailyBudgetUsd: env.dailyBudgetUsd, userDailyUsd: env.userDailyUsd, jobAnalysesPerDay: env.jobAnalysesPerDay };
}

async function requireBudget(deps: Deps, user: User, kind: "reply" | "analysis" | "step" = "reply") {
  if (deps.aiReady === false) throw new HttpError(503, deps.env.notReadyMessage, "not_ready");
  const status = await checkBudget(deps.store, user.id, limits(deps.env), now(deps), kind);
  if (!status.ok) throw new HttpError(429, status.message!, status.reason);
}

function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

async function loadUser(deps: Deps, user: User): Promise<UserRecord> {
  const existing = await deps.store.get<UserRecord>(user.id, "user");
  if (existing) return existing;
  const rec: UserRecord = {
    email: user.email,
    name: user.name,
    prefs: { ...DEFAULT_PREFS },
    createdAt: now(deps).toISOString(),
  };
  await deps.store.put(user.id, "user", rec);
  return rec;
}

async function loadTrack(deps: Deps, user: User, id: string): Promise<Track> {
  if (!/^[a-z0-9]{8,32}$/.test(id)) throw new HttpError(404, "That lesson doesn't exist.");
  const track = await deps.store.get<Track>(user.id, `track:${id}`);
  if (!track) throw new HttpError(404, "That lesson doesn't exist.");
  return track;
}

function trackSummary(t: Track) {
  const trunk = t.state.map?.trunk?.length ?? 0;
  const milestones = t.state.roadmap?.milestones.length ?? 0;
  return {
    id: t.id,
    kind: t.kind,
    title: t.title,
    phase: t.state.phase ?? null,
    total: t.kind === "job" ? milestones : trunk,
    done: t.kind === "job" ? t.job?.milestonesDone?.length ?? 0 : t.state.progress?.done?.length ?? 0,
    nextReviewAt: t.state.nextReviewAt ?? null,
    updatedAt: t.updatedAt,
  };
}

/** Server-sent events: the handler streams progress, then a final "done" or "error" event. */
function sse(run: (send: (event: Record<string, unknown>) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true; // the learner closed the page; keep working so the reply is still saved
        }
      };
      const send = (event: Record<string, unknown>) => write(`data: ${JSON.stringify(event)}\n\n`);
      const heartbeat = setInterval(() => write(": keep-alive\n\n"), 15000);
      run(send)
        .catch((err) => {
          if (err instanceof HttpError) {
            send({ t: "error", message: err.message, code: err.code });
          } else {
            console.error("stream failed", err);
            send({ t: "error", message: describeError(err).message });
          }
        })
        .finally(() => {
          clearInterval(heartbeat);
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // already closed
            }
          }
        });
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}

function withTimeout(deps: Deps): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.env.requestTimeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

// ------------------------------------------------------------------ routes

async function route(req: Request, path: string, url: URL, user: User, deps: Deps): Promise<Response> {
  const m = req.method;
  const seg = path.split("/").filter(Boolean);

  if (m === "GET" && path === "/me") return getMe(user, deps);
  if (m === "DELETE" && path === "/me") return deleteMe(user, deps);
  if (m === "PUT" && path === "/prefs") return putPrefs(req, user, deps);

  if (m === "POST" && path === "/tracks") return createTrack(req, user, deps);
  if (seg[0] === "tracks" && seg[1]) {
    if (m === "GET" && seg.length === 2) return getTrack(seg[1], url, user, deps);
    if (m === "DELETE" && seg.length === 2) return deleteTrack(seg[1], user, deps);
    if (m === "POST" && seg[2] === "chat") return chat(req, seg[1], user, deps);
  }

  if (m === "GET" && path === "/job") return getJob(user, deps);
  if (m === "POST" && path === "/job/profile") return jobProfile(req, user, deps);
  if (m === "POST" && path === "/job/scan") return jobScan(req, user, deps);
  if (m === "POST" && path === "/job/recommend") return jobRecommend(user, deps);
  if (m === "POST" && path === "/job/choose") return jobChoose(req, user, deps);

  throw new HttpError(404, "Not found.");
}

async function getMe(user: User, deps: Deps): Promise<Response> {
  const [rec, tracks, usage] = await Promise.all([
    loadUser(deps, user),
    deps.store.list<Track>(user.id, "track:"),
    deps.store.get<Record<string, number>>(user.id, dayKey(now(deps))),
  ]);
  const summaries = tracks
    .map((t) => trackSummary(t.value))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return json({
    user: { email: rec.email, name: rec.name },
    prefs: rec.prefs,
    tracks: summaries,
    today: now(deps).toISOString().slice(0, 10),
    usage: { used: Math.min(1, (usage?.cost ?? 0) / deps.env.userDailyUsd) },
    ai: deps.aiReady === false ? { ready: false, message: deps.env.notReadyMessage } : { ready: true },
  });
}

async function deleteMe(user: User, deps: Deps): Promise<Response> {
  await deps.store.deleteUser(user.id);
  if (deps.deleteAccount) await deps.deleteAccount(user.id).catch((e) => console.error("deleteAccount", e));
  return json({ ok: true });
}

async function putPrefs(req: Request, user: User, deps: Deps): Promise<Response> {
  const input = await body<Partial<Prefs>>(req);
  const rec = await loadUser(deps, user);
  rec.prefs = {
    style: input.style === "plain" ? "plain" : "characters",
    shows: String(input.shows ?? "").slice(0, 200),
    visuals: input.visuals !== false,
    bookScenes: input.bookScenes === true,
  };
  await deps.store.put(user.id, "user", rec);
  return json({ prefs: rec.prefs });
}

async function createTrack(req: Request, user: User, deps: Deps): Promise<Response> {
  const input = await body<{ kind?: string; title?: string; depth?: string }>(req);
  const title = String(input.title ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (title.length < 2) throw new HttpError(400, "Tell me what you want to learn.");
  if (input.kind !== "topic" && input.kind !== "book") throw new HttpError(400, "Unknown lesson type.");
  const depth = input.depth === "quick" || input.depth === "deep" ? input.depth : "standard";
  const at = now(deps).toISOString();
  const track: Track = { id: newId(), kind: input.kind, title, depth, createdAt: at, updatedAt: at, state: {} };
  await deps.store.put(user.id, `track:${track.id}`, track);
  return json({ track });
}

async function getTrack(id: string, url: URL, user: User, deps: Deps): Promise<Response> {
  const track = await loadTrack(deps, user, id);
  const thread = url.searchParams.get("thread") ?? defaultThread(track);
  if (!THREAD_ID.test(thread)) throw new HttpError(400, "Unknown thread.");
  const messages = (await deps.store.get<StoredMessage[]>(user.id, `msgs:${id}:${thread}`)) ?? [];
  return json({ track, thread, messages: messages.filter((x) => !x.hidden) });
}

async function deleteTrack(id: string, user: User, deps: Deps): Promise<Response> {
  await loadTrack(deps, user, id);
  const threads = await deps.store.list(user.id, `msgs:${id}:`);
  await Promise.all([deps.store.del(user.id, `track:${id}`), ...threads.map((t) => deps.store.del(user.id, t.key))]);
  return json({ ok: true });
}

function defaultThread(track: Track): string {
  return track.kind === "job" ? "plan" : "main";
}

// ------------------------------------------------------------------ chat

type ThreadPlan =
  | { type: "lesson"; mode: LessonMode; milestone?: number }
  | { type: "research"; which: "hunt" | "edge" };

function planThread(track: Track, thread: string): ThreadPlan {
  if (thread.startsWith("review-")) return { type: "lesson", mode: "review" };
  if (track.kind !== "job") {
    if (thread !== "main") throw new HttpError(400, "Unknown thread.");
    return { type: "lesson", mode: track.kind === "book" ? "book" : "learn" };
  }
  if (thread === "plan") return { type: "lesson", mode: "plan" };
  if (thread === "hunt" || thread === "edge") return { type: "research", which: thread };
  const n = Number(thread.slice(1));
  const roadmap = track.state.roadmap;
  if (!roadmap) throw new HttpError(409, "Build your syllabus first.");
  if (!roadmap.milestones.some((x) => x.n === n)) throw new HttpError(404, "That milestone doesn't exist.");
  return { type: "lesson", mode: "milestone", milestone: n };
}

export function extractState(text: string): Record<string, unknown> | null {
  const matches = [...text.matchAll(/```cotsi-state\s*\n([\s\S]*?)```/g)];
  if (!matches.length) return null;
  try {
    const parsed = JSON.parse(matches[matches.length - 1][1].trim());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function applyState(track: Track, raw: Record<string, unknown>, mode: LessonMode, today: Date): void {
  const s: CotsiState = track.state;
  const phases = ["questions", "teaching", "unlock", "wrapup", "done"];
  // The course plan and reviews report their own phase; it must not overwrite the lesson's.
  if (mode !== "review" && mode !== "plan" && mode !== "milestone" && phases.includes(raw.phase as string)) {
    s.phase = raw.phase as CotsiState["phase"];
  }
  if (mode !== "review" && raw.map && typeof raw.map === "object") s.map = raw.map as CotsiState["map"];
  if (raw.progress && typeof raw.progress === "object" && mode !== "plan") {
    s.progress = raw.progress as CotsiState["progress"];
  }
  if (Array.isArray(raw.cards) && raw.cards.length) {
    s.cards = (raw.cards as { q?: unknown; a?: unknown }[])
      .filter((c) => c && typeof c.q === "string" && typeof c.a === "string")
      .slice(0, 20) as CotsiState["cards"];
  }
  const days = Number(raw.next_review_in_days);
  if (Number.isFinite(days) && days >= 1 && days <= 120 && mode !== "plan") {
    s.reviewStepDays = Math.round(days);
    s.nextReviewAt = new Date(today.getTime() + Math.round(days) * 86400000).toISOString().slice(0, 10);
  }
  // deno-lint-ignore no-explicit-any
  const roadmap = raw.roadmap as any;
  if (mode === "plan" && roadmap && Array.isArray(roadmap.milestones) && roadmap.milestones.length) {
    s.roadmap = {
      outcome: String(roadmap.outcome ?? ""),
      capstone: String(roadmap.capstone ?? ""),
      weeks: Number(roadmap.weeks) || undefined,
      // deno-lint-ignore no-explicit-any
      milestones: roadmap.milestones.slice(0, 12).map((x: any, i: number) => ({
        n: i + 1,
        title: String(x.title ?? `Milestone ${i + 1}`),
        hours: Number(x.hours) || undefined,
        done_means: Array.isArray(x.done_means) ? x.done_means.map(String).slice(0, 6) : [],
        boss: x.boss === true,
      })),
    };
  }
  const doneN = Number(raw.milestone_done);
  if (mode === "milestone" && track.job && Number.isInteger(doneN) && s.roadmap?.milestones.some((x) => x.n === doneN)) {
    track.job.milestonesDone = [...new Set([...(track.job.milestonesDone ?? []), doneN])].sort((a, b) => a - b);
  }
}

async function chat(req: Request, id: string, user: User, deps: Deps): Promise<Response> {
  const input = await body<{ thread?: string; message?: string; restart?: boolean }>(req);
  const track = await loadTrack(deps, user, id);
  const thread = input.thread ?? defaultThread(track);
  if (!THREAD_ID.test(thread)) throw new HttpError(400, "Unknown thread.");
  const plan = planThread(track, thread);
  const text = String(input.message ?? "").trim();
  if (text.length > MAX_MESSAGE_CHARS) throw new HttpError(400, "That message is too long. Please shorten it.");
  await requireBudget(deps, user);

  const key = `msgs:${id}:${thread}`;
  const [rec, stored] = await Promise.all([loadUser(deps, user), deps.store.get<StoredMessage[]>(user.id, key)]);
  let history = input.restart ? [] : stored ?? [];
  const at = now(deps);
  const today = at.toISOString().slice(0, 10);

  if (!history.length) {
    const first = plan.type === "lesson"
      ? kickoff(plan.mode, track, plan.milestone)
      : researchUser({ today, track, extra: text || undefined });
    history = [{ role: "user", text: first, at: at.toISOString(), hidden: true }];
    if (text && plan.type === "lesson") history.push({ role: "user", text, at: at.toISOString() });
  } else {
    if (!text) throw new HttpError(400, "Type a message first.");
    history.push({ role: "user", text, at: at.toISOString() });
  }

  const truncated = history.length > MAX_HISTORY;
  let recent = truncated ? history.slice(-MAX_HISTORY) : history;
  while (recent.length && recent[0].role !== "user") recent = recent.slice(1);
  const messages: ChatMessage[] = recent.map((x) => ({ role: x.role, content: x.text }));

  return sse(async (send) => {
    const timeout = withTimeout(deps);
    let result: RunResult;
    try {
      if (plan.type === "lesson") {
        const session = lessonSession({
          today,
          name: rec.name.split(" ")[0] ?? "",
          mode: plan.mode,
          track,
          prefs: rec.prefs,
          milestone: plan.milestone,
          truncated,
        });
        result = await deps.claude({
          model: plan.mode === "plan" ? deps.env.modelPlan : deps.env.modelLesson,
          system: lessonSystem(session),
          messages,
          maxTokens: 16000,
          effort: plan.mode === "plan" || history.length <= 1 ? "medium" : "low",
          onText: (d) => send({ t: "text", d }),
          signal: timeout.signal,
          mock: `lesson:${plan.mode}:${history.filter((x) => x.role === "user").length}`,
        });
      } else {
        result = await deps.claude({
          model: deps.env.modelResearch,
          system: plan.which === "hunt" ? huntSystem() : edgeSystem(),
          messages,
          maxTokens: 12000,
          effort: "medium",
          webSearch: { maxUses: plan.which === "hunt" ? 5 : 6 },
          onText: (d) => send({ t: "text", d }),
          onStatus: (s) => send({ t: "status", d: s }),
          signal: timeout.signal,
          mock: `research:${plan.which}`,
        });
      }
    } finally {
      timeout.clear();
    }

    await recordSpend(deps.store, user.id, at, result.costUsd, { replies: 1 });
    if (result.refused || !result.text.trim()) {
      throw new HttpError(422, "I can't help with that one. Try asking in a different way.", "refused");
    }

    history.push({
      role: "assistant",
      text: result.text,
      at: now(deps).toISOString(),
      ...(result.sources.length ? { sources: result.sources.slice(0, 30) } : {}),
    });
    if (plan.type === "lesson") {
      const raw = extractState(result.text);
      if (raw) applyState(track, raw, plan.mode, at);
    }
    track.updatedAt = now(deps).toISOString();
    await Promise.all([deps.store.put(user.id, key, history), deps.store.put(user.id, `track:${id}`, track)]);
    send({ t: "done", track, sources: result.sources.slice(0, 30), cut: result.stopReason === "max_tokens" });
  });
}

// ------------------------------------------------------------------ job preparation

async function getJob(user: User, deps: Deps): Promise<Response> {
  const [draft, scans] = await Promise.all([
    deps.store.get<JobDraft>(user.id, "job"),
    deps.store.list<{ text: string; sources: unknown[] }>(user.id, "jobscan:"),
  ]);
  const scanMap: Record<string, unknown> = {};
  for (const s of scans) scanMap[s.key.slice("jobscan:".length)] = s.value;
  return json({ draft: draft ?? null, scans: scanMap, signals: SIGNALS });
}

function cleanJobPrefs(input: Partial<JobPrefs> | undefined): JobPrefs {
  const hours = Math.round(Number(input?.hoursPerWeek));
  return {
    hoursPerWeek: Number.isFinite(hours) ? Math.min(60, Math.max(1, hours)) : 5,
    horizonMonths: Number(input?.horizonMonths) === 6 ? 6 : 3,
    location: String(input?.location ?? "").trim().slice(0, 80),
    workMode: input?.workMode === "remote" || input?.workMode === "on-site" ? input.workMode : "either",
    note: String(input?.note ?? "").trim().slice(0, 300) || undefined,
  };
}

async function jobProfile(req: Request, user: User, deps: Deps): Promise<Response> {
  const input = await body<{ pdfBase64?: string; text?: string; prefs?: Partial<JobPrefs> }>(req);
  const prefs = cleanJobPrefs(input.prefs);
  // deno-lint-ignore no-explicit-any
  const content: any[] = [];
  if (input.pdfBase64) {
    const data = input.pdfBase64.replace(/\s+/g, "");
    if (data.length > MAX_PDF_BASE64) throw new HttpError(413, "That file is too large. Please upload a PDF under 4 MB.");
    if (!data.startsWith("JVBER")) throw new HttpError(400, "Please upload your CV as a PDF file.");
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
  } else if (input.text && input.text.trim().length >= 200) {
    content.push({ type: "text", text: `<cv>\n${input.text.trim().slice(0, 30000)}\n</cv>` });
  } else {
    throw new HttpError(400, "Upload your CV as a PDF, or paste its text (at least a few lines).");
  }
  content.push({ type: "text", text: "Extract the career profile from this document." });
  await requireBudget(deps, user, "analysis");

  const timeout = withTimeout(deps);
  let result: RunResult;
  try {
    result = await deps.claude({
      model: deps.env.modelResearch,
      system: profileSystem(),
      messages: [{ role: "user", content }],
      maxTokens: 8000,
      effort: "low",
      jsonSchema: PROFILE_SCHEMA,
      signal: timeout.signal,
      mock: "profile",
    });
  } finally {
    timeout.clear();
  }
  await recordSpend(deps.store, user.id, now(deps), result.costUsd, { analyses: 1 });

  let profile: Profile;
  try {
    profile = JSON.parse(result.text) as Profile;
  } catch {
    throw new HttpError(502, "I couldn't read that CV. Please try again, or paste the text instead.");
  }
  if (!profile.is_cv) {
    throw new HttpError(422, profile.not_cv_reason || "That doesn't look like a CV. Please upload your CV or resume.", "not_cv");
  }

  // A new analysis replaces the previous one, including its scans.
  const old = await deps.store.list(user.id, "jobscan:");
  await Promise.all(old.map((s) => deps.store.del(user.id, s.key)));
  const draft: JobDraft = { profile, prefs, updatedAt: now(deps).toISOString() };
  await deps.store.put(user.id, "job", draft);
  return json({ draft });
}

async function jobScan(req: Request, user: User, deps: Deps): Promise<Response> {
  const input = await body<{ signal?: string }>(req);
  const signal = input.signal as Signal;
  if (!Object.hasOwn(SIGNALS, signal)) throw new HttpError(400, "Unknown signal.");
  const draft = await deps.store.get<JobDraft>(user.id, "job");
  if (!draft?.profile || !draft.prefs) throw new HttpError(409, "Upload your CV first.");
  await requireBudget(deps, user, "step");
  const at = now(deps);

  return sse(async (send) => {
    const timeout = withTimeout(deps);
    let result: RunResult;
    try {
      result = await deps.claude({
        model: deps.env.modelResearch,
        system: scanSystem(),
        messages: [{
          role: "user",
          content: scanUser({ today: at.toISOString().slice(0, 10), signal, profile: draft.profile!, prefs: draft.prefs! }),
        }],
        maxTokens: 8000,
        effort: "low",
        webSearch: { maxUses: 3 },
        onStatus: (s) => send({ t: "status", d: s }),
        signal: timeout.signal,
        mock: `scan:${signal}`,
      });
    } finally {
      timeout.clear();
    }
    await recordSpend(deps.store, user.id, at, result.costUsd);
    if (result.refused || !result.text.trim()) throw new HttpError(502, "That scan came back empty. Please retry it.");
    const value = { text: result.text, sources: result.sources.slice(0, 20) };
    await deps.store.put(user.id, `jobscan:${signal}`, value);
    send({ t: "done", ...value });
  });
}

async function jobRecommend(user: User, deps: Deps): Promise<Response> {
  const [draft, scans] = await Promise.all([
    deps.store.get<JobDraft>(user.id, "job"),
    deps.store.list<{ text: string }>(user.id, "jobscan:"),
  ]);
  if (!draft?.profile || !draft.prefs) throw new HttpError(409, "Upload your CV first.");
  if (scans.length < 2) throw new HttpError(409, "The market scan hasn't finished yet.");
  await requireBudget(deps, user, "step");
  const at = now(deps);
  const scanText: Partial<Record<Signal, string>> = {};
  for (const s of scans) scanText[s.key.slice("jobscan:".length) as Signal] = s.value.text;

  const timeout = withTimeout(deps);
  let result: RunResult;
  try {
    result = await deps.claude({
      model: deps.env.modelResearch,
      system: recommendSystem(),
      messages: [{
        role: "user",
        content: recommendUser({ today: at.toISOString().slice(0, 10), profile: draft.profile, prefs: draft.prefs, scans: scanText }),
      }],
      maxTokens: 10000,
      effort: "medium",
      jsonSchema: RECOMMEND_SCHEMA,
      signal: timeout.signal,
      mock: "recommend",
    });
  } finally {
    timeout.clear();
  }
  await recordSpend(deps.store, user.id, at, result.costUsd);

  let recs: Recommendations;
  try {
    recs = JSON.parse(result.text) as Recommendations;
  } catch {
    throw new HttpError(502, "I couldn't finish the recommendations. Please try again.");
  }
  // Only keep evidence links that really appeared in the scans.
  const seen = scans.map((s) => s.value.text).join("\n");
  for (const role of recs.roles ?? []) {
    role.evidence = (role.evidence ?? []).filter((e) => e.url && seen.includes(e.url));
    role.fit_score = Math.max(0, Math.min(100, Math.round(role.fit_score)));
  }
  recs.roles = (recs.roles ?? []).slice(0, 3);
  if (!recs.roles.length) throw new HttpError(502, "I couldn't finish the recommendations. Please try again.");
  draft.recs = recs;
  draft.updatedAt = now(deps).toISOString();
  await deps.store.put(user.id, "job", draft);
  return json({ draft });
}

async function jobChoose(req: Request, user: User, deps: Deps): Promise<Response> {
  const input = await body<{ index?: number }>(req);
  const draft = await deps.store.get<JobDraft>(user.id, "job");
  const role = draft?.recs?.roles?.[Number(input.index)];
  if (!draft?.profile || !draft.prefs || !role) throw new HttpError(409, "Pick one of your recommended roles.");
  const at = now(deps).toISOString();
  const track: Track = {
    id: newId(),
    kind: "job",
    title: role.title.slice(0, 200),
    createdAt: at,
    updatedAt: at,
    state: {},
    job: { profile: draft.profile, prefs: draft.prefs, role, milestonesDone: [] },
  };
  await deps.store.put(user.id, `track:${track.id}`, track);
  return json({ track });
}
