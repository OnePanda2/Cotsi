// Habit features: the daily learning streak, the learner's "dream" (why they want the job),
// and the wording of reminder notifications. Pure functions, so they're easy to test.

export const DEFAULT_TZ = "Asia/Kolkata";

/** A valid IANA time zone name, or undefined. */
export function validTz(tz: unknown): string | undefined {
  if (typeof tz !== "string" || !tz || tz.length > 64) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

/** The calendar day (YYYY-MM-DD) at this moment in the learner's time zone. */
export function localDay(at: Date, tz?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: validTz(tz) ?? DEFAULT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** The hour (0–23) at this moment in the learner's time zone. */
export function localHour(at: Date, tz?: string): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: validTz(tz) ?? DEFAULT_TZ, hour: "numeric", hourCycle: "h23" }).format(at);
  return Number(h) % 24;
}

export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ streak

/** Days the learner answered at least once (their local calendar), newest last. */
export type Streak = { days: string[]; best: number };

const KEEP_DAYS = 60;

/** Consecutive learning days ending today, or ending yesterday if today isn't done yet. */
function currentRun(days: Set<string>, today: string): number {
  let day = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/** Adds today to the streak. Returns null when today was already counted (nothing to save). */
export function recordDay(streak: Streak | null, today: string): Streak | null {
  const days = streak?.days ?? [];
  if (days.includes(today)) return null;
  const next = [...days, today].sort().slice(-KEEP_DAYS);
  const current = currentRun(new Set(next), today);
  return { days: next, best: Math.max(streak?.best ?? 0, current) };
}

export type StreakView = {
  current: number;
  best: number;
  doneToday: boolean;
  /** The last 7 days, oldest first, for the week dots. */
  week: { day: string; on: boolean }[];
};

export function streakView(streak: Streak | null, today: string): StreakView {
  const days = new Set(streak?.days ?? []);
  const current = currentRun(days, today);
  return {
    current,
    best: Math.max(streak?.best ?? 0, current),
    doneToday: days.has(today),
    week: Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i - 6);
      return { day, on: days.has(day) };
    }),
  };
}

// ------------------------------------------------------------------ dream

export const DREAM_KINDS = ["laptop", "bike", "car", "home", "family", "travel", "savings", "other"] as const;
export type DreamKind = (typeof DREAM_KINDS)[number];
export type Dream = { kind: DreamKind; text?: string };

const DREAM_PHRASE: Record<DreamKind, string> = {
  laptop: "your new laptop",
  bike: "your bike",
  car: "your car",
  home: "your home",
  family: "supporting your family",
  travel: "your trip",
  savings: "your savings goal",
  other: "your goal",
};

/** Checks what the learner sent. Throws a message for the learner when it's not usable. */
export function cleanDream(input: unknown): Dream {
  const raw = (input ?? {}) as { kind?: unknown; text?: unknown };
  const kind = DREAM_KINDS.find((k) => k === raw.kind);
  if (!kind) throw new Error("Pick what this job will change for you.");
  const text = String(raw.text ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (kind === "other" && !text) throw new Error("Tell me in a few words what you're working towards.");
  return text ? { kind, text } : { kind };
}

/** "your bike", or "your Royal Enfield" when they named it. */
export function dreamPhrase(dream: Dream): string {
  if (dream.text) return dream.kind === "family" ? dream.text : `your ${dream.text.replace(/^(my|your)\s+/i, "")}`;
  return DREAM_PHRASE[dream.kind];
}

// ------------------------------------------------------------------ reminders

export type Reminder = { title: string; body: string; url: string };

/** The daily nudge. It never promises a job: it ties today's lesson to progress and the dream. */
export function reminderText(view: StreakView, dream?: Dream | null): Reminder {
  const goal = dream ? dreamPhrase(dream) : "";
  if (view.current >= 2) {
    return {
      title: `🔥 Keep your ${view.current}-day streak`,
      body: goal ? `One lesson today brings ${goal} a step closer.` : "One lesson today keeps it going.",
      url: "/",
    };
  }
  if (goal) {
    return { title: `One step closer to ${goal} today`, body: "Pick up where you left off. Ten minutes is enough.", url: "/" };
  }
  return { title: "Your next lesson is waiting", body: "Ten minutes today keeps what you learned fresh.", url: "/" };
}
