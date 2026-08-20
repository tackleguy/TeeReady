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
        warn: 'var(--warn)',
        bad: 'var(--bad)',
        hero: 'var(--hero)',
      },
      borderRadius: {
        card: '22px',
        hero: '28px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'system-ui',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'Menlo', 'monospace'],
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
      },
      animation: {
        shimmer: 'shimmer 2.2s linear infinite',
      },
    },
  },
  plugins: [],
};
