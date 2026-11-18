// Turns a reply on screen into sentences to read aloud, each tied to the words the learner sees,
// so the sentence being read (and, roughly, the word) can be highlighted, and a tap on any
// sentence can start reading from there.

export type Unit = {
  /** What is spoken (symbols turned into words). */
  text: string;
  /** Where it is on screen, or null for parts with no text of their own (e.g. answer options). */
  range: Range | null;
  /** Each word on screen, with a weight for guessing how far through the sentence the voice is. */
  words: { range: Range; weight: number }[];
};

const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, dt, dd, legend";
const SKIP = "pre, button, .sources, iframe, svg, .read-this, .msg-tools";

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;

/** One sentence as it should sound: symbols and shorthand turned into words. */
export function speakable(s: string): string {
  return s
    .replace(EMOJI, "")
    .replace(/[→⟶]/g, " to ")
    .replace(/≈/g, " about ")
    .replace(/₹\s?(\d+(?:,\d+)*(?:\.\d+)?(?:\s?(?:lakh|lakhs|crore|crores|thousand)\b)?)/gi, "$1 rupees")
    .replace(/₹/g, " rupees ")
    .replace(/^(\d+)\/(\d+)\s*·\s*/g, "Part $1 of $2. ")
    .replace(/\s*·\s*/g, ", ")
    .replace(/https?:\/\/\S+/g, "a link")
    .replace(/[*_#>|`]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Splits text into sentences without breaking numbers like 1.7 or 10,000. */
export function sentenceSpans(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const re = /(?:[^.!?।]|[.!?।](?=\S))+(?:[.!?।]+["')\]”’]*)?/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const start = m.index! + lead;
    const end = m.index! + raw.trimEnd().length;
    if (end > start) out.push({ start, end });
  }
  return out;
}

type Piece = { node: Text; start: number };

function textPieces(block: Element): { full: string; pieces: Piece[] } {
  const pieces: Piece[] = [];
  let full = "";
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    pieces.push({ node: n as Text, start: full.length });
    full += (n as Text).data;
  }
  return { full, pieces };
}

function pointAt(pieces: Piece[], index: number): { node: Text; offset: number } {
  let p = pieces[0];
  for (const q of pieces) {
    if (q.start <= index) p = q;
    else break;
  }
  return { node: p.node, offset: Math.min(index - p.start, p.node.data.length) };
}

function rangeOf(pieces: Piece[], start: number, end: number): Range {
  const r = document.createRange();
  const a = pointAt(pieces, start);
  const b = pointAt(pieces, end);
  r.setStart(a.node, a.offset);
  r.setEnd(b.node, b.offset);
  return r;
}

/** The sentences of one reply on screen, in reading order. */
export function unitsFrom(root: Element): Unit[] {
  const blocks = [...root.querySelectorAll(BLOCKS)].filter((b) => !b.closest(SKIP) && !b.querySelector(BLOCKS));
  const units: Unit[] = [];
  for (const block of blocks) {
    const { full, pieces } = textPieces(block);
    if (!pieces.length) continue;
    for (const span of sentenceSpans(full)) {
      const raw = full.slice(span.start, span.end);
      const text = speakable(raw);
      if (!/[\p{L}\p{N}]/u.test(text)) continue;
      const words: Unit["words"] = [];
      for (const w of raw.matchAll(/\S+/g)) {
        const s = span.start + w.index!;
        // Dashes and other marks aren't spoken words: they add a little time to the word before.
        if (!/[\p{L}\p{N}]/u.test(w[0])) {
          if (words.length) words[words.length - 1].weight += 1;
          continue;
        }
        words.push({ range: rangeOf(pieces, s, s + w[0].length), weight: w[0].length + 2 });
      }
      units.push({ text, range: rangeOf(pieces, span.start, span.end), words });
    }
  }
  return units;
}

/** Answer options are read too: the question, then each option. */
export function choiceUnits(questions: { text: string; options: string[] }[], root: Element | null): Unit[] {
  const legends = root ? [...root.querySelectorAll("legend")] : [];
  return questions.map((q, i) => {
    const options = q.options.map((o, j) => `${j + 1}: ${speakable(o)}`).join(". ");
    let range: Range | null = null;
    if (legends[i]) {
      range = document.createRange();
      range.selectNodeContents(legends[i]);
    }
    return { text: `${q.text ? `${speakable(q.text)} ` : ""}Your options are. ${options}. Tap your answer.`, range, words: [] };
  });
}

/** Which unit a tap landed in, if any. */
export function unitAtPoint(units: Unit[], x: number, y: number): number {
  // Best: ask the browser which character is under the finger, then find its sentence.
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caret = doc.caretPositionFromPoint?.(x, y);
  const legacy = caret ? null : doc.caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode ?? legacy?.startContainer;
  const offset = caret?.offset ?? legacy?.startOffset ?? 0;
  if (node) {
    for (let i = 0; i < units.length; i++) {
      const r = units[i].range;
      try {
        if (r && r.comparePoint(node, offset) === 0) return i;
      } catch {
        // a point in another document part: ignore
      }
    }
    // Between two sentences (e.g. on the space after a full stop): take the one that follows.
    for (let i = 0; i < units.length; i++) {
      const r = units[i].range;
      try {
        if (r && r.comparePoint(node, offset) < 0) return i;
      } catch {
        // ignore
      }
    }
  }
  for (let i = 0; i < units.length; i++) {
    const r = units[i].range;
    if (!r) continue;
    for (const rect of r.getClientRects()) {
      if (x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2) return i;
    }
  }
  return -1;
}

// ------------------------------------------------------------------ highlighting

type HighlightApi = { set: (name: string, h: unknown) => void; delete: (name: string) => void };
const registry = (): HighlightApi | null => {
  const css = (globalThis as { CSS?: { highlights?: HighlightApi } }).CSS;
  return css?.highlights && typeof (globalThis as { Highlight?: unknown }).Highlight === "function" ? css.highlights : null;
};
let fallbackEl: Element | null = null;

/** Marks the sentence being read and the word the voice is on. */
export function highlight(sentence: Range | null, word: Range | null) {
  const reg = registry();
  if (reg) {
    const H = (globalThis as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight;
    if (sentence) reg.set("cotsi-sentence", new H(sentence));
    else reg.delete("cotsi-sentence");
    if (word) reg.set("cotsi-word", new H(word));
    else reg.delete("cotsi-word");
    return;
  }
  // Older browsers: highlight the whole paragraph instead.
  const el = sentence ? (sentence.startContainer.parentElement?.closest(BLOCKS) ?? null) : null;
  if (el === fallbackEl) return;
  fallbackEl?.classList.remove("reading-now");
  fallbackEl = el;
  el?.classList.add("reading-now");
}

let lastUserScroll = 0;
if (typeof window !== "undefined") {
  for (const ev of ["wheel", "touchmove", "keydown"]) window.addEventListener(ev, () => (lastUserScroll = Date.now()), { passive: true });
}

/** Keeps the sentence being read on screen, unless the learner is scrolling around themselves. */
export function keepInView(range: Range | null) {
  if (!range || Date.now() - lastUserScroll < 5000) return;
  const rect = range.getBoundingClientRect();
  if (!rect.height) return;
  const composer = document.querySelector(".composer")?.getBoundingClientRect();
  const bottom = composer ? composer.top : window.innerHeight;
  if (rect.top < 70 || rect.bottom > bottom - 16) window.scrollBy({ top: rect.top - 120, behavior: "smooth" });
}
