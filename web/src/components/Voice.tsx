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
  onChange,
}: {
  voice?: string;
  rate?: number;
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
                    onClick={() => (isPlaying || busy ? reader.stop() : void reader.preview(v.id, speed))}
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
      <p className="fine">Natural voices from Microsoft Azure. Listening counts toward your daily usage, like lessons do.</p>
    </div>
  );
}

/** Play / pause for whatever Cotsi is reading, shown above the message box in listening mode. */
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
  return (
    <div className="listen-bar" role="group" aria-label="Read aloud">
      {!voicesOn ? (
        <span className="listen-soon">🎧 Natural voices coming soon</span>
      ) : s.status === "idle" ? (
        <button type="button" className="listen-main" onClick={onReadLast} disabled={!canReadLast}>
          🔊 <span>{s.error ? "Try reading again" : "Read the last reply"}</span>
        </button>
      ) : s.status === "loading" ? (
        <button type="button" className="listen-main" onClick={() => reader.stop()}>
          … <span>Getting the voice ready</span>
        </button>
      ) : (
        <button type="button" className="listen-main" onClick={() => (speaking ? reader.pause() : reader.resume())}>
          {speaking ? "⏸" : "▶"} <span>{speaking ? "Reading aloud…" : "Paused"}</span>
        </button>
      )}
      {voicesOn && s.status !== "idle" && (
        <button type="button" className="listen-stop" onClick={() => reader.stop()} aria-label="Stop reading">
          ■
        </button>
      )}
      {onGame && (
        <button type="button" className={`listen-game${game ? " on" : ""}`} onClick={onGame} aria-pressed={game}>
          🎮 <span>{game ? "Hide game" : "Play while you listen"}</span>
        </button>
      )}
      {voicesOn && s.error && <span className="listen-error">{s.error}</span>}
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
