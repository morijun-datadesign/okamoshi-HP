# [スコープ: 個別案件 / okayama-moshi] QA_REPORT.md — 自動品質ゲート ＆ CI 監査仕様

## 1. 品質ゲートアーキテクチャ (`scripts/smart-quality-gate.mjs` / `scripts/quality-gate/`)

おかもしリポジトリは `.githooks/pre-push`（および `.git/hooks/pre-push`）による物理ロックと、以下の 5 段階自動検査で構成されています。

### 1.1 検査項目一覧
1. **静的検査 (`scripts/quality-gate/static-checks.mjs`)**:
   - `security/secret`: APIキー・シークレット実値・分割難読化の混入検知（環境変数名・Turnstile 公開サイトキー等は除外）。
   - `security/forbidden-file`: `.env*`, `.dev.vars`, `*.pem`, `*.key` 等が Git 管理/公開対象に含まれていないこと。
   - `security/exposed-file`: 公開不要ファイルが `_redirects` で `/404.html 200` 遮断されていること（`/docs/*`, `/functions/*`, `/scripts/*`, `/gas/*`, `/migrations/*`, `/db/*`, `/tests/*` 等）。
   - `perf/tailwind-cdn`: 全 HTML ファイルに Tailwind Play CDN（`cdn.tailwindcss.com`）が残存していないこと（`/css/style.min.css` 統一強制）。
   - `perf/preconnect-budget`: 各 HTML 内の `<link rel="preconnect">`（上限2個以下）と `_headers` 内の `rel="preconnect"` の合計が 4 個未満であること。
   - `perf/lcp-preload`: `index.html` と `lp/index.html` に `hero-main-sp.avif` の `<link rel="preload" as="image" ... fetchpriority="high">` が必ず存在すること。
   - `perf/no-head-sync-gtag`: `404.html` 以外の HTML `<head>` 内に遅延制御なしの `gtag/js` 直書き（`<script ... src="...googletagmanager.com/gtag/js...">`）が存在しないこと。
   - `garbage/placeholder` & `garbage/visible-text`: 未置換プレースホルダー、`undefined` / `null` / `NaN` / `[object Object]` / `TODO` 等の表示露出ゼロ。
   - `design/forbidden-color` & `design/unregistered-hex`: `blue-*` 等禁止 12 系統および `ALLOWED_HEX` 未登録色の混入ゼロ。
2. **AI 常駐ルール同期検査 (`scripts/sync-ai-rules.mjs --check`)**:
   - 正本 `GEMINI.md` から `CLAUDE.md` / `.cursorrules` / `.idx/airules.md` / `.antigravity/rules.md` / `.agents/rules/okamoshi-core.md` への完全同期を保証。
3. **TypeScript 型チェック (`npx tsc --noEmit`)**:
   - `functions/**/*.ts` および `tsconfig.json` (`@cloudflare/workers-types`) の厳格型検査。
4. **バックエンド堅牢化単体テスト (`node tests/unit/backend-hardening.test.mjs`)**:
   - D1 `apply_initial_emails` 原子ロックによる `/api/apply` ＆ `stripe-webhook.ts` 同時競合・リロード・未到達・部分失敗リトライ冪等性、`checkRecentPaidSession` の 100 件超ページネーション走査、`gas/apply-ledger.gs` `updateStatus_` のバッチ更新＆`paid` 上書き禁止保護を検証。
5. **実施塾公式サイト URL 全件検査 (`scripts/check-juku-urls.mjs`)**:
   - `cram_schools.csv` 登録済み公式サイト URL の疎通・ソフト404・サイト内容整合性・HTTPS 化可能性を全件検証。
6. **Playwright 実ブラウザ検査 (`tests/e2e/quality-gate.spec.mjs`)**:
   - ローカル静的エミュレータ (`scripts/quality-gate/server.mjs`: `_redirects` / 308 / 404 再現) ＋ PC `1280×900` (`pc-1280`) / iPhone `375×812` (`sp-375`) の 2 環境。
   - `pageerror`・`console.error` ゼロ、Tailwind Play CDN（`cdn.tailwindcss.com`）ゼロ、横スクロールゼロ、主要要素コントラスト比 `>= 3.0`、画像描画・`alt`・単一 `<h1>`・見出し階層、会場名省略禁止＆`※`注釈分離、旧サイト 301・404 計測後遷移（`/?from_404=`）を検査。
   - **パフォーマンス ＆ 計測ハードゲート**:
     - `pc-1280`: 操作なし・ページ表示開始 1000ms 以内に `/g/collect`（`tid=G-QCFQWJHMQD`, `en=page_view`, `ep.transport_type` なし）が送信され HTTP 200/204 が返ること、かつ CSP 違反ゼロであること。
     - `sp-375`: CDP `Emulation.setCPUThrottlingRate({ rate: 4 })` 適用下でトップページ（`/`）を実測し、LCP `<= 2500ms`（対象 `hero-main-sp`）・TBT `<= 250ms`、かつ操作なしで `/g/collect`（`tid=G-QCFQWJHMQD`）が送信され HTTP 200/204 が返ること。
   - **`@critical-forms` 死活監視（毎回100%実行）**:
     - `/contact/`（個人・団体両タブの送信完了画面視認性・学年選択肢表記）
     - `/apply/`（操作解説動画アコーディオン遅延読込・学年表記・在籍小中学校名レイアウト・必須バリデーション・郵便番号 7 桁バリデーション＆住所自動補完・会場受験×カード決済＆小6自宅受験×コンビニ決済での `/apply/success` 遷移とコントラスト検査）

---

## 2. 3段階ギア制御 (`smart-quality-gate.mjs`) ＆ GitHub Actions CI

| 実行モード | トリガー条件 | 実行内容 |
| :--- | :--- | :--- |
| **PREVIEW MODE (`--preview`)** | `main` 以外のプレビューブランチ（`feature/idea-b` 等）単独プッシュ | 静的検査 ＋ AI ルール同期 ＋ TypeScript 型チェックのみ（数秒で通過） |
| **FAST MODE** | ローカル実行で特定HTML/記事のみ修正した場合 | 上記 3 検査 ＋ 変更対象ページ + `@critical-forms` の Playwright 検査 |
| **FULL MODE (`--full`)** | `main`（本番）プッシュ時、または `css/`・`js/`・`functions/`・`apply/`・`contact/`・`tests/`・`scripts/`・`_redirects`・`GEMINI.md` 等変更時 | 全 5 ステップ完全実行（`main` プッシュ時は `SKIP_QUALITY_GATE=1` バイパス禁止） |

- **GitHub Actions (`.github/workflows/ci.yml`)**: `main` への push / PR 時に Node.js 20 で `static-checks.mjs`、`sync-ai-rules.mjs --check`、`npm run typecheck`、`npm run build:functions` (`wrangler pages functions build`) を自動検証。
- **既知課題管理 (`tests/e2e/known-issues.json`)**: `emptyArticleBodies` 配列は現在空 `[]`（除外ゼロ）。
