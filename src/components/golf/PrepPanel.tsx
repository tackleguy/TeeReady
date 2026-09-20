import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import type { GolfHole } from '../../lib/golf';

interface Props {
  holes: GolfHole[];
  activeHole: number | null;
  onSelectHole: (hole: number | null) => void;
  onStep: (direction: -1 | 1) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  plan: ReactNode;
  conditions: ReactNode;
  caddie: ReactNode;
  tools: ReactNode;
}

/** A single, scrollable planning surface; map controls never compete for space. */
export function PrepPanel({ holes, activeHole, onSelectHole, onStep, loading, error, onRetry, plan, conditions, caddie, tools }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollToPlan = () => contentRef.current?.scrollTo(0, 0);
  const [section, setSection] = useState<'Plan' | 'Conditions' | 'Caddie'>('Plan');
  const [expanded, setExpanded] = useState(false);
  const index = holes.findIndex(hole => hole.number === activeHole);
  return <section className={`prep-panel ${expanded ? 'is-expanded' : ''}`} aria-label="Round preparation">
    <div className="prep-hole-nav">
      <button type="button" aria-label="Previous hole" disabled={index <= 0} onClick={() => { onStep(-1); scrollToPlan(); }}><ChevronLeft size={20} aria-hidden /></button>
      <label className="prep-hole-select">
        <span className="sr-only">Prep hole</span>
        <select value={activeHole ?? ''} onChange={event => { onSelectHole(event.target.value ? Number(event.target.value) : null); scrollToPlan(); }} disabled={!holes.length}>
          <option value="">{loading ? 'Loading holes…' : 'Course overview'}</option>
          {holes.map(hole => <option key={hole.number} value={hole.number}>Hole {hole.number}{hole.par != null ? ` · Par ${hole.par}` : ''} · {hole.yards} yd</option>)}
        </select>
      </label>
      <button type="button" aria-label="Next hole" disabled={!holes.length || index >= holes.length - 1} onClick={() => { onStep(1); scrollToPlan(); }}><ChevronRight size={20} aria-hidden /></button>
      <button type="button" className="prep-expand" aria-expanded={expanded} aria-label={expanded ? 'Collapse planning panel' : 'Expand planning panel'} onClick={() => setExpanded(value => !value)}>{expanded ? <ChevronDown size={20} aria-hidden /> : <ChevronUp size={20} aria-hidden />}</button>
    </div>
    <nav className="prep-sections" aria-label="Prep details">
      {(['Plan', 'Conditions', 'Caddie'] as const).map(label => <button type="button" key={label} aria-pressed={section === label} onClick={() => { setSection(label); scrollToPlan(); }}>{label}</button>)}
    </nav>
    <div ref={contentRef} className="prep-panel-content" role="region" aria-label={`${section} details`}>
      {error && !holes.length ? <div role="alert" className="prep-message"><p>Hole layouts couldn’t load. You can still explore the map.</p><button type="button" onClick={onRetry} disabled={loading}>{loading ? 'Loading…' : 'Retry hole layouts'}</button></div> : null}
      {section === 'Conditions' ? conditions : section === 'Caddie' ? caddie : activeHole == null ? <div className="prep-overview"><h2>Plan your first shot</h2><p>Choose a hole, then tap the map to place your target. See your carry, next shot, and miss lines together.</p><button type="button" className="btn-primary" disabled={!holes.length} onClick={() => onSelectHole(holes[0]!.number)}>{loading ? 'Loading holes…' : 'Plan hole 1'}</button></div> : plan}
      <details className="prep-tools"><summary>Round tools & settings</summary><div>{tools}</div></details>
    </div>
  </section>;
}
