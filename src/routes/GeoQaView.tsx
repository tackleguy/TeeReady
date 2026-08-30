import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import summary from '../dev/geo-qa-summary.json';
import {
  appendGeoAuditLog,
  readGeoAuditLog,
  type GeoConfidence,
} from '../lib/geoAccuracy';
import { stashPendingCourse } from '../lib/pendingCourse';
import { holePackEntryToSummary } from '../lib/workingCourses';

type QueueRow = {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  holeCount: number;
  confidence: GeoConfidence;
  issues: Array<{ code: string; detail: string }>;
};

type Summary = {
  builtAt?: string;
  packCount: number;
  fabricatedTeeHoles: number;
  confidence: Record<GeoConfidence, number>;
  issueCounts: Record<string, number>;
  duplicateFlags: Array<{ code: string; detail: string }>;
  needsQueue: QueueRow[];
};

const data = summary as Summary;

/**
 * Internal geo QA — visit /dev/geo-qa (dev only, not in nav).
 */
export function GeoQaView() {
  const [confidence, setConfidence] = useState<string>('all');
  const [issue, setIssue] = useState('all');
  const [who, setWho] = useState('qa');
  const [reason, setReason] = useState('');
  const [logTick, setLogTick] = useState(0);
  const log = useMemo(() => readGeoAuditLog(), [logTick]);

  const issueKeys = Object.keys(data.issueCounts ?? {});
  const rows = (data.needsQueue ?? []).filter((r) => {
    if (confidence !== 'all' && r.confidence !== confidence) return false;
    if (issue !== 'all' && !r.issues.some((i) => i.code === issue)) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
        Internal · geo QA
      </p>
      <h1 className="mt-1 text-xl font-semibold text-ink">
        Course geographic accuracy
      </h1>
      <p className="mt-1 text-[13px] text-muted">
        Hole packs are JSON, not PostGIS. This queue flags fabricated tees,
        layout gaps, and name+proximity duplicates without merging layouts.
        Run <code className="font-mono">npm run audit:geo-accuracy</code> to
        refresh. Built {data.builtAt ?? 'never'}.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ['Packs', data.packCount],
            ['Fabricated tees', data.fabricatedTeeHoles],
            ['Unverified', data.confidence?.UNVERIFIED ?? 0],
            ['Needs review', data.confidence?.NEEDS_REVIEW ?? 0],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-3">
            <div className="text-[11px] uppercase tracking-wide text-faint">
              {label}
            </div>
            <div className="text-xl font-semibold tabular-nums text-ink">{n}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="text-[13px] text-muted">
          Confidence
          <select
            className="ml-2 rounded-lg border border-line bg-canvas px-2 py-1 text-ink"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
          >
            <option value="all">All</option>
            <option value="UNVERIFIED">UNVERIFIED</option>
            <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
            <option value="HIGH_CONFIDENCE">HIGH_CONFIDENCE</option>
            <option value="VERIFIED">VERIFIED</option>
          </select>
        </label>
        <label className="text-[13px] text-muted">
          Issue
          <select
            className="ml-2 rounded-lg border border-line bg-canvas px-2 py-1 text-ink"
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
          >
            <option value="all">All</option>
            {issueKeys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="mt-4 space-y-2">
        {rows.slice(0, 80).map((r) => (
          <li
            key={r.slug}
            className="rounded-xl border border-line bg-surface p-3 text-[13px]"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-ink">{r.name}</span>
              <span className="font-mono text-[11px] uppercase text-faint">
                {r.confidence} · {r.holeCount} holes
              </span>
            </div>
            <p className="mt-1 text-muted">
              {r.issues[0]?.detail ?? 'Queued for review'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-line px-2 py-1 text-[12px]"
                onClick={() => {
                  stashPendingCourse(
                    holePackEntryToSummary({
                      slug: r.slug,
                      name: r.name,
                      lat: r.lat,
                      lon: r.lon,
                      holes: r.holeCount,
                    }),
                  );
                  window.location.href = '/rounds/gps';
                }}
              >
                Open GPS / satellite
              </button>
              <button
                type="button"
                className="rounded-lg border border-line px-2 py-1 text-[12px]"
                onClick={() => {
                  appendGeoAuditLog({
                    who: who.trim() || 'qa',
                    slug: r.slug,
                    field: 'confidence',
                    oldValue: r.confidence,
                    newValue: 'NEEDS_VERIFICATION',
                    reason: reason.trim() || 'Queued from QA dashboard',
                  });
                  setLogTick((n) => n + 1);
                }}
              >
                Log verification note
              </button>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-[15px] font-semibold text-ink">Audit log</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          className="rounded-lg border border-line bg-canvas px-2 py-1 text-[13px]"
          value={who}
          onChange={(e) => setWho(e.target.value)}
          aria-label="Reviewer"
          placeholder="Reviewer"
        />
        <input
          className="min-w-[12rem] flex-1 rounded-lg border border-line bg-canvas px-2 py-1 text-[13px]"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Reason"
          placeholder="Reason (who / when stored in log)"
        />
      </div>
      <ul className="mt-2 space-y-1 text-[12px] text-muted">
        {log.slice(0, 20).map((e) => (
          <li key={`${e.at}-${e.slug}`}>
            {e.at} · {e.who} · {e.slug}: {e.oldValue} → {e.newValue} ({e.reason})
          </li>
        ))}
        {log.length === 0 ? <li>No local audit entries yet.</li> : null}
      </ul>

      <p className="mt-6 text-[12px] text-faint">
        Duplicate flags: {data.duplicateFlags?.length ?? 0}. Multi-course
        facilities stay separate.{' '}
        <Link to="/dev/ui-audit" className="text-brand">
          UI audit
        </Link>
      </p>
    </div>
  );
}
