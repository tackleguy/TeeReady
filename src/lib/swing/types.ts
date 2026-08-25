/** Swing analysis types — geometry measured on-device; no LLM numbers. */

export type CameraAngle = 'face-on' | 'dtl';

export type Handedness = 'right' | 'left';

export type MetricConfidence = 'high' | 'low';

export type SwingMetric = {
  id: string;
  label: string;
  value: number;
  unit: string;
  confidence: MetricConfidence;
  /** Minimum capture fps for a trustworthy reading. */
  validAtFps: number;
  angle: CameraAngle;
};

export type LandmarkPoint = {
  x: number;
  y: number;
  z: number;
  visibility: number;
};

export type PoseFrame = {
  /** Seconds from video start. */
  t: number;
  landmarks: LandmarkPoint[];
  /** Mean visibility of body landmarks used for quality. */
  meanVisibility: number;
};

export type KeyPositions = {
  p1: number;
  p4: number;
  p7: number;
  p10: number;
};

export type CaptureQuality =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'too-dark'
        | 'too-far'
        | 'obstructed'
        | 'out-of-frame'
        | 'flicker'
        | 'too-short'
        | 'no-pose';
      message: string;
    };

export type KeyframeImages = {
  p1: string;
  p4: string;
  p7: string;
  p10: string;
};

export type SwingAnalysis = {
  id: string;
  createdAt: number;
  angle: CameraAngle;
  handedness: Handedness;
  /** Actual capture / sample frame rate. */
  fps: number;
  positions: KeyPositions;
  metrics: SwingMetric[];
  summary: string;
  /** Landmark series — analysis artifact (not the video). */
  frames: PoseFrame[];
  /** Pose skeleton overlays for the four key positions. */
  keyframes: KeyframeImages;
};

export type SwingReject = {
  rejected: true;
  quality: Extract<CaptureQuality, { ok: false }>;
  fps: number;
  angle: CameraAngle;
};

export type SwingResult = SwingAnalysis | SwingReject;

export function isSwingAnalysis(r: SwingResult): r is SwingAnalysis {
  return !('rejected' in r && r.rejected);
}
