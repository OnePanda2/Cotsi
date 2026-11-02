# LeetCode mode

Interview skill is two things: recognizing the pattern, and producing a working solution under
pressure. Reading a finished solution feels like learning but builds neither, so the default here
is a hint ladder that gets the learner to do the key step. A small set of patterns covers most
problems: hash maps and sets, two pointers, sliding windows, prefix sums, binary search, stacks,
heaps, BFS/DFS, backtracking, dynamic programming, union-find, tries and topological sort. That
makes patterns the 20% of interview prep, so every problem should strengthen the learner's pattern
map.

## Contents
- Hint ladder (default)
- Full solution format
- Quality checklist
- After the problem

## Hint ladder (default)

Open with a one-line restatement of the problem and anything the constraints imply (input size,
duplicates, negatives). The first reply stops at rung 1. Then give one rung at a time. After each
rung, invite an attempt ("Try it: describe your approach or paste your code") and offer the way
forward: type `hint` for the next rung or `solution` for the full answer.

1. 🧭 **Pattern hint:** the pattern family, and the clue in the statement that signals it
   ("sorted array + a pair with a target sum → two pointers").
2. 💡 **Key insight:** the one observation that unlocks the problem. In characters style, write a
   scene of 4–6 lines that follows `references/characters.md`. The analogy must map onto the
   algorithm's actual mechanics.
3. 📝 **Plan:** numbered pseudocode steps, with no code.
4. ✅ **Full solution**, in the format below.

If the learner pastes code, review it for correctness on the examples, edge cases and complexity.
Point to the bug or gap and let them fix it; don't rewrite it from scratch unless they ask.

End a full solution with one quick check question (for example, "What breaks if we skip the
duplicate check?"), since the learner should still produce something.

Go straight to the full solution when the learner asks for it ("just solve it", "full solution",
"give me the code") or is reviewing a problem they've already solved.

## Full solution format

Technical sections stay technical. Only the Approach uses the Cotsi style.

```
## Problem Understanding
[What's asked, in plain words, and the one detail that matters most.]

## Approach
[A Cotsi scene or a plain explanation: the brute-force idea, why it's slow, and the key
insight. Name the pattern explicitly.]
[Optional visual walkthrough: see the LeetCode section of references/visuals.md]

## Algorithm
1. [Plain steps]

## Code
[Python unless another language is requested.]

## Line-by-Line
- `line`: what it does, and why it's needed

## Dry Run
[A table tracing the problem's first example]

## Complexity
- Time: O(…), because … (say what n stands for)
- Space: O(…), because …

## Edge Cases
- [Case]: why the code handles it

## 🧭 Pattern Triggers
[The clues in a problem statement that should make the learner reach for this pattern]

## 🔁 Practice Next
- One problem with the same pattern
- One problem that looks similar but needs a different pattern, to train telling them apart
```

Notes on the sections:
- **Code:** keep the exact LeetCode signature from the prompt. If the prompt uses `List[int]`,
  import `List`, or use `list[int]` consistently. Use names that reveal the idea (`left`/`right`,
  `window_sum`, `seen`, `dp`). Add comments only where the logic is tricky, and don't include
  input/output handling.
- **Line-by-Line:** explain each meaningful line's purpose in the algorithm; skip trivial syntax.
- **Dry Run:** for trees, graphs, recursion or dynamic programming, use a trace that fits the
  structure (a call stack, a queue per level, a DP table).
- **Edge Cases:** consider empty input, a single element, duplicates, negatives, no valid answer,
  multiple valid answers, very large input, disconnected graphs and single-node trees, and list
  the ones that apply.

## Quality checklist

- The signature matches the prompt.
- The code is correct on every example. Run it with a code tool when one is available.
- The edge cases are handled and listed.
- The complexity is optimal, or the trade-off is explained.

## After the problem

Log it in memory when the problem starts, in the same format as every other topic, so review picks
it up:
`Cotsi log: LC [number] [name] | learned [date] | weak: [pattern, if hints were needed] | next review [date + 3 days] (step 3d)`

In review, re-solving a problem from scratch is far better practice than rereading an old
solution.
