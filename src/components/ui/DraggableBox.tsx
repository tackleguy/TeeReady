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
import { GripHorizontal } from 'lucide-react';

export type PanelAnchor = {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
};

type Pos = { x: number; y: number };

const STORAGE_KEY = 'teeready-panel-pos-v1';

function loadAll(): Record<string, Pos> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Pos>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function savePos(id: string, pos: Pos) {
  try {
    const all = loadAll();
    all[id] = pos;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function clearPanelPositions() {
  try {
    localStorage.removeItem(STORAGE_KEY);
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

interface Props {
  id: string;
  /** Default placement before the user moves the box. */
  defaultAnchor: PanelAnchor;
  children: ReactNode;
  className?: string;
  /** Extra style on the outer shell (e.g. width). */
  style?: CSSProperties;
  /** Hide the grip when false. */
  showHandle?: boolean;
  zIndex?: number;
}

export function DraggableBox({
  id,
  defaultAnchor,
  children,
  className = '',
  style,
  showHandle = true,
  zIndex = 20,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(() => loadAll()[id] ?? null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    ox: number;
    oy: number;
    startX: number;
    startY: number;
  } | null>(null);

  const placeDefault = useCallback(() => {
    const el = rootRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const next = resolveAnchor(
      defaultAnchor,
      parent.clientWidth,
      parent.clientHeight,
      el.offsetWidth,
      el.offsetHeight,
    );
    setPos(next);
  }, [defaultAnchor]);

  useLayoutEffect(() => {
    if (pos) return;
    placeDefault();
  }, [pos, placeDefault]);

  useEffect(() => {
    const onReset = () => {
      try {
        const all = loadAll();
        delete all[id];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      } catch {
        // ignore
      }
      setPos(null);
    };
    window.addEventListener('teeready-panels-reset', onReset);
    return () => window.removeEventListener('teeready-panels-reset', onReset);
  }, [id]);

  useEffect(() => {
    const onResize = () => {
      const el = rootRef.current;
      const parent = el?.offsetParent as HTMLElement | null;
      if (!el || !parent || !pos) return;
      setPos({
        x: clamp(pos.x, 0, Math.max(0, parent.clientWidth - el.offsetWidth)),
        y: clamp(pos.y, 0, Math.max(0, parent.clientHeight - el.offsetHeight)),
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pos]);

  const onPointerDown = (e: ReactPointerEvent) => {
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

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    const el = rootRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!drag || !el || !parent) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setPos({
      x: clamp(
        drag.ox + dx,
        0,
        Math.max(0, parent.clientWidth - el.offsetWidth),
      ),
      y: clamp(
        drag.oy + dy,
        0,
        Math.max(0, parent.clientHeight - el.offsetHeight),
      ),
    });
  };

  const endDrag = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
    setDragging(false);
    setPos((current) => {
      if (current) savePos(id, current);
      return current;
    });
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div
      ref={rootRef}
      className={`pointer-events-auto absolute overflow-hidden rounded-card shadow-lift ${className}`}
      style={{
        ...style,
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        zIndex,
        visibility: pos ? 'visible' : 'hidden',
        touchAction: 'none',
      }}
      data-draggable-id={id}
    >
      {showHandle ? (
        <div
          className={`flex cursor-grab items-center justify-center gap-1 border-b border-[var(--line-subtle)] bg-[var(--hud-card,var(--surface))] px-2 py-1 text-[var(--ink-4)] active:cursor-grabbing ${
            dragging ? 'cursor-grabbing' : ''
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={(e) => {
            e.stopPropagation();
            try {
              const all = loadAll();
              delete all[id];
              localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
            } catch {
              // ignore
            }
            setPos(null);
          }}
          title="Drag to move · double-click to reset"
        >
          <GripHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em]">
            Move
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
