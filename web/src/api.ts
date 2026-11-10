import { getToken } from "./auth";
import { config } from "./config";

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function headers(): Promise<Record<string, string>> {
  const token = await getToken();
  if (!token) throw new ApiError("Please sign in.", 401, "auth");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(config.supabaseAnonKey ? { apikey: config.supabaseAnonKey } : {}),
  };
}

async function fail(res: Response): Promise<never> {
  let message = "Something went wrong. Please try again.";
  let code: string | undefined;
  try {
    const data = await res.json();
    if (data?.error) message = data.error;
    code = data?.code;
  } catch {
    // not JSON; keep the generic message
  }
  throw new ApiError(message, res.status, code);
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(config.apiUrl + path, {
      method,
      headers: await headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("Couldn't reach Cotsi. Check your connection and try again.", 0);
  }
  if (!res.ok) return fail(res);
  return (await res.json()) as T;
}

export type StreamEvent =
  | { t: "text"; d: string }
  | { t: "status"; d: string }
  | { t: "error"; message: string; code?: string }
  | ({ t: "done" } & Record<string, unknown>);

/** POSTs and reads a server-sent event stream, calling onEvent for each event. */
export async function stream(path: string, body: unknown, onEvent: (e: StreamEvent) => void, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch(config.apiUrl + path, { method: "POST", headers: await headers(), body: JSON.stringify(body), signal });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Couldn't reach Cotsi. Check your connection and try again.", 0);
  }
  if (!res.ok) return fail(res);
  if (!res.body) throw new ApiError("No response from Cotsi.", 0);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split: number;
    while ((split = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const event = JSON.parse(line.slice(6)) as StreamEvent;
        if (event.t === "error") throw new ApiError(event.message, 0, event.code);
        if (event.t === "done") finished = true;
        onEvent(event);
      }
    }
  }
  if (!finished) throw new ApiError("The reply was cut off. Please try again.", 0);
}
