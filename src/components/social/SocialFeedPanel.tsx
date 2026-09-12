import { Link } from 'react-router-dom';
import { Flag, Heart, MessageCircle, Video } from 'lucide-react';
import { buildSocialFeed, type SocialFeedItem } from '../../lib/socialFeed';

function kindIcon(kind: SocialFeedItem['kind']) {
  if (kind === 'swing') return Video;
  if (kind === 'achievement') return Heart;
  return Flag;
}

export function SocialFeedPanel({ limit = 8 }: { limit?: number }) {
  const items = buildSocialFeed(limit);

  if (!items.length) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 className="text-[17px] font-bold text-ink">Your golf feed</h2>
        <p className="mt-2 text-[13px] text-muted">
          Finish a round or analyze a swing — activity shows up here so you can
          share and revisit it.
        </p>
        <div className="mt-4 flex gap-2">
          <Link to="/rounds/prep" className="btn-primary px-4 py-2.5 text-[13px]">
            Start round
          </Link>
          <Link to="/swing" className="btn-secondary px-4 py-2.5 text-[13px]">
            AI Swing
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-2">
        <h2 className="text-[17px] font-bold text-ink">Activity</h2>
        <p className="text-[12px] text-muted">On this device</p>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const Icon = kindIcon(item.kind);
          return (
            <li key={item.id}>
              <Link
                to={item.href ?? '/stats'}
                className="flex gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-card"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                  <Icon className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold leading-snug text-ink">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">{item.body}</p>
                  <div className="mt-2 flex gap-3 text-[11px] font-semibold text-faint">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="h-3 w-3" aria-hidden /> Kudos
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" aria-hidden /> Comment
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
