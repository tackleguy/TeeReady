// Lightweight "install this app" prompt for browsers that fire
// `beforeinstallprompt`. We capture the deferred event and surface a
// dismissable card the first time the user has been around for a few
// minutes — never on the first paint, and never again after dismissal.

import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'install-prompt-dismissed-v1';
const SHOW_AFTER_MS = 90_000;

function shouldShow(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) !== '1';
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // ignore
  }
}

export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!shouldShow()) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (!event) return;
    const t = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [event]);

  if (!event || !visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 px-3 sm:bottom-6">
      <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-[rgba(11,16,32,0.92)] px-4 py-3 shadow-2xl backdrop-blur-xl">
        <Download className="h-4 w-4 text-white" strokeWidth={2.2} />
        <div className="text-[13px] text-white/85">
          Install WeatherStop for fast offline-friendly access.
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await event.prompt();
              const result = await event.userChoice;
              if (result.outcome !== 'accepted') {
                // user declined — don't show again
                markDismissed();
              }
            } finally {
              setEvent(null);
              setVisible(false);
            }
          }}
          className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-slate-900 hover:bg-white/90"
        >
          Install
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            markDismissed();
            setVisible(false);
          }}
          className="grid h-7 w-7 place-items-center rounded-full text-white/55 hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
