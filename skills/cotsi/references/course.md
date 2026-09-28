# Course mode

A course answers "what will the learner be able to *do*?", not "what will they have read?". It is
built backward from a real outcome, organized into milestones that each end in doing, and it keeps
going across many conversations.

## Contents
1. Assessment (one batch)
2. The Roadmap (then start Milestone 1)
3. Milestone delivery and checkpoints
4. Boss Battles, skipping and saving
5. Capstone close-out

## 1. Assessment (one batch)

Ask everything in a single tappable batch: use `ask_user_input_v0` or an equivalent tool where
available, and lettered options otherwise. Skip any question the learner has already answered in
their request. Ask at most six questions:
- **Goal:** A) Get a job or change careers B) Start or grow a business C) Build a specific product
  D) Improve at my current role E) Academic mastery F) Personal interest
- **Time per week:** A) About 2 hours B) About 5 C) About 10 D) 20 or more
- **Deadline:** A) None B) About a month C) About three months D) A specific date (they'll say)
- **Experience:** A) None B) I know the basics C) I've built small things D) I use it professionally
- **Two diagnostic questions** that test real knowledge. Show a tiny snippet, scenario or problem,
  and ask what happens, with lettered answers built from common mistakes. Self-ratings are
  unreliable, so when a diagnostic contradicts the self-rating, trust the diagnostic.

Two learners at the same level with different goals need different courses. Someone learning AI
agents to get hired needs a portfolio-and-interview path; someone automating their own business
needs a build-fast, ship-it path. Treat the goal answer as load-bearing.

## 2. The Roadmap (then start Milestone 1 in the same reply)

- 🎯 **Outcome:** what the learner will be able to *do*, derived from the topic and the goal.
- 🏆 **Capstone:** the tangible proof, such as a deployed app, a launched campaign, a finished
  model, or a portfolio.
- 🗺️ **Leverage Map** (from SKILL.md), built for the goal: the trunk skills that drive most of the
  outcome, and what to skip.
- ⚡ **Success Accelerators:** the 3–5 actions that drive most of the result for this goal. This is
  the 20% of the doing.
- 🧗 **Obstacles and plans:** 2–3 obstacles this learner is likely to hit (time, motivation, a
  known hard concept), each with an if-then plan: "If [obstacle], then I will [action]." Naming the
  obstacle and planning for it works better than positive thinking alone.
- 🛰️ **Opportunity Radar** (optional): 3–5 concrete opportunities, such as portfolio ideas, roles
  or communities. Use web search when it's available; otherwise label them as general directions.
  Never invent specific companies, openings or statistics.
- 🧱 **Milestones:** name each one as a capability or an artifact, never a topic ("Connect to a
  real API and fetch live data", not "Introduction to APIs"). Every milestone ends in doing: a
  project, a document, a prototype, a model, a workflow, a deployment, or a real-world action. Size
  them to the weekly time and give each an hour estimate, so a 2-hours-a-week learner gets smaller
  milestones than a 20-hours-a-week learner. Mark the ⚔️ Boss Battles.
- 📅 **Schedule:** for example, "At 5 hours a week, expect Milestone 1 in about 2 weeks."

## 3. Milestone delivery and checkpoints

- Open every milestone after the first with a warm-up of 2–3 questions on earlier milestones. That
  gives spaced, mixed retrieval for free.
- Teach only what this milestone needs and the learner doesn't already know, taking each trunk
  idea through the Cotsi loop. Skip whatever the assessment showed they know.
- Then give the **action task**, and state its **checkpoint** up front: "Done means: [2–4 concrete
  criteria]."
- The learner submits evidence: code, output, a document, answers, or a photo. Check it against
  the criteria. If a criterion isn't met, give a targeted fix and ask for a retry rather than moving
  on from a shaky foundation. If the learner chooses to move on anyway, note the gap and what depends
  on it.

## 4. Boss Battles, skipping and saving

- **⚔️ Boss Battles** come around the midpoint and just before the capstone: one challenge that
  combines several milestones, with no step-by-step solution. Give hints only on request.
- **Skipping a milestone:** act like a mentor managing trade-offs, not a teacher enforcing a
  syllabus. Say whether skipping is safe, which later milestones depend on it, and whether a
  condensed version would keep the dependency while saving time. Then let the learner decide.
- **Saving:** at the end of every milestone, update the memory line
  `Cotsi course: [topic] | goal: … | milestone k/N | next: … | updated [date]` and print a
  💾 save line. `/cotsi resume` picks it up in any conversation.
- Keep the pacing to one step at a time. Don't pack several milestones into one reply.

## 5. Capstone close-out

The course ends with the capstone done, or with the learner fully equipped to finish it. Close with
a short reflection (what they can do now that they couldn't before), review cards for the key
ideas, the review schedule, and the next frontier to explore.
