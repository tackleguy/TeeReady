/** Top-down fairway dispersion plot for driving range sessions. */

import { useEffect, useRef } from 'react';
import type { RangeLanding } from '../../lib/range';

type Props = {
  landings: RangeLanding[];
  /** Highlight the most recent shot. */
  highlightId?: string | null;
  className?: string;
};

const YARD_LINES = [50, 100, 150, 200, 250, 300];

function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  landings: RangeLanding[],
  highlightId: string | null | undefined,
): void {
  const pad = { top: 28, right: 16, bottom: 36, left: 44 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const maxCarry = Math.max(200, ...landings.map((l) => l.carryYd), 250);
  const maxLat = Math.max(25, ...landings.map((l) => Math.abs(l.lateralYd)), 20);

  const toX = (lat: number) => pad.left + plotW / 2 + (lat / maxLat) * (plotW * 0.42);
  const toY = (carry: number) => pad.top + plotH - (carry / maxCarry) * plotH;

  ctx.clearRect(0, 0, w, h);

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#e8f0ea');
  sky.addColorStop(1, '#d4e8d0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Fairway
  const fwLeft = pad.left + plotW * 0.08;
  const fwRight = pad.left + plotW * 0.92;
  ctx.fillStyle = '#3d7a45';
  ctx.beginPath();
  ctx.moveTo(fwLeft, pad.top);
  ctx.lineTo(fwRight, pad.top);
  ctx.lineTo(fwRight + plotW * 0.04, pad.top + plotH);
  ctx.lineTo(fwLeft - plotW * 0.04, pad.top + plotH);
  ctx.closePath();
  ctx.fill();

  // Rough edges
  ctx.fillStyle = '#2d5c34';
  ctx.globalAlpha = 0.35;
  ctx.fillRect(pad.left, pad.top, fwLeft - pad.left, plotH);
  ctx.fillRect(fwRight, pad.top, pad.left + plotW - fwRight, plotH);
  ctx.globalAlpha = 1;

  // Target line
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(toX(0), pad.top);
  ctx.lineTo(toX(0), pad.top + plotH);
  ctx.stroke();
  ctx.setLineDash([]);

  // Yard markers
  ctx.font = '600 10px ui-monospace, monospace';
  ctx.textAlign = 'right';
  for (const yd of YARD_LINES) {
    if (yd > maxCarry) continue;
    const y = toY(yd);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`${yd}`, pad.left - 6, y + 3);
  }

  // Tee box
  ctx.fillStyle = '#c9b896';
  const teeY = pad.top + plotH - 4;
  ctx.fillRect(toX(-8), teeY, toX(8) - toX(-8), 6);

  // Shots
  landings.forEach((l, i) => {
    const x = toX(l.lateralYd);
    const y = toY(l.carryYd);
    const isHighlight = l.launchId === highlightId;
    const isLast = i === landings.length - 1;
    const r = isHighlight || isLast ? 7 : 5;

    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = isHighlight || isLast ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = isHighlight || isLast ? '#f59e0b' : '#2563eb';
    ctx.fill();
  });

  // Axis labels
  ctx.fillStyle = '#1a3d22';
  ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Target line', toX(0), h - 8);
  ctx.textAlign = 'left';
  ctx.fillText('Tee', pad.left, h - 8);
}

export function RangeDispersionCanvas({ landings, highlightId, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(280, Math.floor(rect.width));
      const h = Math.max(220, Math.floor(w * 0.72));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx, w, h, landings, highlightId);
    });

    ro.observe(wrap);
    return () => ro.disconnect();
  }, [landings, highlightId]);

  return (
    <div ref={wrapRef} className={className}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Dispersion plot with ${landings.length} shot${landings.length === 1 ? '' : 's'}`}
        className="w-full rounded-xl"
      />
    </div>
  );
}
