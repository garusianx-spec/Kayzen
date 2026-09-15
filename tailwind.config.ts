import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * Every colour resolves from a CSS custom property, so the palette swaps at
 * runtime when the theme changes without a single class name moving. The tokens
 * themselves live in `src/app/globals.css`.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/hooks/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '480px' },
    },
    extend: {
      fontFamily: {
        'yekan-bakh': ['var(--font-yekan-bakh)', 'Yekan Bakh', 'Vazirmatn', 'Tahoma', 'sans-serif'],
        sans: ['var(--font-yekan-bakh)', 'Yekan Bakh', 'Vazirmatn', 'Tahoma', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      // Yekan Bakh ships 400 and 700 only (see src/lib/fonts.ts). The CSS
      // font-matching algorithm resolves 500 onto 400 and 600/800 onto 700, so
      // the scale below names the two weights that actually render.
      fontWeight: {
        normal: '400',
        medium: '400',
        semibold: '700',
        bold: '700',
        extrabold: '700',
      },
      fontSize: {
        // Persian glyphs sit lower than Latin ones; line-heights are padded to match.
        'caption-sm': ['0.6875rem', { lineHeight: '1.25rem', letterSpacing: '0' }],
        caption: ['0.75rem', { lineHeight: '1.5rem' }],
        body: ['0.875rem', { lineHeight: '1.75rem' }],
        'body-lg': ['1rem', { lineHeight: '2rem' }],
        title: ['1.125rem', { lineHeight: '2rem', fontWeight: '700' }],
        'title-lg': ['1.375rem', { lineHeight: '2.25rem', fontWeight: '700' }],
        display: ['1.75rem', { lineHeight: '2.5rem', fontWeight: '700' }],
        'display-lg': ['2.25rem', { lineHeight: '3rem', fontWeight: '700' }],
      },
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--kz-surface) / <alpha-value>)',
          raised: 'rgb(var(--kz-surface-raised) / <alpha-value>)',
          sunken: 'rgb(var(--kz-surface-sunken) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'rgb(var(--kz-card) / <alpha-value>)',
          foreground: 'rgb(var(--kz-text-primary) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--kz-border) / <alpha-value>)',
          strong: 'rgb(var(--kz-border-strong) / <alpha-value>)',
        },
        content: {
          primary: 'rgb(var(--kz-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--kz-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--kz-text-muted) / <alpha-value>)',
        },
        violet: {
          DEFAULT: 'rgb(var(--kz-violet) / <alpha-value>)',
          deep: 'rgb(var(--kz-violet-deep) / <alpha-value>)',
          soft: 'rgb(var(--kz-violet-soft) / <alpha-value>)',
        },
        flame: {
          DEFAULT: 'rgb(var(--kz-flame) / <alpha-value>)',
          soft: 'rgb(var(--kz-flame-soft) / <alpha-value>)',
        },
        emerald: {
          DEFAULT: 'rgb(var(--kz-emerald) / <alpha-value>)',
          soft: 'rgb(var(--kz-emerald-soft) / <alpha-value>)',
        },
        rose: {
          DEFAULT: 'rgb(var(--kz-rose) / <alpha-value>)',
          soft: 'rgb(var(--kz-rose-soft) / <alpha-value>)',
        },
        sky: {
          DEFAULT: 'rgb(var(--kz-sky) / <alpha-value>)',
          soft: 'rgb(var(--kz-sky-soft) / <alpha-value>)',
        },
        ring: 'rgb(var(--kz-ring) / <alpha-value>)',

        /* Semantic names. Prefer these in new code — `bg-background`,
           `text-foreground`, `text-muted-foreground`, `bg-card`,
           `bg-primary text-primary-foreground` — so a component never has to
           know which literal colour a theme resolves to. Defined in
           `globals.css`; contrast for every pair is asserted by
           `tests/contrast.test.ts`. */
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        popover: 'rgb(var(--popover) / <alpha-value>)',
        'popover-foreground': 'rgb(var(--popover-foreground) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        'muted-foreground': 'rgb(var(--muted-foreground) / <alpha-value>)',
        'subtle-foreground': 'rgb(var(--subtle-foreground) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          foreground: 'rgb(var(--success-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          foreground: 'rgb(var(--info-foreground) / <alpha-value>)',
        },
      },
      borderRadius: {
        card: '1.25rem',
        sheet: '1.75rem',
        pill: '999px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.24), 0 8px 24px -12px rgb(0 0 0 / 0.45)',
        fab: '0 8px 32px -8px rgb(var(--kz-violet) / 0.65)',
        nav: '0 -8px 32px -16px rgb(0 0 0 / 0.7)',
        glow: '0 0 0 1px rgb(var(--kz-violet) / 0.35), 0 0 32px -4px rgb(var(--kz-violet) / 0.45)',
      },
      backgroundImage: {
        /* Built from the fill tokens, not from `--kz-violet`: on the dark theme
           that ink is #9C88FF, and white on it is 2.0:1. Both stops here clear
           4.5:1 against white in either theme. */
        'violet-gradient':
          'linear-gradient(135deg, rgb(var(--primary-from)) 0%, rgb(var(--primary-to)) 100%)',
        'flame-gradient': 'linear-gradient(135deg, #FBBF24 0%, rgb(var(--kz-flame)) 100%)',
        'radial-glow':
          'radial-gradient(circle at center, rgb(var(--kz-violet) / 0.45) 0%, transparent 70%)',
      },
      spacing: {
        // The TWA runs edge-to-edge under the status and navigation bars, so
        // every fixed element pads itself out of the system insets.
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        nav: '4.5rem',
        'nav-offset': 'calc(4.5rem + env(safe-area-inset-bottom, 0px) + 1rem)',
        fab: '5.5rem',
      },
      height: {
        // `--kz-viewport-height` is set from `visualViewport` where it exists;
        // `100dvh` is the fallback and is correct on its own in most browsers.
        viewport: 'var(--kz-viewport-height, 100dvh)',
      },
      minHeight: {
        viewport: 'var(--kz-viewport-height, 100dvh)',
      },
      keyframes: {
        'flame-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.12)', opacity: '0.85' },
        },
        'glow-breathe': {
          '0%, 100%': { opacity: '0.35', transform: 'scale(0.95)' },
          '50%': { opacity: '0.7', transform: 'scale(1.1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(-100%)' },
        },
        'check-draw': {
          from: { strokeDashoffset: '24' },
          to: { strokeDashoffset: '0' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
      },
      animation: {
        'flame-pulse': 'flame-pulse 1.8s ease-in-out infinite',
        'glow-breathe': 'glow-breathe 3.5s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        'check-draw': 'check-draw 240ms ease-out forwards',
        'sheet-up': 'sheet-up 280ms cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [animate],
};

export default config;
