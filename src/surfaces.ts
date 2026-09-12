/**
 * surfaces.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Defines WHERE an ad can run and what hard physical/ergonomic constraints
 * that placement carries. A surface is never just a width and height.
 */

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type ViewingDistance = "near" | "normal" | "far";

export interface SurfaceProfile {
  id: string;
  label: string;
  width: number;
  height: number;
  safeArea?: SafeArea;
  /** Minimum tappable side length in px. Required if touchOnly is true. */
  minTapTarget?: number;
  /** How far a viewer typically stands from this surface. */
  viewingDistance?: ViewingDistance;
  /** Minimum legible font size in px. Required if viewingDistance is "far". */
  minTextSize?: number;
  touchOnly?: boolean;
}

export class SurfaceProfileError extends Error {
  constructor(message: string) {
    super(`[SurfaceProfile] ${message}`);
    this.name = "SurfaceProfileError";
  }
}

/**
 * Validates that a surface's constraints are internally consistent BEFORE
 * the resolver ever sees it — e.g. a touch-only surface that forgot to
 * declare a tap target minimum is a spec bug, not something the resolver
 * should silently default around.
 */
export function defineSurface(profile: SurfaceProfile): SurfaceProfile {
  if (profile.width <= 0 || profile.height <= 0) {
    throw new SurfaceProfileError(`Surface "${profile.id}" must have positive width and height.`);
  }
  if (profile.touchOnly && !profile.minTapTarget) {
    throw new SurfaceProfileError(`Surface "${profile.id}" is touchOnly but does not declare minTapTarget.`);
  }
  if (profile.viewingDistance === "far" && !profile.minTextSize) {
    throw new SurfaceProfileError(
      `Surface "${profile.id}" has viewingDistance "far" but does not declare minTextSize.`
    );
  }
  if (profile.safeArea) {
    const { top, right, bottom, left } = profile.safeArea;
    if (top + bottom >= profile.height || left + right >= profile.width) {
      throw new SurfaceProfileError(
        `Surface "${profile.id}" has a safeArea that consumes the entire surface — nothing would be renderable.`
      );
    }
  }
  return { ...profile };
}

/**
 * Demo surfaces — at least 4, per the brief, plus one intentionally tight
 * surface ("compactPanel") to demonstrate priority-based degradation.
 * The interviewer will add a 5th, unseen one live; resolver.ts must handle
 * it correctly with zero changes to this file's shape.
 */
export const surfaces = [
  defineSurface({
    id: "mobilePortrait",
    label: "Mobile · Portrait interstitial",
    width: 320,
    height: 480,
    safeArea: { top: 20, right: 12, bottom: 20, left: 12 },
    minTapTarget: 44,
    touchOnly: true,
  }),
  defineSurface({
    id: "mobileLandscape",
    label: "Mobile · Landscape banner",
    width: 480,
    height: 300,
    safeArea: { top: 10, right: 14, bottom: 10, left: 14 },
    minTapTarget: 44,
    touchOnly: true,
  }),
  defineSurface({
    id: "broadcastLowerThird",
    label: "Broadcast · Lower third",
    width: 1920,
    height: 250,
    safeArea: { top: 8, right: 40, bottom: 8, left: 40 },
    viewingDistance: "far",
    minTextSize: 32,
  }),
  defineSurface({
    id: "squareKiosk",
    label: "Retail · Square kiosk",
    width: 1080,
    height: 1080,
    safeArea: { top: 24, right: 24, bottom: 24, left: 24 },
    minTapTarget: 60,
    touchOnly: true,
  }),
  defineSurface({
    id: "compactPanel",
    label: "Shelf-edge · Compact panel (tight)",
    width: 480,
    height: 90,
    minTapTarget: 60,
    touchOnly: true,
  }),
] as const;

export type DemoSurfaceId = (typeof surfaces)[number]["id"];
