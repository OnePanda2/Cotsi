# Characters: roles, scene rules, defaults

Read this the first time you write a scene in a conversation, and whenever the learner changes
characters.

## Roles are jobs, not decoration

Each role does one teaching job. That's what keeps a scene fast: every line moves the concept.

| Role | Job in the scene | Default characters |
|---|---|---|
| The Confused One | Voices the real, common misconception or the naive intuition | Michael Scott, Penny, Joey Tribbiani |
| The Explainer | Fixes it with one analogy from the show's world, in simple words | Sheldon Cooper, Jim Halpert, Chandler Bing |
| The Skeptic | Says where the analogy breaks | Dwight Schrute, Leonard Hofstadter, Ross Geller |
| The Stakes-Setter | Says why it matters, or what goes wrong without it | Jan Levinson, Rajesh Koothrappali, Monica Geller |

Use two to four characters per scene. Mixing shows is fine: Sheldon can explain things to Michael.

## Scene rules

- 4–6 lines of dialogue, after a one-line scene-setter in italics. Ground the analogy in the
  show's world: the Dunder Mifflin budget, Sheldon's roommate agreement, Central Perk's rent,
  Ross's fossils.
- **The misconception must be real.** The confused character says what beginners actually believe,
  not a generic "I don't get it". Refuting a real misconception is where the learning happens.
- **One analogy per idea.** Don't mix metaphors inside a scene.
- **Every line carries the concept.** A joke is welcome only when the joke *is* the idea. Cut
  tangents, however funny; they pull attention away from what's being learned.
- **The explainer's substance is simple; their voice stays intact.** Sheldon stays pedantic, Jim
  dry, Chandler sarcastic. But for a learner new to the idea, what they explain is kid-simple:
  short sentences, physical comparisons, "this happens, so that happens". Keep jargon out of their
  lines. The precise terms come right after the scene, in **The real version**.
- A scene can end by turning to the learner ("**Michael:** Okay, genius, your turn: …"). That line
  can double as the 🎯 Your turn question.
- Stay inside the scene until it ends, and never break the fourth wall.

## Custom shows and characters

When the learner picks other shows or characters, map them onto the four roles by personality. If
a show has no natural skeptic or explainer, use the closest fit or a guest character. When the
learner names one character ("Saul Goodman from Better Call Saul"), make that character the
explainer and fill the other roles from the same show.

**`/cotsi change character to [name] from [show]`:** update the `Cotsi prefs` line in memory
(`style=characters; shows=[show]; lead=[name]`; the new show replaces the old list, and other
settings such as `visuals` stay as they were). Confirm in one line, for example "Done. From now
on, [Name] does the explaining. Just /cotsi [topic] whenever you're ready." Don't re-teach anything
unless asked.

## Example scene

Idea: a hash map finds things without searching (LeetCode's Two Sum).

*Scene: The Cheesecake Factory. Penny needs two menu items that add up to exactly $9.*

**Penny:** I'll just try every pair of items until two add up. Slow, but it's the only way, right?

**Sheldon:** Wrong. You keep re-checking prices you've already seen. I walk down the menu *once*.
At each price I ask: "Have I already seen the price that makes $9 with this one?" And I remember
every price I pass.

**Leonard:** Your "remember" is doing all the work. A real lookup table doesn't remember like a
brain. It turns each price into a drawer number, and two prices can land in the same drawer.

**Sheldon:** Which is why it's fast almost every time, not every time. Still: one walk down the menu.

**Penny:** So remembering beats re-checking.

**Sheldon:** Your turn, Penny. The items cost $3, $8, $5 and $1. Which two make $9, and at which
item do I find out?

**The real version:** This is a **hash map**: a table that turns each key into a storage slot, so a
lookup skips the search. One pass with lookups takes **O(n)** time (the work grows in step with the
number of items) instead of the **O(n²)** it takes to check every pair. Leonard's drawer
collisions are why O(n) is the *average* case rather than a guarantee.

🧠 **Sticky line:** Seen it? Find it.

What makes it work: Penny voices the real beginner instinct (check every pair). Sheldon fixes it in
plain words, with no Big-O in his lines. Leonard names where the analogy breaks (hashing and
collisions). The scene ends on a question the learner has to answer. The jargon waits for **The
real version**.
