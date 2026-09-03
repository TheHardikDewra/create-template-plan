# /create-template — build plan

A plan for a Claude Code skill that rebuilds any landing page in Framer at 1440 / 810 / 390,
with Higgsfield graphics, fired from a single Raycast keystroke.

**Read the plan:** https://thehardikdewra.github.io/create-template-plan/

## What this is

Nine past Claude Code sessions ran essentially the same build — recreate a reference page in
Framer via `@framer/agent`, generate the imagery with Higgsfield, ship three breakpoints. Same
brief each time, same phases, and the same platform traps rediscovered from scratch.

This repo holds the plan for collapsing that into one skill:

| Section | What it covers |
|---|---|
| 01 | The nine sessions, with the verbatim brief from each and what it settled |
| 02 | Why every v1 got rejected — and the publish-time root cause behind it |
| 03 | The five things the skill inherits from those sessions |
| 04 | The twelve-phase pipeline, with real commands and the gate on each phase |
| 05 | Eighty platform traps, searchable and grouped |
| 06 | A worked example — windmillgrowth.com, actually captured at all three widths |
| 07 | Live Higgsfield credit costs against what past builds really spent |
| 08 | The Raycast snippet and script command |
| 09 | The file tree the skill writes |
| 10 | Nine open defaults to approve or flip |

## The headline finding

Variant interactions written through the Framer agent API are **silently dropped at publish**.
They serialize back correctly and then simply are not in the published page. That is why
structurally correct builds kept getting rejected as "non-functional" — and it is why the plan
treats the interaction layer as code components, proved against the published URL rather than
the canvas.

## `capture-reference.mjs`

The phase 01 capture script, written and tested against windmillgrowth.com. Drives
`chrome-headless-shell` over CDP with a throwaway profile, waits for the page to settle, runs a
lazy-load scroll pass, then captures a full-page PNG per width plus an `extract.json` carrying
section order, the real type scale, palette, and radii from computed styles.

```bash
node capture-reference.mjs https://example.com ./ref/example 1440,810,390
```

Output: `w1440.png`, `w810.png`, `w390.png`, `extract.json`.

## Status

**Shipped 2026-09-04.** Approved with all defaults plus code-component interactions.

Installed at `~/.claude/skills/create-template/` — `SKILL.md`, five references
(`framer-traps.md`, `interactions.md`, `higgsfield.md`, `capture.md`, `quality-bars.md`),
five scripts and a build ledger. The Raycast script command lives at
`~/.raycast-scripts/create-framer-template.sh`; the `;create-template` snippet is imported
through `scripts/install-raycast-snippet.sh`.

Scripts verified: `capture-reference.mjs` against windmillgrowth.com, `verify-live.mjs`
against the live Osprey build (correctly read `min 1440` / `min 810 .. max 1439.98`),
`compare.mjs` at 0.0% deltas on an identical pair, `slice-sheet.py` on a synthetic
uneven-gutter contact sheet.

---

Built by [Hardik Dewra](https://wedesignlandingpages.com), 2026.
