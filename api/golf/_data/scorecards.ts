import { IMPORTED_SCORECARDS } from './importedScorecards';

/**
 * Official scorecard par + yardage overrides for popular courses.
 *
 * Keyed by OSM relation/way ID so they match GolfCourseSummary.osmId.
 * "back" = championship / tips, "mid" = member / blue, "front" = forward / red.
 * Yardages are from the course's published scorecard, not GPS geometry.
 */

export interface ScorecardHole {
  hole: number;
  par: number;
  back?: number;
  mid?: number;
  front?: number;
  name?: string;
}

export interface CourseScorecard {
  name: string;
  totalPar: number;
  loop?: string;
  /** Exact OSM course IDs when we know them. */
  osmIds?: number[];
  /** Known alternate names seen in OSM / search results. */
  aliases?: string[];
  holes: ScorecardHole[];
}

// OSM IDs → scorecards
const SCORECARDS: Record<string, CourseScorecard[]> = {
  // ─── Torrey Pines South ───
  // OSM relation or way for the South polygon — the holes API assigns loop "South"
  'torrey-pines-south': [
    {
      name: 'Torrey Pines South Course',
      totalPar: 72,
      loop: 'South',
      aliases: ['Torrey Pines Golf Course South Course', 'Torrey Pines South'],
      holes: [
        { hole: 1, par: 4, back: 451, mid: 417, front: 358 },
        { hole: 2, par: 4, back: 389, mid: 376, front: 325 },
        { hole: 3, par: 3, back: 201, mid: 179, front: 144 },
        { hole: 4, par: 4, back: 490, mid: 424, front: 362 },
        { hole: 5, par: 4, back: 454, mid: 413, front: 383 },
        { hole: 6, par: 5, back: 564, mid: 494, front: 447 },
        { hole: 7, par: 4, back: 462, mid: 422, front: 382 },
        { hole: 8, par: 3, back: 177, mid: 168, front: 131 },
        { hole: 9, par: 5, back: 615, mid: 541, front: 469 },
        { hole: 10, par: 4, back: 454, mid: 399, front: 331 },
        { hole: 11, par: 3, back: 225, mid: 201, front: 148 },
        { hole: 12, par: 4, back: 505, mid: 468, front: 388 },
        { hole: 13, par: 5, back: 621, mid: 544, front: 470 },
        { hole: 14, par: 4, back: 437, mid: 394, front: 329 },
        { hole: 15, par: 4, back: 480, mid: 420, front: 364 },
        { hole: 16, par: 3, back: 227, mid: 184, front: 133 },
        { hole: 17, par: 4, back: 443, mid: 398, front: 354 },
        { hole: 18, par: 5, back: 570, mid: 488, front: 418 },
      ],
    },
  ],

  // ─── Torrey Pines North ───
  'torrey-pines-north': [
    {
      name: 'Torrey Pines North Course',
      totalPar: 72,
      loop: 'North',
      aliases: ['Torrey Pines Golf Course North Course', 'Torrey Pines North'],
      holes: [
        { hole: 1, par: 4, back: 421, mid: 395, front: 322 },
        { hole: 2, par: 4, back: 495, mid: 412, front: 344 },
        { hole: 3, par: 3, back: 241, mid: 164, front: 138 },
        { hole: 4, par: 4, back: 479, mid: 416, front: 317 },
        { hole: 5, par: 5, back: 525, mid: 483, front: 424 },
        { hole: 6, par: 4, back: 416, mid: 389, front: 309 },
        { hole: 7, par: 4, back: 322, mid: 290, front: 233 },
        { hole: 8, par: 3, back: 214, mid: 167, front: 128 },
        { hole: 9, par: 5, back: 556, mid: 476, front: 401 },
        { hole: 10, par: 5, back: 536, mid: 506, front: 422 },
        { hole: 11, par: 4, back: 339, mid: 321, front: 258 },
        { hole: 12, par: 3, back: 203, mid: 155, front: 101 },
        { hole: 13, par: 4, back: 459, mid: 399, front: 306 },
        { hole: 14, par: 4, back: 451, mid: 352, front: 292 },
        { hole: 15, par: 3, back: 202, mid: 165, front: 141 },
        { hole: 16, par: 4, back: 393, mid: 345, front: 308 },
        { hole: 17, par: 5, back: 520, mid: 486, front: 404 },
        { hole: 18, par: 4, back: 486, mid: 422, front: 342 },
      ],
    },
  ],

  // ─── Pebble Beach Golf Links ───
  'pebble-beach': [
    {
      name: 'Pebble Beach Golf Links',
      totalPar: 72,
      aliases: ['Pebble Beach'],
      holes: [
        { hole: 1, par: 4, back: 378, mid: 349, front: 295 },
        { hole: 2, par: 5, back: 509, mid: 491, front: 427 },
        { hole: 3, par: 4, back: 397, mid: 381, front: 330 },
        { hole: 4, par: 4, back: 333, mid: 308, front: 295 },
        { hole: 5, par: 3, back: 189, mid: 145, front: 125 },
        { hole: 6, par: 5, back: 498, mid: 490, front: 466 },
        { hole: 7, par: 3, back: 107, mid: 98, front: 97 },
        { hole: 8, par: 4, back: 416, mid: 388, front: 369 },
        { hole: 9, par: 4, back: 483, mid: 463, front: 431 },
        { hole: 10, par: 4, back: 444, mid: 428, front: 407 },
        { hole: 11, par: 4, back: 370, mid: 349, front: 339 },
        { hole: 12, par: 3, back: 202, mid: 187, front: 179 },
        { hole: 13, par: 4, back: 401, mid: 390, front: 370 },
        { hole: 14, par: 5, back: 559, mid: 545, front: 490 },
        { hole: 15, par: 4, back: 393, mid: 375, front: 349 },
        { hole: 16, par: 4, back: 400, mid: 378, front: 376 },
        { hole: 17, par: 3, back: 182, mid: 176, front: 166 },
        { hole: 18, par: 5, back: 541, mid: 531, front: 509 },
      ],
    },
  ],

  // ─── Bethpage Black ───
  'bethpage-black': [
    {
      name: 'Bethpage State Park – Black',
      totalPar: 71,
      aliases: ['Bethpage Black', 'Bethpage Black Course'],
      holes: [
        { hole: 1, par: 4, back: 430, mid: 429, front: 426 },
        { hole: 2, par: 4, back: 389, mid: 354, front: 346 },
        { hole: 3, par: 3, back: 230, mid: 158, front: 128 },
        { hole: 4, par: 5, back: 517, mid: 461, front: 438 },
        { hole: 5, par: 4, back: 478, mid: 423, front: 401 },
        { hole: 6, par: 4, back: 408, mid: 386, front: 376 },
        { hole: 7, par: 5, back: 553, mid: 502, front: 489 },
        { hole: 8, par: 3, back: 210, mid: 191, front: 152 },
        { hole: 9, par: 4, back: 460, mid: 385, front: 293 },
        { hole: 10, par: 4, back: 502, mid: 434, front: 377 },
        { hole: 11, par: 4, back: 435, mid: 421, front: 412 },
        { hole: 12, par: 4, back: 501, mid: 432, front: 403 },
        { hole: 13, par: 5, back: 608, mid: 480, front: 472 },
        { hole: 14, par: 3, back: 161, mid: 152, front: 139 },
        { hole: 15, par: 4, back: 478, mid: 430, front: 417 },
        { hole: 16, par: 4, back: 490, mid: 457, front: 431 },
        { hole: 17, par: 3, back: 207, mid: 195, front: 178 },
        { hole: 18, par: 4, back: 411, mid: 394, front: 345 },
      ],
    },
  ],

  // ─── Augusta National ───
  'augusta-national': [
    {
      name: 'Augusta National Golf Club',
      totalPar: 72,
      aliases: ['Augusta National'],
      holes: [
        { hole: 1, par: 4, back: 445, name: 'Tea Olive' },
        { hole: 2, par: 5, back: 585, name: 'Pink Dogwood' },
        { hole: 3, par: 4, back: 350, name: 'Flowering Peach' },
        { hole: 4, par: 3, back: 240, name: 'Flowering Crab Apple' },
        { hole: 5, par: 4, back: 495, name: 'Magnolia' },
        { hole: 6, par: 3, back: 180, name: 'Juniper' },
        { hole: 7, par: 4, back: 450, name: 'Pampas' },
        { hole: 8, par: 5, back: 570, name: 'Yellow Jasmine' },
        { hole: 9, par: 4, back: 460, name: 'Carolina Cherry' },
        { hole: 10, par: 4, back: 495, name: 'Camellia' },
        { hole: 11, par: 4, back: 520, name: 'White Dogwood' },
        { hole: 12, par: 3, back: 155, name: 'Golden Bell' },
        { hole: 13, par: 5, back: 545, name: 'Azalea' },
        { hole: 14, par: 4, back: 440, name: 'Chinese Fir' },
        { hole: 15, par: 5, back: 550, name: 'Firethorn' },
        { hole: 16, par: 3, back: 170, name: 'Redbud' },
        { hole: 17, par: 4, back: 440, name: 'Nandina' },
        { hole: 18, par: 4, back: 465, name: 'Holly' },
      ],
    },
  ],

  // ─── Pinehurst No. 2 (member/resort par-72 layout) ───
  'pinehurst-no2': [
    {
      name: 'Pinehurst No. 2',
      totalPar: 72,
      aliases: ['Pinehurst No 2', 'Pinehurst Number 2', 'Pinehurst #2'],
      holes: [
        { hole: 1, par: 4, back: 393, mid: 376, front: 340 },
        { hole: 2, par: 4, back: 439, mid: 411, front: 342 },
        { hole: 3, par: 4, back: 350, mid: 330, front: 283 },
        { hole: 4, par: 4, back: 474, mid: 434, front: 316 },
        { hole: 5, par: 5, back: 508, mid: 462, front: 417 },
        { hole: 6, par: 3, back: 203, mid: 178, front: 116 },
        { hole: 7, par: 4, back: 393, mid: 385, front: 306 },
        { hole: 8, par: 5, back: 469, mid: 440, front: 400 },
        { hole: 9, par: 3, back: 174, mid: 148, front: 124 },
        { hole: 10, par: 5, back: 580, mid: 455, front: 438 },
        { hole: 11, par: 4, back: 455, mid: 375, front: 320 },
        { hole: 12, par: 4, back: 419, mid: 360, front: 293 },
        { hole: 13, par: 4, back: 375, mid: 358, front: 278 },
        { hole: 14, par: 4, back: 433, mid: 419, front: 337 },
        { hole: 15, par: 3, back: 183, mid: 170, front: 124 },
        { hole: 16, par: 5, back: 513, mid: 478, front: 411 },
        { hole: 17, par: 3, back: 185, mid: 162, front: 145 },
        { hole: 18, par: 4, back: 415, mid: 366, front: 329 },
      ],
    },
  ],

  // ─── TPC Sawgrass Stadium ───
  'tpc-sawgrass': [
    {
      name: 'TPC Sawgrass – Stadium Course',
      totalPar: 72,
      aliases: ['TPC Sawgrass Stadium Course', 'Players Stadium Course'],
      holes: [
        { hole: 1, par: 4, back: 424, mid: 394, front: 292 },
        { hole: 2, par: 5, back: 555, mid: 507, front: 381 },
        { hole: 3, par: 3, back: 182, mid: 160, front: 97 },
        { hole: 4, par: 4, back: 387, mid: 359, front: 263 },
        { hole: 5, par: 4, back: 469, mid: 446, front: 360 },
        { hole: 6, par: 4, back: 413, mid: 360, front: 269 },
        { hole: 7, par: 4, back: 450, mid: 407, front: 329 },
        { hole: 8, par: 3, back: 236, mid: 195, front: 121 },
        { hole: 9, par: 5, back: 601, mid: 546, front: 453 },
        { hole: 10, par: 4, back: 419, mid: 392, front: 247 },
        { hole: 11, par: 5, back: 573, mid: 519, front: 395 },
        { hole: 12, par: 4, back: 365, mid: 332, front: 243 },
        { hole: 13, par: 3, back: 183, mid: 156, front: 109 },
        { hole: 14, par: 4, back: 485, mid: 436, front: 334 },
        { hole: 15, par: 4, back: 470, mid: 421, front: 288 },
        { hole: 16, par: 5, back: 537, mid: 486, front: 410 },
        { hole: 17, par: 3, back: 141, mid: 128, front: 92 },
        { hole: 18, par: 4, back: 462, mid: 426, front: 336 },
      ],
    },
  ],

  // ─── Whistling Straits (Straits Course) ───
  'whistling-straits': [
    {
      name: 'Whistling Straits – Straits Course',
      totalPar: 72,
      aliases: ['Whistling Straits Straits Course', 'Straits Course'],
      holes: [
        { hole: 1, par: 4, back: 493, mid: 370, front: 325 },
        { hole: 2, par: 5, back: 597, mid: 521, front: 447 },
        { hole: 3, par: 3, back: 188, mid: 166, front: 111 },
        { hole: 4, par: 4, back: 494, mid: 414, front: 354 },
        { hole: 5, par: 5, back: 603, mid: 543, front: 459 },
        { hole: 6, par: 4, back: 409, mid: 360, front: 282 },
        { hole: 7, par: 3, back: 221, mid: 185, front: 132 },
        { hole: 8, par: 4, back: 506, mid: 429, front: 355 },
        { hole: 9, par: 4, back: 442, mid: 384, front: 347 },
        { hole: 10, par: 4, back: 391, mid: 334, front: 304 },
        { hole: 11, par: 5, back: 645, mid: 544, front: 479 },
        { hole: 12, par: 3, back: 163, mid: 118, front: 89 },
        { hole: 13, par: 4, back: 402, mid: 364, front: 319 },
        { hole: 14, par: 4, back: 396, mid: 346, front: 271 },
        { hole: 15, par: 4, back: 503, mid: 429, front: 367 },
        { hole: 16, par: 5, back: 568, mid: 535, front: 412 },
        { hole: 17, par: 3, back: 249, mid: 197, front: 131 },
        { hole: 18, par: 4, back: 520, mid: 424, front: 380 },
      ],
    },
  ],

  // ─── Kiawah Island Ocean Course ───
  'kiawah-ocean': [
    {
      name: 'Kiawah Island – Ocean Course',
      totalPar: 72,
      aliases: ['Kiawah Ocean Course', 'The Ocean Course'],
      holes: [
        { hole: 1, par: 4, back: 396, mid: 375, front: 306 },
        { hole: 2, par: 5, back: 543, mid: 528, front: 419 },
        { hole: 3, par: 4, back: 390, mid: 367, front: 268 },
        { hole: 4, par: 4, back: 453, mid: 432, front: 328 },
        { hole: 5, par: 3, back: 207, mid: 185, front: 117 },
        { hole: 6, par: 4, back: 455, mid: 377, front: 299 },
        { hole: 7, par: 5, back: 527, mid: 505, front: 432 },
        { hole: 8, par: 3, back: 198, mid: 170, front: 105 },
        { hole: 9, par: 4, back: 464, mid: 415, front: 344 },
        { hole: 10, par: 4, back: 439, mid: 378, front: 310 },
        { hole: 11, par: 5, back: 562, mid: 521, front: 440 },
        { hole: 12, par: 4, back: 466, mid: 420, front: 326 },
        { hole: 13, par: 4, back: 404, mid: 371, front: 312 },
        { hole: 14, par: 3, back: 194, mid: 171, front: 132 },
        { hole: 15, par: 4, back: 421, mid: 391, front: 306 },
        { hole: 16, par: 5, back: 579, mid: 555, front: 447 },
        { hole: 17, par: 3, back: 223, mid: 197, front: 122 },
        { hole: 18, par: 4, back: 439, mid: 421, front: 314 },
      ],
    },
  ],

  // ─── Pacific Dunes (Bandon) ───
  'pacific-dunes': [
    {
      name: 'Pacific Dunes',
      totalPar: 71,
      aliases: ['Pacific Dunes Golf Course'],
      holes: [
        { hole: 1, par: 4, back: 370, mid: 304, front: 287 },
        { hole: 2, par: 4, back: 368, mid: 335, front: 288 },
        { hole: 3, par: 5, back: 499, mid: 476, front: 377 },
        { hole: 4, par: 4, back: 463, mid: 449, front: 356 },
        { hole: 5, par: 3, back: 199, mid: 181, front: 163 },
        { hole: 6, par: 4, back: 316, mid: 288, front: 248 },
        { hole: 7, par: 4, back: 464, mid: 436, front: 377 },
        { hole: 8, par: 4, back: 400, mid: 369, front: 285 },
        { hole: 9, par: 4, back: 406, mid: 379, front: 351 },
        { hole: 10, par: 3, back: 206, mid: 163, front: 149 },
        { hole: 11, par: 3, back: 148, mid: 131, front: 114 },
        { hole: 12, par: 5, back: 529, mid: 507, front: 476 },
        { hole: 13, par: 4, back: 444, mid: 390, front: 373 },
        { hole: 14, par: 3, back: 145, mid: 128, front: 119 },
        { hole: 15, par: 5, back: 539, mid: 504, front: 494 },
        { hole: 16, par: 4, back: 338, mid: 338, front: 306 },
        { hole: 17, par: 3, back: 208, mid: 189, front: 148 },
        { hole: 18, par: 5, back: 591, mid: 575, front: 528 },
      ],
    },
  ],

  // ─── Spyglass Hill ───
  'spyglass-hill': [
    {
      name: 'Spyglass Hill Golf Course',
      totalPar: 72,
      aliases: ['Spyglass Hill'],
      holes: [
        { hole: 1, par: 5, back: 597, mid: 565, front: 488 },
        { hole: 2, par: 4, back: 349, mid: 321, front: 241 },
        { hole: 3, par: 3, back: 171, mid: 147, front: 83 },
        { hole: 4, par: 4, back: 376, mid: 370, front: 302 },
        { hole: 5, par: 3, back: 203, mid: 173, front: 94 },
        { hole: 6, par: 4, back: 441, mid: 408, front: 320 },
        { hole: 7, par: 5, back: 545, mid: 520, front: 462 },
        { hole: 8, par: 4, back: 398, mid: 372, front: 300 },
        { hole: 9, par: 4, back: 430, mid: 414, front: 349 },
        { hole: 10, par: 4, back: 409, mid: 376, front: 315 },
        { hole: 11, par: 5, back: 562, mid: 490, front: 420 },
        { hole: 12, par: 3, back: 177, mid: 159, front: 95 },
        { hole: 13, par: 4, back: 458, mid: 430, front: 322 },
        { hole: 14, par: 5, back: 558, mid: 525, front: 481 },
        { hole: 15, par: 3, back: 132, mid: 122, front: 83 },
        { hole: 16, par: 4, back: 469, mid: 447, front: 286 },
        { hole: 17, par: 4, back: 324, mid: 316, front: 266 },
        { hole: 18, par: 4, back: 427, mid: 404, front: 332 },
      ],
    },
  ],

  // ─── TPC Scottsdale Stadium ───
  'tpc-scottsdale': [
    {
      name: 'TPC Scottsdale – Stadium Course',
      totalPar: 71,
      aliases: ['TPC Scottsdale Stadium Course', 'Scottsdale Stadium Course'],
      holes: [
        { hole: 1, par: 4, back: 403, mid: 355, front: 314 },
        { hole: 2, par: 4, back: 442, mid: 410, front: 357 },
        { hole: 3, par: 5, back: 558, mid: 530, front: 470 },
        { hole: 4, par: 3, back: 183, mid: 157, front: 114 },
        { hole: 5, par: 4, back: 470, mid: 417, front: 350 },
        { hole: 6, par: 4, back: 432, mid: 386, front: 316 },
        { hole: 7, par: 3, back: 215, mid: 188, front: 138 },
        { hole: 8, par: 4, back: 475, mid: 445, front: 322 },
        { hole: 9, par: 4, back: 453, mid: 405, front: 334 },
        { hole: 10, par: 4, back: 428, mid: 402, front: 342 },
        { hole: 11, par: 4, back: 472, mid: 446, front: 379 },
        { hole: 12, par: 3, back: 192, mid: 170, front: 122 },
        { hole: 13, par: 5, back: 558, mid: 508, front: 454 },
        { hole: 14, par: 4, back: 490, mid: 461, front: 401 },
        { hole: 15, par: 5, back: 553, mid: 498, front: 407 },
        { hole: 16, par: 3, back: 163, mid: 140, front: 98 },
        { hole: 17, par: 4, back: 332, mid: 294, front: 228 },
        { hole: 18, par: 4, back: 442, mid: 402, front: 318 },
      ],
    },
  ],
};

function isSequentialHoles(holes: ScorecardHole[]): boolean {
  return holes.every((hole, index) => hole.hole === index + 1);
}

function hasOrderedTees(hole: ScorecardHole): boolean {
  if (hole.front != null && hole.mid != null && hole.front > hole.mid) return false;
  if (hole.mid != null && hole.back != null && hole.mid > hole.back) return false;
  if (hole.front != null && hole.back != null && hole.front > hole.back) return false;
  return true;
}

function isUsableImportedScorecard(card: CourseScorecard): boolean {
  if (card.holes.length !== 9 && card.holes.length !== 18) return false;
  if (!isSequentialHoles(card.holes)) return false;
  const parSum = card.holes.reduce((sum, hole) => sum + hole.par, 0);
  if (parSum !== card.totalPar) return false;
  return card.holes.every((hole) => hasOrderedTees(hole));
}

const ALL_MANUAL_SCORECARDS = Object.values(SCORECARDS).flat();
const VALID_IMPORTED_SCORECARDS = IMPORTED_SCORECARDS.filter(isUsableImportedScorecard);
const ALL_SCORECARDS = [...ALL_MANUAL_SCORECARDS, ...VALID_IMPORTED_SCORECARDS];

// ─── Name-based lookup table ───
// We cannot always predict the exact OSM ID, so match by course name tokens.

interface NameEntry {
  key: string;
  patterns: RegExp[];
  loop?: string;
}

function normalizeCourseName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[#]/g, ' number ')
    .replace(/\bno\.?\b/g, ' number ')
    .replace(/\bgc\b/g, ' golf club ')
    .replace(/\bcc\b/g, ' country club ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(the|golf|club|course|links|resort|state park)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cardNameCandidates(card: CourseScorecard): string[] {
  return [card.name, ...(card.aliases ?? [])];
}

function matchesCardNameExact(card: CourseScorecard, courseName: string): boolean {
  const target = normalizeCourseName(courseName);
  if (!target) return false;
  return cardNameCandidates(card).some(
    (candidate) => normalizeCourseName(candidate) === target,
  );
}

function matchesManualCardName(card: CourseScorecard, courseName: string): boolean {
  const target = normalizeCourseName(courseName);
  if (!target) return false;
  return cardNameCandidates(card).some((candidate) => {
    const normalized = normalizeCourseName(candidate);
    return (
      normalized === target ||
      (normalized.length >= 8 &&
        target.length >= 8 &&
        (target.includes(normalized) || normalized.includes(target)))
    );
  });
}

const NAME_INDEX: NameEntry[] = [
  { key: 'torrey-pines-south', patterns: [/torrey\s*pines.*south/i], loop: 'South' },
  { key: 'torrey-pines-north', patterns: [/torrey\s*pines.*north/i], loop: 'North' },
  { key: 'pebble-beach', patterns: [/pebble\s*beach\s*golf\s*links/i, /pebble\s*beach(?!.*spyglass)/i] },
  { key: 'bethpage-black', patterns: [/bethpage.*black/i] },
  { key: 'augusta-national', patterns: [/augusta\s*national/i] },
  { key: 'pinehurst-no2', patterns: [/pinehurst.*(?:no\.?\s*2|#2|number\s*2)/i] },
  { key: 'tpc-sawgrass', patterns: [/tpc\s*sawgrass.*stadium/i, /sawgrass.*stadium/i, /players\s*stadium/i] },
  { key: 'whistling-straits', patterns: [/whistling\s*straits/i] },
  { key: 'kiawah-ocean', patterns: [/kiawah.*ocean/i, /ocean\s*course.*kiawah/i] },
  { key: 'pacific-dunes', patterns: [/pacific\s*dunes/i] },
  { key: 'spyglass-hill', patterns: [/spyglass\s*hill/i] },
  { key: 'tpc-scottsdale', patterns: [/tpc\s*scottsdale.*stadium/i, /scottsdale.*stadium/i] },
];

function pickScorecard(cards: CourseScorecard[], loop?: string): CourseScorecard | null {
  if (!cards.length) return null;
  if (loop) {
    const match = cards.find(
      (c) => c.loop && c.loop.toLowerCase() === loop.toLowerCase(),
    );
    if (match) return match;
  }
  return cards[0] ?? null;
}

export function findScorecard(opts: {
  courseName?: string;
  loop?: string;
  osmId?: number;
}): CourseScorecard | null {
  if (opts.osmId != null) {
    const exact = ALL_SCORECARDS.filter((card) => card.osmIds?.includes(opts.osmId!));
    const match = pickScorecard(exact, opts.loop);
    if (match) return match;
  }

  const courseName = opts.courseName?.trim();
  if (!courseName) return null;

  for (const entry of NAME_INDEX) {
    if (!entry.patterns.some((re) => re.test(courseName))) continue;
    const cards = SCORECARDS[entry.key];
    const match = pickScorecard(cards ?? [], opts.loop);
    if (match) return match;
  }

  const imported = VALID_IMPORTED_SCORECARDS.filter((card) =>
    matchesCardNameExact(card, courseName),
  );
  const manual = ALL_MANUAL_SCORECARDS.filter((card) =>
    matchesManualCardName(card, courseName),
  );
  const match = pickScorecard([...imported, ...manual], opts.loop);
  if (match) return match;

  return null;
}

export function findScorecardByLoop(
  coursePolygonNames: string[],
  loop: string,
): CourseScorecard | null {
  for (const name of coursePolygonNames) {
    const card = findScorecard({ courseName: name, loop });
    if (card) return card;
  }
  return null;
}
