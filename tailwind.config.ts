import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Poppins', 'system-ui', 'sans-serif'],
      },
      colors: {
        /* ── WhatsApp Dark Theme ── */
        wa: {
          bg: {
            DEFAULT: '#111b21',
            panel: '#202c33',
            conversation: '#0b141a',
            input: '#2a3942',
            hover: '#2a3942',
            deeper: '#0c1317',
          },
          bubble: {
            in: '#202c33',
            out: '#005c4b',
          },
          text: {
            primary: '#e9edef',
            secondary: '#8696a0',
            bubble: '#ffffff',
            time: '#ffffff99',
          },
          accent: {
            green: '#00a884',
            blue: '#53bdeb',
            teal: '#00a884',
          },
          border: {
            DEFAULT: '#222d34',
            strong: '#3b4a54',
          },
        },
        /* ── CRM Brand Colors ── */
        crm: {
          primary: '#1e3a5f',
          'primary-hover': '#162d4d',
          'primary-light': '#2a4f7f',
          secondary: '#2563eb',
          'secondary-hover': '#1d4ed8',
          success: '#059669',
          'success-hover': '#047857',
          warning: '#d97706',
          'warning-hover': '#b45309',
          danger: '#dc2626',
          'danger-hover': '#b91c1c',
          info: '#0891b2',
        },
        /* ── Surfaces (Light Mode) ── */
        surface: {
          bg: '#f7f8fa',
          card: '#ffffff',
          sidebar: '#ffffff',
          border: '#e8eaef',
          'border-light': '#f1f3f5',
          divider: '#eef0f2',
        },
        /* ── Text Colors ── */
        txt: {
          primary: '#1a1d21',
          secondary: '#5f6368',
          muted: '#9aa0a6',
          disabled: '#c4c7cc',
          inverse: '#ffffff',
        },
      },
      borderRadius: {
        'card': '16px',
        'btn': '12px',
        'input': '12px',
        'modal': '20px',
        'bubble': '12px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.03)',
        'modal': '0 20px 60px rgba(0, 0, 0, 0.15), 0 8px 20px rgba(0, 0, 0, 0.08)',
        'dropdown': '0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
        'btn-hover': '0 2px 8px rgba(30, 58, 95, 0.2)',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '100': '25rem',
        '120': '30rem',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-up': 'slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slideInRight 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-dot': 'pulseDot 1.5s ease-in-out infinite',
        'spin-slow': 'spin 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
