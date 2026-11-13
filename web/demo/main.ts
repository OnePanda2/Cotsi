// The clickable preview: runs the real Cotsi API code inside the page, with an in-memory
// store and sample AI replies, so the site works with no server, account or API key.
import { handle } from "../../supabase/functions/api/src/app.ts";
import { readEnv } from "../../supabase/functions/api/src/config.ts";
import { makeMockClaude } from "../../supabase/functions/api/src/mock.ts";
import { MemoryStore } from "../../supabase/functions/api/src/store.ts";

const API = "https://preview.cotsi.local/api";
const SAVE_KEY = "cotsi:preview-data";

const store = new MemoryStore((data) => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify([...data]));
  } catch {
    // storage unavailable: the preview still works, it just forgets on reload
  }
});
try {
  const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "[]") as [string, unknown][];
  for (const [k, v] of saved) store.data.set(k, v);
} catch {
  // nothing saved
}

const env = readEnv(() => undefined);
env.dailyBudgetUsd = 1000;
env.userDailyUsd = 1000;
env.jobAnalysesPerDay = 1000;

const deps = {
  env,
  store,
  claude: makeMockClaude(10, 900),
  verifyToken: (token: string) =>
    Promise.resolve(token.startsWith("dev:") ? { id: "preview", email: "riya@example.com", name: "Riya Sharma" } : null),
  deleteAccount: () => Promise.resolve(),
};

const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(API)) return handle(new Request(url, init), deps);
  return realFetch(input, init);
};

void import("../src/main.tsx");
