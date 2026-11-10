// Supabase Edge Function entry point for the Cotsi API.
import { createClient } from "@supabase/supabase-js";
import { handle } from "./src/app.ts";
import { makeClaude } from "./src/claude.ts";
import { readEnv } from "./src/config.ts";
import { makeMockClaude } from "./src/mock.ts";
import { SupabaseStore } from "./src/store.ts";

const env = readEnv((name) => Deno.env.get(name));

/** The server-side key. Supabase provides it to every function; the name depends on the project's key type. */
function serviceKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    const key = keys.default ?? Object.values(keys)[0];
    if (typeof key === "string" && key) return key;
  } catch {
    // not set, or not JSON: fall through to the older variable
  }
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("COTSI_SERVICE_KEY");
  if (!key) throw new Error("No Supabase server key found (SUPABASE_SECRET_KEYS, SUPABASE_SERVICE_ROLE_KEY or COTSI_SERVICE_KEY).");
  return key;
}

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const deps = {
  env,
  store: new SupabaseStore(supabase),
  claude: Deno.env.get("MOCK_CLAUDE") === "1" ? makeMockClaude() : makeClaude(env.anthropicApiKey),
  async verifyToken(token: string) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    const meta = data.user.user_metadata ?? {};
    return { id: data.user.id, email: data.user.email ?? "", name: String(meta.full_name ?? meta.name ?? "") };
  },
  async deleteAccount(userId: string) {
    await supabase.auth.admin.deleteUser(userId);
  },
};

Deno.serve((req) => handle(req, deps));
