import { memo, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type ChoiceQuestion = { text: string; options: string[] };
type Segment =
  | { type: "md"; text: string }
  | { type: "choices"; questions: ChoiceQuestion[] }
  | { type: "visual"; html: string }
  | { type: "pending"; kind: string };

const BLOCK = /```cotsi-(state|choices|visual)[^\n]*\n([\s\S]*?)```/g;
const OPEN = /```cotsi-(state|choices|visual)[^\n]*\n?[\s\S]*$/;

/** Splits a reply into markdown and the app's special blocks (hidden state, buttons, visuals). */
export function parseReply(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  const push = (md: string) => {
    if (md.trim()) out.push({ type: "md", text: md });
  };
  for (const m of text.matchAll(BLOCK)) {
    push(text.slice(last, m.index));
    last = m.index! + m[0].length;
    if (m[1] === "visual") out.push({ type: "visual", html: m[2] });
    if (m[1] === "choices") {
      try {
        const data = JSON.parse(m[2]);
        const questions = (data.questions ?? [])
          .filter((q: ChoiceQuestion) => q && Array.isArray(q.options) && q.options.length > 1)
          .map((q: ChoiceQuestion) => ({ text: String(q.text ?? ""), options: q.options.map(String).slice(0, 6) }))
          .slice(0, 4);
        if (questions.length) out.push({ type: "choices", questions });
      } catch {
        // malformed block: show nothing rather than raw JSON
      }
    }
  }
  const rest = text.slice(last);
  const open = rest.match(OPEN); // a block that is still streaming in
  if (open) {
    push(rest.slice(0, open.index));
    out.push({ type: "pending", kind: open[1] });
  } else {
    push(rest);
  }
  return out;
}

export function choicesOf(text: string): ChoiceQuestion[] {
  const seg = parseReply(text).filter((s) => s.type === "choices").pop();
  return seg && seg.type === "choices" ? seg.questions : [];
}

const CSP =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:\">";
const RESIZE =
  "<script>(function(){function s(){var b=document.body;if(!b)return;parent.postMessage({cotsiHeight:Math.max(b.scrollHeight,b.offsetHeight)},'*')}new ResizeObserver(s).observe(document.documentElement);addEventListener('load',s);addEventListener('click',function(){setTimeout(s,60)});s()})()</script>";

/** Model-written HTML runs in a sandboxed frame with no network access and no access to this page. */
function Visual({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(260);
  const doc = useMemo(() => {
    const base = "<style>html,body{margin:0;background:#110f18;color:#f4f2fb;font-family:system-ui,sans-serif}</style>";
    // The doctype keeps the frame in standards mode so its height can be measured.
    return "<!doctype html>" + CSP + base + html + RESIZE;
  }, [html]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source === ref.current?.contentWindow && typeof e.data?.cotsiHeight === "number") {
        setHeight(Math.min(900, Math.max(120, Math.ceil(e.data.cotsiHeight))));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return <iframe ref={ref} className="visual" title="Interactive visual" sandbox="allow-scripts" srcDoc={doc} style={{ height }} />;
}

export const Rich = memo(function Rich({ text }: { text: string }) {
  const segments = useMemo(() => parseReply(text), [text]);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "md") {
          return (
            <div className="md" key={i}>
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
                  table: ({ children }) => (
                    <div className="table-wrap">
                      <table>{children}</table>
                    </div>
                  ),
                }}
              >
                {seg.text}
              </Markdown>
            </div>
          );
        }
        if (seg.type === "visual") return <Visual key={i} html={seg.html} />;
        if (seg.type === "pending" && seg.kind === "visual") {
          return (
            <div className="visual-pending" key={i}>
              Drawing a visual…
            </div>
          );
        }
        return null;
      })}
    </>
  );
});
