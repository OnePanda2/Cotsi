// A stand-in for Claude used by automated tests, local development (MOCK_CLAUDE=1) and the
// clickable preview. It streams realistic sample replies in the same shape the real model
// produces, at no cost. Every topic gets the same sample lesson (compound interest) and
// every book the same sample book (Atomic Habits).

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
    { name: "Zendesk", level: "strong" },
    { name: "Team training", level: "working" },
    { name: "Reporting", level: "working" },
    { name: "SQL", level: "basic" },
    { name: "Process design", level: "working" },
  ],
  education: "BCom",
  languages: ["English", "Hindi"],
  achievements: ["Cut first-response time by 40%", "Built the team's weekly support dashboard in Excel"],
  strengths: ["Explains complex issues simply", "Comfortable with numbers", "Leads a team of 8"],
  summary:
    "Five years in SaaS customer support, the last two leading a team of eight. Strong with spreadsheets and reporting, and already the person the team asks for numbers.",
};

const RECS = {
  roles: [
    {
      title: "Support Operations Analyst",
      one_liner: "Turns support data into decisions about staffing, tooling and product fixes.",
      why_rising:
        "Support teams are adding AI agents and need people who can measure whether they work. Postings that ask for support analytics and SQL are growing faster than general support roles.",
      signals: ["hiring", "launches"],
      evidence: [{ title: "Sample hiring report", url: "https://example.com/hiring-report" }],
      fit_score: 82,
      fit_reasons: ["Already runs support reporting", "Knows the tools these teams use"],
      have: ["Excel reporting", "Zendesk", "Team leadership", "Knowing what the numbers mean"],
      gaps: ["SQL for analysis", "Dashboards in a BI tool", "Measuring AI agent quality", "Presenting findings to managers"],
      weeks_to_ready: 12,
      pay_note: "Sample pay range: ₹8–14 lakh a year in India (base).",
      confidence: "medium",
      first_step: "Export last month's tickets and answer one question with a pivot table.",
    },
    {
      title: "AI Support Specialist",
      one_liner: "Sets up, tests and improves the AI agents that answer customers.",
      why_rising: "Funding and product launches both point at AI support agents, and companies need people who know what a good answer looks like.",
      signals: ["money", "launches"],
      evidence: [],
      fit_score: 74,
      fit_reasons: ["Knows what good support looks like", "Has trained people, so can train an agent"],
      have: ["Support expertise", "Writing clear help articles"],
      gaps: ["Prompt writing", "Evaluation basics", "Knowledge-base design"],
      weeks_to_ready: 10,
      pay_note: "Pay wasn't found in the scans.",
      confidence: "medium",
      first_step: "Write five test questions an AI agent should handle for your product.",
    },
    {
      title: "Customer Success Manager",
      one_liner: "Keeps business customers successful and renewing.",
      why_rising: "Steady demand in SaaS hiring data. Less growth than the first two, but many openings.",
      signals: ["hiring"],
      evidence: [],
      fit_score: 70,
      fit_reasons: ["Client communication", "Team lead experience"],
      have: ["Client communication", "Calm under pressure"],
      gaps: ["Account planning", "Renewal forecasting"],
      weeks_to_ready: 8,
      pay_note: "Pay wasn't found in the scans.",
      confidence: "low",
      first_step: "Ask to sit in on one renewal call this month.",
    },
  ],
  watchlist: [{ title: "Voice AI operations", note: "Seen in one signal only. Worth watching, not yet worth training for." }],
  caveat: "This is a forecast from public signals, not a guarantee. Check the evidence links before you decide.",
};

const VISUAL = `<!doctype html><html><body style="margin:0;background:#110f18;color:#f4f2fb;font-family:system-ui,sans-serif">
<div style="padding:16px">
<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap">
<b>₹10,000 left alone at <span id="r">10</span>% a year</b>
<span style="color:#a7a2ba;font-size:13px">after <span id="y">30</span> years</span></div>
<svg id="c" viewBox="0 0 300 140" style="width:100%;height:auto;margin:12px 0;display:block"></svg>
<div style="display:flex;gap:16px;font-size:14px;flex-wrap:wrap">
<span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#5a5470"></i> Simple: <b id="s"></b></span>
<span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#a78bfa"></i> Compound: <b id="k"></b></span></div>
<label style="display:block;margin-top:12px;font-size:13px;color:#a7a2ba">Interest rate
<input id="rate" type="range" min="2" max="15" value="10" style="width:100%;accent-color:#a78bfa"></label>
<label style="display:block;font-size:13px;color:#a7a2ba">Years
<input id="yrs" type="range" min="5" max="40" value="30" style="width:100%;accent-color:#a78bfa"></label>
</div>
<script>
function f(n){return '₹'+Math.round(n).toLocaleString('en-IN')}
function draw(){var r=+rate.value/100,Y=+yrs.value,P=10000,max=P*Math.pow(1+r,Y),w=300/Y,h='';
for(var t=1;t<=Y;t++){var cv=P*Math.pow(1+r,t),sv=P*(1+r*t),hc=cv/max*130,hs=sv/max*130;
h+='<rect x="'+((t-1)*w+1)+'" y="'+(138-hc)+'" width="'+(w-2)+'" height="'+hc+'" rx="1.5" fill="#a78bfa"/>';
h+='<rect x="'+((t-1)*w+1)+'" y="'+(138-hs)+'" width="'+(w-2)+'" height="'+hs+'" rx="1.5" fill="#5a5470"/>'}
c.innerHTML=h;document.getElementById('r').textContent=rate.value;document.getElementById('y').textContent=Y;
s.textContent=f(P*(1+r*Y));k.textContent=f(max)}
var rate=document.getElementById('rate'),yrs=document.getElementById('yrs'),c=document.getElementById('c'),s=document.getElementById('s'),k=document.getElementById('k');
rate.oninput=draw;yrs.oninput=draw;draw();
</script></body></html>`;

const LESSON_FIRST = `🗺️ **Leverage Map — Compound interest** (for: making smart money decisions)

**The 20% — learn in this order:**
1. **Interest earns interest** — unlocks: why savings and debt both snowball
2. **Time beats amount** — unlocks: the Rule of 72, and why starting early wins
3. **The rate is a lever both ways** — unlocks: credit cards, EMIs and fees

**Safe to ignore for now:** continuous compounding formulas, APR vs APY fine print.

🎯 **Anchor problem:** Asha invests ₹1 lakh at 22. Ravi invests ₹2 lakh at 32. Same return. Who has more at 60, and why?

### 1/3 · Interest earns interest

**Maya:** My bank gives 10% a year. So ₹10,000 gives me ₹1,000 every year. Thirty years, ₹30,000 extra. Simple.

**Dev:** That's what you'd get if the bank only paid you on your original ₹10,000. But in year two, it pays you on ₹11,000. The ₹1,000 of interest starts earning too.

**Maya:** So the interest has babies.

**Dev:** And then the babies have babies. After thirty years it isn't ₹40,000. It's about ₹1.7 lakh.

**The real version:** With **compound interest**, each year's interest is added to the balance, and next year's interest is calculated on that bigger balance. Growth is a percentage of a growing number, so it curves upward instead of rising in a straight line.

| | Grows on | After 30 years at 10% |
|---|---|---|
| Simple interest | Only the original ₹10,000 | ₹40,000 |
| Compound interest | The whole balance, interest included | ≈ ₹1,74,000 |

\`\`\`cotsi-visual
${VISUAL}
\`\`\`
*Slide the rate and the years. Grey is simple interest, purple is compound. Watch where they split.*

**Where the analogy breaks:** real "babies" don't arrive on a schedule. Compounding only happens when interest is actually added to your balance, so money you withdraw stops compounding.

🧠 **Sticky line:** Simple interest adds. Compound interest multiplies.

🎯 **Your turn:** In year 2, on what amount does the bank calculate your interest?

\`\`\`cotsi-choices
{"questions":[{"text":"In year 2, the bank calculates interest on…","options":["₹10,000, the original amount","₹11,000, the original plus year 1's interest","₹1,000, just the interest","Not sure"]}]}
\`\`\`

\`\`\`cotsi-state
{"phase":"teaching","map":{"topic":"Compound interest","goal":"making smart money decisions","trunk":[{"title":"Interest earns interest","unlocks":"why savings and debt snowball"},{"title":"Time beats amount","unlocks":"the Rule of 72"},{"title":"The rate is a lever both ways","unlocks":"credit cards, EMIs and fees"}],"anchor":"Who has more at 60: ₹1 lakh at 22 or ₹2 lakh at 32?"},"progress":{"current":1,"done":[],"weak":[],"unchecked":[]},"cards":[{"q":"Simple vs compound interest in one line?","a":"Simple adds a fixed amount each year; compound multiplies the whole growing balance."}],"next_review_in_days":1}
\`\`\``;

const LESSON_NEXT = `✅ **Right.** ₹11,000. Year 1's interest is now part of the balance, so it earns too.

### 2/3 · Time beats amount

**Maya:** So the trick is to invest a lot.

**Dev:** The trick is to invest *early*. Quick test: at 8%, how long does it take money to double?

**Maya:** No idea. Twelve and a half years? 100 divided by 8?

**Dev:** That would be true for simple interest. With compounding, divide **72** by the rate. 72 ÷ 8 = **9 years**.

**The real version:** The **Rule of 72** says money doubles about every 72 ÷ rate years. At 8%, that's every 9 years. Over 36 years, that's four doublings: ×2, ×4, ×8, ×16. Each extra decade at the *end* adds more than the whole first decade did, which is why ten years of head start can beat twice the money.

🧠 **Sticky line:** Every doubling is bigger than the last, so the early years buy the late ones.

🎯 **Your turn:** In one line: at 12%, roughly how many years until ₹50,000 becomes ₹1 lakh? Show the sum.

\`\`\`cotsi-state
{"phase":"teaching","progress":{"current":2,"done":[1],"weak":[],"unchecked":[]},"cards":[{"q":"Rule of 72?","a":"Years to double ≈ 72 ÷ yearly rate (%). At 8%: about 9 years."}],"next_review_in_days":1}
\`\`\``;

const LESSON_LAST = `✅ **Yes.** 72 ÷ 12 = 6 years.

### 3/3 · The rate is a lever both ways

**Maya:** So compounding is always good news.

**Dev:** Only when you're the one earning the interest. A credit card at 3.5% a month is 42% a year before compounding, over 50% after, and unpaid interest compounds on *you*. At that rate, a ₹20,000 balance doubles in under two years.

**The real version:** Compounding doesn't care whose side it's on. A small difference in the rate becomes a big difference over time: on a 20-year loan, 9% instead of 8% costs far more than "1% extra" sounds.

🔓 **Unlock test (back to the anchor):** at 8%, money doubles about every 9 years. Asha's ₹1 lakh gets 38 years, a little over four doublings: about ₹18.6 lakh. Ravi's ₹2 lakh gets 28 years, a little over three: about ₹17.3 lakh. **Asha wins with half the money**, because ten extra years bought her one more doubling.

🧠 **Sticky line:** Compounding is a machine. Be the one who owns it, not the one feeding it.

**What you can now explain:** why interest snowballs, how to estimate doubling in your head, and why high-interest debt is an emergency.

🔁 **Review tomorrow:** two quick questions will lock this in.

\`\`\`cotsi-state
{"phase":"done","progress":{"current":3,"done":[1,2,3],"weak":[],"unchecked":[]},"cards":[{"q":"Why is high-interest debt dangerous?","a":"Unpaid interest compounds against you: 42% a year doubles a balance in under two years."}],"next_review_in_days":1}
\`\`\``;

const BOOK_FIRST = `📖 **Atomic Habits** by James Clear — the core in one line: *you don't rise to the level of your goals, you fall to the level of your systems.*

**The 3 ideas that carry the book:**
1. **Habits compound** — unlocks: why tiny changes matter
2. **Identity first** — unlocks: why habits stick or don't
3. **The four laws** — unlocks: designing any habit on purpose

### 1/3 · Habits compound

Getting 1% better every day for a year doesn't make you 365% better. It makes you about **37 times** better, because each day's improvement builds on the last. The same maths runs backwards: 1% worse a day leaves you with almost nothing.

The catch is the **plateau of latent potential**: for weeks, small habits show no visible result, so people quit right before the curve bends upward.

**What it means for you:** judge a habit by its direction, not by this week's result.

🧠 **Sticky line:** Habits are the compound interest of self-improvement.

🎯 **Your turn:** Why do most people quit a new habit around week three?

\`\`\`cotsi-choices
{"questions":[{"text":"Most people quit a new habit around week three because…","options":["The habit was too big","Results are still invisible, so it feels like it isn't working","They lack willpower","Not sure"]}]}
\`\`\`

\`\`\`cotsi-state
{"phase":"teaching","map":{"topic":"Atomic Habits","goal":"use the ideas","trunk":[{"title":"Habits compound","unlocks":"why tiny changes matter"},{"title":"Identity first","unlocks":"why habits stick"},{"title":"The four laws","unlocks":"designing any habit"}],"anchor":"Design one habit you'll actually keep."},"progress":{"current":1,"done":[],"weak":[],"unchecked":[]},"next_review_in_days":1}
\`\`\``;

const BOOK_NEXT = `✅ **Exactly.** The results are building, just not visibly yet.

### 2/3 · Identity first

Most people start with outcomes ("I want to run a marathon"). Clear argues the lasting change starts with identity ("I'm a runner"). Every time you do the habit, you cast a **vote** for the person you want to be.

**What it means for you:** pick the identity, then ask "what would that person do today?"

🧠 **Sticky line:** Every action is a vote for who you're becoming.

🎯 **Your turn:** Rewrite "I want to read more" as an identity statement, then name the smallest vote you could cast today.

\`\`\`cotsi-state
{"phase":"teaching","progress":{"current":2,"done":[1],"weak":[],"unchecked":[]},"next_review_in_days":1}
\`\`\``;

const MAP_REVIEW = `Quick review. Answer both in one message, and add how sure you are (1–5) for each.

1. At 9%, roughly how long does money take to double? Show the sum.
2. Why can someone who invests less, earlier, end up with more?

\`\`\`cotsi-state
{"phase":"teaching","next_review_in_days":3}
\`\`\``;

const PLAN_FIRST = `I've read your CV, so I'll skip what you already know: Excel reporting, Zendesk and running a team. Two quick checks so the syllabus starts at the right place:

\`\`\`cotsi-choices
{"questions":[{"text":"What does SELECT COUNT(*) FROM tickets WHERE status = 'open' return?","options":["Every open ticket","The number of open tickets","The first open ticket","Not sure"]},{"text":"Which chart best shows how ticket volume changed over 12 weeks?","options":["Pie chart","Line chart","Table","Not sure"]}]}
\`\`\`

\`\`\`cotsi-state
{"phase":"questions"}
\`\`\``;

const PLAN_ROADMAP = `Both right. You know more SQL than your CV says, so Milestone 1 starts at joins, not basics.

🎯 **Outcome:** in 12 weeks you can answer real support questions with data, show the answer in a dashboard, and explain it to a manager in two minutes.

🏆 **Capstone:** a public portfolio project: a support dashboard and a one-page findings memo built from a real (anonymised) ticket dataset.

🧱 **Your path** is below: six milestones at about 6 hours a week. ⚔️ marks a boss milestone where you build something real. Open **Milestone 1** to begin.

\`\`\`cotsi-state
{"phase":"done","roadmap":{"outcome":"Answer support questions with data and present the result","capstone":"A support dashboard and findings memo from a real ticket dataset","weeks":12,"milestones":[{"n":1,"title":"SQL joins and grouping on ticket data","hours":10,"done_means":["Query joins tickets to agents","Answer stated in one sentence"],"boss":false},{"n":2,"title":"Metrics that matter: FRT, CSAT, backlog","hours":8,"done_means":["Five metrics defined","Each computed in SQL"],"boss":false},{"n":3,"title":"Build a dashboard a manager can read","hours":14,"done_means":["Three charts","One insight per chart"],"boss":true},{"n":4,"title":"Measuring an AI support agent","hours":10,"done_means":["Test set of 30 questions","Pass rate and failure types reported"],"boss":false},{"n":5,"title":"Capstone: findings memo from real data","hours":16,"done_means":["Dashboard live","One-page memo with a recommendation"],"boss":true},{"n":6,"title":"Job-ready: portfolio, CV and interview practice","hours":10,"done_means":["Portfolio link","CV rewritten for the role","Two mock interviews done"],"boss":false}]}}
\`\`\``;

function milestoneText(n: number, done: boolean): string {
  if (done) {
    return `✅ **Checkpoint passed.** Your query runs and your one-line answer is clear. That's milestone ${n} done.

**Next:** open Milestone ${n + 1} from your path.

\`\`\`cotsi-state
{"phase":"teaching","milestone_done":${n}}
\`\`\``;
  }
  return `### Milestone ${n} · Sample milestone

**Why this matters for the job:** analysts spend most of their day joining tables and grouping results. This is the skill interviewers test first.

**Learn (about 40 minutes):**
1. **JOIN** connects two tables on a shared column, like matching each ticket to the agent who handled it.
2. **GROUP BY** turns rows into one row per group, so you can count tickets per agent or per week.

**Do it (the real test):** using the sample ticket data, write one query that shows **open tickets per agent per week**. Then write one sentence a manager would care about.

**Done means:** the query runs, and your sentence names a number and what to do about it.

Paste your query and your sentence here when you're ready, or type **hint**.

\`\`\`cotsi-state
{"phase":"teaching"}
\`\`\``;
}

const SCAN = (label: string) =>
  `- **SQL for support analytics** — more support postings now ask for SQL and dashboards ([Sample hiring report](https://example.com/hiring-report)), which points to demand over the next months.
- **AI agent evaluation** — companies launching AI support agents mention "quality measurement" in job ads. Signal medium.
- **Voice AI operations** — signal weak, one source only.

**Strongest signal:** ${label}: support teams are hiring for data skills.`;

const HUNT = `## Openings worth applying to

1. **[Support Operations Analyst — Sample Co](https://example.com/jobs/1)** · Bengaluru or remote · Posted 3 days ago
   Asks for SQL, a BI tool and support experience. **Fit: strong** — your team-lead background is listed as a plus.
2. **[Support Analytics Associate — Example Labs](https://example.com/jobs/2)** · Remote (India) · Posted 1 week ago
   Entry-level analytics role inside a support team. **Fit: good** — finish Milestone 3 first.
3. **[CX Data Analyst — Demo Health](https://example.com/jobs/3)** · Pune · Posted 2 weeks ago
   Wants healthcare experience. **Fit: stretch.**

## Do this today
Apply to the first opening. Lead your CV with the 40% response-time improvement and link your capstone dashboard.`;

const EDGE = `## The role in plain words
You turn support data into decisions: where the queue is slow, why customers write in, and whether the new AI agent actually helps.

## Your unfair advantages
- **You've run a support queue.** Most candidates come from pure analytics and have never seen a backlog spiral. You know which numbers are real and which are noise.
- **You already shipped a result:** 40% faster first response. That's a measurable outcome most applicants can't show.
- **You can explain numbers to non-analysts.** You've been doing it for your team for two years.

## Where you're behind, and the fix
- **SQL depth.** Milestones 1–2 close this.
- **A portfolio.** Your capstone becomes it.

## Your five-week plan
1. Week 1 — finish Milestone 1 and post one SQL insight on LinkedIn.
2. Week 2 — rewrite your CV headline around data, not support.
3. Week 3 — publish the capstone dashboard.
4. Week 4 — apply to five roles, each with a two-line note on their support metrics.
5. Week 5 — two mock interviews, focused on "tell me about a time data changed a decision".

## Do this today
Write down three questions your current team can't answer with data. They're your first portfolio ideas.`;

function firstUserText(opts: RunOpts): string {
  const first = opts.messages.find((m) => m.role === "user");
  if (!first) return "";
  if (typeof first.content === "string") return first.content;
  if (Array.isArray(first.content)) {
    return first.content.map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : "")).join(" ");
  }
  return "";
}

function pick(opts: RunOpts): { text: string; sources?: { url: string; title: string }[]; searches?: number } {
  const key = opts.mock ?? "";
  if (key === "profile") return { text: JSON.stringify(PROFILE) };
  if (key === "recommend") return { text: JSON.stringify(RECS) };
  if (key.startsWith("scan:")) {
    return { text: SCAN(key.slice(5)), sources: [{ url: "https://example.com/hiring-report", title: "Sample hiring report" }], searches: 2 };
  }
  if (key === "research:hunt") {
    return {
      text: HUNT,
      sources: [
        { url: "https://example.com/jobs/1", title: "Sample Co careers" },
        { url: "https://example.com/jobs/2", title: "Example Labs careers" },
        { url: "https://example.com/jobs/3", title: "Demo Health careers" },
      ],
      searches: 3,
    };
  }
  if (key === "research:edge") return { text: EDGE, searches: 3 };
  const [, mode, turn] = key.split(":");
  const n = Number(turn);
  if (mode === "plan") return { text: n <= 1 ? PLAN_FIRST : PLAN_ROADMAP };
  if (mode === "milestone") {
    const m = Number(firstUserText(opts).match(/milestone (\d+)/i)?.[1] ?? 1);
    return { text: milestoneText(m, n > 1) };
  }
  if (mode === "review") return { text: MAP_REVIEW };
  if (mode === "book") return { text: n <= 1 ? BOOK_FIRST : BOOK_NEXT };
  return { text: n <= 1 ? LESSON_FIRST : n === 2 ? LESSON_NEXT : LESSON_LAST };
}

/** delayMs paces the streamed text; searchMs pretends each web search takes a moment. */
export function makeMockClaude(delayMs = 4, searchMs = 0): ClaudeRunner {
  return async function run(opts: RunOpts): Promise<RunResult> {
    const reply = pick(opts);
    if (opts.webSearch) {
      opts.onStatus?.("Searching the web…");
      if (searchMs) await new Promise((r) => setTimeout(r, searchMs));
      opts.onStatus?.("Searching: sample query");
      if (searchMs) await new Promise((r) => setTimeout(r, searchMs));
    }
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
