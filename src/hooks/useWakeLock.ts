/**
 * Screen Wake Lock while GPS / round tracking is active.
 * Re-acquires on visibilitychange (browsers release the lock when hidden).
 */

import { useEffect, useRef, useState } from 'react';

const UNSUPPORTED_MSG =
  'Screen lock unavailable — set your phone screen timeout manually so GPS stays on during the round.';

export interface WakeLockState {
  /** Wake Lock API present on this browser. */
  supported: boolean;
  /** Currently holding an active screen wake lock. */
  active: boolean;
  /** Guidance when the API is missing or request failed. Null when locked OK. */
  message: string | null;
}

export function useWakeLock(enabled: boolean): WakeLockState {
  const [supported] = useState(
    () => typeof navigator !== 'undefined' && 'wakeLock' in navigator,
  );
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState<string | null>(
    supported ? null : UNSUPPORTED_MSG,
  );
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) {
      void releaseLock(sentinelRef, setActive);
      if (!supported) setMessage(UNSUPPORTED_MSG);
      else setMessage(null);
      return;
    }

    if (!supported) {
      setMessage(UNSUPPORTED_MSG);
      setActive(false);
      return;
    }

    let cancelled = false;

    const acquire = async () => {
      if (cancelled || !enabledRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      try {
        // Release any prior sentinel before requesting a new one.
        await releaseLock(sentinelRef, setActive);
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled || !enabledRef.current) {
          await sentinel.release().catch(() => undefined);
          return;
        }
        sentinelRef.current = sentinel;
        setActive(true);
        setMessage(null);
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
            setActive(false);
          }
        });
      } catch {
        setActive(false);
        setMessage(UNSUPPORTED_MSG);
      }
    };

    void acquire();

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && enabledRef.current) {
        void acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void releaseLock(sentinelRef, setActive);
    };
  }, [enabled, supported]);

  return { supported, active, message };
}

async function releaseLock(
  sentinelRef: { current: WakeLockSentinel | null },
  setActive: (v: boolean) => void,
): Promise<void> {
  const s = sentinelRef.current;
  sentinelRef.current = null;
  setActive(false);
  if (s) {
    try {
      await s.release();
    } catch {
      /* already released */
    }
  }
}
