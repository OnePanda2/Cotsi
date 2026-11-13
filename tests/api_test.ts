// End-to-end tests of the API with the mock AI and an in-memory store.
//   deno test -A --config supabase/functions/api/deno.json tests/api_test.ts
import { extractState, handle } from "../supabase/functions/api/src/app.ts";
import { readEnv } from "../supabase/functions/api/src/config.ts";
import { makeMockClaude } from "../supabase/functions/api/src/mock.ts";
import { MemoryStore } from "../supabase/functions/api/src/store.ts";
import { costOf } from "../supabase/functions/api/src/budget.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function setup(overrides: Record<string, string> = {}) {
  const env = readEnv((n) => overrides[n]);
  env.allowedOrigins = ["https://cotsi.siddheshthapa.com"];
  const store = new MemoryStore();
  let clock = new Date("2026-11-10T10:00:00Z");
  const deps = {
    env,
    store,
    claude: makeMockClaude(0),
    verifyToken: (t: string) => Promise.resolve(t.startsWith("dev:") ? { id: t, email: `${t.slice(4)}@x.com`, name: "Riya Sharma" } : null),
    now: () => clock,
  };
  const call = async (method: string, path: string, body?: unknown, token = "dev:riya") => {
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
  return { call, store, deps, setClock: (d: string) => (clock = new Date(d)) };
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
});

Deno.test("topic lesson: create, kickoff, answer, state saved, kickoff hidden", async () => {
  const { call } = setup();
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

  await call("POST", `/tracks/${id}/chat`, { thread: "m1" });
  const done = await call("POST", `/tracks/${id}/chat`, { thread: "m1", message: "Here is my query and answer" });
  assert(done.json.track.job.milestonesDone.includes(1), "milestone marked done");
  const bad = await call("POST", `/tracks/${id}/chat`, { thread: "m9" });
  assert(bad.status === 404, "unknown milestone");

  const hunt = await call("POST", `/tracks/${id}/chat`, { thread: "hunt" });
  assert(hunt.json.sources.length === 3 && hunt.events.some((e) => e.t === "status"), "job hunt returns sources");
  const edge = await call("POST", `/tracks/${id}/chat`, { thread: "edge" });
  assert(edge.json.t === "done", "unfair advantage runs");
  const me = await call("GET", "/me");
  assert(me.json.tracks[0].total === 6 && me.json.tracks[0].done === 1, "job progress on /me");
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

Deno.test("users are isolated; delete removes everything", async () => {
  const { call, store } = setup();
  const id = (await call("POST", "/tracks", { kind: "topic", title: "Recursion" })).json.track.id;
  await call("POST", `/tracks/${id}/chat`, {});
  const other = await call("GET", `/tracks/${id}`, undefined, "dev:sam");
  assert(other.status === 404, "another user can't read the track");
  await call("DELETE", "/me");
  assert((await store.list("dev:riya", "")).length === 0, "all data deleted");
});

Deno.test("helpers", () => {
  assert(extractState("x\n```cotsi-state\n{\"phase\":\"done\"}\n```")?.phase === "done", "state parsed");
  assert(extractState("```cotsi-state\n{bad\n```") === null, "bad JSON ignored");
  const c = costOf("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 10000 });
  assert(Math.abs(c - (0.002 + 0.01 + 0.001)) < 1e-9, "sonnet pricing");
  const o = costOf("claude-opus-5-5", { input_tokens: 100000, output_tokens: 2000, server_tool_use: { web_search_requests: 3 } });
  assert(Math.abs(o - (0.4 + 0.04 + 0.03)) < 1e-9, "opus pricing with searches");
});
