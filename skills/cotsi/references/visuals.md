# Visuals

## When a visual earns its place

Make a visual when the idea has **structure** (parts and how they connect), a **process** (steps
over time) or **quantities** (sizes, rates, change) that a picture shows better than words. Skip it
for definitions, opinions and purely verbal ideas: a decorative visual costs the learner time and
attention and teaches nothing. Use at most one visual per reply.

## How to show it

- On claude.ai web and desktop, use the inline visual tool (`show_widget`) when it's available.
- Where inline visuals aren't available or don't render (Claude Code, the API, the claude.ai phone
  apps), draw a compact text diagram instead: a small ASCII diagram, a table, or a Mermaid code
  block.
- Under any visual, add a one- or two-line caption stating what it shows, so nothing is lost if
  the visual doesn't render.
- If the learner has typed `visuals off`, use captions and text diagrams only.

## Interactive step-through spec

- A title bar with the idea's name, a "Step X / N" counter, and Prev / Next buttons.
- **Predict, then reveal:** where it fits, show "What happens next?" on a step and reveal the answer
  on Next. Guessing first makes the reveal stick.
- Show state changes explicitly: values moving, boxes highlighting, arrows appearing.
- Plain-English labels, with no raw variable names or code inside the visual.
- Colors: background `#0f1117`, accent `#7c6af7`, success `#22c55e`, highlight `#f59e0b`, danger
  `#ef4444`. Never signal with color alone; pair it with a label or an icon.
- Smooth CSS transitions of 300–500ms, and honor `prefers-reduced-motion`.
- Sans-serif for labels, monospace for values. Max width 680px; stack vertically on narrow screens.
- Pure HTML, CSS and JavaScript, with no external libraries.

## What to draw

| Idea type | Draw |
|---|---|
| Data structures | Boxes or nodes with labeled pointer arrows; push, pop and insert animations |
| Algorithms | Array cells highlighting and swapping step by step; pointers as labeled arrows |
| Math and formulas | Variables updating live as the formula runs on one example |
| Systems (networks, memory, CPUs, organizations) | A flow diagram of labeled boxes, with the data moving |
| Business and economics | Bar charts, or flows between labeled entities |
| Frameworks and cycles (a habit loop, a feedback loop) | A labeled cycle with animated arrows |
| Before/after, or two systems compared | A split panel with an animated contrast |
| Growth and compounding | A bar or curve that grows over time |
| Relationships between ideas | Nodes and edges that light up in order |
| History and narratives | A timeline with events appearing in sequence |

## LeetCode walkthrough

Step through these panels with Prev and Next:
1. **Problem:** the input and the goal.
2. **Brute force**, only when the contrast teaches something: the naive approach, with the
   repeated work highlighted.
3. **Optimized:** the real algorithm on the problem's first example, showing every state change:
   pointer moves, hash map entries appearing (as a two-column key → value table that grows), the
   window sliding, the recursion stack growing.
4. **Result:** the answer highlighted, with a badge showing the time and space complexity.
