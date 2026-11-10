// Supabase Edge Function entry point for the Cotsi API.
import { createClient } from "@supabase/supabase-js";
import { handle } from "./src/app.ts";
import { makeClaude } from "./src/claude.ts";
import { readEnv } from "./src/config.ts";
import { makeMockClaude } from "./src/mock.ts";
import { SupabaseStore } from "./src/store.ts";

const env = readEnv((name) => Deno.env.get(name));
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
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
