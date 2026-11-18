// HTTP API for the Cotsi web app. Runtime-neutral: it only needs fetch-style Request and
// Response, so the same handler runs on Supabase Edge Functions and in local tests.

import { checkBudget, dayKey, GLOBAL_USER, recordSpend } from "./budget.ts";
import { type ChatMessage, type ClaudeRunner, describeError, type RunResult } from "./claude.ts";
import {
  edgeSystem,
  huntSystem,
  kickoff,
  type LessonMode,
  lessonSession,
  lessonSystem,
  needsShows,
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
import {
  addDays,
  cleanDream,
  type Dream,
  localDay,
  localHour,
  recordDay,
  reminderText,
  type Streak,
  streakView,
  validTz,
} from "./engage.ts";
import type { Store } from "./store.ts";
import {
  cleanTtsText,
  DEFAULT_VOICE,
  fetchVoiceList,
  pickVoices,
  PREVIEW_TEXT,
  SPEEDS,
  synthesize,
  type TtsConfig,
  ttsCost,
  type Voice,
} from "./tts.ts";
import { type BoardEntry, boardName, boardView, type GameStats, placeOnBoard, plausibleRun, recordRun, removeFromBoard, weekStart } from "./game.ts";
import { findTopic, hasTopics, isUnlocked, stepStatuses, type SyllabusProgress, topicKey } from "./syllabus.ts";
import { generateVapidKeys, isPushEndpoint, type PushSubscription, sendPush, type VapidKeys } from "./webpush.ts";
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
  /** How reminders reach browser push services (tests pass a fake). */
  pushFetch?: typeof fetch;
  /** How read-aloud reaches Azure Speech (tests and the preview pass a fake). */
  ttsFetch?: typeof fetch;
};

type UserRecord = {
  email: string;
  name: string;
  prefs: Prefs;
  createdAt: string;
  /** The learner's time zone, from their browser; days and reminder times follow it. */
  tz?: string;
  /** What getting the job will change for them, shown on the progress bar and in reminders. */
  dream?: Dream;
  /** Daily reminder hour (0–23, their time) while reminders are on. */
  reminder?: { hour: number };
  /** Which version of the Terms of Use they accepted, and when. */
  terms?: { version: string; at: string };
};

/** Bump when the Terms of Use change in a way learners must accept again (matches web/src/pages/Terms.tsx). */
export const TERMS_VERSION = "2026-11-16";

/** One device's reminder subscription, kept under the site-wide user so the hourly run can list them all. */
type PushEntry = { user: string; sub: PushSubscription; hour: number; tz?: string; lastSent?: string };

const PUSH_SUBJECT = "https://cotsi.siddheshthapa.com";

const DEFAULT_PREFS: Prefs = { style: "characters", shows: "", visuals: true };
const MAX_HISTORY = 40;
const MAX_MESSAGE_CHARS = 6000;
const MAX_PDF_BASE64 = 6_000_000; // about 4.4 MB of PDF
// Topic threads: m<milestone>t<topic> plus l (learn), r (revise) or q (test only).
const THREAD_ID = /^(main|plan|hunt|edge|m[1-9]\d?|m[1-9]\d?t[1-9]\d?[lrq]|review-\d{8})$/;

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
    // Called every hour by a scheduled GitHub workflow. Safe for anyone to call: it only sends
    // reminders that are due anyway, at most once per learner per day, and runs at most every 10 minutes.
    if (req.method === "POST" && path === "/cron/reminders") return json(await runReminders(deps), 200, cors);

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

/** True when this email may use lessons and CV analysis. */
export function isMember(memberEmails: string[], email: string): boolean {
  if (memberEmails.includes("*")) return true;
  const e = email.trim().toLowerCase();
  return e !== "" && memberEmails.includes(e);
}

type Access = { ready: true } | { ready: false; message: string; code: "not_ready" | "members_only" | "terms" };

/** Whether this learner can use the AI right now, and what to tell them if not. */
function aiAccess(deps: Deps, user: User, rec: UserRecord): Access {
  if (deps.aiReady === false) return { ready: false, message: deps.env.notReadyMessage, code: "not_ready" };
  if (rec.terms?.version !== TERMS_VERSION) {
    return { ready: false, message: "Please read and accept the Terms of Use to start learning.", code: "terms" };
  }
  if (!isMember(deps.env.memberEmails, user.email)) {
    return { ready: false, message: deps.env.membersOnlyMessage, code: "members_only" };
  }
  return { ready: true };
}

async function requireBudget(deps: Deps, user: User, kind: "reply" | "analysis" | "step" = "reply") {
  const access = aiAccess(deps, user, await loadUser(deps, user));
  if (!access.ready) throw new HttpError(access.code === "not_ready" ? 503 : 403, access.message, access.code);
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
  const milestones = t.state.roadmap?.milestones ?? [];
  const topical = t.kind === "job" && hasTopics(milestones);
  const statuses = topical ? stepStatuses(milestones, t.job ?? {}) : [];
  return {
    id: t.id,
    kind: t.kind,
    title: t.title,
    phase: t.state.phase ?? null,
    unit: t.kind !== "job" ? "ideas" : topical ? "steps" : "milestones",
    total: t.kind === "job" ? (topical ? statuses.length : milestones.length) : trunk,
    done: t.kind === "job"
      ? topical ? statuses.filter((x) => x.done).length : t.job?.milestonesDone?.length ?? 0
      : t.state.progress?.done?.length ?? 0,
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

  if (m === "GET" && path === "/me") return getMe(url, user, deps);
  if (m === "DELETE" && path === "/me") return deleteMe(user, deps);
  if (m === "PUT" && path === "/prefs") return putPrefs(req, user, deps);
  if (m === "POST" && path === "/game/run") return postRun(req, user, deps);
  if (m === "GET" && path === "/tts/voices") return getVoices(user, deps);
  if (m === "GET" && path === "/tts/preview") return getPreview(url, user, deps);
  if (m === "POST" && path === "/tts") return postTts(req, user, deps);
  if (m === "GET" && path === "/game/board") return getBoard(user, deps);
  if (m === "PUT" && path === "/dream") return putDream(req, user, deps);
  if (m === "PUT" && path === "/terms") return putTerms(req, user, deps);
  if (m === "GET" && path === "/push/key") return json({ key: (await vapidKeys(deps)).publicKey });
  if (m === "PUT" && path === "/push") return putPush(req, user, deps);
  if (m === "DELETE" && path === "/push") return deletePush(user, deps);

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

async function getMe(url: URL, user: User, deps: Deps): Promise<Response> {
  const [rec, tracks, usage, streak] = await Promise.all([
    loadUser(deps, user),
    deps.store.list<Track>(user.id, "track:"),
    deps.store.get<Record<string, number>>(user.id, dayKey(now(deps))),
    deps.store.get<Streak>(user.id, "streak"),
  ]);
  const tz = validTz(url.searchParams.get("tz"));
  if (tz && tz !== rec.tz) {
    rec.tz = tz;
    await deps.store.put(user.id, "user", rec);
  }
  const summaries = tracks
    .map((t) => trackSummary(t.value))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return json({
    user: { email: rec.email, name: rec.name },
    prefs: rec.prefs,
    tracks: summaries,
    today: now(deps).toISOString().slice(0, 10),
    usage: { used: Math.min(1, (usage?.cost ?? 0) / deps.env.userDailyUsd) },
    ai: (() => {
      const access = aiAccess(deps, user, rec);
      return access.ready ? { ready: true } : { ready: false, message: access.message };
    })(),
    streak: streakView(streak, localDay(now(deps), rec.tz)),
    dream: rec.dream ?? null,
    reminder: rec.reminder ? { on: true, hour: rec.reminder.hour } : { on: false },
    terms: { version: TERMS_VERSION, accepted: rec.terms?.version === TERMS_VERSION },
    voices: { ready: Boolean(ttsConfig(deps)) },
  });
}

async function deleteMe(user: User, deps: Deps): Promise<Response> {
  await removeFromBoards(deps, user.id);
  await deps.store.deleteUser(user.id);
  await deps.store.del(GLOBAL_USER, `push:${user.id}`);
  if (deps.deleteAccount) await deps.deleteAccount(user.id).catch((e) => console.error("deleteAccount", e));
  return json({ ok: true });
}

export function cleanPrefs(input: Partial<Prefs>): Prefs {
  const prefs: Prefs = {
    style: input.style === "plain" ? "plain" : "characters",
    shows: String(input.shows ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    visuals: input.visuals !== false,
    bookScenes: input.bookScenes === true,
  };
  if (input.mode === "read" || input.mode === "listen") prefs.mode = input.mode;
  const voice = String(input.voice ?? "").trim();
  if (voice && voice.length <= 160) prefs.voice = voice;
  const rate = Number(input.rate);
  if (Number.isFinite(rate) && rate >= 0.5 && rate <= 2) prefs.rate = Math.round(rate * 100) / 100;
  if (input.board === false) prefs.board = false;
  return prefs;
}

/**
 * When a lesson asked for the learner's favorite shows, its state block carries the answer.
 * Only used while none are saved, so a lesson can't change preferences the learner set themselves.
 */
export function showsFromState(prefs: Prefs, raw: Record<string, unknown>): Prefs | null {
  if (!needsShows(prefs)) return null;
  if (raw.style === "plain") return { ...prefs, style: "plain" };
  const shows = typeof raw.shows === "string" ? raw.shows.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  return shows ? { ...prefs, shows } : null;
}

async function putPrefs(req: Request, user: User, deps: Deps): Promise<Response> {
  const input = await body<Partial<Prefs>>(req);
  const rec = await loadUser(deps, user);
  const wasShown = rec.prefs.board !== false;
  rec.prefs = cleanPrefs(input);
  await deps.store.put(user.id, "user", rec);
  const shown = rec.prefs.board !== false;
  if (wasShown !== shown) await syncBoards(deps, user, rec, shown);
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

type Variant = "learn" | "revise" | "know";

type ThreadPlan =
  | { type: "lesson"; mode: LessonMode; milestone?: number; topic?: number; variant?: Variant }
  | { type: "research"; which: "hunt" | "edge" };

const VARIANT: Record<string, Variant> = { l: "learn", r: "revise", q: "know" };

function planThread(track: Track, thread: string): ThreadPlan {
  if (thread.startsWith("review-")) return { type: "lesson", mode: "review" };
  if (track.kind !== "job") {
    if (thread !== "main") throw new HttpError(400, "Unknown thread.");
    return { type: "lesson", mode: track.kind === "book" ? "book" : "learn" };
  }
  if (thread === "plan") return { type: "lesson", mode: "plan" };
  if (thread === "hunt" || thread === "edge") return { type: "research", which: thread };
  const roadmap = track.state.roadmap;
  if (!roadmap) throw new HttpError(409, "Build your syllabus first.");
  const progress: SyllabusProgress = track.job ?? {};
  const topicThread = thread.match(/^m(\d+)t(\d+)([lrq])$/);
  if (topicThread) {
    const [n, k, variant] = [Number(topicThread[1]), Number(topicThread[2]), VARIANT[topicThread[3]]];
    if (!findTopic(roadmap.milestones, n, k)) throw new HttpError(404, "That topic doesn't exist.");
    const key = topicKey(n, k);
    if (!isUnlocked(roadmap.milestones, progress, key)) {
      throw new HttpError(403, "This topic opens once you've finished the ones before it.", "locked");
    }
    const done = Boolean(progress.topics?.[key]);
    if (!done && variant !== "learn" && (progress.mustLearn ?? []).includes(key)) {
      throw new HttpError(403, "You didn't pass the test on this topic yet, so learn it first. Then the next topic opens.", "locked");
    }
    return { type: "lesson", mode: "topic", milestone: n, topic: k, variant };
  }
  const n = Number(thread.slice(1));
  if (!roadmap.milestones.some((x) => x.n === n)) throw new HttpError(404, "That milestone doesn't exist.");
  if (hasTopics(roadmap.milestones) && !isUnlocked(roadmap.milestones, progress, `${n}.build`)) {
    throw new HttpError(403, "This hands-on part opens once you've finished the milestone's topics.", "locked");
  }
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

function applyState(
  track: Track,
  raw: Record<string, unknown>,
  mode: LessonMode,
  today: Date,
  topic?: { n: number; k: number; variant: Variant },
): void {
  const s: CotsiState = track.state;
  if (mode === "topic") {
    applyTopicResult(track, raw, today, topic);
    if (Array.isArray(raw.notes)) s.notes = cleanNotes(raw.notes);
    return;
  }
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
      start_points: Array.isArray(roadmap.start_points)
        ? roadmap.start_points.filter((x: unknown) => typeof x === "string").map((x: string) => x.slice(0, 160)).slice(0, 10)
        : undefined,
      // deno-lint-ignore no-explicit-any
      milestones: roadmap.milestones.slice(0, 12).map((x: any, i: number) => ({
        n: i + 1,
        title: String(x.title ?? `Milestone ${i + 1}`),
        hours: Number(x.hours) || undefined,
        done_means: Array.isArray(x.done_means) ? x.done_means.map(String).slice(0, 6) : [],
        boss: x.boss === true,
        capstone: x.capstone === true || undefined,
        topics: Array.isArray(x.topics)
          ? x.topics.filter((t: unknown) => typeof t === "string" && t.trim()).map((t: string) => t.trim().slice(0, 90)).slice(0, 8)
          : undefined,
      })),
    };
  }
  if (Array.isArray(raw.notes)) s.notes = cleanNotes(raw.notes);
  const doneN = Number(raw.milestone_done);
  if (mode === "milestone" && track.job && Number.isInteger(doneN) && s.roadmap?.milestones.some((x) => x.n === doneN)) {
    track.job.milestonesDone = [...new Set([...(track.job.milestonesDone ?? []), doneN])].sort((a, b) => a - b);
  }
}

function cleanNotes(raw: unknown[]): string[] {
  return raw
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => x.trim().slice(0, 160))
    .slice(-8);
}

/** Pass mark for "Revise" and "I already know this": 4 of 5 (80%). */
const PASS_SHARE = 0.8;

/** A topic is done by learning it, or by passing its test; a failed test means Learn comes next. */
function applyTopicResult(track: Track, raw: Record<string, unknown>, at: Date, topic?: { n: number; k: number; variant: Variant }) {
  if (!topic || !track.job) return;
  const key = topicKey(topic.n, topic.k);
  const job = track.job;
  if (job.topics?.[key]) return; // already done; nothing to change
  const markDone = (via: Variant) => {
    job.topics = { ...(job.topics ?? {}), [key]: { via, at: at.toISOString() } };
    job.mustLearn = (job.mustLearn ?? []).filter((x) => x !== key);
  };
  if (topic.variant === "learn" && raw.topic_done === true) {
    markDone("learn");
    return;
  }
  // deno-lint-ignore no-explicit-any
  const result = raw.test_result as any;
  const score = Number(result?.score);
  const of = Number(result?.of);
  if (topic.variant !== "learn" && Number.isFinite(score) && Number.isFinite(of) && of >= 3) {
    if (score / of >= PASS_SHARE) markDone(topic.variant);
    else job.mustLearn = [...new Set([...(job.mustLearn ?? []), key])];
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
      ? kickoff(plan.mode, track, plan.milestone, plan.topic, plan.variant)
      : researchUser({ today, track, extra: text || undefined });
    history = [{ role: "user", text: first, at: at.toISOString(), hidden: true }];
    if (text && plan.type === "lesson") history.push({ role: "user", text, at: at.toISOString() });
  } else {
    if (!text) throw new HttpError(400, "Type a message first.");
    history.push({ role: "user", text, at: at.toISOString() });
  }

  if (plan.type === "lesson" && plan.mode === "topic" && track.job && plan.variant) {
    const key = topicKey(plan.milestone!, plan.topic!);
    track.job.started = { ...(track.job.started ?? {}), [key]: track.job.started?.[key] ?? plan.variant };
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
          topic: plan.topic,
          variant: plan.variant,
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
          mock: `lesson:${plan.mode === "topic" ? `topic-${plan.variant}` : plan.mode}:${history.filter((x) => x.role === "user").length}`,
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
    let prefs: Prefs | null = null;
    if (plan.type === "lesson") {
      const raw = extractState(result.text);
      if (raw) {
        const topic = plan.mode === "topic" ? { n: plan.milestone!, k: plan.topic!, variant: plan.variant! } : undefined;
        applyState(track, raw, plan.mode, at, topic);
        prefs = showsFromState(rec.prefs, raw);
      }
    }
    track.updatedAt = now(deps).toISOString();
    await Promise.all([deps.store.put(user.id, key, history), deps.store.put(user.id, `track:${id}`, track)]);
    if (prefs) {
      // Re-read the account so a change made elsewhere during the reply isn't overwritten.
      const fresh = await loadUser(deps, user);
      if (needsShows(fresh.prefs)) {
        fresh.prefs = { ...fresh.prefs, style: prefs.style, shows: prefs.shows };
        await deps.store.put(user.id, "user", fresh);
      }
    }
    // A day counts toward the streak once the learner answers or asks something (opening a lesson doesn't).
    if (text) await countToday(deps, user, rec.tz);
    send({ t: "done", track, sources: result.sources.slice(0, 30), cut: result.stopReason === "max_tokens" });
  });
}

// ------------------------------------------------------------------ read-aloud voices (Azure)

function ttsConfig(deps: Deps): TtsConfig | null {
  const { azureSpeechKey: key, azureSpeechRegion: region, ttsUsdPerMillion } = deps.env;
  return key && region ? { key, region, usdPerMillion: ttsUsdPerMillion } : null;
}

function requireTts(deps: Deps): TtsConfig {
  const cfg = ttsConfig(deps);
  if (!cfg) throw new HttpError(503, "Natural voices are coming very soon.", "voices_off");
  return cfg;
}

const VOICES_KEY = "tts:voices";
// Kept per store, so separate deployments (and tests) never share a list.
const voiceCaches = new WeakMap<Store, { at: number; voices: Voice[] }>();

/** The voices on offer. Azure's list is fetched at most once a day and shared by everyone. */
async function offeredVoices(deps: Deps, cfg: TtsConfig): Promise<Voice[]> {
  const nowMs = now(deps).getTime();
  const memo = voiceCaches.get(deps.store);
  if (memo && nowMs - memo.at < 3600_000) return memo.voices;
  const stored = await deps.store.get<{ at: number; voices: Voice[] }>(GLOBAL_USER, VOICES_KEY);
  if (stored && nowMs - stored.at < 86400_000 && stored.voices.length) {
    voiceCaches.set(deps.store, stored);
    return stored.voices;
  }
  let voices: Voice[];
  try {
    voices = pickVoices(await fetchVoiceList(cfg, deps.ttsFetch ?? fetch));
  } catch (err) {
    console.error("tts voices", err);
    if (stored?.voices.length) return stored.voices;
    throw new HttpError(502, "Couldn't load the voices just now. Please try again in a minute.", "voices_error");
  }
  const fresh = { at: nowMs, voices };
  voiceCaches.set(deps.store, fresh);
  await deps.store.put(GLOBAL_USER, VOICES_KEY, fresh);
  return voices;
}

async function getVoices(user: User, deps: Deps): Promise<Response> {
  const cfg = requireTts(deps);
  return json({ voices: await offeredVoices(deps, cfg), default: DEFAULT_VOICE });
}

function audioResponse(audio: Uint8Array<ArrayBuffer>, type: string, cache: string): Response {
  return new Response(audio, { headers: { "Content-Type": type, "Cache-Control": cache } });
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Speaks the fixed sample line. Each voice and speed is made once and shared, so previews cost almost nothing. */
async function getPreview(url: URL, user: User, deps: Deps): Promise<Response> {
  const cfg = requireTts(deps);
  const voice = url.searchParams.get("voice") ?? "";
  const rate = Number(url.searchParams.get("rate") ?? 1);
  if (!SPEEDS.includes(rate)) throw new HttpError(400, "Unknown speed.");
  if (!(await offeredVoices(deps, cfg)).some((v) => v.id === voice)) throw new HttpError(400, "Unknown voice.", "bad_voice");
  const key = `tts-preview:${voice}:${rate}`;
  const cached = await deps.store.get<{ type: string; b64: string }>(GLOBAL_USER, key);
  if (cached) return audioResponse(fromB64(cached.b64), cached.type, "private, max-age=86400");
  const text = PREVIEW_TEXT[voice.startsWith("hi-") ? "hi" : "en"];
  const out = await synthesizeOrFail(cfg, deps, text, voice, rate);
  await recordSpend(deps.store, user.id, now(deps), ttsCost(text.length, cfg.usdPerMillion), { ttsChars: text.length });
  await deps.store.put(GLOBAL_USER, key, { type: out.type, b64: toB64(out.audio) });
  return audioResponse(out.audio, out.type, "private, max-age=86400");
}

async function synthesizeOrFail(cfg: TtsConfig, deps: Deps, text: string, voice: string, rate: number) {
  try {
    return await synthesize(cfg, deps.ttsFetch ?? fetch, text, voice, rate);
  } catch (err) {
    console.error("tts", err);
    const status = (err as { status?: number }).status;
    if (status === 429) throw new HttpError(429, "Lots of people are listening right now. Please try again in a moment.", "voices_busy");
    throw new HttpError(502, "The voice didn't load. Please try again.", "voices_error");
  }
}

/** Reads part of a lesson aloud. Counts toward the same daily limits as lessons. */
async function postTts(req: Request, user: User, deps: Deps): Promise<Response> {
  const cfg = requireTts(deps);
  const input = await body<{ text?: unknown; voice?: unknown; rate?: unknown }>(req);
  const text = cleanTtsText(input.text);
  if (!text) throw new HttpError(400, "Nothing to read.");
  const rate = Number(input.rate ?? 1);
  if (!Number.isFinite(rate) || rate < 0.5 || rate > 2) throw new HttpError(400, "Unknown speed.");
  const voices = await offeredVoices(deps, cfg);
  const voice = typeof input.voice === "string" && voices.some((v) => v.id === input.voice) ? input.voice : DEFAULT_VOICE;
  await requireBudget(deps, user);
  const out = await synthesizeOrFail(cfg, deps, text, voice, rate);
  await recordSpend(deps.store, user.id, now(deps), ttsCost(text.length, cfg.usdPerMillion), { ttsChars: text.length });
  return audioResponse(out.audio, out.type, "private, max-age=3600");
}

// ------------------------------------------------------------------ game: high scores and leaderboards

const ALL_BOARD = "board:all";
const weekBoard = (start: string) => `board:week:${start}`;

// Boards are small lists in one row each. Two runs finishing in the same instant could race, which
// at worst drops one board update; the learner's own best is stored separately and kept.
async function updateBoard(deps: Deps, key: string, change: (b: BoardEntry[]) => BoardEntry[]): Promise<void> {
  const board = (await deps.store.get<BoardEntry[]>(GLOBAL_USER, key)) ?? [];
  await deps.store.put(GLOBAL_USER, key, change(board));
}

async function removeFromBoards(deps: Deps, uid: string): Promise<void> {
  const start = weekStart(now(deps));
  for (const key of [ALL_BOARD, weekBoard(start), weekBoard(addDays(start, -7))]) {
    await updateBoard(deps, key, (b) => removeFromBoard(b, uid));
  }
}

/** Adds (or removes) the learner's current bests when they switch the leaderboard on (or off). */
async function syncBoards(deps: Deps, user: User, rec: UserRecord, shown: boolean): Promise<void> {
  if (!shown) return removeFromBoards(deps, user.id);
  const stats = await deps.store.get<GameStats>(user.id, "game");
  const at = now(deps);
  const name = boardName(rec.name);
  if (stats?.best) await updateBoard(deps, ALL_BOARD, (b) => placeOnBoard(b, { uid: user.id, name, score: stats.best, at: stats.bestAt ?? at.toISOString() }));
  if (stats?.week && stats.week.start === weekStart(at) && stats.week.best) {
    await updateBoard(deps, weekBoard(stats.week.start), (b) => placeOnBoard(b, { uid: user.id, name, score: stats.week!.best, at: at.toISOString() }));
  }
}

async function postRun(req: Request, user: User, deps: Deps): Promise<Response> {
  const input = await body<{ score?: unknown; ms?: unknown }>(req);
  if (!plausibleRun(input.score, input.ms)) throw new HttpError(400, "That run couldn't be saved.", "bad_run");
  const at = now(deps);
  const [rec, stats] = await Promise.all([loadUser(deps, user), deps.store.get<GameStats>(user.id, "game")]);
  const result = recordRun(stats, input.score, at);
  if (result.allTime || result.week) await deps.store.put(user.id, "game", result.stats);
  if (rec.prefs.board !== false) {
    const entry = { uid: user.id, name: boardName(rec.name), score: input.score, at: at.toISOString() };
    if (result.allTime) await updateBoard(deps, ALL_BOARD, (b) => placeOnBoard(b, entry));
    if (result.week) {
      const start = result.stats.week!.start;
      const existing = await deps.store.get<BoardEntry[]>(GLOBAL_USER, weekBoard(start));
      // A new week's board starts: drop the one from two weeks ago, which nobody sees any more.
      if (!existing) await deps.store.del(GLOBAL_USER, weekBoard(addDays(start, -14)));
      await updateBoard(deps, weekBoard(start), (b) => placeOnBoard(b, entry));
    }
  }
  return json({ best: result.stats.best, weekBest: result.stats.week?.best ?? 0, newBest: result.allTime });
}

async function getBoard(user: User, deps: Deps): Promise<Response> {
  const at = now(deps);
  const start = weekStart(at);
  const [rec, stats, all, week] = await Promise.all([
    loadUser(deps, user),
    deps.store.get<GameStats>(user.id, "game"),
    deps.store.get<BoardEntry[]>(GLOBAL_USER, ALL_BOARD),
    deps.store.get<BoardEntry[]>(GLOBAL_USER, weekBoard(start)),
  ]);
  const weekView = boardView(week ?? [], user.id);
  const allView = boardView(all ?? [], user.id);
  return json({
    week: { starts: start, rows: weekView.rows },
    all: { rows: allView.rows },
    me: {
      name: boardName(rec.name),
      shown: rec.prefs.board !== false,
      best: stats?.best ?? 0,
      weekBest: stats?.week?.start === start ? stats.week.best : 0,
      weekRank: weekView.myRank,
      allRank: allView.myRank,
    },
  });
}

// ------------------------------------------------------------------ streak, dream, reminders

async function countToday(deps: Deps, user: User, tz?: string): Promise<void> {
  try {
    const next = recordDay(await deps.store.get<Streak>(user.id, "streak"), localDay(now(deps), tz));
    if (next) await deps.store.put(user.id, "streak", next);
  } catch (err) {
    console.error("streak", err); // never fail a lesson over the streak
  }
}

async function putTerms(req: Request, user: User, deps: Deps): Promise<Response> {
  const input = await body<{ version?: string; adult?: boolean }>(req);
  if (input.version !== TERMS_VERSION) throw new HttpError(409, "The Terms of Use were just updated. Please reload the page and read them again.");
  if (input.adult !== true) throw new HttpError(400, "Cotsi is for people aged 18 or older.");
  const rec = await loadUser(deps, user);
  rec.terms = { version: TERMS_VERSION, at: now(deps).toISOString() };
  await deps.store.put(user.id, "user", rec);
  return json({ terms: { version: TERMS_VERSION, accepted: true } });
}

async function putDream(req: Request, user: User, deps: Deps): Promise<Response> {
  const input = await body<unknown>(req);
  let dream: Dream;
  try {
    dream = cleanDream(input);
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
  const rec = await loadUser(deps, user);
  rec.dream = dream;
  await deps.store.put(user.id, "user", rec);
  return json({ dream });
}

/** The server's push signing keys, made on first use and kept in the database (never in the code). */
async function vapidKeys(deps: Deps): Promise<VapidKeys> {
  const saved = await deps.store.get<VapidKeys>(GLOBAL_USER, "vapid");
  if (saved) return saved;
  await deps.store.put(GLOBAL_USER, "vapid", await generateVapidKeys());
  return (await deps.store.get<VapidKeys>(GLOBAL_USER, "vapid"))!;
}

async function putPush(req: Request, user: User, deps: Deps): Promise<Response> {
  const input = await body<{ subscription?: PushSubscription; hour?: number; tz?: string }>(req);
  const sub = input.subscription;
  if (!sub || !isPushEndpoint(sub.endpoint) || typeof sub.keys?.p256dh !== "string" || typeof sub.keys?.auth !== "string") {
    throw new HttpError(400, "This browser's notification details weren't valid. Please try again.");
  }
  const hour = Math.round(Number(input.hour));
  if (!(hour >= 0 && hour <= 23)) throw new HttpError(400, "Pick a reminder time.");
  const rec = await loadUser(deps, user);
  rec.tz = validTz(input.tz) ?? rec.tz;
  rec.reminder = { hour };
  const entry: PushEntry = {
    user: user.id,
    sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh.slice(0, 200), auth: sub.keys.auth.slice(0, 100) } },
    hour,
    tz: rec.tz,
  };
  await Promise.all([deps.store.put(user.id, "user", rec), deps.store.put(GLOBAL_USER, `push:${user.id}`, entry)]);
  return json({ reminder: { on: true, hour } });
}

async function deletePush(user: User, deps: Deps): Promise<Response> {
  const rec = await loadUser(deps, user);
  delete rec.reminder;
  await Promise.all([deps.store.put(user.id, "user", rec), deps.store.del(GLOBAL_USER, `push:${user.id}`)]);
  return json({ reminder: { on: false } });
}

/** Sends today's reminder to everyone whose reminder time has passed and who hasn't learned yet today. */
async function runReminders(deps: Deps): Promise<Record<string, number | boolean>> {
  const at = now(deps);
  const last = await deps.store.get<{ at: string }>(GLOBAL_USER, "cron:reminders");
  if (last && at.getTime() - new Date(last.at).getTime() < 10 * 60_000) return { ok: true, throttled: true };
  await deps.store.put(GLOBAL_USER, "cron:reminders", { at: at.toISOString() });
  if (deps.aiReady === false) return { ok: true, sent: 0 };

  const entries = await deps.store.list<PushEntry>(GLOBAL_USER, "push:");
  let keys: VapidKeys | null = null;
  const counts = { sent: 0, learned: 0, gone: 0, failed: 0 };
  for (const { key, value: e } of entries) {
    const day = localDay(at, e.tz);
    if (e.lastSent === day || localHour(at, e.tz) < e.hour) continue;
    try {
      const [rec, streak] = await Promise.all([
        deps.store.get<UserRecord>(e.user, "user"),
        deps.store.get<Streak>(e.user, "streak"),
      ]);
      if (!rec) {
        await deps.store.del(GLOBAL_USER, key);
        continue;
      }
      if (!isMember(deps.env.memberEmails, rec.email) || rec.terms?.version !== TERMS_VERSION) continue;
      const view = streakView(streak, day);
      if (view.doneToday) {
        counts.learned++; // already learned today: no nudge needed
      } else {
        keys ??= await vapidKeys(deps);
        const status = await sendPush(e.sub, reminderText(view, rec.dream), keys, PUSH_SUBJECT, at, deps.pushFetch);
        if (status === 404 || status === 410) {
          // The browser unsubscribed or the person blocked notifications.
          delete rec.reminder;
          await Promise.all([deps.store.del(GLOBAL_USER, key), deps.store.put(e.user, "user", rec)]);
          counts.gone++;
          continue;
        }
        if (status < 200 || status >= 300) {
          console.error("push failed", status);
          counts.failed++;
          continue; // try again next hour
        }
        counts.sent++;
      }
      await deps.store.put(GLOBAL_USER, key, { ...e, lastSent: day });
    } catch (err) {
      console.error("reminder", err);
      counts.failed++;
    }
  }
  return { ok: true, ...counts };
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
