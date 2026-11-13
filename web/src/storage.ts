// Browser storage can be blocked (private windows, embedded frames). These never throw, and
// fall back to memory so the page keeps working for the current visit.
const memory = new Map<string, string>();

function store(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function getItem(kind: "local" | "session", key: string): string | null {
  try {
    const value = store(kind)?.getItem(key);
    if (value !== undefined && value !== null) return value;
  } catch {
    // blocked
  }
  return memory.get(`${kind}:${key}`) ?? null;
}

export function setItem(kind: "local" | "session", key: string, value: string): void {
  memory.set(`${kind}:${key}`, value);
  try {
    store(kind)?.setItem(key, value);
  } catch {
    // blocked: the memory copy is enough for this visit
  }
}

export function removeItem(kind: "local" | "session", key: string): void {
  memory.delete(`${kind}:${key}`);
  try {
    store(kind)?.removeItem(key);
  } catch {
    // blocked
  }
}
