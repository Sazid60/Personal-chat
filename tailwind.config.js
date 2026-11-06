/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#030712',
        foreground: '#f8fafc',
        card: {
          DEFAULT: 'rgba(9, 14, 26, 0.85)',
          foreground: '#f8fafc',
        },
        popover: {
          DEFAULT: '#090e1a',
          foreground: '#f8fafc',
        },
        primary: {
          DEFAULT: '#00f0ff',
          foreground: '#030712',
        },
        secondary: {
          DEFAULT: '#1e293b',
          foreground: '#f8fafc',
        },
        muted: {
          DEFAULT: '#111827',
          foreground: '#94a3b8',
        },
        accent: {
          DEFAULT: '#0070f3',
          foreground: '#f8fafc',
        },
        destructive: {
          DEFAULT: '#ff3366',
          foreground: '#ffffff',
        },
        border: 'rgba(0, 240, 255, 0.18)',
        input: 'rgba(15, 23, 42, 0.75)',
        ring: '#00f0ff',
      },
      fontFamily: {
        hud: ['Rajdhani', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        cyber: '0 0 25px rgba(0, 240, 255, 0.25)',
        cyberRed: '0 0 25px rgba(255, 51, 102, 0.3)',
      },
      borderRadius: {
        lg: '12px',
        md: '8px',
        sm: '6px',
      },
    },
  },
  plugins: [],
};

