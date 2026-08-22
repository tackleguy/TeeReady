/** Consistent golf course hero photos — stable per course name/id. */

const UNSPLASH = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=960&q=80`;

/** Verified working golf imagery (checked 2026-08). */
export const GOLF_PHOTOS = [
  UNSPLASH('1535131749006-b7f58c99034b'),
  UNSPLASH('1593111774240-d529f12cf4bb'),
  UNSPLASH('1592919505780-303950717480'),
  UNSPLASH('1566073771259-6a8506099945'),
  UNSPLASH('1606443192517-919653213206'),
  UNSPLASH('1709525616662-8d9f9a995ceb'),
  UNSPLASH('1538648759472-7251f7cb2c2f'),
  UNSPLASH('1559827260-dc66d52bef19'),
  UNSPLASH('1571019613454-1cb2f99b2d8b'),
  UNSPLASH('1682687220063-4742bd7fd538'),
  UNSPLASH('1592937238247-cd0090e02f65'),
  UNSPLASH('1500932334442-8761ee4810a7'),
  UNSPLASH('1632946269126-0f8edbe8b068'),
  UNSPLASH('1623567341691-1f47b5cf949e'),
  UNSPLASH('1587205476864-4a5a195167b4'),
  UNSPLASH('1605144884374-ecbb643615f6'),
  UNSPLASH('1582528979903-bee578216a69'),
  UNSPLASH('1605147861225-7bcd55f8e513'),
  UNSPLASH('1443706340763-4b60757a36ce'),
  UNSPLASH('1571940205525-2d48d9f1f8d4'),
  UNSPLASH('1622482594949-a2ea0c800edd'),
] as const;

export const DEFAULT_COURSE_PHOTO = GOLF_PHOTOS[0];

/** Large hero for marketing / landing sections. */
export const DEFAULT_COURSE_HERO = UNSPLASH('1606443192517-919653213206') + '&w=2400';

const NAMED: Record<string, string> = {
  riviera: GOLF_PHOTOS[0]!,
  'rancho-park': GOLF_PHOTOS[1]!,
  'wilson-harding': GOLF_PHOTOS[4]!,
  'torrey-pines': GOLF_PHOTOS[5]!,
};

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function courseHeroImage(seed: string): string {
  const key = seed.trim().toLowerCase();
  if (!key) return DEFAULT_COURSE_PHOTO;
  if (NAMED[key]) return NAMED[key]!;
  return GOLF_PHOTOS[hashSeed(key) % GOLF_PHOTOS.length]!;
}

/** Next fallback if the hashed photo fails to load. */
export function courseHeroFallback(seed: string, failedUrl: string): string {
  const key = seed.trim().toLowerCase();
  if (!key || failedUrl === DEFAULT_COURSE_PHOTO) return DEFAULT_COURSE_PHOTO;
  const idx = hashSeed(key) % GOLF_PHOTOS.length;
  const next = GOLF_PHOTOS[(idx + 1) % GOLF_PHOTOS.length]!;
  return next === failedUrl ? DEFAULT_COURSE_PHOTO : next;
}
