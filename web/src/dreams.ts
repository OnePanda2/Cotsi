import type { Dream, DreamKind } from "./types";

/** What the job will change for the learner. Keep in step with engage.ts on the server. */
export const DREAMS: { kind: DreamKind; emoji: string; label: string; phrase: string }[] = [
  { kind: "laptop", emoji: "💻", label: "A new laptop", phrase: "your new laptop" },
  { kind: "bike", emoji: "🏍️", label: "A bike", phrase: "your bike" },
  { kind: "car", emoji: "🚗", label: "A car", phrase: "your car" },
  { kind: "home", emoji: "🏠", label: "A home", phrase: "your home" },
  { kind: "family", emoji: "👨‍👩‍👧", label: "Supporting my family", phrase: "supporting your family" },
  { kind: "travel", emoji: "✈️", label: "Travel", phrase: "your trip" },
  { kind: "savings", emoji: "🏦", label: "Savings and freedom", phrase: "your savings goal" },
  { kind: "other", emoji: "✨", label: "Something else", phrase: "your goal" },
];

export function dreamInfo(dream: Dream) {
  const d = DREAMS.find((x) => x.kind === dream.kind) ?? DREAMS[DREAMS.length - 1];
  const phrase = dream.text ? (dream.kind === "family" ? dream.text : `your ${dream.text.replace(/^(my|your)\s+/i, "")}`) : d.phrase;
  return { emoji: d.emoji, phrase };
}
