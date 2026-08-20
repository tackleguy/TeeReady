import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useGeocode, type GeocodeResult } from '../../hooks/useGeocode';

interface Props {
  onPick: (pick: GeocodeResult) => void;
}

export function SearchBar({ onPick }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { results, loading } = useGeocode(q);
  const blurTimer = useRef<number | undefined>(undefined);

  // Cancel any pending blur-close timer when the component unmounts so we
  // don't fire setOpen(false) on an unmounted component.
  useEffect(
    () => () => {
      if (blurTimer.current !== undefined) {
        window.clearTimeout(blurTimer.current);
      }
    },
    [],
  );

  return (
    <div className="relative w-full">
      <div
        className="flex items-center gap-2 rounded-lg border border-[var(--line-default)] px-3 py-1.5 backdrop-blur-md transition-colors duration-[var(--t-fast)]"
        style={{ background: 'var(--glass-hi)' }}
      >
        <Search
          className="h-3.5 w-3.5 text-[var(--ink-3)]"
          strokeWidth={2}
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            if (blurTimer.current !== undefined) {
              window.clearTimeout(blurTimer.current);
              blurTimer.current = undefined;
            }
            setOpen(true);
          }}
          onBlur={() => {
            // 150ms grace so click events on the dropdown can register.
            blurTimer.current = window.setTimeout(() => setOpen(false), 150);
          }}
          placeholder="Search city, county, or coordinates"
          className="flex-1 bg-transparent text-[16px] text-[var(--ink-1)] placeholder-[var(--ink-4)] outline-none lg:text-[13px]"
        />
        {q ? (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => setQ('')}
            className="text-[var(--ink-4)] hover:text-[var(--ink-1)]"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.2} />
          </button>
        ) : null}
      </div>
      {open && q.trim() ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-[var(--line-default)] bg-[var(--glass-hi)] shadow-xl backdrop-blur-md">
          {loading && results.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-[var(--ink-3)]">
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-[var(--ink-3)]">
              No results
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {results.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onPick(r);
                      setOpen(false);
                      setQ('');
                    }}
                    className="block w-full px-3 py-3 text-left text-[13px] text-[var(--ink-2)] transition-colors hover:bg-white/8 hover:text-[var(--ink-1)] lg:py-2 lg:text-[12px]"
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
