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
        // 現行サイト流儀・DESIGN.mdのトークン完全整合
        primary: '#134230',
        'primary-container': '#2D5A46',
        'primary-fixed': '#EBF4F0',
        'on-primary-fixed-variant': '#134230',
        'on-primary': '#FFFFFF',
        secondary: '#f97316',     // orange-500（お申し込みボタン専用）
        'secondary-container': '#ea580c', // orange-600
        'on-secondary': '#FFFFFF',
        surface: '#FFFFFF',
        'on-surface': '#1E293B',
        'on-surface-variant': '#64748B',
        'surface-container-low': '#F8FAFC',
        'surface-container': '#F1F5F9',
        'surface-container-high': '#E2E8F0',
        'surface-container-highest': '#CBD5E1',
        'surface-container-lowest': '#FFFFFF',
        'outline-variant': '#E2E8F0'
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', '"Hiragino Kaku Gothic ProN"', 'Meiryo', 'sans-serif'],
        headline: ['"Plus Jakarta Sans"', '"Noto Sans JP"', '"Hiragino Kaku Gothic ProN"', 'sans-serif']
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
        'full': '9999px',
      }
    }
  }
};
