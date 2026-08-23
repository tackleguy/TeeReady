import { useEffect, useRef, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { useGeocode, type GeocodeResult } from '../../hooks/useGeocode';

type Props = {
  value: GeocodeResult | null;
  onChange: (pick: GeocodeResult | null) => void;
};

export function CitySearchField({ value, onChange }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { results, loading } = useGeocode(q);
  const blurTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (blurTimer.current !== undefined) {
        window.clearTimeout(blurTimer.current);
      }
    },
    [],
  );

  const display = value
    ? value.label.split(',')[0]?.trim() || value.label
    : '';

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 rounded-xl border bg-canvas px-3 py-2.5 ${
          open
            ? 'border-brand ring-1 ring-[color-mix(in_srgb,var(--brand)_25%,transparent)]'
            : 'border-line'
        }`}
      >
        <Search className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} />
        <input
          type="search"
          value={open ? q : display}
          placeholder="Search your city…"
          onChange={(e) => {
            setQ(e.target.value);
            if (value) onChange(null);
          }}
          onFocus={() => {
            if (blurTimer.current !== undefined) {
              window.clearTimeout(blurTimer.current);
              blurTimer.current = undefined;
            }
            setOpen(true);
            if (value) {
              setQ(display);
              onChange(null);
            }
          }}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 150);
          }}
          className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
        />
        {value || q ? (
          <button
            type="button"
            aria-label="Clear city"
            onClick={() => {
              onChange(null);
              setQ('');
            }}
            className="text-faint hover:text-ink"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : (
          <MapPin className="h-4 w-4 shrink-0 text-faint" strokeWidth={2} />
        )}
      </div>

      {open && q.trim() ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lift">
          {loading && results.length === 0 ? (
            <div className="px-3 py-2.5 text-[13px] text-muted">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2.5 text-[13px] text-muted">No cities found</div>
          ) : (
            <ul className="max-h-56 overflow-y-auto">
              {results.map((r, i) => (
                <li key={`${r.lat}-${r.lon}-${i}`}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-[13px] hover:bg-canvas"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(r);
                      setQ('');
                      setOpen(false);
                    }}
                  >
                    <MapPin
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand"
                      strokeWidth={2}
                    />
                    <span className="min-w-0 text-ink">{r.label}</span>
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
