import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, stream } from "../api";
import { choiceUnits, unitAtPoint, unitsFrom } from "../readAloud";
import { primeSpeech, reader } from "../speech";
import { getItem, setItem } from "../storage";
import type { Message, Source, Track } from "../types";
import { GamePanel } from "../games/GamePanel";
import { type ChoiceQuestion, choicesOf, Rich } from "./Rich";
import { ListenBar, useReader, useVoicesOn } from "./Voice";

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
  /** The learner can attach a picture (a screenshot, a photo of notes). */
  images?: boolean;
  /** Shown just above the message box (e.g. the way on to the next page). */
  footer?: ReactNode;
};

type Picture = { data: string; thumb: string };

const MAX_SIDE = 1568; // the longest side Claude reads at full detail

/** Shrinks a photo or screenshot in the browser: a JPEG to send, and a small preview to keep. */
async function preparePicture(file: File): Promise<Picture> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a photo or screenshot.");
  if (file.size > 25_000_000) throw new Error("That picture is too large.");
  const bitmap = await createImageBitmap(file);
  const draw = (max: number, quality: number) => {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // transparent screenshots stay readable as JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  };
  let full = draw(MAX_SIDE, 0.85);
  if (full.length > 1_900_000) full = draw(1200, 0.75);
  const thumb = draw(320, 0.7);
  bitmap.close();
  return { data: full.slice(full.indexOf(",") + 1), thumb };
}

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
  const voicesOn = useVoicesOn();
  const listen = listenMode && voicesOn;
  const speech = useReader();
  const [game, setGame] = useState(() => getItem("local", GAME_KEY) === "on");
  const readKey = (m: Message) => `${trackId}:${thread}:${m.at}`;
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [picture, setPicture] = useState<Picture | null>(null);
  const [pictureNote, setPictureNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const busy = streaming !== null;
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const listenRef = useRef(listen);
  listenRef.current = listen;
  const threadEl = useRef<HTMLDivElement>(null);
  const pendingRead = useRef<string | null>(null);

  /** Reads a reply aloud from the start, or from the sentence at a tapped point. */
  const readMessage = useCallback(
    (m: Message, isLast: boolean, at?: { x: number; y: number }) => {
      const el = threadEl.current?.querySelector(`article[data-at="${CSS.escape(m.at)}"]`);
      if (!el) return;
      const units = unitsFrom(el);
      if (isLast) units.push(...choiceUnits(choicesOf(m.text), threadEl.current?.querySelector(".choices") ?? null));
      const start = at ? unitAtPoint(units, at.x, at.y) : 0;
      if (start < 0) return;
      reader.read(units, `${trackId}:${thread}:${m.at}`, start);
    },
    [trackId, thread],
  );

  const send = useCallback(
    async (text: string, restart = false, pic: Picture | null = null) => {
      setError(null);
      if (listenRef.current) reader.stop();
      setStatus("");
      setStreaming("");
      stick.current = true;
      if (restart) setMessages([]);
      else if (text || pic) {
        setMessages((m) => [...(m ?? []), { role: "user", text, at: new Date().toISOString(), ...(pic ? { image: { thumb: pic.thumb } } : {}) }]);
      }
      let reply = "";
      try {
        const image = pic ? { data: pic.data, thumb: pic.thumb } : undefined;
        await stream(`/tracks/${trackId}/chat`, { thread, message: text || undefined, restart: restart || undefined, image }, (e) => {
          if (e.t === "text") {
            reply += e.d;
            setStreaming(reply);
          } else if (e.t === "status") {
            setStatus(e.d);
          } else if (e.t === "done") {
            const done = e as unknown as { track: Track; sources?: Source[]; image?: { thumb: string; desc: string } };
            const msg: Message = { role: "assistant", text: reply, at: new Date().toISOString(), sources: done.sources };
            setMessages((m) => {
              const list = [...(m ?? [])];
              // Keep what Cotsi read from the picture with the learner's message.
              const mine = list[list.length - 1];
              if (done.image && mine?.role === "user") list[list.length - 1] = { ...mine, image: done.image };
              return [...list, msg];
            });
            onTrack?.(done.track);
            // Read it once it's on screen, so each sentence can be highlighted as it's read.
            if (listenRef.current) pendingRead.current = msg.at;
          }
        });
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : new ApiError("Something went wrong. Please try again.", 0);
        setError(apiErr);
        // Put the learner's message back in the box so nothing they typed or attached is lost.
        if ((text || pic) && !restart) {
          setMessages((m) => (m ?? []).slice(0, -1));
          setDraft(text);
          if (pic) setPicture(pic);
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
    const at = pendingRead.current;
    if (!at || !messages) return;
    const i = messages.findIndex((m) => m.at === at);
    if (i < 0) return;
    pendingRead.current = null;
    requestAnimationFrame(() => readMessage(messages[i], i === messages.length - 1));
  }, [messages, readMessage]);

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
    if ((!text && !picture) || busy) return;
    setDraft("");
    setPicture(null);
    void send(text, false, picture);
  };

  const attach = async (file: File | undefined) => {
    setPictureNote("");
    if (!file) return;
    try {
      setPicture(await preparePicture(file));
    } catch (err) {
      setPictureNote(err instanceof Error && err.message ? err.message : "Couldn't open that picture.");
    }
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
  const readLast = () => lastReply && readMessage(lastReply, lastReply === last);
  // The game runs while Cotsi writes or reads, and waits while it's the learner's turn.
  // Without read-aloud the learner reads at their own pace, so the game simply keeps going.
  const running = !listen || busy || speech.status === "speaking" || speech.status === "loading";
  const waitingNote = speech.status === "paused" ? "Reading is paused. Press ▶ to carry on." : "Your turn: answer Cotsi to keep running.";

  return (
    <div className="thread" ref={threadEl} onPointerDownCapture={listen ? primeSpeech : undefined}>
      {showGame && (
        <div className="game-dock">
          <GamePanel
            running={running}
            waitingNote={waitingNote}
            onHide={() => {
              setItem("local", GAME_KEY, "off");
              setGame(false);
            }}
          />
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
        <article
          key={i}
          data-at={m.at}
          className={`msg ${m.role}${listen && m.role === "assistant" ? " tap-to-read" : ""}`}
          onClick={
            listen && m.role === "assistant"
              ? (e) => {
                  if ((e.target as Element).closest("a, button, input, textarea, iframe, summary, pre")) return;
                  if (window.getSelection()?.toString()) return;
                  readMessage(m, i === list.length - 1, { x: e.clientX, y: e.clientY });
                }
              : undefined
          }
        >
          {m.role === "user" && m.image && (
            <figure className="msg-pic">
              <img src={m.image.thumb || undefined} alt="Your picture" />
              {m.image.desc && (
                <details>
                  <summary>What Cotsi read from it</summary>
                  <div className="pic-desc">
                    <Rich text={m.image.desc} />
                  </div>
                </details>
              )}
            </figure>
          )}
          {m.role === "assistant" ? <Rich text={m.text} /> : m.text ? <p>{m.text}</p> : null}
          {m.role === "assistant" && <Sources sources={m.sources} />}
          {m.role === "assistant" && listen && (
            <button
              type="button"
              className="link read-this"
              onClick={() => (speech.key === readKey(m) ? reader.stop() : readMessage(m, i === list.length - 1))}
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

      {!busy && props.footer}

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
          {picture && (
            <div className="pic-chip">
              <img src={picture.thumb} alt="" />
              <span>Picture attached</span>
              <button type="button" className="link" onClick={() => setPicture(null)} aria-label="Remove the picture">
                ✕
              </button>
            </div>
          )}
          {pictureNote && <p className="fine pic-note">{pictureNote}</p>}
          <div className="row">
            {props.images && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    void attach(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="btn ghost attach"
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                  aria-label="Add a photo or screenshot"
                  title="Add a photo or screenshot"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="3" />
                    <circle cx="9" cy="10" r="1.6" />
                    <path d="m21 16-5-5-8 8" />
                  </svg>
                </button>
              </>
            )}
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
            <button className="btn send" disabled={busy || (!draft.trim() && !picture)} aria-label="Send">
              ↑
            </button>
          </div>
        </form>
      )}
      <div ref={bottom} />
    </div>
  );
}
