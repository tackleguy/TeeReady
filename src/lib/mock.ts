export type NavItem = { label: string; href: string };

export const NAV_ITEMS: NavItem[] = [
  { label: 'Today', href: '/' },
  { label: 'Courses', href: '/courses' },
  { label: 'Rounds', href: '/rounds' },
  { label: 'Group', href: '/group' },
];

export const CURRENT_USER = {
  name: 'Jordan Doyle',
  initials: 'JD',
  handicap: 12,
  miss: 'right' as const,
};

export const CURRENT_LOCATION = 'Los Angeles';

export type Hour = {
  label: string;
  short: string;
  score: number;
  temp: number;
  wind: string;
  summary: string;
};

export const HOURS: Hour[] = [
  {
    label: '6 AM',
    short: '6a',
    score: 71,
    temp: 58,
    wind: '5 mph SW',
    summary: 'Cool, calm, dew on greens',
  },
  {
    label: '7 AM',
    short: '7a',
    score: 82,
    temp: 61,
    wind: '6 mph SW',
    summary: 'Light breeze, ideal tee-off',
  },
  {
    label: '8 AM',
    short: '8a',
    score: 86,
    temp: 64,
    wind: '7 mph SW',
    summary: 'Best hour of the day',
  },
  {
    label: '9 AM',
    short: '9a',
    score: 84,
    temp: 67,
    wind: '8 mph SW',
    summary: 'Steady, sun breaking through',
  },
  {
    label: '10 AM',
    short: '10a',
    score: 80,
    temp: 70,
    wind: '9 mph SW',
    summary: 'Warming, breeze building',
  },
  {
    label: '11 AM',
    short: '11a',
    score: 74,
    temp: 72,
    wind: '11 mph W',
    summary: 'Firm greens, crosswind on 4-7',
  },
  {
    label: '12 PM',
    short: '12p',
    score: 66,
    temp: 74,
    wind: '13 mph W',
    summary: 'Gusty stretch begins',
  },
  {
    label: '1 PM',
    short: '1p',
    score: 58,
    temp: 75,
    wind: '15 mph W',
    summary: 'Wind shift west',
  },
  {
    label: '2 PM',
    short: '2p',
    score: 49,
    temp: 74,
    wind: '18 mph W',
    summary: 'Gusts to 22, one extra club',
  },
  {
    label: '3 PM',
    short: '3p',
    score: 54,
    temp: 72,
    wind: '16 mph W',
    summary: 'Easing slightly',
  },
];

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
};

export const GROUP: { name: string; players: Player[] } = {
  name: 'Thursday Skins',
  players: [
    { pos: 1, initials: 'JD', name: 'You', thru: 7, handicap: 12, score: '+4' },
    {
      pos: 2,
      initials: 'MR',
      name: 'Mia Reyes',
      thru: 7,
      handicap: 9,
      score: '+5',
    },
    {
      pos: 3,
      initials: 'TK',
      name: 'Tom Kane',
      thru: 6,
      handicap: 18,
      score: '+11',
    },
    {
      pos: 4,
      initials: 'AS',
      name: 'Ade Sowole',
      thru: 6,
      handicap: 15,
      score: '+13',
    },
  ],
};

/** Play-score colour ramp shared by bars, rings and badges. */
export function scoreColor(score: number): string {
  if (score >= 78) return '#14713f';
  if (score >= 60) return '#d9a83a';
  return '#d9714f';
}

export function bestWindowLabel(hours: Hour[]): string {
  if (!hours.length) return '';
  let bestStart = 0;
  let bestSum = -Infinity;
  for (let i = 0; i <= hours.length - 4; i++) {
    const sum =
      hours[i].score +
      hours[i + 1].score +
      hours[i + 2].score +
      hours[i + 3].score;
    if (sum > bestSum) {
      bestSum = sum;
      bestStart = i;
    }
  }
  const start = hours[bestStart];
  const end = hours[Math.min(bestStart + 3, hours.length - 1)];
  return `BEST ${start.short.toUpperCase()}–${end.short.toUpperCase()}`;
}
