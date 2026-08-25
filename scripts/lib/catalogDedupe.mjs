/**
 * Collapse duplicate catalog artifacts while preserving real multi-nine siblings.
 */

const KM_PER_MI = 1.609_344;

function haversineKm(aLat, aLon, bLat, bLon) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.7613 / KM_PER_MI;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const A =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(A));
}

function isClubSibling(a, b, isClubSiblingFn) {
  return isClubSiblingFn(a, b);
}

/**
 * Drop duplicate rows with the same normalized name at the same pin (4 dp).
 */
export function collapseSameNameSameCoord(entries, normalizeName, entryRank) {
  const groups = new Map();
  for (const entry of entries) {
    const key = `${normalizeName(entry.n)}|${entry.la.toFixed(4)}|${entry.lo.toFixed(4)}`;
    const prev = groups.get(key);
    if (!prev || entryRank(entry) > entryRank(prev)) {
      groups.set(key, entry);
    }
  }
  return [...groups.values()];
}

/**
 * Merge duplicate names within `maxKm` (e.g. Pheasant Glen's two bulk pins).
 */
export function collapseSameNameNearby(
  entries,
  normalizeName,
  entryRank,
  isClubSiblingFn,
  maxKm = 0.2,
) {
  const byName = new Map();
  for (const entry of entries) {
    const key = normalizeName(entry.n);
    const list = byName.get(key) ?? [];
    list.push(entry);
    byName.set(key, list);
  }

  const kept = new Set();
  let removed = 0;

  for (const [, group] of byName.entries()) {
    if (group.length === 1) {
      kept.add(group[0]);
      continue;
    }

    const names = group.map((entry) => entry.n);
    const allSameName = new Set(names).size === 1;
    if (!allSameName) {
      for (const entry of group) kept.add(entry);
      continue;
    }

    const clusters = [];
    for (const entry of group) {
      let placed = false;
      for (const cluster of clusters) {
        const anchor = cluster[0];
        if (haversineKm(entry.la, entry.lo, anchor.la, anchor.lo) <= maxKm) {
          cluster.push(entry);
          placed = true;
          break;
        }
      }
      if (!placed) clusters.push([entry]);
    }

    for (const cluster of clusters) {
      if (cluster.length === 1) {
        kept.add(cluster[0]);
        continue;
      }
      const sorted = [...cluster].sort((a, b) => entryRank(b) - entryRank(a));
      kept.add(sorted[0]);
      removed += sorted.length - 1;
    }
  }

  return { entries: [...kept], removed };
}

/**
 * Final place-key dedupe: same name + country + city + region code.
 */
export function dedupeByPlaceKey(entries, normalizeName, entryRank, placeKey) {
  const byPlace = new Map();
  for (const entry of entries) {
    const key = placeKey(entry);
    const prev = byPlace.get(key);
    if (!prev || entryRank(entry) > entryRank(prev)) {
      byPlace.set(key, entry);
    }
  }
  return [...byPlace.values()];
}

export function collapseDuplicateArtifacts(
  entries,
  { normalizeName, entryRank, isClubSiblingFn },
) {
  let list = entries;
  const sameCoord = collapseSameNameSameCoord(list, normalizeName, entryRank);
  const removedSameCoord = list.length - sameCoord.length;
  list = sameCoord;

  const nearby = collapseSameNameNearby(
    list,
    normalizeName,
    entryRank,
    isClubSiblingFn,
  );
  list = nearby.entries;

  return {
    entries: list,
    removedSameCoord,
    removedNearby: nearby.removed,
  };
}
