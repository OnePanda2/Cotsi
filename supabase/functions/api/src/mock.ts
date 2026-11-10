// A stand-in for Claude used by automated tests and local development (MOCK_CLAUDE=1).
// It streams canned replies in the same shape the real model produces, at no cost.

import type { ClaudeRunner, RunOpts, RunResult } from "./claude.ts";

const PROFILE = {
  is_cv: true,
  not_cv_reason: "",
  first_name: "Riya",
  headline: "Customer support lead moving toward data work",
  location_country: "India",
  years_experience: 5,
  current_role: "Customer Support Team Lead",
  fields: ["Customer support", "SaaS"],
  skills: [
    { name: "Excel", level: "strong" },
    { name: "SQL", level: "basic" },
    { name: "Zendesk", level: "strong" },
    { name: "Team training", level: "working" },
  ],
  education: "BCom",
  languages: ["English", "Hindi"],
  achievements: ["Cut first-response time by 40%"],
  strengths: ["Explains complex issues simply", "Comfortable with numbers", "Leads a team of 8"],
  summary: "Five years in SaaS customer support, the last two leading a team. Strong with spreadsheets and reporting.",
};

const RECS = {
  roles: [
    {
      title: "Support Operations Analyst",
      one_liner: "Turns support data into decisions about staffing, tooling and product fixes.",
      why_rising: "Companies are adding AI agents to support and need people who can measure them. Postings for support analytics roles are growing.",
      signals: ["hiring", "launches"],
      evidence: [{ title: "Example hiring report", url: "https://example.com/hiring-report" }],
      fit_score: 82,
      fit_reasons: ["Already runs support reporting", "Knows the tools these teams use"],
      have: ["Excel reporting", "Zendesk", "Team leadership"],
      gaps: ["SQL for analysis", "Dashboards in a BI tool", "Measuring AI agent quality", "Presenting findings"],
      weeks_to_ready: 12,
      pay_note: "Pay wasn't found in the scans.",
      confidence: "medium",
      first_step: "Export last month's tickets and answer one question with a pivot table.",
    },
    {
      title: "AI Support Specialist",
      one_liner: "Sets up, tests and improves AI agents that answer customers.",
      why_rising: "Funding and product launches both point at AI support agents.",
      signals: ["money", "launches"],
      evidence: [],
      fit_score: 74,
      fit_reasons: ["Knows what good support looks like"],
      have: ["Support expertise"],
      gaps: ["Prompt writing", "Evaluation basics", "Knowledge-base design"],
      weeks_to_ready: 10,
      pay_note: "Pay wasn't found in the scans.",
      confidence: "medium",
      first_step: "Write five test questions an AI agent should handle for your product.",
    },
    {
      title: "Customer Success Manager",
      one_liner: "Keeps business customers successful and renewing.",
      why_rising: "Steady demand in SaaS hiring data.",
      signals: ["hiring"],
      evidence: [],
      fit_score: 70,
      fit_reasons: ["Client communication", "Team lead experience"],
      have: ["Client communication"],
      gaps: ["Account planning", "Renewal forecasting"],
      weeks_to_ready: 8,
      pay_note: "Pay wasn't found in the scans.",
      confidence: "low",
      first_step: "Shadow one renewal call.",
    },
  ],
  watchlist: [{ title: "Voice AI operations", note: "Seen in one signal only." }],
  caveat: "This is a forecast from public signals, not a guarantee.",
};

const MAP_STATE =
  '```cotsi-state\n{"phase":"teaching","map":{"topic":"Test topic","goal":"understand it","trunk":[{"title":"First idea","unlocks":"the basics"},{"title":"Second idea","unlocks":"the rest"}],"anchor":"Can you explain it to a friend?"},"progress":{"current":1,"done":[],"weak":[],"unchecked":[]},"next_review_in_days":1}\n```';

const LESSON_FIRST = `🗺️ **Leverage Map — Test topic** (for: understanding it)

**The 20% — learn in this order:**
1. **First idea** — unlocks: the basics
2. **Second idea** — unlocks: the rest

🎯 **Anchor problem:** Can you explain it to a friend?

### 1/2 · First idea

**Michael:** So it just works by magic?

**Jim:** No. It works because of the first idea.

**The real version:** The **first idea** is the foundation.

| Term | Meaning |
|---|---|
| Idea | A thing to learn |

\`\`\`cotsi-visual
<!doctype html><html><body style="margin:0;background:#110f18;color:#fff;font-family:sans-serif"><div id="v" style="padding:16px">Step <b id="n">1</b> / 2 <button onclick="document.getElementById('n').textContent='2'">Next</button></div></body></html>
\`\`\`
*A two-step walkthrough of the first idea.*

🧠 **Sticky line:** First things first.

🎯 **Your turn:** Which statement is right?

\`\`\`cotsi-choices
{"questions":[{"text":"Which statement is right?","options":["It works by magic","It works because of the first idea","Not sure"]}]}
\`\`\`

${MAP_STATE}`;

const LESSON_NEXT = `✅ **Right.** It works because of the first idea.

### 2/2 · Second idea

The second idea builds on the first.

🎯 **Your turn:** Explain the second idea in one line.

\`\`\`cotsi-state
{"phase":"teaching","progress":{"current":2,"done":[1],"weak":[],"unchecked":[]},"next_review_in_days":1}
\`\`\``;

const PLAN_FIRST = `I've read your CV, so I'll skip what you already know. Two quick checks:

\`\`\`cotsi-choices
{"questions":[{"text":"What does SELECT COUNT(*) FROM tickets WHERE status = 'open' return?","options":["All open tickets","The number of open tickets","The first open ticket","Not sure"]},{"text":"Which chart best shows a trend over time?","options":["Pie chart","Line chart","Table","Not sure"]}]}
\`\`\`

\`\`\`cotsi-state
{"phase":"questions"}
\`\`\``;

const PLAN_ROADMAP = `🎯 **Outcome:** You can answer support questions with data and present the result.

🏆 **Capstone:** A dashboard and a one-page findings memo from real ticket data.

🧱 **Milestones** are in your path. Open **Milestone 1** to begin.

\`\`\`cotsi-state
{"phase":"done","roadmap":{"outcome":"Answer support questions with data and present the result","capstone":"A dashboard and a findings memo from real ticket data","weeks":12,"milestones":[{"n":1,"title":"Answer a business question with SQL","hours":8,"done_means":["Query runs","Answer is stated in one sentence"],"boss":false},{"n":2,"title":"Build a dashboard a manager can read","hours":10,"done_means":["Three charts","One insight per chart"],"boss":true},{"n":3,"title":"Job-ready: portfolio, CV and interview practice","hours":8,"done_means":["Portfolio link","Updated CV","Mock interview done"],"boss":false}]}}
\`\`\``;

const MILESTONE = `### Milestone 1 · Answer a business question with SQL

**Action task:** Write one query that counts open tickets by week.

**Done means:** the query runs, and you state the answer in one sentence.

\`\`\`cotsi-state
{"phase":"teaching"}
\`\`\``;

const MILESTONE_DONE = `✅ **Checkpoint passed.** Your query runs and your answer is clear. Open Milestone 2 next.

\`\`\`cotsi-state
{"phase":"teaching","milestone_done":1}
\`\`\``;

const REVIEW = `Quick review. Answer both in one message, with a 1–5 confidence each.

1. What does the first idea unlock?
2. How does the second idea build on it?

\`\`\`cotsi-state
{"phase":"teaching","next_review_in_days":3}
\`\`\``;

const SCAN = (label: string) =>
  `- **SQL for support analytics** — more postings ask for it ([Example hiring report](https://example.com/hiring-report)), which points to demand over the next months.\n- **AI agent evaluation** — signal weak, one source only.\n\n**Strongest signal:** ${label}: support teams are hiring for data skills.`;

const HUNT = `## Openings worth applying to
- **[Support Operations Analyst, Example Co](https://example.com/jobs/1)** · Remote · Fits your reporting background.

## Do this today
Apply to the first opening.`;

const EDGE = `## The role in plain words
You turn support data into decisions.

## Your unfair advantages
- Most candidates come from pure analytics and have never run a support queue. You have.

## Do this today
Write down three questions your current team can't answer with data.`;

function pick(opts: RunOpts): { text: string; sources?: { url: string; title: string }[]; searches?: number } {
  const key = opts.mock ?? "";
  if (key === "profile") return { text: JSON.stringify(PROFILE) };
  if (key === "recommend") return { text: JSON.stringify(RECS) };
  if (key.startsWith("scan:")) {
    return { text: SCAN(key.slice(5)), sources: [{ url: "https://example.com/hiring-report", title: "Example hiring report" }], searches: 2 };
  }
  if (key === "research:hunt") return { text: HUNT, sources: [{ url: "https://example.com/jobs/1", title: "Example Co careers" }], searches: 3 };
  if (key === "research:edge") return { text: EDGE, searches: 3 };
  const [, mode, turn] = key.split(":");
  const n = Number(turn);
  if (mode === "plan") return { text: n <= 1 ? PLAN_FIRST : PLAN_ROADMAP };
  if (mode === "milestone") return { text: n <= 1 ? MILESTONE : MILESTONE_DONE };
  if (mode === "review") return { text: REVIEW };
  return { text: n <= 1 ? LESSON_FIRST : LESSON_NEXT };
}

export function makeMockClaude(delayMs = 4): ClaudeRunner {
  return async function run(opts: RunOpts): Promise<RunResult> {
    const reply = pick(opts);
    if (opts.webSearch) opts.onStatus?.("Searching: mock query");
    for (let i = 0; i < reply.text.length; i += 24) {
      if (opts.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      opts.onText?.(reply.text.slice(i, i + 24));
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
    return {
      text: reply.text,
      stopReason: "end_turn",
      refused: false,
      costUsd: opts.webSearch ? 0.12 : 0.02,
      model: opts.model,
      sources: reply.sources ?? [],
      searches: reply.searches ?? 0,
    };
  };
}
