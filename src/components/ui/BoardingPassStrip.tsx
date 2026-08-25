import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = {
  flight: string;
  gate: string;
  destination: string;
  detail: string;
  cta: string;
  href: string;
  footer?: ReactNode;
};

export function BoardingPassStrip({
  flight,
  gate,
  destination,
  detail,
  cta,
  href,
  footer,
}: Props) {
  return (
    <div className="boarding-pass relative overflow-hidden">
      <div className="absolute left-[38%] top-0 hidden h-full w-px border-l border-dashed border-[var(--pass-perforation)] sm:block" />
      <div className="flex flex-col sm:flex-row">
        <div className="flex-1 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pass-muted)]">
                {flight}
              </p>
              <h3 className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-[var(--pass-ink)] sm:text-[26px]">
                {destination}
              </h3>
              <p className="mt-2 max-w-md text-[14px] leading-relaxed text-[var(--pass-muted)]">
                {detail}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pass-muted)]">
                Gate
              </p>
              <p className="mt-0.5 font-mono text-[32px] font-bold tabular leading-none text-[var(--phosphor)]">
                {gate}
              </p>
            </div>
          </div>
          {footer ? <div className="mt-4">{footer}</div> : null}
        </div>
        <div className="flex items-stretch border-t border-[var(--pass-line)] sm:w-[11rem] sm:flex-col sm:border-l sm:border-t-0">
          <Link
            to={href}
            className="flex flex-1 items-center justify-center bg-[var(--phosphor)] px-6 py-4 text-center font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-[#051008] transition-opacity hover:opacity-90 sm:py-0"
          >
            {cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
