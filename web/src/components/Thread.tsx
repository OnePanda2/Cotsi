import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, stream } from "../api";
import type { Message, Source, Track } from "../types";
import { type ChoiceQuestion, choicesOf, Rich } from "./Rich";

type Props = {
  trackId: string;
  thread: string;
  /** Start the conversation automatically when the thread is empty. */
  autoStart?: boolean;
  /** Shown instead of auto-starting: the learner taps to begin (used for paid research). */
  startLabel?: string;
  startHint?: string;
  restartLabel?: string;
  quickReplies?: string[];
  placeholder?: string;
  onTrack?: (track: Track) => void;
};

function Choices({ questions, disabled, onAnswer }: { questions: ChoiceQuestion[]; disabled: boolean; onAnswer: (text: string) => void }) {
  const [picked, setPicked] = useState<Record<number, string>>({});
  const single = questions.length === 1;
  const complete = questions.every((_, i) => picked[i]);
  const send = (answers: Record<number, string>) =>
    onAnswer(single ? answers[0] : questions.map((q, i) => `${i + 1}. ${q.text} → ${answers[i]}`).join("\n"));
  return (
    <div className="choices">
      {questions.map((q, i) => (
        <fieldset key={i} disabled={disabled}>
          {(!single || q.text) && <legend>{q.text}</legend>}
          <div className="options">
            {q.options.map((opt) => (
              <button
                type="button"
                key={opt}
                className={picked[i] === opt ? "option picked" : "option"}
                onClick={() => {
                  const next = { ...picked, [i]: opt };
                  setPicked(next);
                  if (single) send(next);
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      {!single && (
        <button type="button" className="btn small" disabled={disabled || !complete} onClick={() => send(picked)}>
          Send answers
        </button>
      )}
    </div>
  );
}

function Sources({ sources }: { sources?: Source[] }) {
  if (!sources?.length) return null;
  return (
    <details className="sources">
      <summary>{sources.length} sources</summary>
      <ul>
        {sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Thread(props: Props) {
  const { trackId, thread, onTrack } = props;
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const busy = streaming !== null;
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const send = useCallback(
    async (text: string, restart = false) => {
      setError(null);
      setStatus("");
      setStreaming("");
      stick.current = true;
      if (restart) setMessages([]);
      else if (text) setMessages((m) => [...(m ?? []), { role: "user", text, at: new Date().toISOString() }]);
      let reply = "";
      try {
        await stream(`/tracks/${trackId}/chat`, { thread, message: text || undefined, restart: restart || undefined }, (e) => {
          if (e.t === "text") {
            reply += e.d;
            setStreaming(reply);
          } else if (e.t === "status") {
            setStatus(e.d);
          } else if (e.t === "done") {
            const done = e as unknown as { track: Track; sources?: Source[] };
            setMessages((m) => [...(m ?? []), { role: "assistant", text: reply, at: new Date().toISOString(), sources: done.sources }]);
            onTrack?.(done.track);
          }
        });
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : new ApiError("Something went wrong. Please try again.", 0);
        setError(apiErr);
        // Put the learner's message back in the box so nothing they typed is lost.
        if (text && !restart) {
          setMessages((m) => (m ?? []).slice(0, -1));
          setDraft(text);
        }
      } finally {
        setStreaming(null);
        setStatus("");
      }
    },
    [trackId, thread, onTrack],
  );

  useEffect(() => {
    let cancelled = false;
    started.current = false;
    setMessages(null);
    setError(null);
    api<{ track: Track; messages: Message[] }>("GET", `/tracks/${trackId}?thread=${thread}`)
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages);
        onTrack?.(data.track);
        if (!data.messages.length && props.autoStart && !started.current) {
          started.current = true;
          void send("");
        }
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err : new ApiError("Couldn't load this lesson.", 0)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, thread]);

  useEffect(() => {
    if (stick.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, streaming]);

  useEffect(() => {
    const onScroll = () => {
      stick.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void send(text);
  };

  if (messages === null && !error) return <p className="muted center">Loading…</p>;

  const list = messages ?? [];
  const last = list[list.length - 1];
  const activeChoices = !busy && last?.role === "assistant" ? choicesOf(last.text) : [];
  const empty = list.length === 0 && !busy;
  // Daily limits and the pre-launch wait aren't errors the learner can fix by retrying.
  const calm = error?.code === "site_full" || error?.code === "user_limit" || error?.code === "not_ready";

  return (
    <div className="thread">
      {empty && props.startLabel && (
        <div className="start-card">
          {props.startHint && <p>{props.startHint}</p>}
          <button className="btn" onClick={() => void send("")}>
            {props.startLabel}
          </button>
        </div>
      )}

      {list.map((m, i) => (
        <article key={i} className={`msg ${m.role}`}>
          {m.role === "assistant" ? <Rich text={m.text} /> : <p>{m.text}</p>}
          {m.role === "assistant" && <Sources sources={m.sources} />}
        </article>
      ))}

      {busy && (
        <article className="msg assistant live" aria-live="polite">
          {streaming ? <Rich text={streaming} /> : null}
          <p className="typing">
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {status || (streaming ? "" : "Cotsi is thinking…")}
          </p>
        </article>
      )}

      {activeChoices.length > 0 && <Choices key={list.length} questions={activeChoices} disabled={busy} onAnswer={(t) => void send(t)} />}

      {error && (
        <div className={`notice ${calm ? "calm" : "error"}`} role="alert">
          {error.message}
          {!calm && list.length === 0 && props.autoStart && (
            <button className="link" onClick={() => void send("")}>
              Try again
            </button>
          )}
        </div>
      )}

      {!empty && props.restartLabel && !busy && (
        <button className="link restart" onClick={() => void send("", true)}>
          {props.restartLabel}
        </button>
      )}

      {(!empty || !props.startLabel) && (
        <form className="composer" onSubmit={submit}>
          {props.quickReplies && !busy && list.length > 0 && (
            <div className="quick">
              {props.quickReplies.map((q) => (
                <button type="button" key={q} onClick={() => void send(q.toLowerCase())}>
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="row">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
              }}
              placeholder={props.placeholder ?? "Type your answer…"}
              rows={1}
              maxLength={6000}
              aria-label="Your message"
            />
            <button className="btn send" disabled={busy || !draft.trim()} aria-label="Send">
              ↑
            </button>
          </div>
        </form>
      )}
      <div ref={bottom} />
    </div>
  );
}
