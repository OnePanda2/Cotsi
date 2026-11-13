// Local development server for the Cotsi API. No Supabase needed: data is kept in
// dev/.data.json and any "Bearer dev:<name>" token signs you in as that test user.
//
//   deno run -A --config supabase/functions/api/deno.json dev/server.ts
//
// MOCK_CLAUDE=1 uses canned AI replies (free). Without it, set ANTHROPIC_API_KEY.
import { handle } from "../supabase/functions/api/src/app.ts";
import { makeClaude } from "../supabase/functions/api/src/claude.ts";
import { readEnv } from "../supabase/functions/api/src/config.ts";
import { makeMockClaude } from "../supabase/functions/api/src/mock.ts";
import { MemoryStore } from "../supabase/functions/api/src/store.ts";

const env = readEnv((name) => Deno.env.get(name));
env.devAuth = true;
env.allowedOrigins = ["http://localhost:5173", "http://localhost:4173", ...env.allowedOrigins];

const file = new URL("./.data.json", import.meta.url);
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const store = new MemoryStore((data) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => Deno.writeTextFile(file, JSON.stringify([...data])), 200);
});
if (Deno.env.get("COTSI_DEV_FRESH") !== "1") {
  try {
    for (const [k, v] of JSON.parse(await Deno.readTextFile(file))) store.data.set(k, v);
  } catch {
    // first run: no saved data yet
  }
}

const mock = Deno.env.get("MOCK_CLAUDE") === "1" || !env.anthropicApiKey;
const deps = {
  env,
  store,
  claude: mock ? makeMockClaude() : makeClaude(env.anthropicApiKey),
  // COTSI_AI_READY=0 previews the "launching soon" state.
  aiReady: Deno.env.get("COTSI_AI_READY") !== "0",
  verifyToken(token: string) {
    const m = token.match(/^dev:([a-z0-9-]{1,40})$/);
    return Promise.resolve(m ? { id: `dev-${m[1]}`, email: `${m[1]}@example.com`, name: "Test Learner" } : null);
  },
};

const port = Number(Deno.env.get("PORT") ?? 8787);
console.log(`Cotsi API on http://localhost:${port}/api  (${mock ? "mock AI" : "real Claude"})`);
Deno.serve({ port }, (req) => handle(req, deps));
