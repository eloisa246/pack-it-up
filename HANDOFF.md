# Latest handoff

→ **`docs/sessions/2026-07-25-claude-opus5-redesign-review.md`** (Claude Opus 5 — redesign review, advisory)

**Shipped:** Docs only. `docs/design/2026-07-25-opus5-redesign-review.md` — 6 mechanical + 8 aesthetic findings from the live build at 390×844, each verified against the running scheduler, plus a ranked 12-ticket table and 3 evidence screenshots. **No game code touched.**

**⚠ Measured on a FRESH INSTALL, not Eloisa's save** — a headless browser has empty localStorage, so every count below describes seed `INITIAL_TASKS`. Her real numbers are almost certainly smaller. Re-run: `node docs/design/tools/hand-audit.mjs my-save.json 2026-07-25` (Settings → "Copy canonical mobile save"). Part 0 of the review splits code-facts from seed-conditioned magnitudes.

**Headline (seed numbers):** a **Fumes** day on Jul 25 deals **69 bound cards / 103 effort** against a design budget of 3 (127 on flight day); `taskPressure` pinned at 3 every day Jul 12→31. **Holds regardless of save:** energy cannot change the bound hand — `isBoundToday` takes no energy argument — and both fan renderers break above ~8 cards (apartment fan spans ~1351px on a 390px screen; the Board hand clips its own tail so those cards can't be tapped).

**Eloisa's stated mechanic (Jul 25):** *"automatically give me the most urgent tasks that make sense for that day and the number of effort points required to keep the move moving at pace."* Specced in **`docs/design/2026-07-25-pace-driven-hand.md`** with a runnable prototype (`docs/design/tools/pace-preview.mjs`). It supersedes the review's "cap the hand" and "make energy real" tickets. The algorithm is largely `buildMinimumSchedule` — already written, never called. **The mandatory new piece is the infeasibility branch:** on seed data at a humane 8/day, 28 of 168 cards fit before the flight and 140 don't; the app must *name* the cut, not silently pile it.

**RULED (Eloisa, Jul 25): no energy check-in.** *"It should just deal me a hand and I should be allowed to put back / switch out things as I please."* Delete Fumes/Steady/Full — which also deletes the pre-pick black void and the "+2 draws" copy nit. Put-back and draw already work (`manualToggleHand` + the Board's Put back button); they're just stuck behind the energy gate. `isBoundToday` becomes a sort key, not a gate.

**Next up:** [cursor] **fan math first** — unconditional, pure layout, independent of all pace work. Then [codex/grok] the pace engine. Both in `FINISH_PLAN.md` → Open next; Eloisa picks which of the other review tickets enter the queue.

**Nag:** flight **Jul 31 — six days.** Vet window Jul 22–**25 closes today**; sublet still unlocked; U-Box lands Jul 29 and nothing is packed. Those outrank every ticket in this file.

---
*Session reports live in `docs/sessions/`; see `docs/ai-team/end-here.md`.*
