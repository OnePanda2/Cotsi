# Changelog

## 6.1 — 2026-11-02

Clarifications from the first round of independent tests (v6.0 scored 96% vs v5.2's 41% on 14
test prompts; the test runners flagged where the instructions were ambiguous).

- The goal question is asked only when the vital 20% would change by goal; otherwise Cotsi assumes
  the common goal and names it. Quick and Sprint never stop to ask.
- Memory lines are saved silently and never shown in the lesson.
- Books stay plain even with a characters preference, unless scenes are asked for in a book lesson.
- Fiction: the brief stays to the premise, a three-way spoiler question comes first, and fiction
  gets an anchor question and a theme-to-today Unlock Test.
- The word budget applies to the idea; the first reply may run about 150 words longer for the map.
- Quick mode: at most about 700 words, no scenes, and under 45 minutes means quick, not Sprint.
- LeetCode: the first reply stops at rung 1 and offers `hint` or `solution`; a full solution ends
  with one check question; LeetCode problems use the same log line as other topics.
- Course: an implied goal is stated rather than asked; the memory line is written at the roadmap.
- Review: gaps count from the review day, even for overdue topics.
- Changing character replaces the show list and keeps other settings.
- Money, health and legal topics get a one-line "education, not advice" note.

## 6.0 — 2026-09-28

A rewrite around one goal: learn anything in the least time, and keep it. It merges `cotsi` 5.2,
`cotsi-books` 1.0 and `cotsi-no-characters` 1.0 into a single skill.

### Added
- **Leverage Map (Pareto first):** every topic starts by finding the 3–7 trunk ideas that unlock
  the rest, scored on fan-out, frequency, threshold and goal fit, plus what they unlock, what to
  ignore, an expert lens and an anchor problem.
- **The Cotsi loop:** hook, then a scene (or plain explanation) that voices the real misconception
  and says where the analogy breaks, then the precise version, a sticky line, 🎯 Your turn, and
  🔮 a guess about the next idea. One idea per reply at standard depth.
- **Mastery gate and feedback rules:** re-teach from a new angle after a miss, flag confident
  misses, compress what the learner already knows.
- **Unlock Test:** questions from the untaught 80%, solved with the trunk.
- **Sprint mode** for "tonight" or a deadline: a time-boxed plan with sleep and next-morning review.
- **Review mode:** `/cotsi review`, `/cotsi quiz me on`, `/cotsi resume`; mixed quizzes,
  retrieval to criterion, 1-3-7-21-60 day intervals, and Anki-ready cards (`#separator:Pipe`).
- **Depth levels:** `quick`, `standard`, `deep`; the 8-part Feynman breakdown moves to `deep`.
- **The genius toolkit:** Musk's semantic tree, Munger's latticework and inversion, Feynman's
  explain-back and favorite problems, Franklin's rebuild-and-compare, Einstein's thought
  experiments, da Vinci's sketching, Pólya's problem-solving steps, Waitzkin's smaller circles.
- **LeetCode hint ladder** (pattern, insight, plan, then the solution), Pattern Triggers, and
  Practice Next (one same-pattern problem, one look-alike).
- **Course mode:** diagnostic questions instead of self-ratings only, obstacles with if-then plans,
  checkpoints with "done means" criteria, save and resume across conversations.
- **Book mode:** a confidence check (no invented quotes), a fiction template with a spoiler check,
  "Try this today" plans, and a "Does it hold up?" evidence note.
- **Accuracy rules** (web search and code checks when available), a visual fallback for surfaces
  without inline visuals, evals, a learning log, `build.py`, and this changelog.

### Changed
- Split into `SKILL.md` (under 300 lines) plus reference files loaded only when needed. v5.2
  loaded 783 lines on every request.
- The style (sitcom characters or plain) is a saved preference. Books default to plain.
- Character roles now each do a teaching job: the confused one voices the misconception, the
  explainer fixes it, the skeptic says where the analogy breaks, the stakes-setter says why it
  matters.
- ELI8 is now "simple first, then precise": kid-simple for a new idea, skipped once the learner
  shows they know the basics.
- Memory hacks are now one sticky line per idea; true mnemonics only for lists, orders and names.
- Visuals only when an idea has structure, a process or quantities; at most one per reply.
- "teach me X" now starts a lesson, not a course.
- Course assessment is one batch of at most six questions, and the roadmap starts Milestone 1 in
  the same reply.

### Removed
- The mandatory five-layer stack per chapter (scene, memory hack, animated visual, 8-part Feynman,
  analogy engine) and "2–3 chapters per reply".
- The Course Mode ban on pitfalls and risk framing, replaced by obstacles with if-then plans.
- The bundled third-party `leetcode-agents.md`; its standards are rewritten in
  `references/leetcode.md`.
- The hardcoded learner name.

### Fixed
- The ELI8 rule banned Big-O in the explainer's lines, but the Two Sum example had Sheldon saying
  "O(n²)". The new example keeps jargon in The real version.
- "One core analogy per chapter" contradicted three analogy slots per chapter.
- The LeetCode template kept an Algorithm section it said it replaced.
- The brute-force panel assumed "all pairs" for every problem.
- The folder inside the package is now `cotsi/`, matching the skill name.

## Earlier versions

Reconstructed from the `.skill` files in this repo; dates are the file dates inside each package.

- **cotsi-books 1.0 and cotsi-no-characters 1.0** (2026-06-30): character-free forks for books and
  for topics and courses. Merged into 6.0.
- **5.2** (2026-06-21): the ELI8 rule for the explainer's lines.
- **5.0** (2026-06-18): weekly time budget, Success Accelerators, Opportunity Radar, Boss Battles,
  the anti-tutorial-hell rule, milestone dependency awareness, and the Analogy & Example Engine.
- **4.5** (2026-06-18): Course Mode as a goal-achievement pipeline (outcome, capstone, gap analysis,
  milestones, checkpoints).
- **4.2** (2026-06-16): an adaptive course assessment with closed-ended questions.
- **3.2** (2026-06-04): the 8-part Feynman breakdown after every scene.
- **1.3** (2026-05-20): animated HTML visuals per chapter, and LeetCode mode.
- **1.0** (2026-05-15): sitcom-character explanations, memory hacks, pacing, and the wrap-up.
