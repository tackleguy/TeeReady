import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { X } from 'lucide-react';

export type PanelAnchor = {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
};

type Pos = { x: number; y: number };
type Size = { width: number; height: number };
type PanelLayout = Pos & Partial<Size>;

const LAYOUT_KEY = 'teeready-panel-layout-v2';
const LEGACY_POS_KEY = 'teeready-panel-pos-v1';

function loadAllLayouts(): Record<string, PanelLayout> {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, PanelLayout>;
      if (parsed && typeof parsed === 'object') return parsed;
    }
    const legacy = localStorage.getItem(LEGACY_POS_KEY);
    if (!legacy) return {};
    const old = JSON.parse(legacy) as Record<string, Pos>;
    const migrated: Record<string, PanelLayout> = {};
    for (const [id, p] of Object.entries(old)) {
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        migrated[id] = { x: p.x, y: p.y };
      }
    }
    return migrated;
  } catch {
    return {};
  }
}

function saveLayout(id: string, layout: PanelLayout) {
  try {
    const all = loadAllLayouts();
    all[id] = layout;
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(all));
    try {
      const legacy = localStorage.getItem(LEGACY_POS_KEY);
      if (legacy) {
        const old = JSON.parse(legacy) as Record<string, Pos>;
        delete old[id];
        localStorage.setItem(LEGACY_POS_KEY, JSON.stringify(old));
      }
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

export function clearPanelPositions() {
  try {
    localStorage.removeItem(LAYOUT_KEY);
    localStorage.removeItem(LEGACY_POS_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event('teeready-panels-reset'));
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function resolveAnchor(
  anchor: PanelAnchor,
  parentW: number,
  parentH: number,
  elW: number,
  elH: number,
): Pos {
  let x = 12;
  let y = 12;
  if (anchor.left != null) x = anchor.left;
  else if (anchor.right != null) x = parentW - elW - anchor.right;
  if (anchor.top != null) y = anchor.top;
  else if (anchor.bottom != null) y = parentH - elH - anchor.bottom;
  return {
    x: clamp(x, 0, Math.max(0, parentW - elW)),
    y: clamp(y, 0, Math.max(0, parentH - elH)),
  };
}

type ResizeEdge = 'se' | 'e' | 's';

interface Props {
  id: string;
  defaultAnchor: PanelAnchor;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  showHandle?: boolean;
  /** Mac-style title bar label. */
  title?: string;
  onClose?: () => void;
  zIndex?: number;
  resizable?: boolean;
  defaultSize?: Size;
  minSize?: Size;
  maxSize?: Size;
}

export function DraggableBox({
  id,
  defaultAnchor,
  children,
  className = '',
  style,
  showHandle = true,
  title,
  onClose,
  zIndex = 20,
  resizable = false,
  defaultSize,
  minSize = { width: 160, height: 88 },
  maxSize = { width: 520, height: 480 },
}: Props) {
  const saved = loadAllLayouts()[id];
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(
    saved ? { x: saved.x, y: saved.y } : null,
  );
  const [size, setSize] = useState<Size | null>(() => {
    if (saved?.width && saved?.height) {
      return { width: saved.width, height: saved.height };
    }
    return defaultSize ?? null;
  });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{
    ox: number;
    oy: number;
    startX: number;
    startY: number;
  } | null>(null);
  const resizeRef = useRef<{
    edge: ResizeEdge;
    startX: number;
    startY: number;
    ow: number;
    oh: number;
    ox: number;
    oy: number;
  } | null>(null);

  const persist = useCallback(
    (p: Pos, s: Size | null) => {
      saveLayout(id, {
        x: p.x,
        y: p.y,
        ...(s ? { width: s.width, height: s.height } : {}),
      });
    },
    [id],
  );

  const placeDefault = useCallback(() => {
    const el = rootRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const w = size?.width ?? el.offsetWidth;
    const h = size?.height ?? el.offsetHeight;
    const next = resolveAnchor(
      defaultAnchor,
      parent.clientWidth,
      parent.clientHeight,
      w,
      h,
    );
    setPos(next);
  }, [defaultAnchor, size]);

  useLayoutEffect(() => {
    if (pos) return;
    placeDefault();
  }, [pos, placeDefault]);

  useEffect(() => {
    const onReset = () => {
      try {
        const all = loadAllLayouts();
        delete all[id];
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(all));
      } catch {
        // ignore
      }
      setPos(null);
      setSize(defaultSize ?? null);
    };
    window.addEventListener('teeready-panels-reset', onReset);
    return () => window.removeEventListener('teeready-panels-reset', onReset);
  }, [id, defaultSize]);

  useEffect(() => {
    const onResize = () => {
      const el = rootRef.current;
      const parent = el?.offsetParent as HTMLElement | null;
      if (!el || !parent || !pos) return;
      const w = size?.width ?? el.offsetWidth;
      const h = size?.height ?? el.offsetHeight;
      setPos({
        x: clamp(pos.x, 0, Math.max(0, parent.clientWidth - w)),
        y: clamp(pos.y, 0, Math.max(0, parent.clientHeight - h)),
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pos, size]);

  const onTitlePointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const el = rootRef.current;
    if (!el || !pos) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      ox: pos.x,
      oy: pos.y,
      startX: e.clientX,
      startY: e.clientY,
    };
    setDragging(true);
  };

  const onDragPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    const el = rootRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!drag || !el || !parent) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const w = size?.width ?? el.offsetWidth;
    const h = size?.height ?? el.offsetHeight;
    setPos({
      x: clamp(drag.ox + dx, 0, Math.max(0, parent.clientWidth - w)),
      y: clamp(drag.oy + dy, 0, Math.max(0, parent.clientHeight - h)),
    });
  };

  const endDrag = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
    setDragging(false);
    setPos((current) => {
      if (current) persist(current, size);
      return current;
    });
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onResizePointerDown = (edge: ResizeEdge, e: ReactPointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const el = rootRef.current;
    if (!el || !pos || !size) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = {
      edge,
      startX: e.clientX,
      startY: e.clientY,
      ow: size.width,
      oh: size.height,
      ox: pos.x,
      oy: pos.y,
    };
    setResizing(true);
  };

  const onResizePointerMove = (e: ReactPointerEvent) => {
    const resize = resizeRef.current;
    const el = rootRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!resize || !el || !parent) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - resize.startX;
    const dy = e.clientY - resize.startY;
    let w = resize.ow;
    let h = resize.oh;
    if (resize.edge === 'se' || resize.edge === 'e') {
      w = clamp(resize.ow + dx, minSize.width, maxSize.width);
    }
    if (resize.edge === 'se' || resize.edge === 's') {
      h = clamp(resize.oh + dy, minSize.height, maxSize.height);
    }
    const nextSize = { width: w, height: h };
    setSize(nextSize);
    setPos({
      x: clamp(resize.ox, 0, Math.max(0, parent.clientWidth - w)),
      y: clamp(resize.oy, 0, Math.max(0, parent.clientHeight - h)),
    });
  };

  const endResize = (e: ReactPointerEvent) => {
    if (!resizeRef.current) return;
    e.stopPropagation();
    resizeRef.current = null;
    setResizing(false);
    setPos((current) => {
      if (current) persist(current, size);
      return current;
    });
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const boxWidth = size?.width ?? style?.width;
  const boxHeight = size?.height ?? style?.height;

  return (
    <div
      ref={rootRef}
      className={`pointer-events-auto absolute flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-lift ${className}`}
      style={{
        ...style,
        width: boxWidth,
        height: resizable ? boxHeight : style?.height,
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        zIndex,
        visibility: pos ? 'visible' : 'hidden',
        touchAction: 'manipulation',
      }}
      data-draggable-id={id}
    >
      {showHandle ? (
        <div
          className={`flex shrink-0 items-center border-b border-line bg-canvas text-[11px] ${
            dragging ? 'cursor-grabbing' : ''
          }`}
        >
          <div
            className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-2 px-2.5 py-1.5 active:cursor-grabbing"
            onPointerDown={onTitlePointerDown}
            onPointerMove={onDragPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={(e) => {
              e.stopPropagation();
              try {
                const all = loadAllLayouts();
                delete all[id];
                localStorage.setItem(LAYOUT_KEY, JSON.stringify(all));
              } catch {
                // ignore
              }
              setPos(null);
              setSize(defaultSize ?? null);
            }}
            title="Drag to move · double-click to reset size & position"
          >
            <span className="truncate font-semibold text-ink">
              {title ?? 'Panel'}
            </span>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="shrink-0 px-2 py-1.5 text-muted hover:text-ink"
              aria-label="Close panel"
              title="Close"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {children}
      </div>
      {resizable && size ? (
        <>
          <div
            className="absolute bottom-0 left-2 right-2 h-2 cursor-s-resize"
            onPointerDown={(e) => onResizePointerDown('s', e)}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            aria-hidden
          />
          <div
            className="absolute bottom-2 right-0 top-8 w-2 cursor-e-resize"
            onPointerDown={(e) => onResizePointerDown('e', e)}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            aria-hidden
          />
          <div
            className="absolute bottom-0 right-0 z-10 flex h-4 w-4 cursor-se-resize items-end justify-end p-0.5"
            onPointerDown={(e) => onResizePointerDown('se', e)}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            title="Resize"
            aria-label="Resize"
          >
            <svg
              viewBox="0 0 8 8"
              className="h-2.5 w-2.5 text-faint"
              aria-hidden
            >
              <path
                d="M7 1v6H1M7 3v4H3M7 5v2H5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
          </div>
        </>
      ) : null}
      {resizing ? (
        <div
          className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-brand/40"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
