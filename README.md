# Cotsi — Complex to Simple

A Claude skill that teaches you any topic, book or LeetCode problem in as little time as possible.
Cotsi finds the vital 20% of ideas that unlock the other 80%, teaches those first (with sitcom
scenes, or in plain style), makes you use each idea right away, and brings it back over the next
few days so it sticks.

The current version is **6.1**: `cotsi 6.1.skill`. The source lives in `skills/cotsi/`.

## How a lesson goes

1. **🗺️ Leverage Map.** Cotsi picks the 3–7 "trunk" ideas that most of the field depends on,
   shows what each one unlocks, what you can safely ignore, how experts think about the field, and
   an anchor problem you'll crack by the end.
2. **One trunk idea at a time.** Each gets a hook, a short scene in which a character voices the
   common misconception and another fixes it (plus where the analogy breaks), the precise version,
   and a sticky line.
3. **🎯 Your turn.** Every idea ends with a quick question: explain it back, apply it, spot it,
   rebuild it. Type `skip` whenever you want. Getting it wrong is fine: you get a new angle and
   another shot.
4. **🔓 Unlock Test.** Questions from the 80% you were never taught, solved with the trunk. This
   is the "the rest is a piece of cake" moment.
5. **Wrap-up.** You explain the whole topic in a few sentences, then get the Full Picture,
   Anki-ready review cards, and a review schedule: tomorrow, then at growing gaps (`/cotsi review`).

## Install (claude.ai)

1. Download `cotsi 6.1.skill` from this repo.
2. Upload it in Claude's Skills settings, the same place you uploaded earlier versions, replacing
   the old `cotsi`.
3. Turn off `cotsi-books`, `cotsi-no-characters` and `leetcode-helper`. Version 6.1 includes all
   three, and leaving them on makes them compete for the same requests.

## Commands

| Type | What happens |
|---|---|
| `/cotsi [topic]` | Learn it: the map, then the trunk ideas one at a time |
| `/cotsi [topic] tonight` (or `in 2 hours`, `exam tomorrow`) | A time-boxed sprint with a sleep-aware review plan |
| `/cotsi quick [topic]` / `/cotsi deep [topic]` | A one-reply overview, or the deep dive |
| `/cotsi [book title]` | Book mode: the book's thesis and core ideas (fiction gets its own treatment) |
| Paste a LeetCode problem | Hints first (pattern, insight, plan), full solution when you ask |
| `/cotsi course [topic]` | A multi-week, goal-driven course with milestones and checkpoints |
| `/cotsi review` / `/cotsi quiz me on [topic]` / `/cotsi resume` | Spaced review, a quiz, or picking up where you left off |
| `/cotsi plain [topic]` / `/cotsi style plain` | No characters, this once or from now on |
| `/cotsi change character to [name] from [show]` | Swap the cast |

In a lesson you can type `skip`, `simpler`, `deeper`, `hint`, `solution`, `map` or `visuals off`
at any time.

## Repository layout

```
skills/cotsi/            source of the current version
  SKILL.md               router, Leverage Map, the Cotsi loop, sprint, depth
  references/            loaded only when needed: books, leetcode, course, review,
                         characters, visuals, deep-dive
  evals/                 test prompts and a personal learning log (not packaged)
build.py                 validates skills/cotsi and builds "cotsi <version>.skill"
cotsi 6.1.skill          the file to upload
cotsi*.skill (older)     earlier versions and the merged forks, kept for history
CHANGELOG.md             what changed in each version
```

## Building a new version

1. Edit `skills/cotsi/` and bump `metadata.version` in `SKILL.md`.
2. Run `python3 build.py` (it needs PyYAML: `pip install pyyaml`). It checks the limits (a
   description of at most 1,024 characters, the name, every referenced file, the body length) and
   writes `cotsi <version>.skill`.
3. Add a CHANGELOG entry.

## Is it working?

- **Behavior:** `skills/cotsi/evals/evals.json` has 14 realistic prompts, each with a checklist
  of what a good response does. Run them after every change.
- **Learning:** `skills/cotsi/evals/learning-log.md` tracks your own day-1 and day-7 quiz scores
  per topic. Retention at day 7 is the number that matters.

## The science behind 6.1

- Experts organize knowledge around core concepts: [How People Learn (National Research Council, 2000)](https://nap.nationalacademies.org/catalog/9853/how-people-learn-brain-mind-experience-and-school-expanded-edition); threshold concepts ([Meyer & Land](https://link.springer.com/article/10.1007/s10734-004-6779-5))
- Practice testing and spaced practice are the two "high utility" techniques: [Dunlosky et al. 2013](https://journals.sagepub.com/doi/abs/10.1177/1529100612453266)
- Feeling of learning ≠ learning: [Deslauriers et al. 2019](https://www.pnas.org/doi/pdf/10.1073/pnas.1821936116)
- AI help without guardrails can harm learning: [Bastani et al. 2025](https://www.pnas.org/doi/10.1073/pnas.2422633122); a tutor built on learning science doubled gains: [Kestin et al. 2025](https://www.nature.com/articles/s41598-025-97652-6)
- Dialogue that voices misconceptions beats a clean lecture: [Muller et al. 2008](https://onlinelibrary.wiley.com/doi/10.1111/j.1365-2729.2007.00248.x)
- Trying before being taught helps: [Richland, Kornell & Kao 2009](https://pubmed.ncbi.nlm.nih.gov/19751074/)
- Concrete first, then abstract: [Fyfe et al. 2014](https://link.springer.com/article/10.1007/s10648-014-9249-3); say where the analogy breaks: [Glynn's teaching-with-analogies model](http://www.csun.edu/science/books/sourcebook/chapters/10-analogies/teaching-analogies.html)
- Comparing cases improves transfer: [Gentner, Loewenstein & Thompson 2003](https://eric.ed.gov/?id=EJ671102); confident errors get corrected best: [Butterfield & Metcalfe 2001](https://www.researchgate.net/publication/11641193_Errors_Committed_with_High_Confidence_Are_Hypercorrected)
- Retrieve to criterion across spaced sessions: [Rawson & Dunlosky 2022](https://journals.sagepub.com/doi/10.1177/09637214221100484)
- Sleep consolidates memory: [Diekelmann & Born 2010](https://www.nature.com/articles/nrn2762); one night without sleep cuts new memory formation by about 40%: [Yoo et al. 2007](https://www.semanticscholar.org/paper/A-deficit-in-the-ability-to-form-new-human-memories-Yoo-Hu/9b84dc5d19b915b478909201a3c6e40986d5dbc0)
- Drawing boosts memory: [Fernandes, Wammes & Meade 2018](https://journals.sagepub.com/doi/abs/10.1177/0963721418755385)
- Irrelevant "interesting" details hurt learning: [Rey 2012](https://eric.ed.gov/?id=EJ986386); guidance that helps novices can hurt experts: [Kalyuga et al. 2003](https://www.tandfonline.com/doi/abs/10.1207/S15326985EP3801_4)
- If-then plans beat positive thinking alone: [Oettingen & Gollwitzer 2019](https://bpb-us-e1.wpmucdn.com/wp.nyu.edu/dist/c/6235/files/2020/05/Oettingen-Gollwitzer-2019-From-feeling-good-to-doing-good.pdf)
- Genius methods: Munger's [latticework of models](https://speakola.com/corp/charli-munger-widom-business-usc-1994), Feynman's dozen favorite problems via [Rota](https://www.ams.org/notices/199701/comm-rota.pdf), Franklin's rebuild-and-compare in his [Autobiography](https://www.gutenberg.org/files/36151/36151-h/36151-h.htm), Musk's [semantic tree](https://fs.blog/2015/01/elon-musk-knowledge/)
- Skill structure: [Anthropic's skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
