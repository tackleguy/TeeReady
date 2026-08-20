/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'system-ui',
          'sans-serif',
        ],
      },
      opacity: {
        8: '0.08',
        12: '0.12',
        35: '0.35',
        45: '0.45',
      },
      keyframes: {
        twinkle: {
          '0%, 100%': { opacity: '0.2' },
          '50%': { opacity: '1' },
        },
        rainfall: {
          '0%': { transform: 'translateY(-10%) translateX(0)' },
          '100%': { transform: 'translateY(110vh) translateX(20px)' },
        },
        snowfall: {
          '0%': { transform: 'translateY(-10%) translateX(0)' },
          '50%': { transform: 'translateY(50vh) translateX(15px)' },
          '100%': { transform: 'translateY(110vh) translateX(0)' },
        },
        flash: {
          '0%, 100%': { opacity: '0' },
          '5%': { opacity: '0.8' },
          '8%': { opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        twinkle: 'twinkle 3s ease-in-out infinite',
        shimmer: 'shimmer 2.2s linear infinite',
      },
    },
  },
  plugins: [],
};
