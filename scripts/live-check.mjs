// Checks the live Cotsi site from the outside, the way a visitor reaches it.
// Runs in GitHub Actions ("Live check"): after every deploy, every 6 hours, or on demand.
//   SUPABASE_PROJECT_REF, SUPABASE_ANON_KEY  (from the repo's Actions variables)
//   SITE_URL, EARLY_URL                      (optional overrides)
// Needs Node 20+ and the `playwright` package with Chromium installed.

import { mkdirSync, appendFileSync } from "node:fs";
import { chromium } from "playwright";

const SITE = (process.env.SITE_URL || "https://cotsi.siddheshthapa.com").replace(/\/$/, "");
const REF = process.env.SUPABASE_PROJECT_REF || "";
const KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPA = (process.env.SUPABASE_URL || (REF ? `https://${REF}.supabase.co` : "")).replace(/\/$/, "");
const API = `${SUPA}/functions/v1/api`;
const EARLY = process.env.EARLY_URL || "https://early.siddheshthapa.com/cotsi/";
const OUT = process.env.OUT_DIR || "live-check";
mkdirSync(OUT, { recursive: true });

const results = [];
class Warn extends Error {}

async function check(name, fn) {
  try {
    results.push({ name, state: "ok", note: (await fn()) || "" });
  } catch (err) {
    results.push({ name, state: err instanceof Warn ? "warn" : "fail", note: err.message });
  }
}

function expect(cond, message) {
  if (!cond) throw new Error(message);
}

function get(url, init = {}) {
  return fetch(url, { redirect: "follow", ...init, signal: AbortSignal.timeout(25_000) });
}

const keyHeaders = KEY ? { apikey: KEY } : {};

await check("Settings for this check", () => {
  expect(REF && KEY, "SUPABASE_PROJECT_REF or SUPABASE_ANON_KEY is missing from the repo's Actions variables");
  return `project ${REF}`;
});

let html = "";
await check("Website loads over HTTPS", async () => {
  const res = await get(`${SITE}/`);
  html = await res.text();
  expect(res.ok, `HTTP ${res.status}`);
  expect(html.includes('id="root"'), "the page isn't the Cotsi app");
  return `HTTP ${res.status}`;
});

await check("Website is connected to Supabase", async () => {
  const src = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
  expect(src, "couldn't find the app's script in the page");
  const js = await (await get(new URL(src, `${SITE}/`).href)).text();
  expect(js.includes(`${REF}.supabase.co`), "the site wasn't built with the Supabase project address");
  expect(KEY && js.includes(KEY), "the site wasn't built with the publishable key");
  return "project address and publishable key are in the site";
});

await check("Privacy page", async () => {
  const res = await get(`${SITE}/privacy/`);
  const text = await res.text();
  expect(res.ok && text.includes("Privacy"), `HTTP ${res.status}`);
  return "/privacy/ loads";
});

let health = null;
await check("API is running", async () => {
  const res = await get(`${API}/health?deep`);
  expect(res.ok, `HTTP ${res.status}`);
  health = await res.json();
  expect(health.ok, "health check didn't answer ok");
  expect(health.db === true, "the API can't read the database (check the migration and the function's keys)");
  expect(health.counters === true, "the spending counter (cotsi_bump) doesn't work; run supabase/migrations/0001_cotsi.sql");
  return "API, database and spending counter answer";
});

await check("Claude API key", () => {
  if (!health) throw new Error("API didn't answer");
  if (!health.ai) throw new Warn("not added yet: learners see the \"getting ready for launch\" note");
  return "added: lessons and CV analysis are open";
});

await check("API refuses requests without sign-in", async () => {
  const res = await get(`${API}/me`, { headers: { Origin: SITE } });
  expect(res.status === 401, `expected 401, got ${res.status}`);
  return "401 without a sign-in token";
});

await check("API accepts calls from the website (CORS)", async () => {
  const res = await get(`${API}/me`, {
    method: "OPTIONS",
    headers: {
      Origin: SITE,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization,apikey,content-type",
    },
  });
  const allowed = res.headers.get("access-control-allow-origin");
  expect(res.status < 300, `preflight got HTTP ${res.status}`);
  expect(allowed === SITE, `allowed origin is "${allowed}", expected ${SITE}`);
  return `allows ${allowed}`;
});

await check("Google sign-in is on in Supabase", async () => {
  const res = await get(`${SUPA}/auth/v1/settings`, { headers: keyHeaders });
  expect(res.ok, `HTTP ${res.status}`);
  const s = await res.json();
  expect(s.external?.google === true, "the Google provider is off");
  expect(!s.disable_signup, "new sign-ups are turned off");
  const extra = s.external?.email ? " (email sign-up is also on; the site only uses Google)" : "";
  return `Google on, sign-ups allowed${extra}`;
});

await check("Learner data is private", async () => {
  const res = await get(`${SUPA}/rest/v1/cotsi_kv?select=key&limit=1`, { headers: keyHeaders });
  const body = await res.text();
  if (res.status === 404 || /42P01|PGRST205|does not exist|Could not find the table/.test(body)) {
    throw new Error("the cotsi_kv table is missing: run supabase/migrations/0001_cotsi.sql");
  }
  if (res.ok) expect(body.trim() === "[]", "anyone with the public key can read stored data: row level security is off");
  return res.ok ? "table exists, rows hidden from the public key" : `public key refused (HTTP ${res.status})`;
});

await check("Spending counter is private", async () => {
  const res = await get(`${SUPA}/rest/v1/rpc/cotsi_bump`, {
    method: "POST",
    headers: { ...keyHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ p_user: "_live_check", p_key: "probe", p_fields: { n: 0 } }),
  });
  expect(!res.ok, "anyone with the public key can change spending counters");
  return `public key refused (HTTP ${res.status})`;
});

await check("Website in a phone browser, and Google sign-in opens", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`${SITE}/`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForSelector(".hero, .notice", { timeout: 20_000 });
    await page.screenshot({ path: `${OUT}/1-first-page.png` });
    expect(!(await page.$(".notice.error")), `the page shows an error: ${await page.textContent(".notice.error").catch(() => "")}`);
    expect(await page.$(".btn.google"), "no sign-in button");
    expect(errors.length === 0, `browser errors: ${errors.slice(0, 3).join(" | ")}`);
    await Promise.all([page.waitForURL(/accounts\.google\.com/, { timeout: 30_000 }), page.click(".btn.google")]);
    const url = new URL(page.url());
    const redirect = url.searchParams.get("redirect_uri") || "";
    const client = url.searchParams.get("client_id") || "";
    await page.screenshot({ path: `${OUT}/2-google.png` });
    expect(redirect === `${SUPA}/auth/v1/callback`, `Google is told to return to "${redirect}"`);
    expect(client.endsWith(".apps.googleusercontent.com"), "no Google client id");
    return `Google sign-in opens for client ${client.slice(0, 12)}…`;
  } finally {
    await browser.close();
  }
});

await check("Early-access page", async () => {
  const res = await get(EARLY);
  const text = await res.text();
  expect(res.ok, `HTTP ${res.status}`);
  const at = text.match(/data-live-at="([^"]+)"/)?.[1];
  expect(at, "no launch switch on the page");
  expect(text.includes(SITE), "the page doesn't link to the site");
  return `switches to "Open Cotsi" at ${at}`;
});

const icon = { ok: "✅", warn: "⚠️", fail: "❌" };
const lines = results.map((r) => `| ${icon[r.state]} | ${r.name} | ${r.note.replace(/\|/g, "/")} |`);
const table = ["| | Check | Result |", "|---|---|---|", ...lines].join("\n");
console.log(results.map((r) => `${icon[r.state]}  ${r.name}: ${r.note}`).join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Cotsi live check\n\n${table}\n`);

const failed = results.filter((r) => r.state === "fail").length;
if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
