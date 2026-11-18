import { useEffect, useState } from "react";
import { type VoiceGroup, groupLabel, loadVoices, pickVoice, previewVoice, reader, type ReaderState, speechSupported, voiceId, type VoiceOption, voiceOptions } from "../speech";

export function useReader(): ReaderState {
  const [state, setState] = useState(reader.state);
  useEffect(() => reader.subscribe(setState), []);
  return state;
}

export function useVoices(): { voices: SpeechSynthesisVoice[]; options: VoiceOption[]; loaded: boolean } {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    void loadVoices().then((v) => {
      if (!live) return;
      setVoices(v);
      setLoaded(true);
    });
    // Some browsers add voices later (e.g. after a language pack downloads).
    const more = () => setVoices(speechSynthesis.getVoices());
    if (speechSupported()) speechSynthesis.addEventListener("voiceschanged", more);
    return () => {
      live = false;
      if (speechSupported()) speechSynthesis.removeEventListener("voiceschanged", more);
    };
  }, []);
  return { voices, options: voiceOptions(voices), loaded };
}

export const SPEEDS = [
  { rate: 0.85, label: "Slower" },
  { rate: 1, label: "Normal" },
  { rate: 1.2, label: "Faster" },
];

/** The list of voices on this device, India first, each with a preview button. */
export function VoicePicker({
  voice,
  rate,
  onChange,
}: {
  voice?: string;
  rate?: number;
  onChange: (next: { voice?: string; rate: number }) => void;
}) {
  const { voices, options, loaded } = useVoices();
  const playing = useReader();
  const speed = rate ?? 1;
  const chosen = voices.length ? pickVoice(voices, voice) : null;
  const chosenId = chosen ? voiceId(chosen) : voice;
  useEffect(() => () => reader.stop(), []);

  if (!speechSupported()) {
    return <p className="notice calm">This browser can't read aloud. Try Chrome, Edge or Safari, or the browser on your phone.</p>;
  }
  if (loaded && !options.length) {
    return (
      <p className="notice calm">
        No English or Hindi voices are installed on this device. On Android, open Settings → Text-to-speech and add English (India). On
        iPhone, open Settings → Accessibility → Spoken Content → Voices.
      </p>
    );
  }
  const groups = [...new Set(options.map((o) => o.group))] as VoiceGroup[];
  return (
    <div className="voices">
      {!loaded && <p className="fine">Finding the voices on this device…</p>}
      {groups.map((g) => (
        <fieldset key={g} className="voice-group">
          <legend>{groupLabel(g)}</legend>
          {options
            .filter((o) => o.group === g)
            .map((o) => {
              const on = o.id === chosenId;
              const isPlaying = playing.key === `preview:${o.id}` && playing.status === "speaking";
              return (
                <div key={o.id} className={`voice${on ? " on" : ""}`}>
                  <label>
                    <input type="radio" name="voice" checked={on} onChange={() => onChange({ voice: o.id, rate: speed })} />
                    <span>
                      <b>{o.name}</b>
                      {!o.local && <small>Needs internet</small>}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="voice-play"
                    aria-label={isPlaying ? `Stop ${o.name}` : `Play a sample of ${o.name}`}
                    onClick={() => (isPlaying ? reader.stop() : void previewVoice(o.id, speed))}
                  >
                    {isPlaying ? "■" : "▶"}
                  </button>
                </div>
              );
            })}
        </fieldset>
      ))}
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
      <p className="fine">These are the voices built into this device, so they're free and work offline. Other devices may offer different ones.</p>
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
          🔊 <span>Read the last reply</span>
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
