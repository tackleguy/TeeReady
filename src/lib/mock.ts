export type NavItem = { label: string; href: string };

export const NAV_ITEMS: NavItem[] = [
  { label: 'Today', href: '/today' },
  { label: 'Play', href: '/rounds/prep' },
  { label: 'Courses', href: '/courses' },
  { label: 'Progress', href: '/stats' },
];

export const ROUNDS_MODES = [
  { label: 'Prep', href: '/rounds/prep' },
  { label: 'GPS', href: '/rounds/gps' },
] as const;

export const CURRENT_USER = {
  name: 'Golfer',
  initials: 'G',
  handicap: 18,
  miss: 'right' as const,
};

export const CURRENT_LOCATION = 'Los Angeles';

const DISPLAY_PROFILE_KEY = 'teeready-display-v1';

export type DisplayProfile = {
  name: string;
  initials: string;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return CURRENT_USER.initials;
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

export function loadDisplayProfile(): DisplayProfile {
  try {
    const raw = localStorage.getItem(DISPLAY_PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DisplayProfile>;
      if (typeof parsed.name === 'string' && parsed.name.trim()) {
        const name = parsed.name.trim();
        return {
          name,
          initials:
            typeof parsed.initials === 'string' && parsed.initials.trim()
              ? parsed.initials.trim().slice(0, 2).toUpperCase()
              : initialsFromName(name),
        };
      }
    }
  } catch {
    // ignore
  }
  return {
    name: CURRENT_USER.name,
    initials: CURRENT_USER.initials,
  };
}

export function saveDisplayProfile(input: {
  name: string;
}): DisplayProfile {
  const name = input.name.trim() || CURRENT_USER.name;
  const next: DisplayProfile = {
    name,
    initials: initialsFromName(name),
  };
  try {
    localStorage.setItem(DISPLAY_PROFILE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('teeready-display-changed'));
  }
  return next;
}

export type Course = {
  slug: string;
  name: string;
  access: 'Public' | 'Private';
  distanceMi: number;
  playScore: number;
  wind: string;
  photo?: string;
};

export const COURSES: Course[] = [
  {
    slug: 'riviera',
    name: 'Riviera CC',
    access: 'Private',
    distanceMi: 4.1,
    playScore: 91,
    wind: '6 mph',
  },
  {
    slug: 'rancho-park',
    name: 'Rancho Park',
    access: 'Public',
    distanceMi: 2.5,
    playScore: 86,
    wind: '8 mph',
  },
  {
    slug: 'wilson-harding',
    name: 'Wilson & Harding',
    access: 'Public',
    distanceMi: 6.0,
    playScore: 79,
    wind: '11 mph',
  },
  {
    slug: 'torrey-pines',
    name: 'Torrey Pines',
    access: 'Public',
    distanceMi: 112,
    playScore: 74,
    wind: '14 mph',
  },
];

export const NEXT_TEE_TIME = {
  courseSlug: 'rancho-park',
  courseName: 'Rancho Park',
  time: '7:40 AM',
  playScore: 82,
  verdict: 'Good conditions',
  summary:
    'Light SW breeze, dry through 11. Wind turns west after 1 PM and the back nine plays into it.',
  wind: '8 mph SW',
  temp: 71,
  rainChance: 5,
};

export type Player = {
  pos: number;
  initials: string;
  name: string;
  thru: number;
  handicap: number;
  score: string;
  /** Gross to par numeric for sorting / delta display */
  toPar: number;
  isYou?: boolean;
  status?: 'playing' | 'finished' | 'away';
};

export type SkinHole = {
  hole: number;
  par: number;
  winner: string | null;
  note: string;
};

export type GroupActivity = {
  id: string;
  initials: string;
  name: string;
  text: string;
  ago: string;
};

export const GROUP: {
  name: string;
  course: string;
  format: string;
  pot: string;
  inviteCode: string;
  live: boolean;
  holeFocus: number;
  players: Player[];
  skins: SkinHole[];
  activity: GroupActivity[];
} = {
  name: 'Thursday Skins',
  course: 'Rancho Park · Blue tees',
  format: '$10 skins · net · carryovers',
  pot: '$40 on the table',
  inviteCode: 'TEE-4THU',
  live: true,
  holeFocus: 8,
  players: [
    {
      pos: 1,
      initials: 'JD',
      name: 'You',
      thru: 7,
      handicap: 12,
      score: '+4',
      toPar: 4,
      isYou: true,
      status: 'playing',
    },
    {
      pos: 2,
      initials: 'MR',
      name: 'Mia Reyes',
      thru: 7,
      handicap: 9,
      score: '+5',
      toPar: 5,
      status: 'playing',
    },
    {
      pos: 3,
      initials: 'TK',
      name: 'Tom Kane',
      thru: 6,
      handicap: 18,
      score: '+11',
      toPar: 11,
      status: 'playing',
    },
    {
      pos: 4,
      initials: 'AS',
      name: 'Ade Sowole',
      thru: 6,
      handicap: 15,
      score: '+13',
      toPar: 13,
      status: 'away',
    },
  ],
  skins: [
    { hole: 1, par: 4, winner: 'Mia', note: 'Birdie net' },
    { hole: 2, par: 5, winner: null, note: 'Carry' },
    { hole: 3, par: 3, winner: 'You', note: 'Closest pin' },
    { hole: 4, par: 4, winner: null, note: 'Carry' },
    { hole: 5, par: 4, winner: 'Mia', note: 'Par net' },
    { hole: 6, par: 4, winner: null, note: 'Carry' },
    { hole: 7, par: 5, winner: 'You', note: 'Eagle net' },
    { hole: 8, par: 3, winner: null, note: 'In play' },
  ],
  activity: [
    {
      id: '1',
      initials: 'MR',
      name: 'Mia',
      text: 'Pushed 6 — pot rolls to 8.',
      ago: '2m',
    },
    {
      id: '2',
      initials: 'JD',
      name: 'You',
      text: 'Dropped a bomb on 7. Skins on me.',
      ago: '8m',
    },
    {
      id: '3',
      initials: 'TK',
      name: 'Tom',
      text: 'Wind is howling on the ridge. Club up.',
      ago: '14m',
    },
    {
      id: '4',
      initials: 'AS',
      name: 'Ade',
      text: 'Grabbing a water — back on the tee in 2.',
      ago: '21m',
    },
  ],
};

// Playability helpers live in ./playability (live weather only).
