// Public settings for the web app. These are safe to publish: the Supabase "anon" key
// only identifies the project, and all data access goes through the Cotsi API.
// Fill in the two Supabase values after creating the project (see SETUP.md).
const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";

const env = import.meta.env;

export const config = {
  supabaseUrl: (env.VITE_SUPABASE_URL as string | undefined) || SUPABASE_URL,
  supabaseAnonKey: (env.VITE_SUPABASE_ANON_KEY as string | undefined) || SUPABASE_ANON_KEY,
  /** Local development: sign in as a test learner against dev/server.ts. */
  devAuth: env.VITE_DEV_AUTH === "1",
  get apiUrl(): string {
    return (env.VITE_API_URL as string | undefined) || (this.supabaseUrl ? `${this.supabaseUrl}/functions/v1/api` : "");
  },
  get configured(): boolean {
    return this.devAuth || Boolean(this.supabaseUrl && this.supabaseAnonKey);
  },
};
