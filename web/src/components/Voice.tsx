import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useMe } from "../App";
import { GROUP_LABEL, reader, type ReaderState, type Voice, type VoiceGroup, voiceOrDefault } from "../speech";

export function useReader(): ReaderState {
  const [state, setState] = useState(reader.state);
  useEffect(() => reader.subscribe(setState), []);
  return state;
}

/** True once natural voices are set up on the server. */
export function useVoicesOn(): boolean {
  const { me } = useMe();
  return Boolean(me?.voices?.ready);
}

export const SPEEDS = [
  { rate: 0.85, label: "Slower" },
  { rate: 1, label: "Normal" },
  { rate: 1.2, label: "Faster" },
];

let voiceList: Voice[] | null = null;

function useVoiceList(): { voices: Voice[] | null; error: string } {
  const [voices, setVoices] = useState<Voice[] | null>(voiceList);
  const [error, setError] = useState("");
  useEffect(() => {
    if (voiceList) return;
    api<{ voices: Voice[] }>("GET", "/tts/voices")
      .then((d) => {
        voiceList = d.voices;
        setVoices(d.voices);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the voices."));
  }, []);
  return { voices, error };
}

/** Natural voices, India first, each with a sample to play. */
export function VoicePicker({
  voice,
  rate,
  lang = "",
  onChange,
}: {
  voice?: string;
  rate?: number;
  /** Previews speak the lesson language the learner picked. */
  lang?: "" | "hi" | "mr";
  onChange: (next: { voice?: string; rate: number }) => void;
}) {
  const { voices, error } = useVoiceList();
  const playing = useReader();
  const speed = rate ?? 1;
  const chosenId = voiceOrDefault(voice);
  useEffect(() => () => reader.stop(), []);

  if (error) return <p className="notice calm">{error}</p>;
  if (!voices) return <p className="fine">Loading voices…</p>;
  const groups = [...new Set(voices.map((v) => v.group))] as VoiceGroup[];
  return (
    <div className="voices">
      {groups.map((g) => (
        <fieldset key={g} className="voice-group">
          <legend>{GROUP_LABEL[g]}</legend>
          {voices
            .filter((v) => v.group === g)
            .map((v) => {
              const on = v.id === chosenId;
              const mine = playing.key === `preview:${v.id}`;
              const busy = mine && playing.status === "loading";
              const isPlaying = mine && playing.status === "speaking";
              return (
                <div key={v.id} className={`voice${on ? " on" : ""}`}>
                  <label>
                    <input type="radio" name="voice" checked={on} onChange={() => onChange({ voice: v.id, rate: speed })} />
                    <span>
                      <b>{v.name}</b>
                      <small>{v.gender}</small>
                    </span>
                  </label>
                  <button
                    type="button"
                    className="voice-play"
                    aria-label={isPlaying ? `Stop ${v.name}` : `Play a sample of ${v.name}`}
                    onClick={() => (isPlaying || busy ? reader.stop() : void reader.preview(v.id, speed, lang))}
                  >
                    {busy ? "…" : isPlaying ? "■" : "▶"}
                  </button>
                </div>
              );
            })}
        </fieldset>
      ))}
      {playing.error && <p className="notice calm">{playing.error}</p>}
      <fieldset className="voice-speed">
        <legend>Speed</legend>
        <div className="segmented">
          {SPEEDS.map((s) => (
            <button type="button" key={s.rate} className={speed === s.rate ? "on" : ""} onClick={() => onChange({ voice: chosenId, rate: s.rate })}>
              <b>{s.label}</b>
            </button>
          ))}
        </div>
      </fieldset>
      <p className="fine">Natural voices from OpenAI. Listening counts toward your daily usage, like lessons do.</p>
    </div>
  );
}

/** Play / pause, back and forward for whatever Cotsi is reading, above the message box. */
export function ListenBar({
  voicesOn,
  onReadLast,
  canReadLast,
  game,
  onGame,
}: {
  voicesOn: boolean;
  onReadLast: () => void;
  canReadLast: boolean;
  game?: boolean;
  onGame?: () => void;
}) {
  const s = useReader();
  const speaking = s.status === "speaking";
  const active = voicesOn && s.status !== "idle" && !s.key?.startsWith("preview:");
  return (
    <div className="listen-bar" role="group" aria-label="Read aloud">
      {!voicesOn ? (
        <span className="listen-soon">🎧 Natural voices coming soon</span>
      ) : !active ? (
        <button type="button" className="listen-main" onClick={onReadLast} disabled={!canReadLast}>
          🔊 <span>{s.error ? "Try reading again" : "Read the last reply"}</span>
        </button>
      ) : (
        <div className="listen-controls">
          <button type="button" className="listen-ctl" onClick={() => reader.prev()} aria-label="Back one sentence" title="Back one sentence">
            ⏮
          </button>
          <button
            type="button"
            className="listen-ctl main"
            onClick={() => (speaking ? reader.pause() : reader.resume())}
            disabled={s.status === "loading"}
            aria-label={speaking ? "Pause" : "Play"}
          >
            {s.status === "loading" ? "…" : speaking ? "⏸" : "▶"}
          </button>
          <button type="button" className="listen-ctl" onClick={() => reader.next()} aria-label="Next sentence" title="Next sentence">
            ⏭
          </button>
          <button type="button" className="listen-ctl" onClick={() => reader.stop()} aria-label="Stop reading" title="Stop">
            ■
          </button>
          {s.total ? (
            <span className="listen-pos">
              {(s.index ?? 0) + 1} / {s.total}
            </span>
          ) : null}
        </div>
      )}
      {onGame && (
        <button type="button" className={`listen-game${game ? " on" : ""}`} onClick={onGame} aria-pressed={game}>
          🎮 <span>{game ? "Hide game" : "Play while you listen"}</span>
        </button>
      )}
      {voicesOn && s.error && <span className="listen-error">{s.error}</span>}
      {voicesOn && active && <span className="listen-tip">Tip: tap any sentence to hear it from there.</span>}
    </div>
  );
}

/** Shown where voices would be chosen, until natural voices are switched on. */
export function VoicesSoon() {
  return (
    <p className="notice calm">
      🎧 Natural, human-sounding voices are coming very soon. Until then, listening mode gives you plain lessons written to be easy to
      follow, plus the calm game to play alongside.
    </p>
  );
}
