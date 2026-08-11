/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#E5F1FF',
          100: '#D0E8FF',
          200: '#A8D1FF',
          300: '#7FBAFF',
          400: '#57A3FF',
          500: '#007AFF',
          600: '#0066D6',
          700: '#0052AD',
          800: '#003D85',
          900: '#00295E',
        },
        apple: {
          blue: '#007AFF',
          indigo: '#5856D6',
          green: '#34C759',
          orange: '#FF9500',
          red: '#FF3B30',
          purple: '#AF52DE',
          pink: '#FF2D55',
          teal: '#5AC8FA',
          yellow: '#FFCC00',
          gray1: '#8E8E93',
          gray2: '#636366',
          gray3: '#48484A',
          gray4: '#3A3A3C',
          gray5: '#2C2C2E',
          gray6: '#1C1C1E',
        },
        ios: {
          gray: '#F5F5F7',
          dark: '#1D1D1F',
          secondary: '#86868B',
        },
      },
      fontFamily: {
        sans: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        'ios': '12px',
        'ios-lg': '16px',
        'ios-xl': '20px',
        'ios-2xl': '24px',
      },
      boxShadow: {
        'ios': '0 2px 12px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
        'ios-lg': '0 8px 32px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.06)',
        'ios-green': '0 4px 16px rgba(52, 199, 89, 0.3)',
        'ios-blue': '0 4px 16px rgba(0, 122, 255, 0.3)',
        'ios-red': '0 4px 16px rgba(255, 59, 48, 0.3)',
        'apple-sm': '0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
        'apple': '0 4px 16px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
        'apple-lg': '0 8px 32px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.06)',
        'apple-blue': '0 4px 16px rgba(0, 122, 255, 0.25)',
        'apple-green': '0 4px 16px rgba(52, 199, 89, 0.25)',
        'apple-red': '0 4px 16px rgba(255, 59, 48, 0.25)',
      },
      animation: {
        'blob-apple': 'blob-apple 10s ease-in-out infinite',
        'float-apple': 'float-apple 5s ease-in-out infinite',
        'blob': 'blob 8s ease-in-out infinite',
        'float': 'float 4s ease-in-out infinite',
      },
      keyframes: {
        'blob-apple': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(30px, -45px) scale(1.04)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.97)' },
        },
        'float-apple': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        blob: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(25px, -40px) scale(1.03)' },
          '66%': { transform: 'translate(-15px, 15px) scale(0.97)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      backdropBlur: {
        'apple': '25px',
      },
    },
  },
  plugins: [],
};
