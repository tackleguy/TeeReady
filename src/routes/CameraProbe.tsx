/** DEV-only camera fps capability probe — Phase 0. */

import { useCallback, useRef, useState } from 'react';

type ProbeRow = {
  label: string;
  deviceId: string;
  requested: string;
  negotiated: string;
  delivered: string;
  error?: string;
};

export function CameraProbe() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [rows, setRows] = useState<ProbeRow[]>([]);
  const [running, setRunning] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const measureDeliveredFps = useCallback(
    (video: HTMLVideoElement, seconds = 5): Promise<number> => {
      return new Promise((resolve, reject) => {
        if (typeof video.requestVideoFrameCallback !== 'function') {
          reject(new Error('requestVideoFrameCallback not available'));
          return;
        }
        let ticks = 0;
        const start = performance.now();

        const onFrame = () => {
          ticks++;
          const elapsed = (performance.now() - start) / 1000;
          if (elapsed >= seconds) {
            video.pause();
            resolve(ticks / elapsed);
            return;
          }
          video.requestVideoFrameCallback(onFrame);
        };

        video.currentTime = 0;
        video
          .play()
          .then(() => video.requestVideoFrameCallback(onFrame))
          .catch(reject);
      });
    },
    [],
  );

  const probeConstraints = useCallback(
    async (label: string, constraints: MediaTrackConstraints): Promise<ProbeRow> => {
      stopStream();
      const requested = JSON.stringify(constraints);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: constraints,
        });
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0]!;
        const settings = track.getSettings();
        const negotiated = JSON.stringify({
          frameRate: settings.frameRate,
          width: settings.width,
          height: settings.height,
          facingMode: settings.facingMode,
          deviceId: settings.deviceId,
        });

        const video = videoRef.current;
        if (!video) throw new Error('No video element');
        video.srcObject = stream;
        await video.play();

        const delivered = await measureDeliveredFps(video);
        stopStream();

        return {
          label,
          deviceId: settings.deviceId ?? 'unknown',
          requested,
          negotiated,
          delivered: `${delivered.toFixed(1)} fps`,
        };
      } catch (e) {
        stopStream();
        return {
          label,
          deviceId: '—',
          requested,
          negotiated: '—',
          delivered: '—',
          error: e instanceof Error ? e.message : 'Failed',
        };
      }
    },
    [measureDeliveredFps, stopStream],
  );

  const runAll = useCallback(async () => {
    setRunning(true);
    setRows([]);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter((d) => d.kind === 'videoinput');
      setDevices(cams);

      const results: ProbeRow[] = [];

      for (const mode of ['environment', 'user'] as const) {
        results.push(
          await probeConstraints(`facingMode:${mode}`, {
            facingMode: { ideal: mode },
            frameRate: { ideal: 240 },
            width: { ideal: 1920 },
          }),
        );
      }

      for (const cam of cams) {
        results.push(
          await probeConstraints(cam.label || cam.deviceId.slice(0, 8), {
            deviceId: { exact: cam.deviceId },
            frameRate: { ideal: 240 },
            width: { ideal: 1920 },
          }),
        );
      }

      setRows(results);
    } catch (e) {
      setRows([
        {
          label: 'enumerate',
          deviceId: '—',
          requested: '—',
          negotiated: '—',
          delivered: '—',
          error: e instanceof Error ? e.message : 'Permission denied',
        },
      ]);
    } finally {
      setRunning(false);
    }
  }, [probeConstraints]);

  const copyTable = useCallback(() => {
    const text = rows
      .map(
        (r) =>
          `${r.label}\t${r.deviceId}\t${r.requested}\t${r.negotiated}\t${r.delivered}${r.error ? `\t${r.error}` : ''}`,
      )
      .join('\n');
    void navigator.clipboard.writeText(
      `UA: ${navigator.userAgent}\n\nLabel\tDeviceId\tRequested\tNegotiated\tDelivered\n${text}`,
    );
  }, [rows]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="font-display text-2xl font-bold text-ink">Camera FPS probe</h1>
      <p className="mt-2 text-sm text-muted">
        DEV only. Measures negotiated vs delivered fps via requestVideoFrameCallback over 5s.
      </p>

      <video ref={videoRef} playsInline muted className="mt-4 hidden" />

      <button
        type="button"
        disabled={running}
        onClick={() => void runAll()}
        className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        {running ? 'Probing…' : 'Run probe on all cameras'}
      </button>

      {devices.length > 0 ? (
        <p className="mt-2 text-xs text-muted">{devices.length} video input(s) found</p>
      ) : null}

      {rows.length > 0 ? (
        <>
          <button
            type="button"
            onClick={copyTable}
            className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold"
          >
            Copy results
          </button>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line text-faint">
                  <th className="py-2 pr-2">Camera</th>
                  <th className="py-2 pr-2">Negotiated</th>
                  <th className="py-2 pr-2">Delivered</th>
                  <th className="py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.label}-${r.deviceId}`} className="border-b border-line/50">
                    <td className="py-2 pr-2 font-medium">{r.label}</td>
                    <td className="py-2 pr-2 font-mono text-[10px]">{r.negotiated.slice(0, 80)}</td>
                    <td className="py-2 pr-2 font-bold text-brand">{r.delivered}</td>
                    <td className="py-2 text-bad">{r.error ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted">
            Fork: if delivered ≥120 fps → live capture viable. If ≤60 fps → upload-only path.
          </p>
        </>
      ) : null}
    </div>
  );
}
