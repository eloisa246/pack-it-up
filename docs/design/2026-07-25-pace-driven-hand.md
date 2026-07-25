# The pace-driven hand — design spec

**Author:** [Claude Code / Opus 5] · **Date:** 2026-07-25
**Supersedes:** ticket 1 ("cap the hand at 3/5/7") in
`docs/design/2026-07-25-opus5-redesign-review.md` — that was a blunt fix; this is
the mechanic Eloisa actually asked for.
**Prototype:** `docs/design/tools/pace-preview.mjs` (runnable, read-only)

> **Eloisa, in her words:** *"it should automatically give me the most urgent
> tasks that make sense for that day and the number of effort points required to
> keep the move moving at pace."*

That is three separate asks, and the third one is the hard one. Taken in order:
**(1)** a computed daily effort number, **(2)** an automatic selection of the
right cards to fill it, **(3)** the guarantee that hitting that number actually
keeps the move on pace. This spec covers all three, and is honest about what
happens when (3) is impossible — which, on the data I can see, it currently is.

---

## The core insight: you already wrote this

`buildMinimumSchedule` in `schedule.js:220` is a backward scheduler. It walks
every required card from its latest date toward today, places it on the last day
with room, and returns what landed on today. **That is the mechanic described
above, already implemented, and it has never once been called.** The review
flagged it as dead code; in light of this request it is not dead code, it is the
foundation.

Three things separate it from what Eloisa asked for:

1. Its daily capacity is hardcoded to `ENERGY_BUDGET.fumes` (3) instead of a
   **computed pace**.
2. It only places criticality ≥ 2, so it can't fill a day's budget with the next
   most urgent thing.
3. It has no notion of **"makes sense for that day"** beyond dependencies and
   availability.

Fix those three and the feature exists.

---

## Part 1 — What "pace" means

Not an average. `calculateTierQuotas` currently computes remaining-effort ÷
remaining-days, which is why it returns 103–135 effort/day: it is averaging work
that is deadline-clustered, not evenly spreadable. An average is the wrong
instrument.

**Pace is the smallest daily effort ceiling at which every remaining card still
fits before its own deadline.** Level-loading, not averaging. Compute it by
searching upward from 1: place all work backward at capacity C; the first C that
places everything without spilling is the pace.

This gives a number that means something exact: *"7 effort a day and nothing is
late. 6 and something is."*

### Fixtures are not work

A flight, a vet appointment, a walkthrough — these happen at a time whether or
not you act. The prototype separates them: `exactDate` or `kind: "attend"` cards
**reserve** their day's capacity, are never proposed as discretionary work, and
are never cut. Today's board shows them above the hand as *"happening today"*,
not as cards to pick.

This matters more than it sounds. Under the current engine your flight competes
for budget against "remove coffee table," and in the greedy cut it loses.

---

## Part 2 — "Makes sense for that day"

Five filters, in rough order of value per unit of work:

| Filter | Rule | Status |
|--------|------|--------|
| **Dependencies** | Don't deal a card whose prerequisites are open | ✅ exists (`depsComplete`) |
| **Availability** | Don't deal before `availableFrom` | ✅ exists |
| **Phase** | Use `movePhase.js` PHASES. Flight day deals the sweep checklist and *nothing else*. U-Box week deals load-prep, not job applications. Lock night deals lock-night. | ⚠️ data spine exists, unused for selection |
| **Lane variety** | Cap one lane at ~2 cards per hand. A day of four furniture removals is a chore list; one packing push + one call + one cat thing is a day. | ❌ new, small |
| **Time window** | A card that requires a business-hours phone call should not be dealt at 9pm. One `window: "business"` flag on ~20 tasks. | ❌ new, small, high felt value |

The phase filter is the one to build first — the table already exists, it is
already the calendar's source of truth, and it is the difference between the app
understanding the move and merely sorting it.

---

## Part 3 — When the pace doesn't fit

**This is the part that matters and it is where the design earns its keep.**

Measured against seed data on Jul 25 (6 days out), everything fits only above
**60 effort/day**. Held to a humane **8/day**, **28 of 168 cards fit before the
flight and 140 do not.** Three of the cuts are marked critical path.

A pace-driven hand without an answer for this just produces a nicer-looking wall.
So the third branch is mandatory:

- **Feasible** → show the pace, deal the day, done.
- **Infeasible** → hold a humane ceiling, deal that day, and **name what is being
  cut.** Not silently deprioritized — *named*, in a list, acknowledgeable.

Cut order: `criticalPath` survives longest → then `criticality` → then deadline
urgency. Never cut a fixture. (Getting this ordering right is not cosmetic: with
a naive criticality-first sort, the prototype cut *"Lock the Aug 1 sublet"* and
*"Attend the vet visit"* while keeping *"Remove outdoor furniture"* — because
"how late it is" outranked "how much it matters." `criticalPath` first fixes it.)

And then the honest line, which is the most valuable sentence this app could say
to Eloisa today:

> **140 of these aren't happening. Here they are. Decide now, while deciding is
> still cheaper than discovering.**

That is the triage verb from the review, with an automatic trigger and a
principled selection. Raise the ceiling, get help, or move a date — those are the
only three levers, and the app should say so.

---

## Part 4 — What happens to the energy check-in

**Recommendation: pace becomes the truth, energy becomes the modifier.**

| Energy | Meaning under the new model |
|--------|-----------------------------|
| **Fumes** | Deal only the `criticalPath` subset of today's pace hand. Say plainly what slips: *"The rest moves to tomorrow — tomorrow becomes 11."* |
| **Steady** | The pace hand, exactly. The honest day. |
| **Full** | Pace hand + pull tomorrow's lightest cards forward. *"Tomorrow drops to 5."* |

This keeps the emotional check-in — which is one of the best ideas in the
project — while making it *mean* something, since today's choice now visibly
moves tomorrow's number. Under the current engine, energy changes nothing about
the forced hand at all (`isBoundToday` doesn't take an energy argument).

**This is the one genuine fork in the spec, and it's Eloisa's call.** The
alternative reading of her request is that the app should just decide, with no
morning check-in at all. That is a defensible, calmer design and it is less code.
I recommend keeping the check-in because a moving app that never asks how you are
is a different, colder product — but I'd build whichever she picks, and the
scheduler underneath is identical either way.

---

## Try it before anyone writes it

```bash
node docs/design/tools/pace-preview.mjs                      # seed data
node docs/design/tools/pace-preview.mjs my-save.json 8       # your real ledger
```

Seed output for today, for reference:

```
PACE     Everything fits only at >60 effort/day — that is not a day.
         Holding a humane 8/day, 28 of 168 cards fit before the flight.
         140 do not. That is the real decision, and it is yours, not the app's.

TODAY — 4 cards / 8 effort:
  [cat    ] e2 c3* Book: Stretchy's travel vet (meds + certificate)
  [admin  ] e1 c3* Locate Wi-Fi kit
  [housing] e3 c3* Lock the Aug 1 sublet
  [cat    ] e2 c3* Attend Stretchy's travel vet visit
```

Four cards. That is a day. Compare to the 69 the live engine deals right now.

**Caveat, same as the review:** this is seed data. Your real ledger is smaller and
the pace will be lower — possibly feasible. Run it on your save before believing
any number here.

---

## Known gaps in the prototype

Honest list, so nobody ships it thinking it's finished:

1. **Dependencies aren't pulled in with their dependents.** The prototype cuts
   *"Get Stretchy's travel certificate"* while keeping *"Attend the vet visit"*.
   Fix: when a card survives, its open dependencies survive with it.
2. **No lane-variety or time-window filter yet** — specced in Part 2, not coded.
3. **Recurring cards** (`recurrence: "daily"`, e.g. sublet outreach) need to
   consume pace every day rather than be placed once.
4. **Search is linear** from C=1. Fine at this data size; binary-search if the
   ledger ever gets big.
5. The prototype re-places from scratch each call. In-game this should be
   memoized on `taskScheduleKey`, which already exists for exactly this purpose.

---

## Ticket

**Replaces review tickets 1 and 3.** Sized for Codex or Grok — this is scheduler
work, not a tweak, and it touches the daily loop, so it wants a lead.

- [ ] **Pace engine** — revive `buildMinimumSchedule` with computed capacity;
      fixtures reserve, never budget; return `{ pace, hand, cut, tomorrow }`.
- [ ] **Board reads the pace** — show today's number and the hand that meets it;
      fixtures rendered above the hand as "happening today," not as picks.
- [ ] **Infeasibility branch** — when it doesn't fit, hold the ceiling, deal the
      day, and show the named cut list with a one-tap *"Let it go"* → `archived`.
- [ ] **Phase filter** from `movePhase.js` — flight day deals the sweep and
      nothing else.
- [ ] **Energy re-pointed** per Part 4 (pending Eloisa's fork decision).
- [ ] Lane variety + `window: "business"` — after the above, if they still feel
      needed.

**Ship order:** pace engine → Board reads it → infeasibility branch. The first
two make the app usable; the third makes it honest.

Fan-renderer fix (review ticket 2) is **independent of all of this and should
land first** — it is a geometry bug, and a 4-card hand renders correctly through
a broken fan only by accident.

---

*Prototyped and specced by Claude Opus 5, advisory — no game code changed.
Numbers from seed `INITIAL_TASKS`; re-run on the real save before acting.*
