/**
 * Collapse duplicate catalog artifacts while preserving real multi-nine siblings.
 */

import { isInUnitedStates, stateAtPoint } from './usStateLookup.mjs';

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
  _isClubSiblingFn,
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
 * Same name, far apart (>2 km): keep entries whose claimed state matches the
 * coordinate, drop mismatched clones / poisoned geocodes.
 */
export function resolveSameNameFarApart(entries, normalizeName, entryRank) {
  const byName = new Map();
  for (const entry of entries) {
    const key = normalizeName(entry.n);
    const list = byName.get(key) ?? [];
    list.push(entry);
    byName.set(key, list);
  }

  const kept = [];
  let removed = 0;

  for (const [, group] of byName.entries()) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }

    const clusters = [];
    for (const entry of group) {
      let placed = false;
      for (const cluster of clusters) {
        const anchor = cluster[0];
        if (haversineKm(entry.la, entry.lo, anchor.la, anchor.lo) <= 2) {
          cluster.push(entry);
          placed = true;
          break;
        }
      }
      if (!placed) clusters.push([entry]);
    }

    if (clusters.length === 1) {
      for (const entry of group) kept.push(entry);
      continue;
    }

    const scored = group.map((entry) => {
      const at = stateAtPoint(entry.la, entry.lo);
      const inUs = isInUnitedStates(entry.la, entry.lo);
      const stateMatch = Boolean(entry.st && at && entry.st === at);
      const stateMismatch = Boolean(entry.st && at && entry.st !== at);
      const outside = !inUs && !at;
      let score = entryRank(entry);
      if (stateMatch) score += 200;
      if (stateMismatch) score -= 150;
      if (outside) score -= 300;
      return { entry, score, stateMatch, outside };
    });

    const anyMatch = scored.some((s) => s.stateMatch);
    const survivors = anyMatch
      ? scored.filter((s) => s.stateMatch && !s.outside)
      : scored.filter((s) => !s.outside);

    if (!survivors.length) {
      scored.sort((a, b) => b.score - a.score);
      kept.push(scored[0].entry);
      removed += scored.length - 1;
      continue;
    }

    const byCluster = new Map();
    for (const s of survivors) {
      let clusterIdx = 0;
      for (let i = 0; i < clusters.length; i += 1) {
        if (clusters[i].includes(s.entry)) {
          clusterIdx = i;
          break;
        }
      }
      const prev = byCluster.get(clusterIdx);
      if (!prev || s.score > prev.score) byCluster.set(clusterIdx, s);
    }
    for (const s of byCluster.values()) kept.push(s.entry);
    removed += group.length - byCluster.size;
  }

  return { entries: kept, removed };
}

/**
 * Drop clearly non-US pins (Canada / ocean) that claim country US.
 * Coastal courses that miss the state polygon but have a claimed US state
 * are kept (Cypress Point, Cape Cod islands, etc.).
 */
export function dropNonUsPins(entries) {
  const kept = [];
  let removed = 0;
  for (const entry of entries) {
    if (entry.co && entry.co !== 'US') {
      kept.push(entry);
      continue;
    }
    const inUs = isInUnitedStates(entry.la, entry.lo);
    const at = stateAtPoint(entry.la, entry.lo);
    const regionCanada = /\b(BC|AB|ON|QC|MB|SK|NS|NB|PE|NL|YT|NT|NU)\b/i.test(
      entry.r ?? '',
    );
    // True Canada north of CONUS with no US state hit.
    const canada =
      entry.la > 49.0 &&
      entry.lo < -66 &&
      entry.lo > -141 &&
      !inUs &&
      !at;
    // Open ocean / null island without a matching state claim.
    const ocean =
      !inUs &&
      !at &&
      !entry.st &&
      (Math.abs(entry.la) < 5 || entry.lo > -66);
    if (canada || ocean || (regionCanada && !inUs && !at)) {
      removed += 1;
      continue;
    }
    kept.push(entry);
  }
  return { entries: kept, removed };
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

  const far = resolveSameNameFarApart(list, normalizeName, entryRank);
  list = far.entries;

  const nonUs = dropNonUsPins(list);
  list = nonUs.entries;

  return {
    entries: list,
    removedSameCoord,
    removedNearby: nearby.removed,
    removedFarApart: far.removed,
    removedNonUs: nonUs.removed,
  };
}
