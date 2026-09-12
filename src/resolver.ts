import type { AdElement, AdSpec, ElementRole } from "./spec";
import type { SurfaceProfile } from "./surfaces";

/**
 * resolver.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Pure TypeScript. No DOM, no React, no import from render-dom.ts. Given an
 * AdSpec and a SurfaceProfile it never has seen before, it returns a
 * ResolvedLayout: positions and sizes for every element, in plain data.
 * A renderer (render-dom.ts, or a future render-canvas.ts) consumes that
 * data — it never re-decides placement.
 *
 * ── The algorithm, in four steps ─────────────────────────────────────────
 *
 * 1. CLASSIFY — look ONLY at the surface's aspect ratio (width / height) to
 *    pick a composition strategy: row, column, or stack. This is the single
 *    branch driven by surface shape, and it's a continuous rule (two
 *    thresholds), not a per-surface-name lookup table. Any surface with the
 *    same aspect ratio gets the same strategy, seen before or not.
 *
 * 2. SIZE — every element gets an intrinsic minimum footprint computed from
 *    its TYPE and the SURFACE'S hard constraints (minTapTarget, minTextSize)
 *    — never from the surface's id or name.
 *
 * 3. DEGRADE — walk elements from lowest priority-importance to highest
 *    (priority 3 considered for removal first, then 2; priority 1 is never
 *    removed) and drop elements one at a time, only while the sum of
 *    intrinsic minimums still doesn't fit the surface's main-axis budget.
 *
 * 4. PLACE — give every surviving element its intrinsic minimum, then
 *    distribute any leftover space proportionally by role weight, and lay
 *    the results out along the strategy chosen in step 1.
 *
 * Steps 2–4 are pure functions of (elements, flow, contentBox, surface
 * constraints) — nothing here special-cases "mobilePortrait" or
 * "broadcastLowerThird" by name.
 */

const ROW_ASPECT_THRESHOLD = 1.4; // width : height >= this -> single horizontal row
const COLUMN_ASPECT_THRESHOLD = 0.75; // width : height <= this -> single vertical column
const GAP = 8;

export type FlowStrategy = "row" | "column" | "stack";

export interface ResolvedBox {
  id: string;
  role: ElementRole;
  type: AdElement["type"];
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Only meaningful for "text" / "button" elements. */
  fontSize?: number;
  dropped: boolean;
}

export interface ResolvedLayout {
  surfaceId: string;
  surfaceWidth: number;
  surfaceHeight: number;
  flow: FlowStrategy;
  boxes: ResolvedBox[];
  warnings: string[];
}

// Relative importance used only to split LEFTOVER space once every element
// already has its guaranteed minimum. Never used to decide who gets
// dropped — priority alone decides that.
const ROLE_WEIGHT: Record<ElementRole, number> = {
  hero: 0.42,
  primary: 0.2,
  secondary: 0.12,
  action: 0.16,
  branding: 0.1,
};

// Visual reading order within a composition, independent of declaration order.
const ROLE_ORDER: ElementRole[] = ["hero", "primary", "secondary", "action", "branding"];

interface ContentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SizedElement extends AdElement {
  minWidth: number;
  minHeight: number;
  fontSize?: number;
}

export function resolveLayout(spec: AdSpec, surface: SurfaceProfile): ResolvedLayout {
  const warnings: string[] = [];
  const flow = chooseFlow(surface.width, surface.height);
  const box = getContentBox(surface);

  const sized = spec.elements.map((el) => sizeElement(el, surface));
  const { kept, dropped } = degrade(sized, flow, box, warnings);
  const orderedKept = sortByRoleOrder(kept);

  const placedBoxes =
    flow === "stack" ? placeStack(orderedKept, box) : placeLinear(orderedKept, box, flow);

  const droppedBoxes: ResolvedBox[] = dropped.map((el) => ({
    id: el.id,
    role: el.role,
    type: el.type,
    content: el.content,
    x: box.x,
    y: box.y,
    width: 0,
    height: 0,
    dropped: true,
  }));

  return {
    surfaceId: surface.id,
    surfaceWidth: surface.width,
    surfaceHeight: surface.height,
    flow,
    boxes: [...placedBoxes, ...droppedBoxes],
    warnings,
  };
}

// ── 1. Classify ────────────────────────────────────────────────────────

function chooseFlow(width: number, height: number): FlowStrategy {
  const aspect = width / height;
  if (aspect >= ROW_ASPECT_THRESHOLD) return "row";
  if (aspect <= COLUMN_ASPECT_THRESHOLD) return "column";
  return "stack";
}

function getContentBox(surface: SurfaceProfile): ContentBox {
  const sa = surface.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    x: sa.left,
    y: sa.top,
    width: surface.width - sa.left - sa.right,
    height: surface.height - sa.top - sa.bottom,
  };
}

// ── 2. Size ────────────────────────────────────────────────────────────

function sizeElement(el: AdElement, surface: SurfaceProfile): SizedElement {
  if (el.type === "button") {
    const tap = surface.minTapTarget ?? (surface.touchOnly ? 44 : 32);
    return { ...el, minWidth: Math.max(tap * 1.9, 84), minHeight: tap };
  }

  if (el.type === "image") {
    // Hero images want real presence; smaller roles (branding) can be a
    // compact badge — both must stay above a legible/tappable-adjacent floor.
    const base = el.role === "hero" ? 96 : 40;
    return { ...el, minWidth: base, minHeight: base };
  }

  // text
  const isFar = surface.viewingDistance === "far";
  const floor = surface.minTextSize ?? (isFar ? 32 : 14);
  const fontSize = el.role === "primary" ? Math.max(floor, 18) : Math.max(floor * 0.72, 12);
  return {
    ...el,
    minWidth: fontSize * el.content.length * 0.42,
    minHeight: fontSize * 1.45,
    fontSize,
  };
}

// ── 3. Degrade ─────────────────────────────────────────────────────────

function mainAxisMin(el: SizedElement, flow: FlowStrategy): number {
  return flow === "column" ? el.minHeight : el.minWidth;
}

function degrade(
  elements: SizedElement[],
  flow: FlowStrategy,
  box: ContentBox,
  warnings: string[]
): { kept: SizedElement[]; dropped: SizedElement[] } {
  const budget = flow === "column" ? box.height : box.width;

  let kept = [...elements];
  const dropped: SizedElement[] = [];

  const totalMain = (list: SizedElement[]) =>
    list.reduce((sum, el) => sum + mainAxisMin(el, flow), 0) + GAP * Math.max(0, list.length - 1);

  // Consider elements for removal lowest-priority-first (3, then 2). Never
  // touch priority 1. Re-check the budget after every removal so we drop
  // the minimum number of elements actually needed, not more.
  const dropCandidates = [...elements]
    .filter((el) => el.priority !== 1)
    .sort((a, b) => b.priority - a.priority);

  for (const candidate of dropCandidates) {
    if (totalMain(kept) <= budget) break;
    kept = kept.filter((el) => el.id !== candidate.id);
    dropped.push(candidate);
    warnings.push(
      `Dropped "${candidate.id}" (priority ${candidate.priority}, role "${candidate.role}") — ` +
        `insufficient space on this surface even at minimum size.`
    );
  }

  if (totalMain(kept) > budget) {
    warnings.push(
      `Priority-1 elements alone (${totalMain(kept).toFixed(0)}px) exceed the available ` +
        `${budget.toFixed(0)}px main-axis budget. Rendering at minimum size; this surface ` +
        `is too small for this spec's guaranteed content.`
    );
  }

  return { kept, dropped };
}

function sortByRoleOrder(elements: SizedElement[]): SizedElement[] {
  return [...elements].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
}

// ── 4. Place ───────────────────────────────────────────────────────────

/**
 * How much of the cross axis an element actually occupies. In column flow,
 * full-width stretch is the idiomatic mobile pattern (a full-width CTA bar
 * looks right there), so every element takes the full cross size. In row
 * flow, only the hero image should fill the full row height like a photo
 * strip — a button or badge stretched to the row's full height would render
 * as an oversized oval/bar instead of a normal-looking element, so those get
 * a capped, content-appropriate height and are centered within the row.
 */
function crossSizeFor(el: SizedElement, isRow: boolean, fullCross: number): number {
  if (!isRow) return fullCross;
  if (el.role === "hero") return fullCross;
  if (el.type === "button") return Math.min(el.minHeight * 1.35, fullCross);
  if (el.type === "image") return Math.min(el.minHeight * 1.15, fullCross); // branding badge
  return Math.min((el.fontSize ?? 14) * 1.8, fullCross); // text: a comfortable line box
}

/** Row (main axis = x) or column (main axis = y) linear placement. */
function placeLinear(elements: SizedElement[], box: ContentBox, flow: "row" | "column"): ResolvedBox[] {
  const isRow = flow === "row";
  const mainBudget = isRow ? box.width : box.height;
  const baseline = elements.reduce((sum, el) => sum + mainAxisMin(el, flow), 0);
  const totalGap = GAP * Math.max(0, elements.length - 1);
  const leftover = Math.max(0, mainBudget - baseline - totalGap);
  const totalWeight = elements.reduce((sum, el) => sum + ROLE_WEIGHT[el.role], 0) || 1;
  const fullCross = isRow ? box.height : box.width;

  let cursor = isRow ? box.x : box.y;
  const boxes: ResolvedBox[] = [];

  for (const el of elements) {
    const bonus = leftover * (ROLE_WEIGHT[el.role] / totalWeight);
    const mainSize = mainAxisMin(el, flow) + bonus;
    const crossSize = crossSizeFor(el, isRow, fullCross);
    const crossOffset = (fullCross - crossSize) / 2; // center within the row/column band

    boxes.push({
      id: el.id,
      role: el.role,
      type: el.type,
      content: el.content,
      x: isRow ? cursor : box.x + crossOffset,
      y: isRow ? box.y + crossOffset : cursor,
      width: isRow ? mainSize : crossSize,
      height: isRow ? crossSize : mainSize,
      fontSize: el.fontSize,
      dropped: false,
    });

    cursor += mainSize + GAP;
  }

  return boxes;
}

/**
 * Stack strategy — used for near-square surfaces. A hero image (if present
 * and kept) claims the top ~58% of the box; everything else composes as a
 * horizontal row in the remaining strip beneath it, by re-using the same
 * row-placement math on a smaller sub-box rather than inventing a second
 * bespoke algorithm.
 */
function placeStack(elements: SizedElement[], box: ContentBox): ResolvedBox[] {
  const hero = elements.find((el) => el.role === "hero");
  const rest = elements.filter((el) => el.role !== "hero");

  const heroHeight = hero ? Math.round(box.height * 0.58) : 0;
  const boxes: ResolvedBox[] = [];

  if (hero) {
    boxes.push({
      id: hero.id,
      role: hero.role,
      type: hero.type,
      content: hero.content,
      x: box.x,
      y: box.y,
      width: box.width,
      height: heroHeight,
      dropped: false,
    });
  }

  const captionBox: ContentBox = {
    x: box.x,
    y: box.y + heroHeight + (hero ? GAP : 0),
    width: box.width,
    height: box.height - heroHeight - (hero ? GAP : 0),
  };

  boxes.push(...placeLinear(rest, captionBox, "row"));
  return boxes;
}