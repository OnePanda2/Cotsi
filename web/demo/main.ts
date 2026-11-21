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

// Natural voices: a stand-in for OpenAI that returns a short silent clip.
env.openaiApiKey = "preview";
env.sarvamApiKey = "preview";
env.googleTtsApiKey = "preview";

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

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

const fakeSpeech = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  // The voice comparison page: stand-ins for Sarvam and Google.
  if (url.includes("sarvam")) return Promise.resolve(Response.json({ audios: [toBase64(silentWav(4))] }));
  if (url.includes("/v1/voices")) {
    const lang = url.includes("mr-IN") ? "mr-IN" : "hi-IN";
    return Promise.resolve(
      Response.json({ voices: [{ name: `${lang}-Chirp3-HD-Aoede`, ssmlGender: "FEMALE", languageCodes: [lang] }, { name: `${lang}-Chirp3-HD-Charon`, ssmlGender: "MALE", languageCodes: [lang] }] }),
    );
  }
  if (url.includes("text:synthesize")) return Promise.resolve(Response.json({ audioContent: toBase64(silentWav(4)) }));
  const words = String(JSON.parse(String(init?.body ?? "{}")).input ?? "").split(/\s+/).filter(Boolean).length;
  return new Promise<Response>((resolve) =>
    setTimeout(() => resolve(new Response(silentWav(Math.min(20, 0.35 * words)), { headers: { "content-type": "audio/wav" } })), 300),
  );
}) as typeof fetch;

const deps = {
  env,
  store,
  ttsFetch: fakeSpeech,
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
