# Architecture

## Pipeline

```
AdSpec (spec.ts)  +  SurfaceProfile (surfaces.ts)
                 │
                 ▼
        resolveLayout()  (resolver.ts — pure TypeScript, no DOM, no React)
                 │
                 ▼
          ResolvedLayout  (plain data: boxes with x/y/width/height/fontSize)
                 │
                 ▼
      renderLayoutToDOM()  (render-dom.ts — DOM writes only)
                 │
                 ▼
              App.tsx  (React shell: surface picker, inspector, wires the ref)
```

Each arrow is a real module boundary — one file never imports "sideways"
across the pipeline:

- `spec.ts` and `surfaces.ts` know nothing about each other, and nothing
  about layout math or rendering.
- `resolver.ts` imports types from both, but never imports `render-dom.ts`
  or `react`. It has no idea its output will end up as absolutely-positioned
  `<div>`s — it could just as easily be consumed by a test, a CLI, or a
  canvas renderer.
- `render-dom.ts` imports only `ResolvedLayout` / `ResolvedBox` from
  `resolver.ts`. It has no idea an `AdSpec` or a `SurfaceProfile` exists —
  it just draws whatever numbers it's given.
- `App.tsx` is the only file that touches React, and its only layout-related
  job is calling `resolveLayout()` then handing the result to
  `renderLayoutToDOM()` via a ref in a `useEffect`. It never computes a
  coordinate itself.

## "Could a new surface be added without touching the resolver?"

Yes. `resolver.ts` never references a surface by id or name — the only
surface-shape-driven branch is `chooseFlow(width, height)`, a two-threshold
rule on aspect ratio. Every other decision (element sizing, drop order,
space distribution) reads `surface.minTapTarget`, `surface.minTextSize`,
`surface.viewingDistance`, `surface.touchOnly`, and `surface.safeArea` —
generic fields any profile can set. Adding a surface is adding an object to
the array in `surfaces.ts`; nothing in `resolver.ts` changes. This is also
what the "5th unknown surface" interview step exercises directly.

## "Could a new renderer (Canvas instead of DOM) be added without touching the resolver?"

Yes, by construction: `render-dom.ts` is the *only* file that knows a DOM
exists. A hypothetical `render-canvas.ts` would:

```ts
import type { ResolvedLayout } from "./resolver";

export function renderLayoutToCanvas(ctx: CanvasRenderingContext2D, layout: ResolvedLayout) {
  for (const box of layout.boxes) {
    if (box.dropped) continue;
    // ctx.fillRect(box.x, box.y, box.width, box.height), ctx.fillText(box.content, ...), etc.
  }
}
```

`resolver.ts` would not change a single line — `ResolvedLayout` is already
renderer-agnostic plain data (numbers and strings, no DOM types, no React
types).

## Why this shape, not a monorepo / published package

The brief explicitly doesn't require package publishing — the thing being
evaluated is the algorithm, not distribution. A single Vite app with a
clean internal module boundary demonstrates the same separation of concerns
a published `@flam/layout-engine` package would, without the overhead of
workspace tooling that isn't the point of the exercise.

## Design decisions worth being able to defend live

- **Flow selection is a 2-threshold rule on aspect ratio**, not a
  discrete surface-type enum. `width / height >= 1.4` → row,
  `<= 0.75` → column, otherwise → stack. This is what makes an unseen 5th
  surface resolve correctly: the rule only needs the two numbers every
  surface already has.
- **Degradation never touches priority-1 elements.** The drop loop filters
  `priority !== 1` before it ever looks at fit. If a spec's priority-1
  elements alone don't fit a surface, the resolver renders them at minimum
  size and emits a warning rather than silently dropping something the
  spec author marked as non-negotiable.
- **Leftover space is distributed by role weight, not equally.** Once every
  kept element has its guaranteed minimum, remaining space is handed out
  proportionally (`hero` gets the biggest share, `branding` the smallest) —
  this is why a spacious surface doesn't just center-pad everything evenly.
- **The `stack` strategy reuses `placeLinear` on a sub-box** rather than
  being a fully separate algorithm — the "caption row" beneath a hero image
  is computed by the exact same row-placement function used for the
  broadcast surface, just on a shorter box. One arrangement primitive,
  composed twice.

## Known limitations

- Text width estimation (`fontSize * content.length * 0.42`) is a fixed
  heuristic, not actual rendered-text measurement (`canvas.measureText` /
  a hidden-DOM probe) — the bonus item in the brief. It's accurate enough
  for the demo's short strings but will drift for long copy or non-Latin
  scripts.
- Only three element types (`text`, `image`, `button`) are modeled — no
  video, no rich text, no nested groups.
- The `stack` strategy's 58%/42% hero/caption split is a fixed ratio, not
  itself derived from content — a spec with an unusually tall caption block
  could still get a tight caption row on a square surface.
- No animated transition between surfaces (listed as a bonus item, not
  attempted).
