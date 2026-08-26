/** Shot tracer overlay — polyline + fade on video replay. */

import { useEffect, useRef } from 'react';
import type { TrackPoint } from '../../lib/launch';

type Props = {
  videoUrl: string;
  track: TrackPoint[];
  videoWidth: number;
  videoHeight: number;
};

export function TracerOverlay({ videoUrl, track, videoWidth, videoHeight }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || track.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const t = video.currentTime;
      const visible = track.filter((p) => p.t <= t + 0.05);
      if (visible.length < 2) return;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let i = 1; i < visible.length; i++) {
        const alpha = 0.35 + (i / visible.length) * 0.65;
        ctx.strokeStyle = `rgba(34, 197, 94, ${alpha})`;
        ctx.lineWidth = 3 + (i / visible.length) * 2;
        ctx.beginPath();
        ctx.moveTo(
          (visible[i - 1]!.x * w),
          (visible[i - 1]!.y * h),
        );
        ctx.lineTo((visible[i]!.x * w), (visible[i]!.y * h));
        ctx.stroke();
      }

      const last = visible[visible.length - 1]!;
      ctx.fillStyle = 'rgba(34, 197, 94, 0.95)';
      ctx.beginPath();
      ctx.arc(last.x * w, last.y * h, 5, 0, Math.PI * 2);
      ctx.fill();
    };

    video.addEventListener('timeupdate', draw);
    video.addEventListener('seeked', draw);
    draw();

    return () => {
      video.removeEventListener('timeupdate', draw);
      video.removeEventListener('seeked', draw);
    };
  }, [track, videoUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && videoWidth > 0 && videoHeight > 0) {
      canvas.width = videoWidth;
      canvas.height = videoHeight;
    }
  }, [videoWidth, videoHeight]);

  return (
    <div className="relative overflow-hidden rounded-card bg-black shadow-card">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        playsInline
        className="block w-full"
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      />
    </div>
  );
}
