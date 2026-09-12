/**
 * spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Defines WHAT an ad contains and HOW IMPORTANT each piece is.
 * Deliberately contains nothing about position, size, or surface — that is
 * the resolver's job (resolver.ts), driven entirely by surfaces.ts.
 */

export type ElementType = "text" | "image" | "button";

/** Semantic role — drives sizing weight and placement order, not literal styling. */
export type ElementRole = "hero" | "primary" | "secondary" | "action" | "branding";

/** 1 = must always render intact. 2 = should render, may shrink. 3 = first to be dropped. */
export type Priority = 1 | 2 | 3;

export interface AdElement {
  id: string;
  type: ElementType;
  role: ElementRole;
  priority: Priority;
  /** Text to render (for "text"/"button") or a description/URL (for "image"). */
  content: string;
}

export interface AdSpec {
  elements: AdElement[];
}

/**
 * Thrown at spec-definition time when an AdSpec is structurally invalid.
 * TypeScript's literal unions (ElementType / ElementRole / Priority) already
 * reject most mistakes at compile time — passing role: "hero " with a typo,
 * or priority: 4, is a compiler error before this code ever runs. This class
 * catches what types can't: duplicate ids, role/type mismatches, and specs
 * with nothing guaranteed to render — at runtime, with a specific message.
 */
export class AdSpecError extends Error {
  constructor(message: string) {
    super(`[AdSpec] ${message}`);
    this.name = "AdSpecError";
  }
}

const VALID_TYPES: ElementType[] = ["text", "image", "button"];
const VALID_ROLES: ElementRole[] = ["hero", "primary", "secondary", "action", "branding"];
const VALID_PRIORITIES: Priority[] = [1, 2, 3];

// Buttons are always the call-to-action. Enforcing this pairing means a
// misconfigured spec can't define a button the resolver has no sizing rule
// for (e.g. a "branding" button, which minTapTarget logic doesn't expect).
const TYPE_ROLE_CONSTRAINTS: Partial<Record<ElementType, ElementRole[]>> = {
  button: ["action"],
};

export function defineAd(spec: AdSpec): AdSpec {
  if (!spec.elements || spec.elements.length === 0) {
    throw new AdSpecError("An ad spec must define at least one element.");
  }

  const seenIds = new Set<string>();
  for (const el of spec.elements) {
    validateElement(el, seenIds);
    seenIds.add(el.id);
  }

  const hasGuaranteedElement = spec.elements.some((el) => el.priority === 1);
  if (!hasGuaranteedElement) {
    throw new AdSpecError(
      "At least one element must have priority 1 — otherwise the resolver has nothing it is required to keep on screen."
    );
  }

  // Defensive copy: a caller mutating their original object after calling
  // defineAd() can't silently invalidate a spec the engine already checked.
  return { elements: spec.elements.map((el) => ({ ...el })) };
}

function validateElement(el: AdElement, seenIds: Set<string>): void {
  if (!el.id || typeof el.id !== "string") {
    throw new AdSpecError(`Every element needs a non-empty string id. Received: ${JSON.stringify(el.id)}`);
  }
  if (seenIds.has(el.id)) {
    throw new AdSpecError(`Duplicate element id "${el.id}" — ids must be unique within a spec.`);
  }
  if (!VALID_TYPES.includes(el.type)) {
    throw new AdSpecError(`Element "${el.id}" has type "${el.type}", not one of: ${VALID_TYPES.join(", ")}.`);
  }
  if (!VALID_ROLES.includes(el.role)) {
    throw new AdSpecError(`Element "${el.id}" has role "${el.role}", not one of: ${VALID_ROLES.join(", ")}.`);
  }
  if (!VALID_PRIORITIES.includes(el.priority)) {
    throw new AdSpecError(`Element "${el.id}" has priority "${el.priority}" — must be 1, 2, or 3.`);
  }
  const allowedRoles = TYPE_ROLE_CONSTRAINTS[el.type];
  if (allowedRoles && !allowedRoles.includes(el.role)) {
    throw new AdSpecError(
      `Element "${el.id}" is type "${el.type}" but has role "${el.role}". ` +
        `Elements of type "${el.type}" must have role: ${allowedRoles.join(" or ")}.`
    );
  }
  if (!el.content || typeof el.content !== "string") {
    throw new AdSpecError(`Element "${el.id}" must define non-empty string content.`);
  }
}

/**
 * The demo product ad — defined exactly once, resolved against every
 * surface in surfaces.ts. Five elements, matching the assignment's minimum:
 * headline, image, price, CTA, branding.
 */
export const productAd = defineAd({
  elements: [
    { id: "headline", type: "text", role: "primary", priority: 1, content: "Sound that moves with you" },
    { id: "product-image", type: "image", role: "hero", priority: 1, content: "Aria wireless earbuds" },
    { id: "price", type: "text", role: "secondary", priority: 2, content: "$129" },
    { id: "cta", type: "button", role: "action", priority: 2, content: "Shop now" },
    { id: "logo", type: "image", role: "branding", priority: 3, content: "Aria logo" },
  ],
});
