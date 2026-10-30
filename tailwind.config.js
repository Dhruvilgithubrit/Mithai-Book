/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand — saffron orange
        orange: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316', // primary
          600: '#ea6c0a',
          700: '#c2540a',
          800: '#9a3c10',
          900: '#7c3111',
        },
        // Warm dark backgrounds
        stone: {
          950: '#0c0a09',
          900: '#1c1917',
          800: '#292524',
          700: '#44403c',
          600: '#57534e',
          500: '#78716c',
          400: '#a8a29e',
          300: '#d6d3d1',
          200: '#e7e5e4',
          100: '#f5f5f4',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'base': ['1rem', { lineHeight: '1.5' }],
      },
      minHeight: {
        '12': '3rem',   // 48px — minimum tap target
        '14': '3.5rem', // 56px
        '16': '4rem',   // 64px
      },
      borderRadius: {
        'xl':  '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'glow-orange': '0 0 20px rgba(249, 115, 22, 0.35)',
        'glow-sm':     '0 0 12px rgba(249, 115, 22, 0.2)',
      },
    },
  },
  plugins: [],
}
