# [スコープ: 個別案件 / okayama-moshi] REFERENCE_DNA.md — UI構造・共通スクリプト・パフォーマンス設計

## 1. 共通 UI モジュール構造 (`js/`)

| ファイル | 役割・主な機能 | 適用範囲 |
| :--- | :--- | :--- |
| `js/header.js` | PC ドロップダウン（「次回模試」「お問い合わせ」ホバー隙間防止ブリッジ `::before` 注入）、モバイル右スライドドロワー、アコーディオン展開時スクロール位置自動補正 (`revealMobileMenuSection`) | 全ページ共通 |
| `js/floating-cta.js` | SP（`md:hidden`）下部追従バー。`/apply`, `/contact`, `/privacy`, `/tokushoho` では完全非表示。トップページでは `#student-voices` 到達〜 `#schedule-selector`・申込エリア外でのみ `IntersectionObserver` + `rAF` 表示 | 公開案内ページ共通 |
| `js/venue-format.js` | `escapeHtml()` ＆ `formatVenuePlaceHtml()`（`※` 注釈分離、改行保持、切り捨て防止） | `index.html`, `lp/index.html` |
| `js/common-date.js` | URL クエリ `?test_date=YYYY-MM-DD` によるテスト日時シミュレーション共通提供 | サイト全体 |
| `js/sidebar-exam-widget.js` | `requestIdleCallback` 経由で `/api/exam-guides` を低優先取得し、中3・中2・中1・小6 の直近受付中回または受付終了表示を記事詳細サイドバーに描画 | `detail.html`, `news/[id]/`, `news/preview/` |
| `js/contact-config.js` | `window.CONTACT_CONFIG = { apiUrl: '/api/contact' }` | お問い合わせ 3 ページ |
| `js/microcms-config.js` | `serviceDomain: 'okamoshi-blog'`, `endpoint: 'blogs'`, **`apiKey: ''`（空固定）** | プレビュー・設定共有 |

---

## 2. レスポンシブ設計 ＆ アニメーション規律

- **ブレークポイント検証基準**: PC `1280px` / SP `375px`（Playwright 品質ゲート 2 プロジェクト標準）
- **SP カルーセル操作バー (`.features-nav-bar`)**:
  - `css/input.css` にて `.is-hidden` / `.is-floating`（`backdrop-filter: blur(8px)` + `env(safe-area-inset-bottom)` 考慮） / `.is-docked` の 3 状態を定義し、`transform` と `opacity` のみで遷移。
- **非合成アニメーション抑止**:
  - `.transition-all`, `.transition-colors`, タブピル・カード群に対し `transition-property: opacity, transform !important` を適用し、レイアウト・ペイント再計算による CLS/フレーム落ちを抑止。
- **LCP・初期描画最適化 (`index.html`)**:
  - `css/style.min.css` を `<style id="inline-style-min-css">` でインライン化しレンダリングブロック CSS ゼロ化。
  - `<link rel="preload" as="image" href="/images/hero-main-sp.avif" media="(max-width: 767px)">` と `hero-main-pc.avif`（`min-width: 768px`）で画面幅別に先読み。
  - Google Analytics 4 (`GT-NBJ63L9J`) と Microsoft Clarity (`z5nnqjwyks`) ＆ Google Fonts は `scroll` / `pointerdown` / `keydown` / `touchstart` または `load` 後 `5500ms` で遅延ロード（TBT 0ms 化）。
