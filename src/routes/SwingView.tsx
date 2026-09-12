/** Swing capture, on-device measurement, and optional local vision coaching. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Camera,
  Loader2,
  RotateCcw,
  Upload,
  Video,
} from 'lucide-react';
import {
  analyzeSwingVideo,
  coachSwingAnalysis,
  isSwingAnalysis,
  loadSwingHistory,
  saveSwingAnalysis,
  type AnalyzeProgress,
  type Handedness,
  type SwingAnalysis,
  type SwingCoachResult,
  type SwingMetric,
  type SwingReject,
  SWING_THRESHOLDS,
} from '../lib/swing';
import { swingDelta, swingScorecard } from '../lib/swingScore';

type Step = 'setup' | 'record' | 'preview' | 'analyzing' | 'results' | 'rejected';

function formatMetricValue(m: SwingMetric): string {
  if (m.unit === ':1') return `${m.value}:1`;
  if (m.unit === '°') return `${m.value}°`;
  return `${m.value} ${m.unit}`;
}

function MetricRow({ m, fps }: { m: SwingMetric; fps: number }) {
  const low = m.confidence === 'low' || fps < m.validAtFps;
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-ink">{m.label}</div>
        {low ? (
          <p className="mt-0.5 text-[11px] text-bad">
            Low confidence — needs {m.validAtFps}+ fps (got ~{Math.round(fps)})
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] text-muted">{m.angle === 'dtl' ? 'Down-the-line' : 'Face-on'}</p>
        )}
      </div>
      <div
        className={`shrink-0 text-right text-[15px] font-bold tabular ${
          low ? 'text-muted' : 'text-brand'
        }`}
      >
        {formatMetricValue(m)}
      </div>
    </div>
  );
}

function AlignmentGuide() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute inset-4 rounded-xl border border-dashed border-white/50" />
      <div className="absolute left-1/2 top-6 bottom-6 w-px -translate-x-1/2 bg-white/30" />
      <div className="absolute left-[15%] right-[15%] top-[10%] h-px bg-white/25" />
      <div className="absolute left-[15%] right-[15%] bottom-[12%] h-px bg-white/25" />
      <p className="absolute bottom-6 left-0 right-0 px-4 text-center text-[11px] font-medium leading-snug text-white/90 drop-shadow">
        Any angle works — face-on or down-the-line. Keep your full body in frame for the whole swing.
      </p>
    </div>
  );
}

export function SwingView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [step, setStep] = useState<Step>('setup');
  const [handedness, setHandedness] = useState<Handedness>('right');
  const [fps, setFps] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<AnalyzeProgress | null>(null);
  const [result, setResult] = useState<SwingAnalysis | null>(null);
  const [reject, setReject] = useState<SwingReject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SwingAnalysis[]>(() => loadSwingHistory());
  const [coach, setCoach] = useState<SwingCoachResult | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const coachAbortRef = useRef<AbortController | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    const refresh = () => setHistory(loadSwingHistory());
    window.addEventListener('teeready-swing-history-changed', refresh);
    return () => window.removeEventListener('teeready-swing-history-changed', refresh);
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
      coachAbortRef.current?.abort();
    };
  }, [stopStream]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const startCamera = useCallback(async () => {
    setError(null);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 120 },
        },
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings() ?? {};
      const gotFps = typeof settings.frameRate === 'number' ? settings.frameRate : null;
      setFps(gotFps);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStep('record');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Camera permission denied or unavailable.',
      );
    }
  }, [stopStream]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mime =
      MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : 'video/mp4';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
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
      stopStream();
      setStep('preview');
      setRecording(false);
    };
    rec.start(100);
    setRecording(true);
  }, [stopStream]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const onUpload = useCallback((file: File) => {
    setError(null);
    stopStream();
    const b = file;
    setBlob(b);
    const url = URL.createObjectURL(b);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    // Uploads rarely carry reliable high-fps metadata — assume 30 and warn.
    setFps(30);
    setStep('preview');
  }, [stopStream]);

  const runCoach = useCallback(async (analysis: SwingAnalysis) => {
    coachAbortRef.current?.abort();
    const ac = new AbortController();
    coachAbortRef.current = ac;
    setCoachLoading(true);
    setCoach(null);
    try {
      const out = await coachSwingAnalysis(analysis, { signal: ac.signal });
      if (ac.signal.aborted) return;
      setCoach(out);
      if (out.source === 'llm') {
        const updated: SwingAnalysis = {
          ...analysis,
          coach: {
            text: out.text,
            source: 'llm',
            elapsedMs: out.elapsedMs,
            model: out.model,
          },
        };
        setResult(updated);
        saveSwingAnalysis(updated);
      }
    } catch {
      if (!ac.signal.aborted) {
        setCoach({ text: analysis.summary, source: 'rules' });
      }
    } finally {
      if (!ac.signal.aborted) setCoachLoading(false);
    }
  }, []);

  const runAnalyze = useCallback(async () => {
    if (!blob) return;
    setStep('analyzing');
    setProgress({ stage: 'pose', pct: 0 });
    setResult(null);
    setReject(null);
    setCoach(null);
    setError(null);
    try {
      const out = await analyzeSwingVideo({
        blob,
        handedness,
        fps: fps ?? 30,
        onProgress: setProgress,
      });
      if (isSwingAnalysis(out)) {
        setResult(out);
        setStep('results');
        void runCoach(out);
      } else {
        setReject(out);
        setStep('rejected');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
      setStep('preview');
    }
  }, [blob, handedness, fps, runCoach]);

  const reset = useCallback(() => {
    coachAbortRef.current?.abort();
    stopStream();
    setBlob(null);
    setResult(null);
    setReject(null);
    setProgress(null);
    setError(null);
    setCoach(null);
    setCoachLoading(false);
    setRecording(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setStep('setup');
  }, [stopStream]);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const lowFps = fps != null && fps < SWING_THRESHOLDS.warnBelowFps;
  const card = result ? swingScorecard(result) : null;
  const prevSwing = history.find((h) => h.id !== result?.id);
  const delta = result ? swingDelta(prevSwing, result) : null;

  return (
    <div className="mx-auto w-full max-w-lg px-5 pb-16 pt-6 md:px-8">
      <header className="mb-6">
        <h1 className="font-display text-[28px] font-bold tracking-[-0.03em] text-ink">
          AI Swing
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          Record or upload. Pose is measured on-device — nothing leaves this phone.
        </p>
      </header>

      {error ? (
        <div className="mb-4 rounded-card border border-bad/30 bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] px-4 py-3 text-[13px] text-ink">
          {error}
        </div>
      ) : null}

      {step === 'setup' ? (
        <div className="space-y-5">
          <button
            type="button"
            onClick={() => void startCamera()}
            className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-brand px-4 py-4 text-[17px] font-bold tracking-wide text-white shadow-lift"
          >
            <Camera className="h-5 w-5" strokeWidth={2.2} aria-hidden />
            ANALYZE MY SWING
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void startCamera()}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-3 text-[13px] font-semibold text-ink shadow-card"
            >
              <Video className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              Record
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-3 text-[13px] font-semibold text-ink shadow-card"
            >
              <Upload className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              Upload
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              className="hidden"
              aria-label="Upload swing video"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
            />
          </div>

          <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <p className="text-[12px] font-semibold text-muted">Handedness</p>
            <div className="mt-3 flex gap-2">
              {(['right', 'left'] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHandedness(h)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-[13px] font-semibold capitalize ${
                    handedness === h
                      ? 'border-brand bg-brand-soft text-brand'
                      : 'border-line text-ink'
                  }`}
                >
                  {h}-handed
                </button>
              ))}
            </div>
          </section>

          {history.length > 0 ? (
            <section className="pt-1">
              <p className="text-[12px] font-semibold text-muted">Previous swings</p>
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
                {history.slice(0, 5).map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-canvas/60"
                      onClick={() => {
                        setResult(h);
                        setFps(h.fps);
                        setCoach(
                          h.coach
                            ? {
                                text: h.coach.text,
                                source: h.coach.source,
                                elapsedMs: h.coach.elapsedMs,
                                model: h.coach.model,
                              }
                            : { text: h.summary, source: 'rules' },
                        );
                        setCoachLoading(false);
                        setStep('results');
                      }}
                    >
                      <div>
                        <div className="text-[13px] font-semibold text-ink">
                          {h.angle === 'dtl' ? 'Down-the-line' : 'Face-on'}
                        </div>
                        <div className="text-[11px] text-muted">
                          {new Date(h.createdAt).toLocaleString()} · ~
                          {Math.round(h.fps)} fps
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
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <AlignmentGuide />
            <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white">
              {fps != null ? `${Math.round(fps)} fps` : 'fps…'}
            </div>
          </div>

          {lowFps ? (
            <div className="flex gap-2 rounded-card border border-amber-500/40 bg-[color-mix(in_srgb,#f59e0b_12%,transparent)] px-3 py-2.5 text-[12px] text-ink">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <p>
                Below 30 fps — impact-position metrics will be flagged unreliable.
                Most phones at 30 fps are fine; higher frame rates still help at impact.
              </p>
            </div>
          ) : null}

          <div className="flex gap-2">
            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-[14px] font-bold text-white"
              >
                <Video className="h-4 w-4" aria-hidden="true" />
                Record swing
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
            Camera angle is detected during analysis.
            {fps != null ? ` · ~${Math.round(fps)} fps` : ''}
          </p>
          {lowFps ? (
            <div className="flex gap-2 rounded-card border border-amber-500/40 bg-[color-mix(in_srgb,#f59e0b_12%,transparent)] px-3 py-2.5 text-[12px] text-ink">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <p>
                Impact metrics need 30+ fps. They’ll show as low confidence on this clip.
              </p>
            </div>
          ) : null}
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
              Retake
            </button>
          </div>
        </div>
      ) : null}

      {step === 'analyzing' ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden="true" />
          <p className="text-[15px] font-semibold text-ink">
            {progress?.stage === 'measure' ? 'Measuring your swing…' : 'Estimating pose…'}
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
              Capture rejected
            </p>
            <h2 className="mt-2 text-[18px] font-bold text-ink">Not analysing this clip</h2>
            <p className="mt-2 text-[14px] text-muted">{reject.quality.message}</p>
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

      {step === 'results' && result && card ? (
        <div className="space-y-5">
          <section className="rounded-2xl border border-line bg-surface p-5 text-center shadow-card">
            <p className="text-[12px] font-semibold text-muted">Swing score</p>
            <p className="mt-1 text-[56px] font-bold leading-none tabular tracking-[-0.04em] text-brand">
              {card.score}
              <span className="text-[20px] font-semibold text-muted">/100</span>
            </p>
            {delta != null && delta !== 0 ? (
              <p className="mt-3 text-[14px] font-semibold text-ink">
                {delta > 0 ? '+' : ''}
                {delta} vs previous swing
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <h2 className="text-[15px] font-bold text-ink">Biggest issue</h2>
            <p className="mt-1 text-[18px] font-semibold text-ink">
              {card.biggestIssue}
            </p>
            <h3 className="mt-4 text-[13px] font-semibold text-muted">
              What you&apos;re doing well
            </h3>
            <ul className="mt-2 space-y-1.5">
              {card.doingWell.map((item) => (
                <li key={item} className="text-[14px] text-ink">
                  ✓ {item}
                </li>
              ))}
            </ul>
            <h3 className="mt-4 text-[13px] font-semibold text-muted">Fix this</h3>
            <p className="mt-1 text-[14px] leading-relaxed text-ink">
              {coachLoading
                ? 'Writing your cue…'
                : coach?.text?.split(/[.!\n]/)[0]?.trim() || card.fixThis}
            </p>
          </section>

          <section className="rounded-2xl border border-brand/25 bg-brand-soft p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-brand">
              Practice plan
            </p>
            <p className="mt-2 text-[14px] font-semibold text-ink">
              1 drill — {card.drill}
            </p>
            <p className="mt-2 text-[13px] text-ink">{card.practice}</p>
          </section>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['p1', 'Setup'],
                ['p4', 'Backswing'],
                ['p7', 'Impact'],
                ['p10', 'Finish'],
              ] as const
            ).map(([key, label]) => (
              <div
                key={key}
                className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
              >
                {result.keyframes[key] ? (
                  <img
                    src={result.keyframes[key]}
                    alt={label}
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="grid aspect-video place-items-center text-[12px] text-muted">
                    {label}
                  </div>
                )}
                <p className="px-2 py-1.5 text-center text-[11px] font-semibold text-muted">
                  {label}
                </p>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-[13px] font-semibold text-ink shadow-card"
          >
            {showAdvanced ? 'Hide advanced metrics' : 'Show advanced analysis'}
          </button>

          {showAdvanced ? (
            <>
              <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                <p className="text-[12px] font-semibold text-muted">
                  {coach?.source === 'llm' ? 'Full caddie notes' : 'Full summary'}
                </p>
                {coachLoading ? (
                  <p className="mt-2 flex items-center gap-2 text-[13px] text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Asking local caddie…
                  </p>
                ) : null}
                <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink">
                  {coach?.text ?? result.coach?.text ?? result.summary}
                </p>
                {coach?.notice ? (
                  <p className="mt-3 rounded-xl border border-amber-500/40 bg-[color-mix(in_srgb,#f59e0b_12%,transparent)] px-3 py-2 text-[12px] text-ink">
                    {coach.notice}
                  </p>
                ) : null}
              </div>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
                <div className="border-b border-line px-4 py-3">
                  <p className="text-[12px] font-semibold text-muted">Metrics</p>
                </div>
                {result.metrics.map((m) => (
                  <MetricRow key={m.id} m={m} fps={result.fps} />
                ))}
              </div>
            </>
          ) : null}

          <button
            type="button"
            onClick={reset}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-[14px] font-semibold text-ink shadow-card"
          >
            New swing
          </button>
          <Link
            to={`/swing/guide?analysis=${result.id}`}
            className="flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-[14px] font-bold text-white"
          >
            Open improvement guide
          </Link>
        </div>
      ) : null}
    </div>
  );
}
