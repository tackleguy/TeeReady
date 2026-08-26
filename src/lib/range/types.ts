/** Driving range session types — built on launch monitor shots. */

export type RangeSession = {
  id: string;
  createdAt: number;
  endedAt?: number;
  club: string;
  /** LaunchAnalysis ids in order added. */
  shotIds: string[];
};

export type RangeLanding = {
  launchId: string;
  createdAt: number;
  carryYd: number;
  totalYd: number | null;
  directionDeg: number | null;
  /** Lateral offset from target line (yards). Positive = right. */
  lateralYd: number;
  downrangeYd: number;
};

export type RangeSessionStats = {
  shotCount: number;
  avgCarryYd: number | null;
  avgLateralYd: number | null;
  lateralSpreadYd: number | null;
  carrySpreadYd: number | null;
  avgDirectionDeg: number | null;
};

/** Axis-aligned dispersion band (~1σ) for canvas overlay. */
export type DispersionBand = {
  centerLateralYd: number;
  centerCarryYd: number;
  semiAxisLatYd: number;
  semiAxisCarryYd: number;
};
