// End-to-end tests of the API with the mock AI and an in-memory store.
//   deno test -A --config supabase/functions/api/deno.json tests/api_test.ts
import Anthropic from "@anthropic-ai/sdk";
import { extractState, handle, isMember, showsFromState, TERMS_VERSION } from "../supabase/functions/api/src/app.ts";

// deno-lint-ignore no-explicit-any
type Called = { status: number; json: any; events: any[]; headers: Headers };
import { describeError, isOutOfCredit } from "../supabase/functions/api/src/claude.ts";
import { readEnv } from "../supabase/functions/api/src/config.ts";
import { makeMockClaude } from "../supabase/functions/api/src/mock.ts";
import { MemoryStore } from "../supabase/functions/api/src/store.ts";
import { costOf } from "../supabase/functions/api/src/budget.ts";
import { lessonSession } from "../supabase/functions/api/src/prompts.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function setup(overrides: Record<string, string> = {}) {
  const env = readEnv((n) => ({ COTSI_MEMBERS: "*", ...overrides })[n]);
  env.allowedOrigins = ["https://cotsi.siddheshthapa.com"];
  const store = new MemoryStore();
  let clock = new Date("2026-11-10T10:00:00Z");
  const deps = {
    env,
    store,
    claude: makeMockClaude(0),
    verifyToken: (t: string) => Promise.resolve(t.startsWith("dev:") ? { id: t, email: `${t.slice(4)}@x.com`, name: "Riya Sharma" } : null),
    now: () => clock,
    aiReady: true as boolean,
    pushFetch: undefined as typeof fetch | undefined,
  };
  const accepted = new Set<string>();
  const call = async (method: string, path: string, body?: unknown, token = "dev:riya"): Promise<Called> => {
    if (!accepted.has(token) && path !== "/terms" && !overrides.NO_AUTO_TERMS) {
      accepted.add(token);
      await call("PUT", "/terms", { version: TERMS_VERSION, adult: true }, token);
    }
    const res = await handle(
      new Request(`https://x.supabase.co/functions/v1/api${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin: "https://cotsi.siddheshthapa.com" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      deps,
    );
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("event-stream")) {
      const events = (await res.text()).split("\n\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));
      return { status: res.status, events, json: events.at(-1), headers: res.headers };
    }
    return { status: res.status, json: await res.json(), events: [], headers: res.headers };
  };
  return {
    call,
    store,
    deps,
    setClock: (d: string) => (clock = new Date(d)),
    tick: (ms: number) => (clock = new Date(clock.getTime() + ms)),
  };
}

const PDF = "JVBERi0xLjQK" + "A".repeat(400);
const PREFS = { hoursPerWeek: 6, horizonMonths: 3, location: "India", workMode: "remote" };

Deno.test("auth is required and CORS is set", async () => {
  const { call } = setup();
  const anon = await call("GET", "/me", undefined, "");
  assert(anon.status === 401, "401 without token");
  assert(anon.headers.get("access-control-allow-origin") === "https://cotsi.siddheshthapa.com", "cors header");
  const bad = await call("GET", "/me", undefined, "nope");
  assert(bad.status === 401, "401 with bad token");
  const health = await call("GET", "/health?deep", undefined, "");
  assert(health.json.ok && health.json.db === true && health.json.counters === true, "health checks the database");
});

Deno.test("topic lesson: create, kickoff, answer, state saved, kickoff hidden", async () => {
  const { call } = setup();
  await call("PUT", "/prefs", { style: "characters", shows: "Friends" });
  const created = await call("POST", "/tracks", { kind: "topic", title: "  How HTTPS works  " });
  assert(created.status === 200 && created.json.track.title === "How HTTPS works", "track created and trimmed");
  const id = created.json.track.id;

  const first = await call("POST", `/tracks/${id}/chat`, {});
  const text = first.events.filter((e) => e.t === "text").map((e) => e.d).join("");
  assert(text.includes("Leverage Map"), "streams the lesson");
  assert(first.json.t === "done" && first.json.track.state.map.trunk.length === 3, "map saved from state block");
  assert(first.json.track.state.nextReviewAt === "2026-11-11", "review scheduled for tomorrow");

  const second = await call("POST", `/tracks/${id}/chat`, { message: "It works because of the first idea" });
  assert(second.json.track.state.progress.done.includes(1), "progress updated");

  const got = await call("GET", `/tracks/${id}`);
  assert(got.json.messages.length === 3, "kickoff hidden: assistant, user, assistant");
  assert(got.json.messages[0].role === "assistant", "first visible message is the lesson");

  const empty = await call("POST", `/tracks/${id}/chat`, {});
  assert(empty.status === 400, "empty follow-up rejected");

  const me = await call("GET", "/me");
  assert(me.json.tracks.length === 1 && me.json.tracks[0].total === 3 && me.json.tracks[0].done === 1, "summary on /me");
  assert(me.json.usage.used > 0, "usage tracked");
});

Deno.test("no shows named: the lesson asks once, saves the answer, and points to Settings", async () => {
  const { call } = setup();
  const before = await call("GET", "/me");
  assert(before.json.prefs.style === "characters" && !before.json.prefs.shows, "new accounts start with no shows");
  const id = (await call("POST", "/tracks", { kind: "topic", title: "Compound interest" })).json.track.id;

  const first = await call("POST", `/tracks/${id}/chat`, {});
  const asked = first.events.filter((e) => e.t === "text").map((e) => e.d).join("");
  assert(/which show, movie or characters/i.test(asked) && /No characters, keep it plain/.test(asked), "asks before teaching");
  assert(!(await call("GET", "/me")).json.prefs.shows, "nothing saved yet");

  const second = await call("POST", `/tracks/${id}/chat`, { message: "Harry Potter" });
  const saved = second.events.filter((e) => e.t === "text").map((e) => e.d).join("");
  assert(/Settings/.test(saved) && saved.includes("Leverage Map"), "confirms, mentions Settings, then teaches");
  assert((await call("GET", "/me")).json.prefs.shows === "Harry Potter", "answer saved to preferences");

  // Once saved, a lesson can't change the learner's own choice.
  assert(showsFromState({ style: "characters", shows: "Harry Potter" }, { shows: "Something else" }) === null, "set shows are kept");
  assert(showsFromState({ style: "characters", shows: "" }, { style: "plain" })?.style === "plain", "'no characters' switches to plain");
  assert(showsFromState({ style: "characters", shows: "", mode: "listen" }, { shows: "X" }) === null, "listening mode never asks");

  const other = (await call("POST", "/tracks", { kind: "topic", title: "How HTTPS works" })).json.track.id;
  const next = await call("POST", `/tracks/${other}/chat`, {});
  assert(next.events.filter((e) => e.t === "text").map((e) => e.d).join("").includes("Leverage Map"), "later lessons don't ask again");
});

Deno.test("preferences: reading or listening, voice and speed are checked", async () => {
  const { call } = setup();
  const put = await call("PUT", "/prefs", { style: "characters", shows: "  The   Office ", mode: "listen", voice: "device:en-IN:Heera", rate: 9 });
  assert(put.json.prefs.mode === "listen" && put.json.prefs.voice === "device:en-IN:Heera", "mode and voice saved");
  assert(put.json.prefs.rate === undefined && put.json.prefs.shows === "The Office", "bad speed dropped, shows tidied");
  const odd = await call("PUT", "/prefs", { style: "characters", mode: "sing", rate: 1.25 });
  assert(odd.json.prefs.mode === undefined && odd.json.prefs.rate === 1.25, "unknown mode ignored");

  const track = { id: "t1", kind: "topic", title: "SQL", createdAt: "", updatedAt: "", state: {} } as const;
  const base = { today: "2026-11-17", name: "Riya", track: { ...track } };
  const listen = lessonSession({ ...base, mode: "learn", prefs: { style: "characters", shows: "Friends", mode: "listen" } });
  assert(/Style: plain, no characters\. Listening/.test(listen), "listening lessons are plain and read aloud");
  const noShows = { style: "characters" as const, shows: "" };
  assert(/hasn't named any shows yet/.test(lessonSession({ ...base, mode: "learn", prefs: noShows })), "full lessons ask");
  assert(/plain for this part/.test(lessonSession({ ...base, mode: "review", prefs: noShows })), "reviews don't stop to ask");
});

Deno.test("review thread uses saved state and reschedules", async () => {
  const { call } = setup();
  const id = (await call("POST", "/tracks", { kind: "book", title: "Atomic Habits" })).json.track.id;
  await call("POST", `/tracks/${id}/chat`, {});
  const review = await call("POST", `/tracks/${id}/chat`, { thread: "review-20261111" });
  assert(review.json.t === "done", "review runs");
  assert(review.json.track.state.nextReviewAt === "2026-11-13", "next review in 3 days");
  assert(review.json.track.state.map.trunk.length === 3, "review doesn't erase the map");
});

Deno.test("job path: profile, scans, recommend, choose, plan, milestone, research", async () => {
  const { call } = setup();
  await call("PUT", "/prefs", { style: "characters", shows: "Friends" });
  const notPdf = await call("POST", "/job/profile", { pdfBase64: "AAAA", prefs: PREFS });
  assert(notPdf.status === 400, "non-PDF rejected");
  const early = await call("POST", "/job/scan", { signal: "hiring" });
  assert(early.status === 409, "scan needs a profile");

  const prof = await call("POST", "/job/profile", { pdfBase64: PDF, prefs: PREFS });
  assert(prof.status === 200 && prof.json.draft.profile.first_name === "Riya", "profile extracted");
  const again = await call("POST", "/job/profile", { pdfBase64: PDF, prefs: PREFS });
  assert(again.status === 429 && again.json.code === "analysis_limit", "one analysis per day");

  for (const signal of ["hiring", "money", "launches", "momentum"]) {
    const scan = await call("POST", "/job/scan", { signal });
    assert(scan.json.t === "done" && scan.json.text.includes("Strongest signal"), `scan ${signal}`);
    assert(scan.events.some((e) => e.t === "status"), "scan reports search status");
  }
  const recs = await call("POST", "/job/recommend");
  assert(recs.status === 200 && recs.json.draft.recs.roles.length === 3, "three roles");
  assert(recs.json.draft.recs.roles[0].evidence.length === 1, "evidence link kept when it appears in scans");

  const chosen = await call("POST", "/job/choose", { index: 0 });
  const id = chosen.json.track.id;
  assert(chosen.json.track.kind === "job", "job track created");

  const tooEarly = await call("POST", `/tracks/${id}/chat`, { thread: "m1" });
  assert(tooEarly.status === 409, "milestone needs a roadmap");

  const q = await call("POST", `/tracks/${id}/chat`, { thread: "plan" });
  assert(q.events.map((e) => e.d ?? "").join("").includes("cotsi-choices"), "plan asks diagnostics");
  const roadmap = await call("POST", `/tracks/${id}/chat`, { thread: "plan", message: "The number of open tickets; Line chart" });
  assert(roadmap.json.track.state.roadmap.milestones.length === 6, "roadmap saved");

  const r = roadmap.json.track.state.roadmap;
  assert(r.milestones[0].topics.length === 4 && r.milestones[4].capstone === true, "topics and capstone saved");
  assert(r.start_points.length === 2, "start points saved");

  // Strict order: later topics and the hands-on build are locked.
  const locked = await call("POST", `/tracks/${id}/chat`, { thread: "m1t2l" });
  assert(locked.status === 403 && locked.json.code === "locked", "topic 2 waits for topic 1");
  const lockedBuild = await call("POST", `/tracks/${id}/chat`, { thread: "m1" });
  assert(lockedBuild.status === 403 && lockedBuild.json.code === "locked", "the build waits for the topics");

  // Learn: done once the checks are answered.
  await call("POST", `/tracks/${id}/chat`, { thread: "m1t1l" });
  const learned = await call("POST", `/tracks/${id}/chat`, { thread: "m1t1l", message: "One ticket" });
  assert(learned.json.track.job.topics["1.1"].via === "learn", "topic 1 learned");

  // Revise: a run-through and a test; 5 of 5 passes.
  await call("POST", `/tracks/${id}/chat`, { thread: "m1t2r" });
  const revised = await call("POST", `/tracks/${id}/chat`, { thread: "m1t2r", message: "1... 2... 3... 4... 5..." });
  assert(revised.json.track.job.topics["1.2"].via === "revise", "topic 2 passed by revising");

  // I already know this: 3 of 5 fails, so only Learn is allowed.
  await call("POST", `/tracks/${id}/chat`, { thread: "m1t3q" });
  const failed = await call("POST", `/tracks/${id}/chat`, { thread: "m1t3q", message: "1... 2... 3... 4... 5..." });
  assert(!failed.json.track.job.topics["1.3"] && failed.json.track.job.mustLearn.includes("1.3"), "a failed test means Learn");
  const retest = await call("POST", `/tracks/${id}/chat`, { thread: "m1t3r" });
  assert(retest.status === 403 && retest.json.code === "locked", "no retest before learning");
  await call("POST", `/tracks/${id}/chat`, { thread: "m1t3l" });
  const relearned = await call("POST", `/tracks/${id}/chat`, { thread: "m1t3l", message: "It matches rows" });
  assert(relearned.json.track.job.topics["1.3"].via === "learn" && !relearned.json.track.job.mustLearn.includes("1.3"), "learned after failing");
  assert(relearned.json.track.job.started["1.3"] === "know", "how they started is remembered");

  const passMe = await call("POST", `/tracks/${id}/chat`, { thread: "m1t4q" });
  assert(passMe.status === 200, "topic 4 is open");
  await call("POST", `/tracks/${id}/chat`, { thread: "m1t4l" });
  await call("POST", `/tracks/${id}/chat`, { thread: "m1t4l", message: "Counts per group" });

  await call("POST", `/tracks/${id}/chat`, { thread: "m1" });
  const done = await call("POST", `/tracks/${id}/chat`, { thread: "m1", message: "Here is my query and answer" });
  assert(done.json.track.job.milestonesDone.includes(1), "milestone marked done");
  const next = await call("POST", `/tracks/${id}/chat`, { thread: "m2t1l" });
  assert(next.status === 200, "milestone 2's first topic opens after milestone 1");
  const bad = await call("POST", `/tracks/${id}/chat`, { thread: "m9" });
  assert(bad.status === 404, "unknown milestone");

  const hunt = await call("POST", `/tracks/${id}/chat`, { thread: "hunt" });
  assert(hunt.json.sources.length === 3 && hunt.events.some((e) => e.t === "status"), "job hunt returns sources");
  const edge = await call("POST", `/tracks/${id}/chat`, { thread: "edge" });
  assert(edge.json.t === "done", "unfair advantage runs");
  const me = await call("GET", "/me");
  const t0 = me.json.tracks[0];
  assert(t0.unit === "steps" && t0.total === 22 && t0.done === 5, `job progress on /me (${t0.done} of ${t0.total})`);
});

Deno.test("budget caps: per-user and whole-site, reset next day", async () => {
  const { call, setClock } = setup({ COTSI_USER_DAILY_USD: "0.03", COTSI_DAILY_BUDGET_USD: "0.05" });
  const id = (await call("POST", "/tracks", { kind: "topic", title: "Recursion" })).json.track.id;
  await call("POST", `/tracks/${id}/chat`, {});
  await call("POST", `/tracks/${id}/chat`, { message: "a" });
  const capped = await call("POST", `/tracks/${id}/chat`, { message: "b" });
  assert(capped.status === 429 && capped.json.code === "user_limit", "user cap reached");

  const id2 = (await call("POST", "/tracks", { kind: "topic", title: "Recursion" }, "dev:sam")).json.track.id;
  await call("POST", `/tracks/${id2}/chat`, {}, "dev:sam");
  const site = await call("POST", `/tracks/${id2}/chat`, { message: "a" }, "dev:sam");
  assert(site.status === 429 && site.json.code === "site_full", "site cap reached");

  setClock("2026-11-11T00:05:00Z");
  const next = await call("POST", `/tracks/${id}/chat`, { message: "b" });
  assert(next.json.t === "done", "caps reset the next day");
});

Deno.test("a started CV analysis can finish past the per-person cap", async () => {
  const { call } = setup({ COTSI_USER_DAILY_USD: "0.03" });
  const prefs = { hoursPerWeek: 5, horizonMonths: 3, location: "India", workMode: "either" };
  const profile = await call("POST", "/job/profile", { text: "Customer support lead. ".repeat(20), prefs });
  assert(profile.status === 200, "profile read");
  for (const signal of ["hiring", "money", "launches", "momentum"]) {
    const scan = await call("POST", "/job/scan", { signal });
    assert(scan.json.t === "done", `scan ${signal} finished past the cap`);
  }
  const recs = await call("POST", "/job/recommend");
  assert(recs.status === 200 && recs.json.draft.recs, "ranking finished past the cap");
  const id = (await call("POST", "/tracks", { kind: "topic", title: "Recursion" })).json.track.id;
  const lesson = await call("POST", `/tracks/${id}/chat`, {});
  assert(lesson.status === 429 && lesson.json.code === "user_limit", "ordinary lessons still respect the cap");
});

Deno.test("without an API key: sign-in works, lessons say launching soon", async () => {
  const { call, deps } = setup();
  deps.aiReady = false;
  const me = await call("GET", "/me");
  assert(me.status === 200 && me.json.ai.ready === false && me.json.ai.message, "me reports not ready");
  const id = (await call("POST", "/tracks", { kind: "topic", title: "Recursion" })).json.track.id;
  const lesson = await call("POST", `/tracks/${id}/chat`, {});
  assert(lesson.status === 503 && lesson.json.code === "not_ready", "lesson waits for launch");
  const cv = await call("POST", "/job/profile", { text: "Customer support lead. ".repeat(20), prefs: PREFS });
  assert(cv.status === 503 && cv.json.code === "not_ready", "CV analysis waits for launch");
  deps.aiReady = true;
  const later = await call("POST", "/job/profile", { text: "Customer support lead. ".repeat(20), prefs: PREFS });
  assert(later.status === 200, "the waiting attempt didn't use up the daily analysis");
});

Deno.test("only founding members on the list can use the AI", async () => {
  const { call, deps } = setup({ COTSI_MEMBERS: "Riya@X.com, someone@else.com" });
  const me = await call("GET", "/me");
  assert(me.json.ai.ready === true, "a listed member is ready (email match ignores case)");
  const id = (await call("POST", "/tracks", { kind: "topic", title: "Recursion" })).json.track.id;
  assert((await call("POST", `/tracks/${id}/chat`, {})).status === 200, "a member gets lessons");

  const other = await call("GET", "/me", undefined, "dev:sam");
  assert(other.status === 200 && other.json.ai.ready === false, "someone not on the list can sign in");
  assert(/founding members/.test(other.json.ai.message) && !/\bfree\b/i.test(other.json.ai.message), "and sees the founding-members note");
  const theirs = (await call("POST", "/tracks", { kind: "topic", title: "Recursion" }, "dev:sam")).json.track.id;
  const lesson = await call("POST", `/tracks/${theirs}/chat`, {}, "dev:sam");
  assert(lesson.status === 403 && lesson.json.code === "members_only", "but can't start a lesson");
  const cv = await call("POST", "/job/profile", { text: "Customer support lead. ".repeat(20), prefs: PREFS }, "dev:sam");
  assert(cv.status === 403 && cv.json.code === "members_only", "or a CV analysis");

  deps.aiReady = false;
  const waiting = await call("POST", `/tracks/${theirs}/chat`, {}, "dev:sam");
  assert(waiting.status === 503 && waiting.json.code === "not_ready", "with no key, everyone sees the launching note first");

  const closed = setup({ COTSI_MEMBERS: "" });
  const nobody = await closed.call("GET", "/me");
  assert(nobody.json.ai.ready === false, "an empty list lets nobody in, so adding the key never opens the AI by accident");
  assert(isMember(["*"], "anyone@x.com") && !isMember(["a@x.com"], "") && !isMember([], "a@x.com"), "isMember");
});

Deno.test("an empty Claude account shows a calm 'paused' note, not 'rephrase'", () => {
  const low = Anthropic.APIError.generate(
    400,
    { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } },
    undefined,
    new Headers(),
  );
  assert(isOutOfCredit(low), "credit balance error recognised");
  assert(describeError(low).status === 503 && /paused/.test(describeError(low).message), "learner sees the paused note");
  const cap = Anthropic.APIError.generate(
    429,
    { type: "error", error: { type: "rate_limit_error", message: "You have reached your API usage limits", details: { error_code: "enforced_spend_limit_reached" } } },
    undefined,
    new Headers(),
  );
  assert(isOutOfCredit(cap), "spend cap recognised");
  const busy = Anthropic.APIError.generate(
    429,
    { type: "error", error: { type: "rate_limit_error", message: "Number of request tokens has exceeded your per-minute rate limit" } },
    undefined,
    new Headers(),
  );
  assert(!isOutOfCredit(busy) && /busy/.test(describeError(busy).message), "an ordinary rate limit still says busy");
  const bad = Anthropic.APIError.generate(
    400,
    { type: "error", error: { type: "invalid_request_error", message: "messages: text content blocks must be non-empty" } },
    undefined,
    new Headers(),
  );
  assert(!isOutOfCredit(bad), "other bad requests are unchanged");
});

Deno.test("streak, dream and daily reminders", async () => {
  const { call, deps, store, tick } = setup();
  const me0 = await call("GET", "/me?tz=Asia/Kolkata");
  assert(me0.json.streak.current === 0 && me0.json.dream === null && me0.json.reminder.on === false, "starts empty");

  const id = (await call("POST", "/tracks", { kind: "topic", title: "Recursion" })).json.track.id;
  await call("POST", `/tracks/${id}/chat`, {});
  assert((await call("GET", "/me")).json.streak.current === 0, "opening a lesson doesn't count");
  await call("POST", `/tracks/${id}/chat`, { message: "A function calling itself" });
  const me1 = (await call("GET", "/me")).json;
  assert(me1.streak.current === 1 && me1.streak.doneToday, "answering counts today");

  assert((await call("PUT", "/dream", { kind: "other" })).status === 400, "'something else' needs words");
  const dream = await call("PUT", "/dream", { kind: "bike", text: "Royal Enfield" });
  assert(dream.status === 200 && (await call("GET", "/me")).json.dream.text === "Royal Enfield", "dream saved");

  const key = await call("GET", "/push/key");
  assert(key.status === 200 && key.json.key.length > 80, "push key made on first use");
  assert((await call("GET", "/push/key")).json.key === key.json.key, "and kept");
  const bad = await call("PUT", "/push", { subscription: { endpoint: "https://evil.example.com/x", keys: { p256dh: "a", auth: "b" } }, hour: 20 });
  assert(bad.status === 400, "only real push services");

  // A real browser subscription key pair, so the encryption step runs for real.
  const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const p256dh = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh, auth: "BTBZMqHH6r4Tts7J_aSIgg" } };
  const on = await call("PUT", "/push", { subscription: sub, hour: 20, tz: "Asia/Kolkata" });
  assert(on.status === 200 && (await call("GET", "/me")).json.reminder.hour === 20, "reminder on at 8 pm");

  const sent: { url: string; auth: string }[] = [];
  deps.pushFetch = (url, init) => {
    sent.push({ url: String(url), auth: String((init?.headers as Record<string, string>).Authorization) });
    return Promise.resolve(new Response(null, { status: 201 }));
  };
  const cron = () => handle(new Request("https://x.supabase.co/functions/v1/api/cron/reminders", { method: "POST" }), deps).then((r) => r.json());

  // The test clock starts at 10:00 UTC = 15:30 in India: before the reminder hour.
  assert((await cron()).sent === 0 && sent.length === 0, "nothing before 8 pm");
  assert((await cron()).throttled === true, "calls within 10 minutes are ignored");
  tick(5 * 3600_000); // 20:30 in India, and they already learned today
  const r1 = await cron();
  assert(r1.sent === 0 && r1.learned === 1, "no nudge for someone who learned today");
  tick(24 * 3600_000); // next day 20:30: hasn't learned yet
  const r2 = await cron();
  assert(r2.sent === 1 && sent[0].url === sub.endpoint && sent[0].auth.startsWith("vapid t="), "reminder sent");
  tick(3600_000);
  assert((await cron()).sent === 0, "only one reminder a day");

  deps.pushFetch = () => Promise.resolve(new Response(null, { status: 410 }));
  tick(24 * 3600_000);
  const r3 = await cron();
  assert(r3.gone === 1 && (await call("GET", "/me")).json.reminder.on === false, "a blocked browser turns reminders off");

  await call("PUT", "/push", { subscription: sub, hour: 7 });
  await call("DELETE", "/me");
  assert((await store.list("_global", "push:")).length === 0, "deleting the account removes the reminder");
});

Deno.test("the Terms of Use must be accepted before the AI answers", async () => {
  const { call } = setup({ NO_AUTO_TERMS: "1" });
  const me = await call("GET", "/me");
  assert(me.json.terms.accepted === false && me.json.terms.version === TERMS_VERSION, "not yet accepted");
  const id = (await call("POST", "/tracks", { kind: "topic", title: "Recursion" })).json.track.id;
  const blocked = await call("POST", `/tracks/${id}/chat`, {});
  assert(blocked.status === 403 && blocked.json.code === "terms", "lessons wait for acceptance");
  assert((await call("PUT", "/terms", { version: TERMS_VERSION })).status === 400, "must confirm 18+");
  assert((await call("PUT", "/terms", { version: "old", adult: true })).status === 409, "must accept the current version");
  assert((await call("PUT", "/terms", { version: TERMS_VERSION, adult: true })).status === 200, "accepted");
  assert((await call("GET", "/me")).json.terms.accepted === true, "me shows accepted");
  assert((await call("POST", `/tracks/${id}/chat`, {})).status === 200, "lessons open");
});

Deno.test("users are isolated; delete removes everything", async () => {
  const { call, store } = setup();
  const id = (await call("POST", "/tracks", { kind: "topic", title: "Recursion" })).json.track.id;
  await call("POST", `/tracks/${id}/chat`, {});
  const other = await call("GET", `/tracks/${id}`, undefined, "dev:sam");
  assert(other.status === 404, "another user can't read the track");
  await call("DELETE", "/me");
  assert((await store.list("dev:riya", "")).length === 0, "all data deleted");
});

Deno.test("level-check start points and learner notes reach later lessons", () => {
  // deno-lint-ignore no-explicit-any
  const track: any = {
    id: "t1", kind: "job", title: "Data Analyst", createdAt: "", updatedAt: "",
    state: {
      notes: ["On Windows 11 laptop", "Has no SQL software yet"],
      roadmap: { outcome: "o", capstone: "c", start_points: ["SQL: from what a table is"], milestones: [{ n: 1, title: "SQL basics", hours: 6 }] },
    },
    job: {
      profile: { first_name: "", headline: "", location_country: "UK", years_experience: 1, current_role: "", fields: [], skills: [], education: "", languages: [], achievements: [], strengths: [], summary: "", is_cv: true, not_cv_reason: "" },
      prefs: { hoursPerWeek: 6, horizonMonths: 3, location: "UK", workMode: "either" },
      role: { title: "Data Analyst", one_liner: "", why_rising: "", signals: [], evidence: [], fit_score: 1, fit_reasons: [], have: [], gaps: ["SQL"], weeks_to_ready: 8, pay_note: "", confidence: "medium", first_step: "" },
    },
  };
  const s = lessonSession({ today: "2026-11-17", name: "Hitesh", mode: "milestone", track, prefs: { style: "plain" }, milestone: 1 });
  assert(s.includes("SQL: from what a table is"), "milestones know where each weak skill starts");
  assert(s.includes("Has no SQL software yet"), "notes are handed back");
  assert(s.includes("guide every step") && !s.includes("CAPSTONE"), "ordinary milestones are guided step by step");
  track.state.roadmap.milestones.push({ n: 2, title: "Capstone: stock planner", hours: 20 });
  const cap = lessonSession({ today: "2026-11-17", name: "Hitesh", mode: "milestone", track, prefs: { style: "plain" }, milestone: 2 });
  assert(cap.includes("CAPSTONE"), "the capstone asks for minimal help");
});

Deno.test("helpers", () => {
  assert(extractState("x\n```cotsi-state\n{\"phase\":\"done\"}\n```")?.phase === "done", "state parsed");
  assert(extractState("```cotsi-state\n{bad\n```") === null, "bad JSON ignored");
  const c = costOf("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 10000 });
  assert(Math.abs(c - (0.002 + 0.01 + 0.001)) < 1e-9, "sonnet pricing");
  const o = costOf("claude-opus-5-5", { input_tokens: 100000, output_tokens: 2000, server_tool_use: { web_search_requests: 3 } });
  assert(Math.abs(o - (0.4 + 0.04 + 0.03)) < 1e-9, "opus pricing with searches");
});
