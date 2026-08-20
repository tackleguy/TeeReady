/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f4f5f2',
        surface: '#ffffff',
        ink: '#12160f',
        muted: '#707a6b',
        faint: '#98a291',
        line: 'rgba(18,30,15,0.08)',
        brand: { DEFAULT: '#14713f', soft: '#e6f0e8' },
        warn: '#d9a83a',
        bad: '#d9714f',
      },
      borderRadius: {
        card: '22px',
        hero: '28px',
      },
      boxShadow: {
        card: '0 1px 4px rgba(18,30,15,0.07)',
        lift: '0 8px 26px rgba(18,30,15,0.12)',
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
