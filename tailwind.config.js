/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ocean: {
          50: '#f0f7f8',
          100: '#d9ecee',
          200: '#b3d7dc',
          300: '#83b9c1',
          400: '#5296a1',
          500: '#357985',
          600: '#24606c',
          700: '#1c4b55',
          800: '#163a42',
          900: '#0f2a30',
          950: '#081619',
        },
        amber: {
          50: '#fdf8ef',
          100: '#faedd2',
          200: '#f5d99f',
          300: '#efc06b',
          400: '#eaa848',
          500: '#e08d2a',
          600: '#c56d1f',
          700: '#9c501d',
          800: '#7d3f1d',
          900: '#66351b',
        },
        ivory: {
          50: '#fdfcf8',
          100: '#faf6ec',
          200: '#f3ead4',
          300: '#e8d9b2',
          400: '#d9c188',
        },
        ink: {
          50: '#f4f5f6',
          100: '#e7e8ea',
          200: '#c9ccd1',
          300: '#9ea3ac',
          400: '#6d7480',
          500: '#4d525c',
          600: '#383c45',
          700: '#2a2d35',
          800: '#1e2128',
          900: '#13151a',
        },
      },
      borderRadius: {
        'xl2': '1.25rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 42, 48, 0.04), 0 4px 16px rgba(15, 42, 48, 0.06)',
        lifted: '0 4px 12px rgba(15, 42, 48, 0.08), 0 16px 48px rgba(15, 42, 48, 0.12)',
        glow: '0 0 0 4px rgba(234, 168, 72, 0.28)',
      },
      backgroundImage: {
        'grain': "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.08 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
        'shimmer': 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
};
