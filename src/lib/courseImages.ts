/** Consistent golf course hero photos — stable per course name/id. */

const GOLF_PHOTOS = [
  'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?auto=format&fit=crop&w=960&q=80',
  'https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?auto=format&fit=crop&w=960&q=80',
  'https://images.unsplash.com/photo-1587174486073-ae585e01f9a0?auto=format&fit=crop&w=960&q=80',
  'https://images.unsplash.com/photo-1596727362302-b8d192c92d51?auto=format&fit=crop&w=960&q=80',
  'https://images.unsplash.com/photo-1592919505780-303950717480?auto=format&fit=crop&w=960&q=80',
  'https://images.unsplash.com/photo-1635151227785-429f9c3a725d?auto=format&fit=crop&w=960&q=80',
  'https://images.unsplash.com/photo-1593113616828-c4b7a2a5a8a0?auto=format&fit=crop&w=960&q=80',
  'https://images.unsplash.com/photo-1587174486073-ae585e01f9a0?auto=format&fit=crop&w=960&q=80',
] as const;

const NAMED: Record<string, string> = {
  riviera: GOLF_PHOTOS[0],
  'rancho-park': GOLF_PHOTOS[1],
  'wilson-harding': GOLF_PHOTOS[2],
  'torrey-pines': GOLF_PHOTOS[3],
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
  if (NAMED[key]) return NAMED[key]!;
  return GOLF_PHOTOS[hashSeed(key) % GOLF_PHOTOS.length]!;
}
