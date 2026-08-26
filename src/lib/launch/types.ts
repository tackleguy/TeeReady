/** Launch monitor types — deterministic measurements only. */

export type CameraAngle = 'face-on' | 'dtl' | 'corner';

export type LaunchConfidence = 'uncalibrated';

export type LaunchMetric = {
  id: string;
  label: string;
  value: number;
  unit: string;
  confidence: LaunchConfidence;
  validForAngle: CameraAngle;
  assumptions: string[];
};

export type TrackPoint = {
  /** Seconds from clip start. */
  t: number;
  /** Frame index in sampled series. */
  frameIndex: number;
  /** Normalized 0–1 image coords. */
  x: number;
  y: number;
  /** Pixel coords for overlay. */
  px: number;
  py: number;
};

export type ScaleCalibration = {
  mmPerPixel: number;
  ballPixelDiameter: number;
  confidence: LaunchConfidence;
  assumptions: string[];
};

export type LaunchAnalysisTier = 'swing-only' | 'launch-monitor' | 'high-precision';

export type LaunchRejectReason =
  | 'too-short'
  | 'too-few-frames'
  | 'no-track'
  | 'low-fps'
  | 'setup';

export type LaunchReject = {
  ok: false;
  reason: LaunchRejectReason;
  message: string;
};

export type LaunchAnalysis = {
  ok: true;
  id: string;
  createdAt: number;
  angle: CameraAngle;
  fps: number;
  tier: LaunchAnalysisTier;
  impactFrameIndex: number;
  impactTime: number;
  track: TrackPoint[];
  scale: ScaleCalibration | null;
  metrics: LaunchMetric[];
  /** Why a metric is missing (id → reason). */
  unavailable: Record<string, string>;
  setupWarnings: string[];
};

export type LaunchResult = LaunchAnalysis | LaunchReject;

export type AnalyzeLaunchProgress = {
  stage: 'fps' | 'track' | 'physics';
  pct: number;
};

export function isLaunchAnalysis(r: LaunchResult): r is LaunchAnalysis {
  return r.ok === true;
}
