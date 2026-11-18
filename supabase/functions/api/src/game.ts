// The side game's high scores and leaderboards (listening mode). A score is one run: the sparks
// collected before hitting a rock. Each learner keeps their best; the best runs across Cotsi make
// an all-time board and a weekly board that starts fresh every Monday (India time).

import { addDays, localDay } from "./engage.ts";

/** The side games. Each has its own bests and leaderboards. */
export const GAMES = ["runner", "orbit", "comet", "bubbles"] as const;
export type GameId = (typeof GAMES)[number];

export function isGame(id: unknown): id is GameId {
  return GAMES.includes(id as GameId);
}

/** The fastest anyone can score in each game (points per second), with room to spare. */
export const MAX_RATE: Record<GameId, number> = { runner: 1.6, orbit: 1.6, comet: 3, bubbles: 3 };
export const MAX_SPARKS_PER_SECOND = MAX_RATE.runner;
const BOARD_SIZE = 50;
export const SHOWN = 10;

export type GameStats = { best: number; bestAt?: string; week?: { start: string; best: number } };
export type BoardEntry = { uid: string; name: string; score: number; at: string };
export type BoardRow = { rank: number; name: string; score: number; me: boolean };

/** "Riya Sharma" → "Riya S." Never shows the full name or anything from the email address. */
export function boardName(fullName: string): string {
  const parts = fullName.replace(/[^\p{L}\p{M}\s'-]/gu, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return "Learner";
  const first = parts[0].slice(0, 20);
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return last ? `${first} ${[...last][0].toUpperCase()}.` : first;
}

/** The Monday (YYYY-MM-DD, India time) that starts this week's board. */
export function weekStart(at: Date): string {
  const day = localDay(at, "Asia/Kolkata");
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

/** A run is believable if it's a whole number and no faster than sparks can appear. */
export function plausibleRun(score: unknown, ms: unknown, game: GameId = "runner"): score is number {
  if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 20000) return false;
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0 || ms > 6 * 3600_000) return false;
  return score <= Math.floor((ms / 1000) * MAX_RATE[game]) + 3;
}

/** Where each game's data lives. The runner keeps the keys it had before there were other games. */
export function gameKeys(game: GameId) {
  const p = game === "runner" ? "" : `${game}:`;
  return {
    stats: game === "runner" ? "game" : `game:${game}`,
    all: `board:${p}all`,
    week: (start: string) => `board:${p}week:${start}`,
  };
}

/** Records a run. Returns the new stats and which bests it beat. */
export function recordRun(stats: GameStats | null, score: number, at: Date): { stats: GameStats; allTime: boolean; week: boolean } {
  const start = weekStart(at);
  const next: GameStats = { best: stats?.best ?? 0, bestAt: stats?.bestAt, week: stats?.week?.start === start ? stats.week : { start, best: 0 } };
  const allTime = score > next.best;
  const week = score > next.week!.best;
  if (allTime) {
    next.best = score;
    next.bestAt = at.toISOString();
  }
  if (week) next.week = { start, best: score };
  return { stats: next, allTime, week };
}

/** Puts a learner's score on a board (one row per learner), highest first; earlier wins a tie. */
export function placeOnBoard(board: BoardEntry[], entry: BoardEntry): BoardEntry[] {
  const mine = board.find((e) => e.uid === entry.uid);
  if (mine && mine.score >= entry.score) return board.map((e) => (e.uid === entry.uid ? { ...e, name: entry.name } : e));
  return [...board.filter((e) => e.uid !== entry.uid), entry]
    .sort((a, b) => b.score - a.score || a.at.localeCompare(b.at))
    .slice(0, BOARD_SIZE);
}

export function removeFromBoard(board: BoardEntry[], uid: string): BoardEntry[] {
  return board.filter((e) => e.uid !== uid);
}

/** The top rows for everyone to see, with the learner's own rank. Never exposes account ids. */
export function boardView(board: BoardEntry[], uid: string): { rows: BoardRow[]; myRank: number | null } {
  const rows = board.slice(0, SHOWN).map((e, i) => ({ rank: i + 1, name: e.name, score: e.score, me: e.uid === uid }));
  const idx = board.findIndex((e) => e.uid === uid);
  return { rows, myRank: idx >= 0 ? idx + 1 : null };
}
