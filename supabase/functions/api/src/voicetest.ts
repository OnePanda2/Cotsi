// A side-by-side listening test of Hindi and Marathi voices from three providers: OpenAI (what
// Cotsi uses now), Sarvam (an Indian company built for Indian languages) and Google Cloud. The
// same paragraph is made once per voice and kept, so listening again costs nothing.
// Keys live in Supabase secrets: OPENAI_API_KEY, SARVAM_API_KEY, GOOGLE_TTS_API_KEY.

import type { Lang } from "./types.ts";
import { instructionsFor } from "./tts.ts";

export const PROVIDERS = ["openai", "sarvam", "google"] as const;
export type Provider = (typeof PROVIDERS)[number];
export type Gender = "female" | "male";

export type CompareKeys = { openai: string; sarvam: string; google: string; ttsModel: string };

/** The same lesson paragraph in each language, with English terms, numbers and rupees mixed in. */
export const SAMPLES: Record<Lang, string> = {
  hi:
    "मान लीजिए आपका बैंक हर साल 10% ब्याज देता है, और आप ₹10,000 जमा करते हैं। एक साल बाद आपके पास ₹11,000 हो जाते हैं। " +
    "दूसरे साल बैंक ब्याज ₹11,000 पर देता है, ₹10,000 पर नहीं। यानी पिछले साल का ₹1,000 भी अब कमाने लगता है। " +
    "इसे compound interest, यानी चक्रवृद्धि ब्याज कहते हैं।",
  mr:
    "समजा तुमची बँक दरवर्षी 10% व्याज देते, आणि तुम्ही ₹10,000 ठेवता. एका वर्षानंतर तुमच्याकडे ₹11,000 होतात. " +
    "दुसऱ्या वर्षी बँक व्याज ₹11,000 वर देते, ₹10,000 वर नाही. म्हणजे मागच्या वर्षी मिळालेले ₹1,000 सुद्धा आता कमवायला लागतात. " +
    "याला compound interest, म्हणजे चक्रवाढ व्याज म्हणतात.",
};

const LOCALE: Record<Lang, string> = { hi: "hi-IN", mr: "mr-IN" };

// Sarvam bulbul:v3 speakers (from Sarvam's official SDK, sarvamai 1.1.21).
const SARVAM_SPEAKER: Record<Gender, string> = { female: "priya", male: "shubh" };
const OPENAI_VOICE: Record<Gender, string> = { female: "marin-in", male: "cedar-in" };

export type Clip = { audio: Uint8Array<ArrayBuffer>; type: string; voice: string };

function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sniff(bytes: Uint8Array): string {
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "audio/wav";
  return "audio/mpeg";
}

async function fail(res: Response, who: string): Promise<never> {
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  throw Object.assign(new Error(`${who} ${res.status}: ${detail}`), { status: res.status });
}

async function openai(keys: CompareKeys, f: typeof fetch, lang: Lang, g: Gender): Promise<Clip> {
  const id = OPENAI_VOICE[g];
  const res = await f("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${keys.openai}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: keys.ttsModel, voice: id.replace(/-in$/, ""), input: SAMPLES[lang], instructions: instructionsFor(id, 1, lang), response_format: "mp3" }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) await fail(res, "OpenAI");
  return { audio: new Uint8Array(await res.arrayBuffer()), type: "audio/mpeg", voice: `${keys.ttsModel} · ${id.replace(/-in$/, "")}` };
}

async function sarvam(keys: CompareKeys, f: typeof fetch, lang: Lang, g: Gender): Promise<Clip> {
  const res = await f("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "api-subscription-key": keys.sarvam, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: SAMPLES[lang],
      language_code: LOCALE[lang],
      speaker: SARVAM_SPEAKER[g],
      model: "bulbul:v3",
      speech_sample_rate: 24000,
      output_audio_codec: "mp3",
    }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) await fail(res, "Sarvam");
  const data = (await res.json()) as { audios?: string[] };
  if (!data.audios?.length) throw new Error("Sarvam returned no audio");
  const audio = b64ToBytes(data.audios[0]);
  return { audio, type: sniff(audio), voice: `bulbul:v3 · ${SARVAM_SPEAKER[g]}` };
}

/** Google's best voice for the language: Chirp 3 HD if there is one, then Neural2, WaveNet, Standard. */
async function googleVoice(keys: CompareKeys, f: typeof fetch, lang: Lang, g: Gender): Promise<string> {
  const res = await f(`https://texttospeech.googleapis.com/v1/voices?languageCode=${LOCALE[lang]}`, {
    headers: { "X-Goog-Api-Key": keys.google },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) await fail(res, "Google voices");
  const data = (await res.json()) as { voices?: { name: string; ssmlGender?: string; languageCodes?: string[] }[] };
  const rank = (name: string) => ["Chirp3-HD", "Chirp-HD", "Neural2", "Wavenet", "Standard"].findIndex((t) => name.includes(t));
  const wanted = g === "female" ? "FEMALE" : "MALE";
  const voices = (data.voices ?? [])
    .filter((v) => v.languageCodes?.includes(LOCALE[lang]) && v.ssmlGender === wanted && rank(v.name) >= 0)
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  if (!voices.length) throw Object.assign(new Error(`Google has no ${g} ${LOCALE[lang]} voice`), { status: 404 });
  return voices[0].name;
}

async function google(keys: CompareKeys, f: typeof fetch, lang: Lang, g: Gender): Promise<Clip> {
  const name = await googleVoice(keys, f, lang, g);
  const res = await f("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: { "X-Goog-Api-Key": keys.google, "Content-Type": "application/json" },
    body: JSON.stringify({ input: { text: SAMPLES[lang] }, voice: { languageCode: LOCALE[lang], name }, audioConfig: { audioEncoding: "MP3" } }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) await fail(res, "Google");
  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) throw new Error("Google returned no audio");
  return { audio: b64ToBytes(data.audioContent), type: "audio/mpeg", voice: name };
}

export function configured(keys: CompareKeys): Record<Provider, boolean> {
  return { openai: Boolean(keys.openai), sarvam: Boolean(keys.sarvam), google: Boolean(keys.google) };
}

export async function makeClip(keys: CompareKeys, f: typeof fetch, p: Provider, lang: Lang, g: Gender): Promise<Clip> {
  if (p === "openai") return await openai(keys, f, lang, g);
  if (p === "sarvam") return await sarvam(keys, f, lang, g);
  return await google(keys, f, lang, g);
}

/** Rough cost of one clip, for the daily spending limits (Google's first million characters a month are free). */
export function clipCostUsd(p: Provider, lang: Lang, ttsUsdPerMillion: number): number {
  const chars = SAMPLES[lang].length;
  if (p === "openai") return (chars * ttsUsdPerMillion) / 1_000_000;
  if (p === "sarvam") return (chars * 0.036) / 1000; // about ₹30 per 10,000 characters
  return (chars * 30) / 1_000_000;
}
