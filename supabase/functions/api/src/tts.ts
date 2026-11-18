// Natural read-aloud voices from OpenAI (the voices ChatGPT uses). The key stays on the server:
// browsers send text here and get audio back.
// Docs: https://platform.openai.com/docs/guides/text-to-speech

export type TtsConfig = { key: string; model: string; usdPerMillion: number };

export type VoiceGroup = "en-IN" | "en-US";
export type Voice = { id: string; name: string; gender: string; group: VoiceGroup };

/** The voices on offer. The same voice can speak with an Indian or an American accent. */
const BASE = [
  { voice: "marin", name: "Marin", gender: "Female" },
  { voice: "cedar", name: "Cedar", gender: "Male" },
  { voice: "coral", name: "Coral", gender: "Female" },
  { voice: "ash", name: "Ash", gender: "Male" },
];

export const VOICES: Voice[] = [
  ...BASE.map((v) => ({ id: `${v.voice}-in`, name: v.name, gender: v.gender, group: "en-IN" as const })),
  ...BASE.map((v) => ({ id: `${v.voice}-us`, name: v.name, gender: v.gender, group: "en-US" as const })),
];

export const DEFAULT_VOICE = "marin-in";
export const MAX_TTS_CHARS = 1500;
export const PREVIEW_TEXT = "Hi, I'm your Cotsi voice. I'll read your lessons aloud, one idea at a time, so you can follow along easily.";
export const SPEEDS = [0.85, 1, 1.2];

export function isVoice(id: unknown): id is string {
  return typeof id === "string" && VOICES.some((v) => v.id === id);
}

/** How the voice should sound: a warm teacher, with the chosen accent and pace. */
export function instructionsFor(id: string, rate = 1): string {
  const accent = id.endsWith("-in") ? "Speak English with a natural Indian accent." : "Speak with a neutral American accent.";
  const pace = rate < 1 ? " Speak a little slower than usual." : rate > 1 ? " Speak a little faster than usual." : "";
  return `Warm, patient teacher explaining one idea at a time. Calm, clear and friendly. ${accent}${pace}`;
}

export function cleanTtsText(input: unknown): string {
  return String(input ?? "")
    .replace(/[\u0000-\u0008\u000B-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TTS_CHARS);
}

export function ttsCost(chars: number, usdPerMillion: number): number {
  return (chars * usdPerMillion) / 1_000_000;
}

/** Returns MP3 audio for the text, or throws with OpenAI's status. */
export async function synthesize(
  cfg: TtsConfig,
  fetchFn: typeof fetch,
  text: string,
  voiceId: string,
  rate = 1,
): Promise<{ audio: Uint8Array<ArrayBuffer>; type: string }> {
  const res = await fetchFn("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      voice: voiceId.replace(/-(in|us)$/, ""),
      input: text,
      instructions: instructionsFor(voiceId, rate),
      response_format: "mp3",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw Object.assign(new Error(`OpenAI speech failed: ${res.status}`), { status: res.status });
  }
  return { audio: new Uint8Array(await res.arrayBuffer()), type: res.headers.get("content-type") || "audio/mpeg" };
}
