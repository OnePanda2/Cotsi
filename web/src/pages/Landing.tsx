import { rememberNext } from "../App";
import { useAuth } from "../auth";
import { config } from "../config";

export const SECTIONS = [
  {
    kind: "topic",
    icon: "💡",
    title: "Learn a topic",
    text: "Name anything you want to understand. Cotsi finds the few ideas that unlock the rest and teaches them one at a time.",
    cta: "Learn something",
    to: "/new/topic",
  },
  {
    kind: "book",
    icon: "📖",
    title: "Understand a book",
    text: "Get the core ideas of any book, what they mean for you, and a quick check that they stuck.",
    cta: "Pick a book",
    to: "/new/book",
  },
  {
    kind: "job",
    icon: "🚀",
    title: "Get job-ready",
    text: "Upload your CV. Cotsi finds the roles rising in your field, builds a syllabus of only what you're missing, then helps you land the job.",
    cta: "Upload my CV",
    to: "/job",
  },
] as const;

function GoogleButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button className="btn google" onClick={onClick}>
      <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.500-4.800 7.200l7.6 5.900c4.400-4.100 7-10.100 7-17.600z" />
        <path fill="#FBBC05" d="M10.5 28.700c-.5-1.500-.8-3.100-.8-4.700s.3-3.200.8-4.700l-7.900-6.100C.9 16.500 0 20.100 0 24s.9 7.500 2.600 10.800l7.900-6.100z" />
        <path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.600-5.900c-2.100 1.400-4.800 2.300-8.300 2.300-6.300 0-11.600-4.200-13.500-9.900l-7.900 6.100C6.500 42.600 14.600 48 24 48z" />
      </svg>
      {label}
    </button>
  );
}

export function Landing() {
  const { signIn } = useAuth();
  const start = (to?: string) => {
    if (to) rememberNext(to);
    void signIn();
  };
  const label = config.devAuth ? "Continue as test learner" : "Continue with Google";
  return (
    <div className="landing">
      <section className="hero">
        <p className="badge">
          <span className="pulse" aria-hidden="true" />
          Free while in early access
        </p>
        <h1>
          Learn anything. <em>Get job-ready.</em>
        </h1>
        <p className="lede">
          Cotsi teaches through scenes with characters from the shows you love, starts with the 20% that matters, and makes sure it sticks.
        </p>
        <GoogleButton onClick={() => start()} label={label} />
      </section>

      <section className="sections" aria-label="What you can do">
        {SECTIONS.map((s) => (
          <button className="card section" key={s.kind} onClick={() => start(s.to)}>
            <span className="icon" aria-hidden="true">
              {s.icon}
            </span>
            <h2>{s.title}</h2>
            <p>{s.text}</p>
            <span className="go">{s.cta} →</span>
          </button>
        ))}
      </section>

      <section className="how">
        <h2>The job path, step by step</h2>
        <ol>
          <li>
            <b>Upload your CV.</b> Cotsi reads what you already know.
          </li>
          <li>
            <b>See what's rising.</b> It scans hiring, funding, new launches and community momentum for roles likely to be in demand in the next 3 to 6 months.
          </li>
          <li>
            <b>Get your syllabus.</b> Only what you're missing, sized to your hours per week.
          </li>
          <li>
            <b>Learn by doing.</b> Short lessons, a question after every idea, reviews so you remember.
          </li>
          <li>
            <b>Land it.</b> Live openings that fit you, and the edge you have over other applicants.
          </li>
        </ol>
        <p className="fine">Forecasts are estimates from public signals, not guarantees.</p>
      </section>
    </div>
  );
}
