/** Draw pose skeleton overlays for key-position frames. */

import type { LandmarkPoint, PoseFrame } from './types';

type PoseConnection = { start: number; end: number };

const STROKE = 'rgba(34, 197, 94, 0.95)';
const JOINT = 'rgba(250, 250, 250, 0.95)';

export function drawPoseOverlay(
  ctx: CanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  width: number,
  height: number,
  connections: PoseConnection[],
): void {
  ctx.save();
  ctx.lineWidth = Math.max(2, Math.round(width * 0.004));
  ctx.strokeStyle = STROKE;
  ctx.fillStyle = JOINT;
  ctx.lineCap = 'round';

  for (const { start, end } of connections) {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b) continue;
    if ((a.visibility ?? 0) < 0.3 || (b.visibility ?? 0) < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }

  const r = Math.max(2, Math.round(width * 0.006));
  for (const p of landmarks) {
    if ((p.visibility ?? 0) < 0.3) continue;
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function renderKeyframeDataUrl(
  video: HTMLVideoElement,
  frame: PoseFrame,
  label: string,
  connections: PoseConnection[],
): string {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 360;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  video.currentTime = frame.t;
  // Caller should await seek before calling when batching; still draw best-effort.
  ctx.drawImage(video, 0, 0, w, h);
  drawPoseOverlay(ctx, frame.landmarks, w, h, connections);

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(8, 8, Math.min(120, w * 0.3), 28);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.max(12, Math.round(w * 0.03))}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(label, 16, 28);

  return canvas.toDataURL('image/jpeg', 0.72);
}

export async function renderKeyframes(
  video: HTMLVideoElement,
  frames: PoseFrame[],
  indices: { p1: number; p4: number; p7: number; p10: number },
): Promise<{ p1: string; p4: string; p7: string; p10: string }> {
  const { PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const connections = PoseLandmarker.POSE_CONNECTIONS;

  const labels = {
    p1: 'Address',
    p4: 'Top of backswing',
    p7: 'Impact',
    p10: 'Finish',
  } as const;

  const out = { p1: '', p4: '', p7: '', p10: '' };
  for (const key of ['p1', 'p4', 'p7', 'p10'] as const) {
    const frame = frames[indices[key]];
    if (!frame) continue;
    video.currentTime = frame.t;
    await waitSeeked(video);
    out[key] = renderKeyframeDataUrl(video, frame, labels[key], connections);
  }
  return out;
}

function waitSeeked(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    // If already at time and not seeking, resolve on next frame.
    requestAnimationFrame(() => {
      if (!video.seeking) done();
    });
  });
}
