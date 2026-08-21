import { AuthForm } from '../components/AuthForm';

const FEATURES = [
  {
    title: 'Prep your bag',
    body: 'Hole-by-hole plans with miss lines, wind, and front / mid / back yardages.',
  },
  {
    title: 'GPS on the course',
    body: 'Live ranging that keeps running in the background while you check Settings or Today.',
  },
  {
    title: 'Synced scorecard',
    body: 'Handicap, plus scores, and your bag stocks follow your account across devices.',
  },
] as const;

export function HomeLanding() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 pb-10 pt-2 md:gap-14 md:pt-4">
      <section className="grid items-start gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
        <div className="flex flex-col gap-5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">
            TeeReady
          </span>
          <h1 className="text-[36px] font-bold leading-[1.05] tracking-[-0.03em] text-ink text-pretty sm:text-[44px]">
            Show up ready for every hole
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-muted text-pretty sm:text-[16px]">
            Weather-aware hole plans, live GPS ranging, and a scorecard that
            knows your handicap — all in one place. Sign in to start.
          </p>
          <ul className="mt-1 flex flex-col gap-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand"
                  aria-hidden
                />
                <div>
                  <div className="text-[14px] font-semibold text-ink">
                    {f.title}
                  </div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                    {f.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-card border border-line bg-surface p-5 shadow-lift sm:p-6">
          <AuthForm variant="landing" defaultMode="signin" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { k: 'Prep', v: 'Miss lines & club picks' },
          { k: 'GPS', v: 'Front · mid · back' },
          { k: 'Card', v: 'Net scoring · plus HCP' },
        ].map((item) => (
          <div
            key={item.k}
            className="rounded-card border border-line bg-surface px-4 py-4 shadow-card"
          >
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
              {item.k}
            </div>
            <div className="mt-1.5 text-[14px] font-semibold text-ink">
              {item.v}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
