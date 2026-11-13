# Putting the Cotsi website live

The website has two parts:

- **The pages** people see, hosted free on GitHub Pages at `cotsi.siddheshthapa.com`.
- **The API** that talks to Claude and stores progress, hosted free on Supabase. It exists
  because the Claude API key must stay secret, and GitHub Pages can't keep secrets.

Both deploy automatically from this repo every time `main` changes. You do the steps below once.
They take about 30 minutes. Do them in order.

## 1. Claude API key (pays for the AI)

1. Go to the Claude Console (console.anthropic.com) and create an account.
2. Add credits under **Billing**. $25 is enough to launch.
3. Set a **monthly spend limit** there too. Cotsi has its own daily cap ($10), and this is the
   backstop if anything goes wrong.
4. Create an API key under **API keys** and copy it. You paste it in step 2.4, nowhere else.
   Never put it in this repo or in a chat.

New accounts start with low rate limits. If many people arrive at once, some will see "Cotsi is
very busy". The limits rise automatically as the account ages and spends.

## 2. Supabase project (sign-in, storage, the API)

1. Go to supabase.com, create a free account, then **New project**. Pick the region closest to
   your audience (Mumbai for India). Save the database password somewhere safe.
2. Open **SQL Editor**, paste everything from `supabase/migrations/0001_cotsi.sql`, press **Run**.
3. Find two values and keep them for step 4:
   - **Project ID** (Project Settings → General). It looks like `abcdxyzabcdxyzabcd`.
   - **Publishable key** (Project Settings → API keys). It's also called the "anon" key. It is
     safe to publish.
4. Open **Edge Functions → Secrets** and add a secret named `ANTHROPIC_API_KEY` with the key
   from step 1.4.
5. Click your avatar → **Account → Access Tokens → Generate new token**. Copy it for step 4.

## 3. Google sign-in

1. Go to console.cloud.google.com and create a project called Cotsi.
2. **APIs & Services → OAuth consent screen**: choose External, app name `Cotsi`, your email as
   the contact. Then press **Publish app** so anyone can sign in, not only test users.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://cotsi.siddheshthapa.com`
   - Authorized redirect URIs: `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`
   Copy the **Client ID** and **Client secret**.
4. In Supabase: **Authentication → Sign In / Providers → Google**. Turn it on and paste the
   Client ID and Client secret.
5. In Supabase: **Authentication → URL Configuration**:
   - Site URL: `https://cotsi.siddheshthapa.com`
   - Redirect URLs: add `https://cotsi.siddheshthapa.com/**`

Google's sign-in screen will say "continue to YOUR_PROJECT_ID.supabase.co". That is normal on the
free plan.

## 4. GitHub

1. In this repo: **Settings → Secrets and variables → Actions**.
   - Under **Secrets**, add `SUPABASE_ACCESS_TOKEN` (from step 2.5).
   - Under **Variables**, add `SUPABASE_PROJECT_REF` (the Project ID) and `SUPABASE_ANON_KEY`
     (the publishable key).
2. **Settings → Pages**: set Source to **GitHub Actions**. Set Custom domain to
   `cotsi.siddheshthapa.com` and tick **Enforce HTTPS** once it's offered.
3. At your domain provider, add a DNS record: type `CNAME`, name `cotsi`, value
   `onepanda2.github.io`.
4. Get the code onto `main`. The **Actions** tab shows "Test and deploy" running. When it's
   green, the site is live.

## 5. Check it works

1. Open `https://YOUR_PROJECT_ID.supabase.co/functions/v1/api/health`. It should show `{"ok":true}`.
2. Open `https://cotsi.siddheshthapa.com`, sign in with Google, and start a topic.
3. Upload a CV under "Get job-ready" and go through to the syllabus.
4. In the Claude Console, look at **Usage** to see what those steps cost.

If sign-in bounces back to the first page, recheck step 3.5. If lessons fail with "AI connection
isn't set up correctly", recheck step 2.4.

## Settings you can change later

Add any of these under Supabase **Edge Functions → Secrets**. They take effect right away.

| Name | Default | What it does |
|---|---|---|
| `COTSI_DAILY_BUDGET_USD` | `10` | Total AI spend per day for the whole site. When it's used up, learners see a friendly "full for today" note. |
| `COTSI_USER_DAILY_USD` | `1.5` | AI spend per person per day. |
| `COTSI_JOB_ANALYSES_PER_DAY` | `1` | CV analyses per person per day. |
| `COTSI_MODEL_LESSON` | `claude-sonnet-5-5` | Model for lessons, milestones and reviews. |
| `COTSI_MODEL_PLAN` | `claude-sonnet-5-5` | Model that builds the syllabus. `claude-opus-5-5` is sharper and costs about twice as much. |
| `COTSI_MODEL_RESEARCH` | `claude-sonnet-5-5` | Model for CV reading, market scans, job search and "your edge". `claude-opus-5-5` is sharper and costs about twice as much. |
| `COTSI_ALLOWED_ORIGINS` | `https://cotsi.siddheshthapa.com` | Websites allowed to call the API (comma-separated). |

## Running it on your own computer

No accounts or keys needed: the test server gives canned AI replies.

```
deno run -A --config supabase/functions/api/deno.json dev/server.ts      # the API, port 8787
cd web && npm install
VITE_DEV_AUTH=1 VITE_API_URL=http://localhost:8787/api npm run dev       # the pages
```

Tests: `deno test -A --config supabase/functions/api/deno.json tests/api_test.ts`

After editing anything in `skills/cotsi/`, run `node scripts/gen-prompts.mjs` so the website
teaches from the new version.
