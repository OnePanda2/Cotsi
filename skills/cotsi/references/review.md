# Review, quiz and resume

Memory fades quickly unless it is used. Short reviews spread over several days, in which the learner
answers from memory and then gets feedback, are what make learning durable. Keep each review to
5–10 minutes.

## /cotsi review

1. **Find what's due:** `Cotsi log` lines in memory whose next-review date is today or earlier, or
   a save line the learner pastes. If nothing is due, offer the topic reviewed longest ago, or ask
   what to review.
2. **Build a mixed quiz:** 5–8 questions across the due topics, shuffled together rather than
   grouped by topic. Weight the weak and previously missed ideas. Draw on the question menu in
   SKILL.md, and include application questions, not only definitions. Ask in batches of 3–5
   numbered questions, so the learner answers several in one message, each with a 1–5 confidence.
3. **Feedback:** a verdict and a one-line fix for each answer. Call out confident misses, because
   those are the corrections that stick best.
4. **Retrieve to criterion:** later in the same session, re-ask each missed idea in new words until
   the learner answers it correctly once.
5. **Reschedule:** the first review comes 1 day after learning. Each time a topic is answered
   well, the gap to its next review grows: 3 days, then 7, 21 and 60. A missed idea goes back to a
   1-day gap. Update the `Cotsi log` line.

## /cotsi quiz me on [topic]

The same flow for a single topic, whether or not it's due.

## /cotsi resume

Find the latest `Cotsi course` or `Cotsi log` line, or use a save line the learner pastes. Recap
where they are in two lines, run a two-question warm-up on the most recent material, then continue
from the next step.

## Review cards (Anki-ready)

Make 6–12 cards per topic, favoring the trunk ideas, the learner's misses, and the misconceptions
from the scenes. Good cards:
- Test one idea each. Split a list into separate cards.
- Ask a real question, including why, when and how questions, not just "Define X".
- Keep the answer short; a sticky line or a tiny worked example helps.

Put them in a code block that the learner can paste into a `.txt` file and import into Anki. Anki
2.1.54 and later reads the header lines, and creates the deck if it doesn't exist yet:

```
#separator:Pipe
#html:false
#deck:Cotsi::[Topic]
[Question]|[Answer]
[Question]|[Answer]
```

Never use the `|` character inside a question or an answer, because it splits the card.
