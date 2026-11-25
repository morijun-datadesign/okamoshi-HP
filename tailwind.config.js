/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./apply/**/*.html",
    "./contact/**/*.html",
    "./lp/**/*.html",
    "./news/**/*.html",
    "./js/**/*.js"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#134230',       // おかもし伝統のディープグリーン
          greenDark: '#0A261B',   // ホバー用ダークグリーン
          greenLight: '#EBF4F0',  // 爽やかな淡いグリーン背景
          greenAccent: '#1F6B51', // ボタン・強調用の中間グリーン
          dateBrown: '#8B3A18',   // 日程表示用のアクセントブラウン
          homeBrown: '#4A4031',   // 自宅受験用の落ち着いたブラウン
          grayBg: '#F1F5F9'
        },
        // 全ページ統合デザインシステム・トークン（GEMINI.md & 下層ページ Material 3 準拠）
        primary: '#134230',
        'primary-container': '#2d5a46',
        'primary-fixed': '#bceed3',
        'primary-fixed-dim': '#a1d1b8',
        'on-primary': '#ffffff',
        'on-primary-container': '#9fcfb6',
        'on-primary-fixed': '#002114',
        'on-primary-fixed-variant': '#224f3c',
        'inverse-primary': '#a1d1b8',
        secondary: '#a23e18',
        'secondary-container': '#fe8357',
        'secondary-fixed': '#ffdbcf',
        'secondary-fixed-dim': '#ffb59c',
        'on-secondary': '#ffffff',
        'on-secondary-container': '#6f2000',
        'on-secondary-fixed': '#390c00',
        'on-secondary-fixed-variant': '#822801',
        tertiary: '#4f3600',
        'tertiary-container': '#6c4c00',
        'tertiary-fixed': '#ffdea7',
        'tertiary-fixed-dim': '#f2be5b',
        'on-tertiary': '#ffffff',
        'on-tertiary-container': '#f1bd5a',
        'on-tertiary-fixed': '#271900',
        'on-tertiary-fixed-variant': '#5e4200',
        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error': '#ffffff',
        'on-error-container': '#93000a',
        background: '#f8fafc',
        'on-background': '#1b1c1c',
        surface: '#f8fafc',
        'surface-bright': '#ffffff',
        'surface-dim': '#dcd9d9',
        'surface-tint': '#3a6752',
        'surface-variant': '#e4e2e1',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#F1F5F9',
        'surface-container': '#E2E8F0',
        'surface-container-high': '#E2E8F0',
        'surface-container-highest': '#CBD5E1',
        'on-surface': '#1b1c1c',
        'on-surface-variant': '#414944',
        'inverse-surface': '#303030',
        'inverse-on-surface': '#f3f0ef',
        outline: '#717973',
        'outline-variant': '#E2E8F0'
      },
      spacing: {
        'gutter-desktop': '1.5rem',
        'gutter-mobile': '1rem',
        'container-max': '75rem',
        'space-2xs': '0.25rem',
        'space-xs': '0.5rem',
        'space-sm': '0.75rem',
        'space-md': '1rem',
        'space-lg': '1.5rem',
        'space-xl': '2rem',
        'space-2xl': '3rem',
        'space-3xl': '4.5rem',
        'space-4xl': '6rem'
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', '"Hiragino Kaku Gothic ProN"', 'Meiryo', 'sans-serif'],
        headline: ['"Plus Jakarta Sans"', '"Noto Sans JP"', '"Hiragino Kaku Gothic ProN"', 'sans-serif'],
        'headline-xl': ['"Plus Jakarta Sans"', '"Noto Sans JP"', 'sans-serif'],
        'headline-xl-mobile': ['"Plus Jakarta Sans"', '"Noto Sans JP"', 'sans-serif'],
        'headline-lg': ['"Plus Jakarta Sans"', '"Noto Sans JP"', 'sans-serif'],
        'headline-lg-mobile': ['"Plus Jakarta Sans"', '"Noto Sans JP"', 'sans-serif'],
        'headline-md': ['"Plus Jakarta Sans"', '"Noto Sans JP"', 'sans-serif'],
        'headline-sm': ['"Plus Jakarta Sans"', '"Noto Sans JP"', 'sans-serif'],
        'body-lg': ['"Noto Sans JP"', 'sans-serif'],
        'body-md': ['"Noto Sans JP"', 'sans-serif'],
        'body-sm': ['"Noto Sans JP"', 'sans-serif'],
        'label-lg': ['"Plus Jakarta Sans"', '"Noto Sans JP"', 'sans-serif'],
        'label-md': ['"Plus Jakarta Sans"', '"Noto Sans JP"', 'sans-serif'],
        'label-sm': ['"Plus Jakarta Sans"', '"Noto Sans JP"', 'sans-serif']
      },
      borderRadius: {
        'none': '0px',
        'sm': '4px',
        'DEFAULT': '6px',
        'md': '6px',
        'lg': '8px',
        'xl': '8px',
        '2xl': '8px',
        '3xl': '8px',
        'full': '9999px'
      }
    }
  }
};
