import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Bảng màu lấy cảm hứng công nghiệp dầu khí: xanh thép + hổ phách
        brand: {
          50: '#f0f7ff',
          100: '#e0eefe',
          200: '#bad9fd',
          300: '#7cbafb',
          400: '#3697f6',
          500: '#0c78e8',
          600: '#005cc6',
          700: '#0149a0',
          800: '#063e84',
          900: '#0b356e',
          950: '#07214a',
        },
        accent: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
