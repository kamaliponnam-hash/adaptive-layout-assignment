import type { ResolvedLayout, ResolvedBox } from "./resolver";

/**
 * render-dom.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Deliberately has NO import from React, and NO knowledge of AdSpec,
 * SurfaceProfile, or the resolution algorithm. It takes the plain data
 * resolver.ts already computed and turns it into real, absolutely-positioned
 * DOM nodes with inline CSS. That's the whole contract.
 *
 * This is what makes the "could a new renderer be added without touching
 * the resolver?" question in the brief answerable with "yes": a hypothetical
 * render-canvas.ts would import the exact same ResolvedLayout /
 * ResolvedBox types from resolver.ts and paint the same numbers onto a
 * <canvas> instead of the DOM. Nothing in resolver.ts would change.
 */

const ROLE_COLOR: Record<string, string> = {
  hero: "#3B4252",
  primary: "#EAEFF5",
  secondary: "#B7C2D0",
  action: "#F5A623",
  branding: "#5EEAD4",
};

export interface RenderOptions {
  /** Uniform scale factor applied to every coordinate, for fitting a preview area. */
  scale?: number;
}

/**
 * Clears `container` and renders `layout` into it as absolutely-positioned
 * child elements. Returns the list of dropped element ids for callers that
 * want to display them separately (e.g. as a "dropped" chip list).
 */
export function renderLayoutToDOM(
  container: HTMLElement,
  layout: ResolvedLayout,
  options: RenderOptions = {}
): { droppedIds: string[] } {
  const scale = options.scale ?? 1;

  container.innerHTML = "";
  container.style.position = "relative";
  container.style.width = `${layout.surfaceWidth * scale}px`;
  container.style.height = `${layout.surfaceHeight * scale}px`;
  container.style.overflow = "hidden";

  const droppedIds: string[] = [];
  const visible = layout.boxes.filter((b) => !b.dropped);

  for (const box of visible) {
    container.appendChild(renderBox(box, scale));
  }
  for (const box of layout.boxes) {
    if (box.dropped) droppedIds.push(box.id);
  }

  return { droppedIds };
}

function renderBox(box: ResolvedBox, scale: number): HTMLElement {
  const el = document.createElement("div");
  el.className = `adx-el adx-el-${box.type} adx-el-role-${box.role}`;
  el.title = `${box.id} · role: ${box.role}`;

  Object.assign(el.style, {
    position: "absolute",
    left: `${box.x * scale}px`,
    top: `${box.y * scale}px`,
    width: `${box.width * scale}px`,
    height: `${box.height * scale}px`,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: box.type === "button" ? "center" : "flex-start",
    overflow: "hidden",
  } satisfies Partial<CSSStyleDeclaration>);

  if (box.type === "image") {
    el.style.background = ROLE_COLOR[box.role] ?? "#3B4252";
    el.style.borderRadius = "6px";
    el.style.color = "#7A8699";
    el.style.fontSize = "11px";
    el.style.padding = "4px 8px";
    el.style.whiteSpace = "nowrap";
    el.style.textOverflow = "ellipsis";
    el.textContent = box.content;
    return el;
  }

  if (box.type === "button") {
    el.style.background = ROLE_COLOR.action;
    el.style.borderRadius = "999px";
    el.style.color = "#1A1300";
    el.style.fontWeight = "600";
    el.style.fontSize = box.fontSize ? `${Math.max(box.fontSize * scale, 8)}px` : "14px";
    el.style.whiteSpace = "nowrap";
    el.style.textOverflow = "ellipsis";
    el.style.padding = "0 14px";
    el.textContent = box.content;
    return el;
  }

  // text
  el.style.color = box.role === "primary" ? "#EAEFF5" : "#B7C2D0";
  el.style.fontWeight = box.role === "primary" ? "600" : "400";
  el.style.fontSize = box.fontSize ? `${Math.max(box.fontSize * scale, 8)}px` : "14px";
  el.style.lineHeight = "1.2";
  el.style.whiteSpace = "nowrap";
  el.style.textOverflow = "ellipsis";
  el.textContent = box.content;
  return el;
}