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
env.memberEmails = ["*"];

// Natural voices: a stand-in for Azure that lists real voice names and returns a short silent clip.
env.azureSpeechKey = "preview";
env.azureSpeechRegion = "centralindia";
const PREVIEW_VOICES = [
  ["en-IN-NeerjaNeural", "Neerja", "Female", "en-IN"],
  ["en-IN-PrabhatNeural", "Prabhat", "Male", "en-IN"],
  ["en-US-AvaMultilingualNeural", "Ava Multilingual", "Female", "en-US"],
  ["en-US-AndrewMultilingualNeural", "Andrew Multilingual", "Male", "en-US"],
  ["en-GB-SoniaNeural", "Sonia", "Female", "en-GB"],
  ["en-GB-RyanNeural", "Ryan", "Male", "en-GB"],
  ["hi-IN-SwaraNeural", "Swara", "Female", "hi-IN"],
  ["hi-IN-MadhurNeural", "Madhur", "Male", "hi-IN"],
].map(([ShortName, DisplayName, Gender, Locale]) => ({ ShortName, DisplayName, Gender, Locale, VoiceType: "Neural" }));

function silentWav(seconds: number): Uint8Array<ArrayBuffer> {
  const rate = 8000;
  const n = Math.round(rate * seconds);
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + n, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, "data"); v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  return new Uint8Array(buf);
}

const fakeAzure = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith("/voices/list")) return Promise.resolve(new Response(JSON.stringify(PREVIEW_VOICES)));
  const words = String(init?.body ?? "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return new Promise<Response>((resolve) =>
    setTimeout(() => resolve(new Response(silentWav(Math.min(20, 0.35 * words)), { headers: { "content-type": "audio/wav" } })), 300),
  );
}) as typeof fetch;

const deps = {
  env,
  store,
  ttsFetch: fakeAzure,
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
