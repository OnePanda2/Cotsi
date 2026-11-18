// Read-aloud for listening mode, with natural voices from Microsoft Azure. The browser sends
// text to the Cotsi server, which asks Azure for the audio (the Azure key never reaches the
// browser) and counts the cost toward the learner's daily limit.

import { apiAudio, ApiError } from "./api";
import { parseReply } from "./components/Rich";

export type VoiceGroup = "en-IN" | "en-US" | "en-GB" | "hi-IN";
export type Voice = { id: string; name: string; gender: string; group: VoiceGroup };

export const GROUP_LABEL: Record<VoiceGroup, string> = {
  "en-IN": "English (India)",
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "hi-IN": "Hindi",
};
export const DEFAULT_VOICE = "en-IN-NeerjaNeural";

/** Saved voices from before natural voices ("device:…") fall back to the default. */
export function voiceOrDefault(id?: string): string {
  return id && /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/.test(id) ? id : DEFAULT_VOICE;
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

/** Pieces of a reply: a short first one so audio starts quickly, then longer ones. */
export function chunks(text: string, first = 260, max = 900): string[] {
  const sentences = text.match(/[^.!?।]+[.!?।]+["')\]]*\s*|[^.!?।]+$/g) ?? [];
  const out: string[] = [];
  let cur = "";
  const limit = () => (out.length ? max : first);
  for (const s of sentences.map((x) => x.trim()).filter(Boolean)) {
    if (s.length > limit()) {
      if (cur) out.push(cur);
      cur = "";
      for (const piece of s.match(new RegExp(`.{1,${max}}(\\s|$)`, "g")) ?? [s]) out.push(piece.trim());
      continue;
    }
    if ((cur + " " + s).trim().length > limit()) {
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

export type ReaderState = { status: "idle" | "loading" | "speaking" | "paused"; key: string | null; error?: string };
type Listener = (s: ReaderState) => void;

// A short silent clip. Phones only allow audio that starts from a tap, so the first tap plays this
// on the same audio element, which then may play lesson audio later on its own.
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

class Reader {
  private audio: HTMLAudioElement | null = null;
  private parts: string[] = [];
  private index = 0;
  private gen = 0;
  private listeners = new Set<Listener>();
  private cache = new Map<string, string>(); // voice|rate|text -> object URL
  private ended: (() => void) | null = null;
  state: ReaderState = { status: "idle", key: null };
  voice = DEFAULT_VOICE;
  rate = 1;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(state: ReaderState) {
    this.state = state;
    for (const fn of this.listeners) fn(state);
  }

  private el(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = "auto";
    }
    return this.audio;
  }

  /** Unlocks audio on phones. Call from a tap. */
  prime() {
    const a = this.el();
    if (a.src) return;
    a.src = SILENCE;
    void a.play().catch(() => {});
  }

  private remember(key: string, url: string) {
    this.cache.set(key, url);
    if (this.cache.size > 60) {
      const [oldest, old] = this.cache.entries().next().value as [string, string];
      this.cache.delete(oldest);
      URL.revokeObjectURL(old);
    }
  }

  private async audioFor(text: string): Promise<string> {
    const key = `${this.voice}|${this.rate}|${text}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const blob = await apiAudio("POST", "/tts", { text, voice: this.voice, rate: this.rate });
    const url = URL.createObjectURL(blob);
    this.remember(key, url);
    return url;
  }

  /** Reads text aloud from the start. `key` names what is being read (e.g. a message). */
  async read(text: string, key: string) {
    this.stop();
    this.parts = chunks(text);
    this.index = 0;
    if (!this.parts.length) return;
    const gen = ++this.gen;
    this.set({ status: "loading", key });
    await this.play(gen, key);
  }

  /** Plays the fixed sample for a voice (made once on the server and shared). */
  async preview(voice: string, rate: number) {
    this.stop();
    const gen = ++this.gen;
    const key = `preview:${voice}`;
    this.set({ status: "loading", key });
    try {
      const cacheKey = `preview|${voice}|${rate}`;
      let url = this.cache.get(cacheKey);
      if (!url) {
        url = URL.createObjectURL(await apiAudio("GET", `/tts/preview?voice=${encodeURIComponent(voice)}&rate=${rate}`));
        this.remember(cacheKey, url);
      }
      if (gen !== this.gen) return;
      this.set({ status: "speaking", key });
      await this.playUrl(url);
      if (gen === this.gen) this.set({ status: "idle", key: null });
    } catch (err) {
      if (gen === this.gen) this.fail(err);
    }
  }

  private async play(gen: number, key: string) {
    try {
      let next: Promise<string> | null = this.audioFor(this.parts[this.index]);
      while (gen === this.gen && this.index < this.parts.length) {
        const url = await next!;
        // Fetch the next piece while this one plays, so there's no gap between them.
        next = this.index + 1 < this.parts.length ? this.audioFor(this.parts[this.index + 1]) : null;
        if (gen !== this.gen) return;
        if (this.state.status !== "paused") this.set({ status: "speaking", key });
        await this.playUrl(url);
        if (gen !== this.gen) return;
        this.index++;
      }
      if (gen === this.gen) this.set({ status: "idle", key: null });
    } catch (err) {
      if (gen === this.gen) this.fail(err);
    }
  }

  private fail(err: unknown) {
    const message =
      err instanceof ApiError
        ? err.code === "user_limit" || err.code === "site_full"
          ? "You've reached today's listening limit. It resets tomorrow."
          : err.message
        : "The voice didn't load. Please try again.";
    this.set({ status: "idle", key: null, error: message });
  }

  private playUrl(url: string): Promise<void> {
    const a = this.el();
    return new Promise((resolve, reject) => {
      const done = () => {
        a.onended = null;
        a.onerror = null;
        this.ended = null;
        resolve();
      };
      this.ended = done;
      a.onended = done;
      a.onerror = () => {
        a.onended = null;
        a.onerror = null;
        this.ended = null;
        reject(new Error("audio error"));
      };
      a.src = url;
      a.play().catch((e) => {
        // Blocked until the learner taps: wait paused instead of failing.
        if ((e as Error)?.name === "NotAllowedError") this.set({ status: "paused", key: this.state.key });
        else reject(e);
      });
    });
  }

  pause() {
    if (this.state.status !== "speaking") return;
    this.audio?.pause();
    this.set({ status: "paused", key: this.state.key });
  }

  resume() {
    if (this.state.status !== "paused") return;
    this.set({ status: "speaking", key: this.state.key });
    void this.audio?.play().catch(() => this.set({ status: "paused", key: this.state.key }));
  }

  stop() {
    this.gen++;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
    }
    this.ended?.();
    this.parts = [];
    if (this.state.status !== "idle" || this.state.error) this.set({ status: "idle", key: null });
  }
}

export const reader = new Reader();

export function primeSpeech() {
  reader.prime();
}
