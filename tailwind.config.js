/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        line: 'var(--line)',
        brand: { DEFAULT: 'var(--brand)', soft: 'var(--brand-soft)' },
        accent: { DEFAULT: 'var(--accent)', soft: 'var(--accent-soft)' },
        warn: 'var(--warn)',
        bad: 'var(--bad)',
        hero: 'var(--hero)',
      },
      fontSize: {
        hero: 'var(--type-hero-num)',
        display: 'var(--type-display)',
        stat: 'var(--type-stat)',
        title: 'var(--type-title)',
        body: 'var(--type-body)',
        detail: 'var(--type-detail)',
        micro: 'var(--type-micro)',
      },
      borderRadius: {
        card: '14px',
        hero: '20px',
        pill: '999px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
        inset: 'var(--shadow-inset)',
      },
      fontFamily: {
        sans: ['Sora', 'system-ui', 'sans-serif'],
        display: ['Literata', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      opacity: {
        8: '0.08',
        12: '0.12',
        35: '0.35',
        45: '0.45',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.2s linear infinite',
        'fade-up': 'fade-up 0.5s ease-out both',
      },
    },
  },
  plugins: [],
};
