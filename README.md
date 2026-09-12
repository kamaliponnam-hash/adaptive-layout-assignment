# Adaptive Layout Engine for Multi-Surface Ads

A constraint-based layout resolver that takes one declarative ad spec and
produces a correct, structurally different arrangement for any surface —
mobile portrait, mobile landscape, a wide broadcast lower-third, a square
kiosk, or a surface the resolver has never seen before — without a single
`if (surface === "...")` branch.

## Setup instructions

```bash
npm install
npm run dev
```

Then open the printed local URL (Vite defaults to `http://localhost:5173`).

`npm run build` type-checks the project (`tsc -b`) and produces a static
`dist/` folder; `npm run preview` serves that build locally.

## How to run the demo and switch surfaces

`npm run dev` opens the demo directly — there's nothing else to configure.
A single product ad ("Aria wireless earbuds": headline, hero image, price,
CTA, logo) is defined once in `src/spec.ts`. The row of buttons at the top
of the page is the surface picker; clicking one re-resolves the same spec
against that surface's profile (defined in `src/surfaces.ts`) and re-renders
live. The right-hand panel shows the composition strategy the resolver
chose, which hard constraints were active, and any degradation warnings.

The **"Compact panel (tight)"** surface is intentionally too small to fit
all five elements at full priority — selecting it demonstrates the branding
logo (priority 3) being dropped cleanly while the headline, hero image, and
CTA stay intact and correctly positioned.

## Layout algorithm — how constraint resolution works, step by step

See `resolver.ts` for the implementation; the short version:

1. **Classify.** Look only at `surface.width / surface.height`. `>= 1.4` →
   `row` (single horizontal arrangement — fits a wide, short surface like a
   broadcast lower-third). `<= 0.75` → `column` (vertical stack — fits a
   tall surface like a mobile interstitial). Otherwise → `stack` (hero image
   on top, everything else in a row beneath it — fits a roughly-square
   surface like a kiosk).
2. **Size.** Every element gets an intrinsic minimum width/height computed
   from its `type` and the surface's hard constraints: buttons respect
   `minTapTarget`, text respects `minTextSize` (with a `far`-viewing floor
   of 32px if the surface doesn't set one explicitly), images get a
   role-dependent minimum (hero images want real presence; branding can be
   a small badge).
3. **Degrade.** Sum the intrinsic minimums along the surface's main axis
   (width for row/stack, height for column). If that sum doesn't fit the
   available space, remove elements one at a time — **lowest priority
   number is never touched; priority 3 is considered for removal first,
   then priority 2** — re-checking the fit after every removal, so the
   minimum number of elements is dropped, never more than necessary.
   Priority 1 elements are never removed.
4. **Place.** Every surviving element gets its intrinsic minimum size, then
   any leftover space is distributed proportionally by role weight (hero
   gets the largest share of extra room, branding the smallest), and the
   results are laid out along the axis chosen in step 1.

## Priority & degradation logic

Priority is the *only* signal that decides what gets dropped. Role weight
(`ROLE_WEIGHT` in `resolver.ts`) only decides how bonus space is split
among elements that already survived — it never influences the drop order.
Concretely: on the tight "Compact panel" surface, the sum of every
element's intrinsic minimum exceeds the available width, so the resolver
removes the priority-3 logo first (the *only* priority-3 element); if that
alone weren't enough, it would move on to priority-2 elements next
(price, then CTA — in the order the drop-candidate list produces them),
and would stop *before* ever considering a priority-1 element for removal.
This is verifiable by reading `degrade()` directly: the drop candidate list
is explicitly filtered with `.filter(el => el.priority !== 1)`.

## TypeScript design

`ElementType`, `ElementRole`, and `Priority` are literal unions (not plain
`string`/`number`), so `role: "Hero"` or `priority: 4` is a compile-time
error, not something that has to be caught at runtime. `defineAd()` and
`defineSurface()` add the runtime checks types can't express — duplicate
ids, a `button` with a non-`"action"` role, a `touchOnly` surface missing
`minTapTarget` — each throwing a specific, named error
(`AdSpecError` / `SurfaceProfileError`) with a message identifying exactly
what's wrong and where. `ResolvedLayout` / `ResolvedBox` (in `resolver.ts`)
are fully typed too, so `render-dom.ts` (or any future renderer) consumes
positions/sizes without guessing at shape.

## Resolution flow

```
Ad Spec + Surface Profile → Constraint Resolver → Resolved Layout → Renderer
```

See `ARCHITECTURE.md` for the full module-boundary breakdown, including why
a new surface or a new renderer (e.g. Canvas) can be added without touching
the resolution algorithm.

## Known limitations

- Text sizing uses a fixed per-character-width heuristic, not actual
  rendered-text measurement — see `ARCHITECTURE.md` for detail.
- Three element types only (`text`, `image`, `button`); no video, rich
  text, or nested groups.
- No animated transition when switching surfaces.
- The `stack` strategy's hero/caption split ratio (58/42) is fixed, not
  derived from content.

## AI tool disclosure

Built with assistance from Claude (Anthropic). Claude was used to draft the
initial resolver algorithm (aspect-ratio classification, priority-based
degradation loop, and the linear/stack placement functions), the DOM
renderer, the React demo shell, and this documentation, based on a
step-by-step design discussion of the constraint-resolution approach before
any code was written. All code was reviewed and is understood well enough
to walk through line-by-line, including the live-interview requirement to
resolve an unseen 5th surface and explain why any given element landed at
its specific position and size.

## Time spent

_Fill in honestly before submitting — the brief asks for this explicitly,
and it should reflect your own time reading, testing, and understanding
this code, not just when the files were generated._
