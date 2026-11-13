# Launch checklist

Everything except the Claude API key is set up. Until the key is added, people can sign in and
see a "Cotsi is getting ready for launch" note; lessons and CV analysis wait.

## When the key is ready (5 minutes)

1. **Add the key.** Supabase → Edge Functions → Secrets → add `ANTHROPIC_API_KEY`. It works
   right away; nothing needs redeploying.
2. **Check the API sees it.** Open
   `https://jytrpyoghkpcwbhvlgzh.supabase.co/functions/v1/api/health`.
   It should say `"ai":true`. If it says `false`, the secret name is misspelled.
3. **Refresh the site** (`cotsi.siddheshthapa.com`). The "getting ready" note is gone.
4. **One topic lesson.** Learn a topic → type anything → answer the first question.
   You should see the map, a scene, and buttons to tap.
5. **One book.** Understand a book → any book → it starts.
6. **Your own CV.** Get job-ready → upload your CV → wait for the four scans (about 1–2
   minutes) → three roles → pick one → answer the two questions → you get your milestones.
7. **Look at the cost.** Claude Console → Usage. Send the number to Claude so the daily
   limits can be set from real data.

If something fails, take a screenshot of the message and the step number.

| You see | What it means | Fix |
|---|---|---|
| "Cotsi's AI connection isn't set up correctly" | The key is wrong or has no credit | Recheck the key in Supabase; add credit in the Console |
| "Cotsi is very busy right now" | The Anthropic account's rate limit was hit | Wait a minute. New accounts start with low limits that rise as you buy credit; the Console's Limits page shows your tier |
| "Cotsi is at capacity for today" | The $10 daily site budget is used up | Raise `COTSI_DAILY_BUDGET_USD` in Supabase secrets |
| "You've reached today's learning limit" | One person used $1.50 today | Raise `COTSI_USER_DAILY_USD` if it happens too early |
| Sign-in returns to the first page | Google or Supabase redirect settings | SETUP.md step 3.5 |

## Launch day (16 November)

- **The early-access page switches by itself** at midnight India time
  (`2026-11-16T00:00+05:30`): its buttons change to "Open Cotsi" and link to the site. To move
  that time, change `launch_at` for Cotsi in the early-access repo's `projects.json`.
- **Watch the Usage page** in the Claude Console in the first hours. The site stops new AI
  replies when the daily budget is reached and resets at 05:30 India time (midnight UTC).
- **Change the "getting ready" text** (only shown while there's no key) with the Supabase secret
  `COTSI_NOT_READY_MESSAGE`.

## What a day costs (estimates until measured)

| Action | Cost |
|---|---|
| One lesson message | $0.02–0.04 |
| A full topic or book lesson | $0.30–0.60 |
| A CV analysis (reading, 4 web scans, ranking) | $0.50–0.90 |
| Find jobs / Your edge (each) | $0.20–0.40 |

At $10 a day that's roughly 11–20 CV analyses, or 20–30 full lessons, or a mix.
