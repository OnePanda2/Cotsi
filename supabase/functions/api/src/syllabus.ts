// The job path's syllabus: each milestone is split into topics (most basic first), followed by
// the milestone's hands-on build. Everything is done strictly in order: a step opens only when
// every step before it is done. Shared by the API (to enforce it) and the web app (to show it).
// No imports, so both Deno and the web build can use this file as is.

export type SyllabusMilestone = {
  n: number;
  title: string;
  hours?: number;
  topics?: string[];
  boss?: boolean;
  capstone?: boolean;
};

export type TopicVia = "learn" | "revise" | "know";

export type SyllabusProgress = {
  milestonesDone?: number[];
  /** Topics done, keyed "milestone.topic" (e.g. "2.3"), with how they were completed. */
  topics?: Record<string, { via: TopicVia; at: string }>;
  /** Topics whose test was failed: only Learn is allowed until they're learned. */
  mustLearn?: string[];
};

export type Step =
  | { kind: "topic"; n: number; k: number; key: string; title: string }
  | { kind: "build"; n: number; key: string; title: string; capstone: boolean };

export function topicKey(n: number, k: number): string {
  return `${n}.${k}`;
}

/** The capstone milestone: flagged by the plan, or (older plans) named so. */
export function isCapstone(m: { title: string; capstone?: boolean }): boolean {
  return m.capstone === true || /capstone/i.test(m.title);
}

/** Older syllabi have no topics; they keep the simple milestone list and no locking. */
export function hasTopics(milestones: SyllabusMilestone[]): boolean {
  return milestones.some((m) => (m.topics?.length ?? 0) > 0);
}

export function steps(milestones: SyllabusMilestone[]): Step[] {
  const out: Step[] = [];
  for (const m of [...milestones].sort((a, b) => a.n - b.n)) {
    (m.topics ?? []).forEach((title, i) => out.push({ kind: "topic", n: m.n, k: i + 1, key: topicKey(m.n, i + 1), title }));
    out.push({ kind: "build", n: m.n, key: `${m.n}.build`, title: m.title, capstone: isCapstone(m) });
  }
  return out;
}

export function stepDone(step: Step, p: SyllabusProgress): boolean {
  return step.kind === "topic" ? Boolean(p.topics?.[step.key]) : (p.milestonesDone ?? []).includes(step.n);
}

export type StepStatus = Step & { done: boolean; open: boolean; locked: boolean; mustLearn: boolean };

/** Every step with its status. "open" is the one step to do next; later ones are locked. */
export function stepStatuses(milestones: SyllabusMilestone[], p: SyllabusProgress): StepStatus[] {
  let blocked = false;
  return steps(milestones).map((s) => {
    const done = stepDone(s, p);
    const open = !done && !blocked;
    const locked = !done && blocked;
    if (!done) blocked = true;
    return { ...s, done, open, locked, mustLearn: s.kind === "topic" && (p.mustLearn ?? []).includes(s.key) };
  });
}

/** A step can be worked on when it's done already or every step before it is done. */
export function isUnlocked(milestones: SyllabusMilestone[], p: SyllabusProgress, key: string): boolean {
  const s = stepStatuses(milestones, p).find((x) => x.key === key);
  return Boolean(s && (s.done || s.open));
}

export function findTopic(milestones: SyllabusMilestone[], n: number, k: number): { milestone: SyllabusMilestone; title: string } | null {
  const m = milestones.find((x) => x.n === n);
  const title = m?.topics?.[k - 1];
  return m && title ? { milestone: m, title } : null;
}

/** Share of the syllabus done (0–100), weighted by each milestone's hours. */
export function readinessPct(milestones: SyllabusMilestone[], p: SyllabusProgress): number {
  let total = 0;
  let got = 0;
  for (const m of milestones) {
    const weight = m.hours && m.hours > 0 ? m.hours : 1;
    const topics = m.topics ?? [];
    const items = topics.length + 1;
    const doneTopics = topics.filter((_, i) => p.topics?.[topicKey(m.n, i + 1)]).length;
    const doneItems = doneTopics + ((p.milestonesDone ?? []).includes(m.n) ? 1 : 0);
    total += weight;
    got += weight * (doneItems / items);
  }
  return total ? Math.round((got / total) * 100) : 0;
}
