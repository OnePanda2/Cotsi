import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, stream } from "../api";
import { primeSpeech, reader, speechFor, speechSupported, VOICES_ON } from "../speech";
import { getItem, setItem } from "../storage";
import type { Message, Source, Track } from "../types";
import { LaneRunner } from "./LaneRunner";
import { type ChoiceQuestion, choicesOf, Rich } from "./Rich";
import { ListenBar, useReader } from "./Voice";

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
  /** Listening mode: read replies aloud, with the side game. */
  listen?: boolean;
};

const GAME_KEY = "cotsi:game";

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
  // Listening mode: the game is always there; reading aloud only once natural voices are on.
  const listenMode = Boolean(props.listen);
  const listen = listenMode && VOICES_ON && speechSupported();
  const speech = useReader();
  const [game, setGame] = useState(() => getItem("local", GAME_KEY) === "on");
  const readKey = (m: Message) => `${trackId}:${thread}:${m.at}`;
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const busy = streaming !== null;
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const listenRef = useRef(listen);
  listenRef.current = listen;

  const send = useCallback(
    async (text: string, restart = false) => {
      setError(null);
      if (listenRef.current) reader.stop();
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
            const msg: Message = { role: "assistant", text: reply, at: new Date().toISOString(), sources: done.sources };
            setMessages((m) => [...(m ?? []), msg]);
            onTrack?.(done.track);
            if (listenRef.current) void reader.read(speechFor(reply), `${trackId}:${thread}:${msg.at}`);
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

  // Leaving the lesson stops the reading.
  useEffect(() => () => reader.stop(), [trackId, thread]);

  // Wide screens make room for the game beside the lesson.
  const showGame = listenMode && game;
  useEffect(() => {
    if (!showGame) return;
    document.body.classList.add("has-game");
    return () => document.body.classList.remove("has-game");
  }, [showGame]);

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
  // Daily limits, the pre-launch wait and the members-only note aren't errors the learner can fix by retrying.
  const calm =
    error?.code === "site_full" || error?.code === "user_limit" || error?.code === "not_ready" || error?.code === "members_only" || error?.code === "terms" || error?.code === "locked";

  const lastReply = [...list].reverse().find((m) => m.role === "assistant");
  const readLast = () => lastReply && void reader.read(speechFor(lastReply.text), readKey(lastReply));
  // The game runs while Cotsi writes or reads, and waits while it's the learner's turn.
  // Without read-aloud the learner reads at their own pace, so the game simply keeps going.
  const running = !listen || busy || speech.status === "speaking";
  const waitingNote = speech.status === "paused" ? "Reading is paused. Press ▶ to carry on." : "Your turn: answer Cotsi to keep running.";

  return (
    <div className="thread" onPointerDownCapture={listen ? primeSpeech : undefined}>
      {showGame && (
        <div className="runner-dock">
          <LaneRunner running={running} waitingNote={waitingNote} />
        </div>
      )}
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
          {m.role === "assistant" && listen && (
            <button
              type="button"
              className="link read-this"
              onClick={() => (speech.key === readKey(m) ? reader.stop() : void reader.read(speechFor(m.text), readKey(m)))}
            >
              {speech.key === readKey(m) ? "■ Stop reading" : "🔊 Read this aloud"}
            </button>
          )}
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
          {listenMode && (
            <ListenBar
              voicesOn={listen}
              onReadLast={readLast}
              canReadLast={Boolean(lastReply) && !busy}
              game={game}
              onGame={() => {
                setItem("local", GAME_KEY, game ? "off" : "on");
                setGame(!game);
              }}
            />
          )}
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
