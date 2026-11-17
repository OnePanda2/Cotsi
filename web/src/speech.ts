// Read-aloud for listening mode, using the voices built into the learner's phone or computer
// (the Web Speech API). They're free, work offline, and most phones include English (India),
// English (US/UK) and Hindi. Nothing is sent to a server.

import { parseReply } from "./components/Rich";

export type VoiceGroup = "en-IN" | "en-US" | "en-GB" | "hi-IN" | "en";
export type VoiceOption = { id: string; name: string; lang: string; group: VoiceGroup; local: boolean };

export const GROUP_LABEL: Record<VoiceGroup, string> = {
  "en-IN": "English (India)",
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "hi-IN": "Hindi",
  en: "Other English",
};
const GROUP_ORDER: VoiceGroup[] = ["en-IN", "en-US", "en-GB", "hi-IN", "en"];

export const PREVIEW_TEXT: Record<"en" | "hi", string> = {
  en: "Hi, I'm your Cotsi voice. I'll read your lessons aloud, one idea at a time.",
  hi: "नमस्ते, यह आपकी Cotsi आवाज़ है। आपके पाठ इसी आवाज़ में पढ़े जाएँगे।",
};

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

function groupOf(lang: string): VoiceGroup | null {
  const l = lang.replace("_", "-").toLowerCase();
  if (l === "en-in") return "en-IN";
  if (l === "en-us") return "en-US";
  if (l === "en-gb") return "en-GB";
  if (l.startsWith("hi")) return "hi-IN";
  if (l.startsWith("en")) return "en";
  return null;
}

export function voiceId(v: SpeechSynthesisVoice): string {
  return `device:${v.lang}:${v.name}`;
}

/** The device's voices, waiting briefly for them to load (Chrome loads them after the page). */
export function loadVoices(timeoutMs = 2500): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(speechSynthesis.getVoices());
    };
    speechSynthesis.addEventListener("voiceschanged", done);
    setTimeout(done, timeoutMs);
  });
}

/** "Microsoft Heera - English (India)" → "Heera"; the group already says the language. */
function shortName(name: string): string {
  const short = name
    .replace(/^(Microsoft|Google|Apple)\s+/i, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/\s*\((Natural|Enhanced|Premium)\)\s*/i, " ($1)")
    .trim();
  return short || name;
}

/** English and Hindi voices, grouped India first. */
export function voiceOptions(voices: SpeechSynthesisVoice[]): VoiceOption[] {
  const out: VoiceOption[] = [];
  const seen = new Set<string>();
  for (const v of voices) {
    const group = groupOf(v.lang);
    if (!group || seen.has(voiceId(v))) continue;
    seen.add(voiceId(v));
    out.push({ id: voiceId(v), name: shortName(v.name), lang: v.lang, group, local: v.localService });
  }
  return out.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.name.localeCompare(b.name));
}

export function groupLabel(group: VoiceGroup): string {
  return GROUP_LABEL[group];
}

/** The saved voice, or the best default: English (India), then US, UK, any English. */
export function pickVoice(voices: SpeechSynthesisVoice[], id?: string): SpeechSynthesisVoice | null {
  if (id) {
    const exact = voices.find((v) => voiceId(v) === id);
    if (exact) return exact;
    const [, lang, name] = id.split(":");
    const same = voices.find((v) => v.name === name) ?? voices.find((v) => v.lang === lang);
    if (same) return same;
  }
  for (const g of GROUP_ORDER) {
    const v = voices.find((x) => groupOf(x.lang) === g);
    if (v) return v;
  }
  return voices[0] ?? null;
}

// ------------------------------------------------------------------ turning a reply into speech

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;

/** Markdown to plain sentences: no symbols, links read as their text, tables read row by row. */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ") // code is shown, not read
    // List items become sentences, so each one gets its own pause.
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(.*?)\s*$/gm, (_, item: string) => (/[.!?:;]$/.test(item) ? item : `${item}.`))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "a link")
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, "") // table divider rows
    .replace(/\|/g, ", ")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__|\*|_|~~)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(EMOJI, "")
    .replace(/[→⟶]/g, " to ")
    .replace(/≈/g, " about ")
    .replace(/₹\s?(\d+(?:,\d+)*(?:\.\d+)?(?:\s?(?:lakh|lakhs|crore|crores|thousand)\b)?)/gi, "$1 rupees")
    .replace(/₹/g, " rupees ")
    .replace(/^(\d+)\/(\d+)\s*·\s*/gm, "Part $1 of $2. ")
    .replace(/\s*·\s*/g, ", ")
    .replace(/\s*\n\s*\n\s*/g, ". ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s*,\s*(,\s*)+/g, ", ")
    .replace(/([.!?:;])\s*\.(\s|$)/g, "$1$2")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** What gets read for one Cotsi reply: the text, then any question and its options. */
export function speechFor(reply: string): string {
  const parts: string[] = [];
  for (const seg of parseReply(reply)) {
    if (seg.type === "md") parts.push(plainText(seg.text));
    if (seg.type === "choices") {
      for (const q of seg.questions) {
        const options = q.options.map((o, i) => `${i + 1}: ${plainText(o)}`).join(". ");
        parts.push(`${q.text ? `${plainText(q.text)} ` : ""}Your options are. ${options}. Tap your answer.`);
      }
    }
  }
  return parts.filter(Boolean).join(" ");
}

/** Short pieces, so long replies don't stall (some browsers stop after about 15 seconds). */
export function chunks(text: string, max = 220): string[] {
  const sentences = text.match(/[^.!?।]+[.!?।]+["')\]]*\s*|[^.!?।]+$/g) ?? [];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences.map((x) => x.trim()).filter(Boolean)) {
    if (s.length > max) {
      if (cur) out.push(cur);
      cur = "";
      for (const piece of s.match(new RegExp(`.{1,${max}}(\\s|$)`, "g")) ?? [s]) out.push(piece.trim());
      continue;
    }
    if ((cur + " " + s).trim().length > max) {
      if (cur) out.push(cur);
      cur = s;
    } else {
      cur = (cur + " " + s).trim();
    }
  }
  if (cur) out.push(cur);
  return out;
}

// ------------------------------------------------------------------ the reader

export type ReaderState = { status: "idle" | "speaking" | "paused"; key: string | null };

type Listener = (s: ReaderState) => void;

/**
 * One reader for the whole app. Pause is done by stopping and remembering the piece, because
 * the browser's own pause doesn't work reliably on Android.
 */
class Reader {
  private parts: string[] = [];
  private index = 0;
  private gen = 0;
  private listeners = new Set<Listener>();
  state: ReaderState = { status: "idle", key: null };
  voice?: string;
  rate = 1;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(state: ReaderState) {
    this.state = state;
    for (const fn of this.listeners) fn(state);
  }

  /** Reads text aloud from the start. `key` names what is being read (e.g. a message). */
  async read(text: string, key: string) {
    if (!speechSupported()) return;
    this.stopSpeech();
    this.parts = chunks(text);
    this.index = 0;
    if (!this.parts.length) return this.set({ status: "idle", key: null });
    this.set({ status: "speaking", key });
    await this.play(++this.gen);
  }

  private async play(gen: number) {
    const voices = await loadVoices();
    const voice = pickVoice(voices, this.voice);
    while (gen === this.gen && this.index < this.parts.length) {
      const ok = await this.say(this.parts[this.index], voice);
      if (gen !== this.gen) return;
      if (!ok) break;
      this.index++;
    }
    if (gen === this.gen) this.set({ status: "idle", key: null });
  }

  private say(text: string, voice: SpeechSynthesisVoice | null): Promise<boolean> {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      }
      u.rate = this.rate;
      u.onend = () => resolve(true);
      u.onerror = (e) => resolve(e.error === "interrupted" || e.error === "canceled");
      speechSynthesis.speak(u);
    });
  }

  pause() {
    if (this.state.status !== "speaking") return;
    this.gen++;
    speechSynthesis.cancel();
    this.set({ status: "paused", key: this.state.key });
  }

  resume() {
    if (this.state.status !== "paused") return;
    this.set({ status: "speaking", key: this.state.key });
    void this.play(++this.gen);
  }

  stop() {
    this.stopSpeech();
    this.parts = [];
    this.set({ status: "idle", key: null });
  }

  private stopSpeech() {
    this.gen++;
    if (speechSupported()) speechSynthesis.cancel();
  }
}

export const reader = new Reader();

let primed = false;
/** iPhones only allow speech that starts from a tap; one silent utterance unlocks it for the page. */
export function primeSpeech() {
  if (primed || !speechSupported()) return;
  primed = true;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
}

/** Plays a short sample in one voice (Settings and the welcome screen). */
export async function previewVoice(id: string, rate = 1) {
  const voices = await loadVoices();
  const v = pickVoice(voices, id);
  const prev = reader.voice;
  const prevRate = reader.rate;
  reader.voice = id;
  reader.rate = rate;
  await reader.read(PREVIEW_TEXT[v?.lang.toLowerCase().startsWith("hi") ? "hi" : "en"], `preview:${id}`);
  reader.voice = prev;
  reader.rate = prevRate;
}
