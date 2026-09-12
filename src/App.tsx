import { useEffect, useMemo, useRef, useState } from "react";
import { productAd } from "./spec";
import { surfaces, type SurfaceProfile } from "./surfaces";
import { resolveLayout } from "./resolver";
import { renderLayoutToDOM } from "./render-dom";

/**
 * App.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * This is UI chrome only — the surface picker, the inspector panel, the
 * page shell. It does NOT decide layout. It calls resolveLayout() (pure TS,
 * resolver.ts) and hands the result straight to renderLayoutToDOM() (plain
 * DOM writes, render-dom.ts) via a ref. React never touches box coordinates.
 */

const MAX_PREVIEW_WIDTH = 620;
const MAX_PREVIEW_HEIGHT = 460;

export default function App() {
  const [activeId, setActiveId] = useState<string>(surfaces[0].id);
  const stageRef = useRef<HTMLDivElement>(null);
  const [droppedIds, setDroppedIds] = useState<string[]>([]);

  const activeSurface: SurfaceProfile = useMemo(
    () => surfaces.find((s) => s.id === activeId) ?? surfaces[0],
    [activeId]
  );

  const layout = useMemo(() => resolveLayout(productAd, activeSurface), [activeSurface]);

  useEffect(() => {
    if (!stageRef.current) return;
    const scale = Math.min(
      MAX_PREVIEW_WIDTH / layout.surfaceWidth,
      MAX_PREVIEW_HEIGHT / layout.surfaceHeight,
      1
    );
    const { droppedIds } = renderLayoutToDOM(stageRef.current, layout, { scale });
    setDroppedIds(droppedIds);
  }, [layout]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="eyebrow-row">
          <span className="dot" />
          <span className="header-kicker">layout engine / live demo</span>
        </div>
        <h1>One ad spec. Five surfaces. Zero per-surface layouts.</h1>
        <p className="header-sub">
          The product ad below is defined exactly once — five elements, each with a role and a
          priority. Switch surfaces and watch the same resolver recompute a structurally
          different arrangement for each one, dropping or shrinking elements by priority when a
          surface can't fit everything.
        </p>
      </header>

      <div className="surface-picker">
        {surfaces.map((s) => (
          <button
            key={s.id}
            className={`surface-btn ${s.id === activeId ? "active" : ""}`}
            onClick={() => setActiveId(s.id)}
          >
            <span className="surface-btn-label">{s.label}</span>
            <span className="surface-btn-dims">
              {s.width}×{s.height}
            </span>
          </button>
        ))}
      </div>

      <main className="stage">
        <div className="canvas-wrap">
          <div className="surface-frame" ref={stageRef} />
          <div className="canvas-meta">
            <span className="flow-tag">flow: {layout.flow}</span>
            <span className="dims-tag">
              {layout.surfaceWidth}×{layout.surfaceHeight}px
            </span>
          </div>
          {droppedIds.length > 0 && (
            <div className="dropped-list">
              {droppedIds.map((id) => (
                <span key={id} className="dropped-chip">
                  dropped: {id}
                </span>
              ))}
            </div>
          )}
        </div>

        <aside className="inspector">
          <h2>Resolved for “{activeSurface.label}”</h2>

          <dl className="constraint-list">
            <div>
              <dt>Composition strategy</dt>
              <dd>{layout.flow}</dd>
            </div>
            <div>
              <dt>Hard constraints</dt>
              <dd>
                {activeSurface.touchOnly && `min tap target ${activeSurface.minTapTarget}px`}
                {activeSurface.touchOnly && activeSurface.viewingDistance === "far" && " · "}
                {activeSurface.viewingDistance === "far" &&
                  `min text size ${activeSurface.minTextSize}px (far viewing)`}
                {!activeSurface.touchOnly && activeSurface.viewingDistance !== "far" && "none"}
              </dd>
            </div>
            <div>
              <dt>Elements kept</dt>
              <dd>{layout.boxes.filter((b) => !b.dropped).length} / 5</dd>
            </div>
          </dl>

          {layout.warnings.length > 0 ? (
            <div className="warnings">
              {layout.warnings.map((w, i) => (
                <p key={i} className="warning-line">
                  ⚠ {w}
                </p>
              ))}
            </div>
          ) : (
            <p className="all-fit">All five elements fit at full priority — no degradation needed.</p>
          )}

          <div className="spec-block">
            <h3>The spec (defined once)</h3>
            <pre>{`defineAd({
  elements: [
    { id: "headline",       role: "primary",   priority: 1 },
    { id: "product-image",  role: "hero",       priority: 1 },
    { id: "price",          role: "secondary",  priority: 2 },
    { id: "cta",            role: "action",     priority: 2 },
    { id: "logo",           role: "branding",   priority: 3 },
  ],
});`}</pre>
          </div>
        </aside>
      </main>
    </div>
  );
}
