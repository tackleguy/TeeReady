/** Per-isolate IP rate limiting for public Edge handlers. */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const MAX_BUCKETS = 8_000;

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  return 'unknown';
}

function prune(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
    if (buckets.size < MAX_BUCKETS * 0.7) break;
  }
  // Still too large — drop oldest half by resetAt.
  if (buckets.size >= MAX_BUCKETS) {
    const entries = [...buckets.entries()].sort(
      (a, b) => a[1].resetAt - b[1].resetAt,
    );
    for (let i = 0; i < Math.floor(entries.length / 2); i++) {
      buckets.delete(entries[i]![0]);
    }
  }
}

/**
 * Returns null when allowed, or a 429 Response when the client is over limit.
 * `limit` = max requests per `windowMs` sliding window (fixed window for Edge).
 */
export function rateLimit(
  req: Request,
  opts: { key: string; limit: number; windowMs: number },
): Response | null {
  const now = Date.now();
  prune(now);
  const ip = clientIp(req);
  const bucketKey = `${opts.key}:${ip}`;
  let bucket = buckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(bucketKey, bucket);
  }
  bucket.count += 1;
  if (bucket.count <= opts.limit) return null;

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return new Response(
    JSON.stringify({ error: 'rate limit exceeded', retryAfter }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Retry-After': String(retryAfter),
      },
    },
  );
}

export const RATE = {
  geocode: { key: 'geocode', limit: 30, windowMs: 60_000 },
  courses: { key: 'courses', limit: 40, windowMs: 60_000 },
  holes: { key: 'holes', limit: 20, windowMs: 60_000 },
  ensemble: { key: 'ensemble', limit: 40, windowMs: 60_000 },
  notebook: { key: 'notebook', limit: 20, windowMs: 60_000 },
  hours: { key: 'hours', limit: 40, windowMs: 60_000 },
  caddy: { key: 'caddy', limit: 24, windowMs: 60_000 },
} as const;

export const MAX_POST_HOLES = 54;
