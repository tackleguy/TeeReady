/** Launch monitor — upload slow-mo, shot tracer, rough yardage. */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Loader2,
  RotateCcw,
  Target,
  Upload,
  Video,
} from 'lucide-react';
import { TracerOverlay } from '../components/launch/TracerOverlay';
import {
  analyzeLaunchVideo,
  isLaunchAnalysis,
  LM_TIER_MIN_FPS,
  loadLaunchHistory,
  saveLaunchAnalysis,
  type AnalyzeLaunchProgress,
  type CameraAngle,
  type LaunchAnalysis,
  type LaunchMetric,
  type LaunchReject,
} from '../lib/launch';

type Step = 'setup' | 'record' | 'preview' | 'analyzing' | 'results' | 'rejected';

const CHECKLIST = [
  'Record in native Camera app slow-mo (120 or 240 fps).',
  'Face-on for launch angle + carry; down-the-line for line speed only.',
  'Keep the ball in frame at least 1–2 seconds after impact.',
  'Use a white or yellow ball on contrasting turf when possible.',
  'Hold phone steady — motion blur breaks tracking.',
] as const;

function formatMetric(m: LaunchMetric): string {
  if (m.unit === '°') return `${m.value}°`;
  return `${m.value} ${m.unit}`;
}

function MetricRow({ m }: { m: LaunchMetric }) {
  return (
    <div className="border-b border-line px-4 py-3 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">{m.label}</div>
          <p className="mt-0.5 text-[11px] text-amber-700">
            Uncalibrated — for relative comparison only
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {m.validForAngle === 'dtl' ? 'Down-the-line' : 'Face-on'}
          </p>
        </div>
        <div className="shrink-0 text-right text-[15px] font-bold tabular text-brand">
          {formatMetric(m)}
        </div>
      </div>
      {m.assumptions.length > 0 ? (
        <ul className="mt-2 list-disc pl-4 text-[10px] leading-snug text-faint">
          {m.assumptions.slice(0, 3).map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function LaunchView() {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [step, setStep] = useState<Step>('setup');
  const [angle, setAngle] = useState<CameraAngle | 'auto'>('auto');
  const [club, setClub] = useState('driver');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });
  const [progress, setProgress] = useState<AnalyzeLaunchProgress | null>(null);
  const [result, setResult] = useState<LaunchAnalysis | null>(null);
  const [reject, setReject] = useState<LaunchReject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [liveFps, setLiveFps] = useState<number | null>(null);
  const [history, setHistory] = useState<LaunchAnalysis[]>(() => loadLaunchHistory());

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  useEffect(() => {
    const refresh = () => setHistory(loadLaunchHistory());
    window.addEventListener('teeready-launch-history-changed', refresh);
    return () => window.removeEventListener('teeready-launch-history-changed', refresh);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onUpload = useCallback((file: File) => {
    setError(null);
    stopStream();
    setBlob(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    const v = document.createElement('video');
    v.src = url;
    v.onloadedmetadata = () => {
      setVideoSize({ w: v.videoWidth, h: v.videoHeight });
    };
    setStep('preview');
  }, [stopStream]);

  const startCamera = useCallback(async () => {
    setError(null);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          frameRate: { ideal: 240 },
        },
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings() ?? {};
      setLiveFps(typeof settings.frameRate === 'number' ? settings.frameRate : null);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStep('record');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Camera unavailable — use native Camera slow-mo upload instead.',
      );
    }
  }, [stopStream]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported('video/mp4')
      ? 'video/mp4'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
    recorderRef.current = rec;
    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    rec.onstop = () => {
      const b = new Blob(chunksRef.current, { type: mime });
      setBlob(b);
      const url = URL.createObjectURL(b);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      const v = document.createElement('video');
      v.src = url;
      v.onloadedmetadata = () => setVideoSize({ w: v.videoWidth, h: v.videoHeight });
      stopStream();
      setStep('preview');
      setRecording(false);
    };
    rec.start(50);
    setRecording(true);
  }, [stopStream]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
  }, []);

  const runAnalyze = useCallback(async () => {
    if (!blob) return;
    setStep('analyzing');
    setProgress({ stage: 'fps', pct: 0 });
    setResult(null);
    setReject(null);
    setError(null);
    try {
      const out = await analyzeLaunchVideo({
        blob,
        angle,
        club,
        onProgress: setProgress,
      });
      if (isLaunchAnalysis(out)) {
        setResult(out);
        saveLaunchAnalysis(out);
        setStep('results');
      } else {
        setReject(out);
        setStep('rejected');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
      setStep('preview');
    }
  }, [blob, angle, club]);

  const reset = useCallback(() => {
    stopStream();
    setBlob(null);
    setRecording(false);
    setLiveFps(null);
    setResult(null);
    setReject(null);
    setProgress(null);
    setError(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setStep('setup');
  }, [stopStream]);

  return (
    <div className="mx-auto w-full max-w-lg px-5 pb-16 pt-6 md:px-8">
      <header className="mb-6">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
          Practice
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold tracking-[-0.03em] text-ink">
          Launch monitor
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          Upload slow-mo from your Camera app. Shot tracer and rough yardage — measured on-device, never uploaded.
        </p>
      </header>

      {error ? (
        <div className="mb-4 rounded-card border border-bad/30 bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] px-4 py-3 text-[13px] text-ink">
          {error}
        </div>
      ) : null}

      {step === 'setup' ? (
        <div className="space-y-5">
          <section className="rounded-card bg-surface p-4 shadow-card">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
              Before you record
            </p>
            <ul className="mt-3 space-y-2">
              {CHECKLIST.map((item) => (
                <li key={item} className="flex gap-2 text-[13px] text-ink">
                  <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-card bg-surface p-4 shadow-card">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
              Camera angle
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ['auto', 'Auto-detect'],
                  ['face-on', 'Face-on'],
                  ['dtl', 'Down-the-line'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAngle(v)}
                  className={`rounded-xl border px-3 py-2 text-[12px] font-semibold ${
                    angle === v
                      ? 'border-brand bg-brand-soft text-brand'
                      : 'border-line text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-card bg-surface p-4 shadow-card">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
              Club (spin assumption)
            </p>
            <select
              value={club}
              onChange={(e) => setClub(e.target.value)}
              className="mt-3 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[13px] text-ink"
            >
              {['driver', '3-wood', '5-wood', 'hybrid', '4-iron', '7-iron', 'wedge'].map(
                (c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ),
              )}
            </select>
            <p className="mt-2 text-[11px] text-muted">
              Spin is not measurable — carry uses typical spin for this club.
            </p>
          </section>

          <button
            type="button"
            onClick={() => void startCamera()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[14px] font-semibold text-ink shadow-card"
          >
            <Camera className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            Live camera (browser fps may cap below slow-mo)
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-[14px] font-bold text-white"
          >
            <Upload className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            Upload slow-mo clip
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            aria-label="Upload launch monitor video"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
            }}
          />

          {history.length > 0 ? (
            <section className="pt-2">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                Saved locally
              </p>
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card">
                {history.slice(0, 5).map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-canvas/60"
                      onClick={() => {
                        setResult(h);
                        setStep('results');
                      }}
                    >
                      <div>
                        <div className="text-[13px] font-semibold text-ink">
                          {h.angle === 'dtl' ? 'Down-the-line' : 'Face-on'} · ~
                          {Math.round(h.fps)} fps
                        </div>
                        <div className="text-[11px] text-muted">
                          {new Date(h.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <span className="text-[12px] font-medium text-brand">View</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {step === 'record' ? (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-card bg-black shadow-card aspect-[3/4]">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white">
              {liveFps != null ? `${Math.round(liveFps)} fps negotiated` : 'fps…'}
            </div>
          </div>
          <div className="flex gap-2 rounded-card border border-amber-500/40 bg-[color-mix(in_srgb,#f59e0b_12%,transparent)] px-3 py-2.5 text-[12px] text-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <p>
              For best results use native Camera slow-mo upload. Browser capture often caps at 60 fps.
            </p>
          </div>
          <div className="flex gap-2">
            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-[14px] font-bold text-white"
              >
                <Video className="h-4 w-4" aria-hidden="true" />
                Record shot
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-bad px-4 py-3 text-[14px] font-bold text-white"
              >
                Stop
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-line bg-surface px-4 py-3 text-[13px] font-semibold text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {step === 'preview' && previewUrl ? (
        <div className="space-y-4">
          <video
            src={previewUrl}
            controls
            playsInline
            className="w-full rounded-card bg-black shadow-card"
          />
          <p className="text-[12px] text-muted">
            Fps is measured during analysis — not from file metadata.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runAnalyze()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-[14px] font-bold text-white"
            >
              Analyse on device
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] font-semibold text-ink"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              New clip
            </button>
          </div>
        </div>
      ) : null}

      {step === 'analyzing' ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden="true" />
          <p className="text-[15px] font-semibold text-ink">
            {progress?.stage === 'fps'
              ? 'Measuring frame rate…'
              : progress?.stage === 'track'
                ? 'Tracking ball flight…'
                : 'Computing yardage…'}
          </p>
          <div className="h-2 w-48 overflow-hidden rounded-full bg-brand-soft">
            <div
              className="h-full bg-brand transition-all"
              style={{ width: `${Math.round(progress?.pct ?? 0)}%` }}
            />
          </div>
          <p className="text-[12px] text-muted">Stays on this device — nothing is uploaded.</p>
        </div>
      ) : null}

      {step === 'rejected' && reject ? (
        <div className="space-y-4">
          <div className="rounded-card border border-bad/30 bg-surface p-5 shadow-card">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-bad">
              Clip rejected
            </p>
            <p className="mt-2 text-[14px] text-muted">{reject.message}</p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-xl bg-brand px-4 py-3 text-[14px] font-bold text-white"
          >
            Try again
          </button>
        </div>
      ) : null}

      {step === 'results' && result && previewUrl ? (
        <div className="space-y-5">
          <TracerOverlay
            videoUrl={previewUrl}
            track={result.track}
            videoWidth={videoSize.w || 1280}
            videoHeight={videoSize.h || 720}
          />

          <div className="rounded-card border border-amber-500/40 bg-[color-mix(in_srgb,#f59e0b_8%,transparent)] px-4 py-3">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <div className="text-[12px] text-ink">
                <p className="font-semibold">Uncalibrated — for relative comparison only</p>
                <p className="mt-1 text-muted">
                  Not validated against TrackMan. Spin: not measurable. Compare today vs yesterday, not vs a launch monitor.
                </p>
              </div>
            </div>
          </div>

          {result.fps < LM_TIER_MIN_FPS ? (
            <div className="rounded-card border border-amber-500/40 bg-surface px-4 py-3 text-[12px] text-ink">
              Measured ~{Math.round(result.fps)} fps — below {LM_TIER_MIN_FPS} launch-monitor tier. Tracer may work; numbers are less reliable.
            </div>
          ) : null}

          {result.setupWarnings.map((w) => (
            <p key={w} className="text-[12px] text-muted">
              {w}
            </p>
          ))}

          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            <div className="border-b border-line px-4 py-3">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                Metrics
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                ~{Math.round(result.fps)} fps · {result.tier.replace('-', ' ')} ·{' '}
                {result.angle === 'dtl' ? 'down-the-line' : 'face-on'}
              </p>
            </div>
            {result.metrics.length > 0 ? (
              result.metrics.map((m) => <MetricRow key={m.id} m={m} />)
            ) : (
              <p className="px-4 py-3 text-[13px] text-muted">No numeric metrics for this clip.</p>
            )}
            {Object.entries(result.unavailable).map(([id, reason]) => (
              <div key={id} className="border-t border-line px-4 py-2.5">
                <p className="text-[12px] font-medium capitalize text-faint">
                  {id.replace(/_/g, ' ')}
                </p>
                <p className="text-[12px] text-muted">{reason}</p>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={reset}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-[14px] font-semibold text-ink shadow-card"
          >
            New shot
          </button>
        </div>
      ) : null}

      {step === 'results' && result && !previewUrl ? (
        <div className="space-y-4">
          <p className="text-[14px] text-muted">
            Loaded from history — re-upload the clip to replay tracer.
          </p>
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            {result.metrics.map((m) => (
              <MetricRow key={m.id} m={m} />
            ))}
          </div>
          <button type="button" onClick={reset} className="w-full rounded-xl bg-brand px-4 py-3 text-[14px] font-bold text-white">
            New shot
          </button>
        </div>
      ) : null}
    </div>
  );
}
