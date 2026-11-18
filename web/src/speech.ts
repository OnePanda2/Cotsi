// Read-aloud for listening mode, with natural voices from OpenAI. The browser sends text to the
// Cotsi server, which asks OpenAI for the audio (the key never reaches the browser) and counts
// the cost toward the learner's daily limit.

import { apiAudio, ApiError } from "./api";
import { parseReply } from "./components/Rich";
import { highlight, keepInView, type Unit } from "./readAloud";

export type VoiceGroup = "en-IN" | "en-US";
export type Voice = { id: string; name: string; gender: string; group: VoiceGroup };

export const GROUP_LABEL: Record<VoiceGroup, string> = {
  "en-IN": "Indian accent",
  "en-US": "American accent",
};
export const DEFAULT_VOICE = "marin-in";

/** Voices saved before natural voices (device or other ids) fall back to the default. */
export function voiceOrDefault(id?: string): string {
  return id && /^[a-z]+-(in|us)$/.test(id) ? id : DEFAULT_VOICE;
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

export type ReaderState = {
  status: "idle" | "loading" | "speaking" | "paused";
  key: string | null;
  error?: string;
  /** Which sentence is being read, and how many there are. */
  index?: number;
  total?: number;
};
type Listener = (s: ReaderState) => void;

// A short silent clip. Phones only allow audio that starts from a tap, so the first tap plays this
// on the same audio element, which then may play lesson audio later on its own.
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

/**
 * Reads a reply one sentence at a time, highlighting each sentence (and roughly each word) as it
 * goes. The learner can pause, go back a sentence, skip ahead, or tap any sentence to start there.
 */
class Reader {
  private audio: HTMLAudioElement | null = null;
  private units: Unit[] = [];
  private index = 0;
  private gen = 0;
  private listeners = new Set<Listener>();
  private cache = new Map<string, Promise<string>>(); // voice|rate|text -> object URL
  private ended: (() => void) | null = null;
  private raf = 0;
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

  private audioFor(text: string, path = "/tts", method = "POST"): Promise<string> {
    const key = `${this.voice}|${this.rate}|${path}|${text}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const p = (method === "POST" ? apiAudio("POST", path, { text, voice: this.voice, rate: this.rate }) : apiAudio("GET", path)).then((b) =>
      URL.createObjectURL(b),
    );
    p.catch(() => this.cache.delete(key));
    this.cache.set(key, p);
    if (this.cache.size > 80) this.cache.delete(this.cache.keys().next().value as string);
    return p;
  }

  /** Reads the sentences from `start`. `key` names what is being read (e.g. a message). */
  read(units: Unit[], key: string, start = 0) {
    this.stop();
    this.units = units.filter((u) => u.text);
    if (!this.units.length) return;
    this.index = Math.max(0, Math.min(start, this.units.length - 1));
    this.set({ status: "loading", key });
    void this.playFrom(++this.gen);
  }

  /** Back one sentence (or to the start of this one, if it has been playing a while). */
  prev() {
    if (!this.units.length) return;
    const into = this.audio && !this.audio.paused ? this.audio.currentTime : 0;
    this.jumpTo(into > 1.5 ? this.index : this.index - 1);
  }

  next() {
    if (!this.units.length) return;
    if (this.index + 1 >= this.units.length) return this.stop();
    this.jumpTo(this.index + 1);
  }

  jumpTo(i: number) {
    if (!this.units.length) return;
    this.halt();
    this.index = Math.max(0, Math.min(i, this.units.length - 1));
    this.set({ ...this.state, status: "loading" });
    void this.playFrom(++this.gen);
  }

  /** Plays the fixed sample for a voice (made once on the server and shared). */
  async preview(voice: string, rate: number) {
    this.stop();
    const gen = ++this.gen;
    const key = `preview:${voice}`;
    this.set({ status: "loading", key });
    try {
      const prevVoice = this.voice;
      const prevRate = this.rate;
      this.voice = voice;
      this.rate = rate;
      const url = this.audioFor("", `/tts/preview?voice=${encodeURIComponent(voice)}&rate=${rate}`, "GET");
      this.voice = prevVoice;
      this.rate = prevRate;
      const src = await url;
      if (gen !== this.gen) return;
      this.set({ status: "speaking", key });
      await this.playUrl(src);
      if (gen === this.gen) this.set({ status: "idle", key: null });
    } catch (err) {
      if (gen === this.gen) this.fail(err);
    }
  }

  private async playFrom(gen: number) {
    const key = this.state.key;
    try {
      while (gen === this.gen && this.index < this.units.length) {
        const i = this.index;
        const url = await this.audioFor(this.units[i].text);
        // Fetch the next sentences while this one plays, so there are no gaps.
        for (const j of [i + 1, i + 2]) if (j < this.units.length) this.audioFor(this.units[j].text).catch(() => {});
        if (gen !== this.gen) return;
        const paused = this.state.status === "paused";
        this.set({ status: paused ? "paused" : "speaking", key, index: i, total: this.units.length });
        this.track(i, gen);
        await this.playUrl(url, paused);
        if (gen !== this.gen) return;
        this.index = i + 1;
      }
      if (gen === this.gen) this.finish();
    } catch (err) {
      if (gen === this.gen) this.fail(err);
    }
  }

  /** Highlights the sentence, and moves the word highlight along as the audio plays. */
  private track(i: number, gen: number) {
    cancelAnimationFrame(this.raf);
    const unit = this.units[i];
    highlight(unit.range, null);
    keepInView(unit.range);
    const total = unit.words.reduce((n, w) => n + w.weight, 0);
    let shown = -1;
    const tick = () => {
      if (gen !== this.gen || this.index !== i) return;
      const a = this.audio;
      if (a && unit.words.length && a.duration && Number.isFinite(a.duration)) {
        // The voice gives no word timings, so estimate from how far through the audio we are.
        const at = (a.currentTime / a.duration) * total;
        let sum = 0;
        let w = unit.words.length - 1;
        for (let k = 0; k < unit.words.length; k++) {
          sum += unit.words[k].weight;
          if (sum >= at) {
            w = k;
            break;
          }
        }
        if (w !== shown) {
          shown = w;
          highlight(unit.range, unit.words[w].range);
        }
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private finish() {
    cancelAnimationFrame(this.raf);
    highlight(null, null);
    this.units = [];
    this.set({ status: "idle", key: null });
  }

  private fail(err: unknown) {
    cancelAnimationFrame(this.raf);
    highlight(null, null);
    const message =
      err instanceof ApiError
        ? err.code === "user_limit" || err.code === "site_full"
          ? "You've reached today's listening limit. It resets tomorrow."
          : err.message
        : "The voice didn't load. Please try again.";
    this.set({ status: "idle", key: null, error: message });
  }

  private playUrl(url: string, startPaused = false): Promise<void> {
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
      if (startPaused) return;
      a.play().catch((e) => {
        // Blocked until the learner taps: wait paused instead of failing.
        if ((e as Error)?.name === "NotAllowedError") this.set({ ...this.state, status: "paused" });
        else reject(e);
      });
    });
  }

  pause() {
    if (this.state.status !== "speaking") return;
    this.audio?.pause();
    this.set({ ...this.state, status: "paused" });
  }

  resume() {
    if (this.state.status !== "paused") return;
    this.set({ ...this.state, status: "speaking" });
    void this.audio?.play().catch(() => this.set({ ...this.state, status: "paused" }));
  }

  /** Stops the audio without forgetting where we are (used when jumping). */
  private halt() {
    this.gen++;
    cancelAnimationFrame(this.raf);
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
    }
    this.ended?.();
  }

  stop() {
    this.halt();
    this.units = [];
    highlight(null, null);
    if (this.state.status !== "idle" || this.state.error) this.set({ status: "idle", key: null });
  }
}

export const reader = new Reader();

export function primeSpeech() {
  reader.prime();
}
