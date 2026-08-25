/** Build a labelled 2×2 contact sheet from key-position frames. */

import type { KeyframeImages } from '../types';

const LABELS = {
  p1: 'P1 Address',
  p4: 'P4 Top',
  p7: 'P7 Impact',
  p10: 'P10 Finish',
} as const;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('Missing keyframe image'));
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load keyframe'));
    img.src = src;
  });
}

/**
 * Composite the four keyframes into one JPEG data URL for a single vision prompt.
 */
export async function buildContactSheet(
  keyframes: KeyframeImages,
  opts?: { cellWidth?: number; cellHeight?: number },
): Promise<string> {
  const cellW = opts?.cellWidth ?? 480;
  const cellH = opts?.cellHeight ?? 360;
  const gap = 8;
  const labelH = 28;
  const canvas = document.createElement('canvas');
  canvas.width = cellW * 2 + gap * 3;
  canvas.height = cellH * 2 + gap * 3 + labelH * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.fillStyle = '#0f1412';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const order = [
    { key: 'p1' as const, col: 0, row: 0 },
    { key: 'p4' as const, col: 1, row: 0 },
    { key: 'p7' as const, col: 0, row: 1 },
    { key: 'p10' as const, col: 1, row: 1 },
  ];

  for (const { key, col, row } of order) {
    const x = gap + col * (cellW + gap);
    const y = gap + row * (cellH + labelH + gap);
    ctx.fillStyle = '#1a221e';
    ctx.fillRect(x, y, cellW, cellH + labelH);

    ctx.fillStyle = '#e8efe9';
    ctx.font = 'bold 14px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(LABELS[key], x + 10, y + 18);

    try {
      const img = await loadImage(keyframes[key]);
      const boxY = y + labelH;
      const scale = Math.min(cellW / img.width, cellH / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = x + (cellW - dw) / 2;
      const dy = boxY + (cellH - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    } catch {
      ctx.fillStyle = '#6b7c72';
      ctx.fillText('(no frame)', x + 10, y + labelH + 24);
    }
  }

  return canvas.toDataURL('image/jpeg', 0.82);
}
