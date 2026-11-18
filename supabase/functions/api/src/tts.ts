// Natural read-aloud voices from Microsoft Azure Speech (neural text to speech).
// The key stays on the server: browsers send text here, and get audio back.
// Docs: https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech

export type TtsConfig = { key: string; region: string; usdPerMillion: number };

export type VoiceGroup = "en-IN" | "en-US" | "en-GB" | "hi-IN";
export type Voice = { id: string; name: string; gender: string; group: VoiceGroup };

/** What Azure's voice list returns (the fields Cotsi uses). */
export type AzureVoice = { ShortName: string; DisplayName?: string; LocalName?: string; Gender?: string; Locale: string; VoiceType?: string; Status?: string };

/** The voices Cotsi offers, most natural first. Only those Azure actually lists are shown. */
const PREFERRED: Record<VoiceGroup, string[]> = {
  "en-IN": ["en-IN-NeerjaNeural", "en-IN-PrabhatNeural", "en-IN-AartiNeural", "en-IN-ArjunNeural"],
  "en-US": ["en-US-AvaMultilingualNeural", "en-US-AndrewMultilingualNeural", "en-US-EmmaMultilingualNeural", "en-US-BrianMultilingualNeural"],
  "en-GB": ["en-GB-SoniaNeural", "en-GB-RyanNeural", "en-GB-AdaMultilingualNeural", "en-GB-OllieMultilingualNeural"],
  "hi-IN": ["hi-IN-SwaraNeural", "hi-IN-MadhurNeural", "hi-IN-AartiNeural", "hi-IN-ArjunNeural"],
};
const PER_GROUP = 4;

export const DEFAULT_VOICE = "en-IN-NeerjaNeural";
export const MAX_TTS_CHARS = 1500;
export const PREVIEW_TEXT: Record<"en" | "hi", string> = {
  en: "Hi, I'm your Cotsi voice. I'll read your lessons aloud, one idea at a time, so you can follow along easily.",
  hi: "नमस्ते, यह आपकी Cotsi आवाज़ है। आपके पाठ इसी आवाज़ में पढ़े जाएँगे।",
};
export const SPEEDS = [0.85, 1, 1.2];

/** Picks up to four voices per group: the preferred ones Azure lists, then other neural voices. */
export function pickVoices(list: AzureVoice[]): Voice[] {
  const neural = list.filter((v) => (v.VoiceType ?? "Neural") === "Neural" && v.Status !== "Deprecated");
  const byName = new Map(neural.map((v) => [v.ShortName, v]));
  const out: Voice[] = [];
  for (const group of Object.keys(PREFERRED) as VoiceGroup[]) {
    const chosen = PREFERRED[group].map((n) => byName.get(n)).filter((v): v is AzureVoice => Boolean(v));
    for (const v of neural) {
      if (chosen.length >= PER_GROUP) break;
      if (v.Locale === group && !chosen.includes(v)) chosen.push(v);
    }
    for (const v of chosen.slice(0, PER_GROUP)) {
      out.push({ id: v.ShortName, name: (v.DisplayName ?? v.ShortName.split("-")[2]).replace(/\s*Multilingual\s*/i, ""), gender: v.Gender ?? "", group });
    }
  }
  return out;
}

export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

/** Text in, SSML out. Speed 1 is normal; 1.2 is 20% faster. */
export function ssml(text: string, voice: string, rate = 1): string {
  const lang = voice.split("-").slice(0, 2).join("-");
  const pct = Math.round((rate - 1) * 100);
  const prosody = pct ? `<prosody rate="${pct > 0 ? "+" : ""}${pct}%">${escapeXml(text)}</prosody>` : escapeXml(text);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}">${prosody}</voice></speak>`;
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

const host = (cfg: TtsConfig) => `https://${cfg.region}.tts.speech.microsoft.com`;

export async function fetchVoiceList(cfg: TtsConfig, fetchFn: typeof fetch): Promise<AzureVoice[]> {
  const res = await fetchFn(`${host(cfg)}/cognitiveservices/voices/list`, {
    headers: { "Ocp-Apim-Subscription-Key": cfg.key },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Azure voice list failed: ${res.status}`);
  return (await res.json()) as AzureVoice[];
}

/** Returns MP3 audio for the text, or throws with Azure's status. */
export async function synthesize(cfg: TtsConfig, fetchFn: typeof fetch, text: string, voice: string, rate = 1): Promise<{ audio: Uint8Array<ArrayBuffer>; type: string }> {
  const res = await fetchFn(`${host(cfg)}/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": cfg.key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "cotsi",
    },
    body: ssml(text, voice, rate),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw Object.assign(new Error(`Azure speech failed: ${res.status}`), { status: res.status });
  }
  return { audio: new Uint8Array(await res.arrayBuffer()), type: res.headers.get("content-type") || "audio/mpeg" };
}
