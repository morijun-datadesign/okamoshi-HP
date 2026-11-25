# [スコープ: 個別案件 / okayama-moshi] STRATEGY_RESEARCH.md — 技術診断・SWOT・AISAS・改善戦略

## 1. 現行本番サイトの技術診断（実装済み到達水準）

| 観点 | 実装状況・強み | 根拠ファイル |
| :--- | :--- | :--- |
| **パフォーマンス / CWV** | `index.html` への `style.min.css` インライン展開、ヒーロー画像 PC/SP 別 AVIF `<link rel="preload" fetchpriority="high">`、Google Fonts ノンブロッキング読込（`media="print" onload`）、GA4/Clarity の idle + 操作時遅延ロード、R2 動画 `preload="none"` 遅延注入、CLS 防止用見出し `min-height`・アイコン枠固定を実装 | `index.html`, `css/input.css`, `scripts/build.py` |
| **アクセシビリティ (a11y)** | NEW バッジコントラスト改善（`#b5451f`）により WCAG AA（>=4.5:1）適合。Playwright 品質ゲートで文字・ボタンコントラスト比 `>= 3.0` および主要テキストサイズを自動検査 | `css/input.css`, `tests/e2e/quality-gate.spec.mjs` |
| **セキュリティ / 防御** | `_headers` で `X-Frame-Options: SAMEORIGIN`・`HSTS preload`・`CSP`・`COOP` 設定。`_redirects` で非公開ファイル/ディレクトリへの直接アクセスを `/404.html` へ遮断。サーバー側金額強制・Webhook HMAC 署名検証・Turnstile・`escapeHtml()`・`static-checks.mjs` シークレット検出を運用 | `_headers`, `_redirects`, `functions/api/*`, `scripts/quality-gate/static-checks.mjs` |
| **データ整合性・信頼性** | 本番（`main`）とプレビュー（`feature/idea-b`）への GAS 二重同期、旧サイト Stripe 決済除外ガード、コンビニ重複決済ガード、GAS `LockService` 排他制御を実装 | `gas/*.js`, `functions/api/stripe-webhook.ts` |
| **技術負債（認識済み）** | `index.html` 以外のページ（`apply/`, `contact/`, `schools.html`, `news.html`, `detail.html`, `lp/`, `privacy.html`, `tokushoho.html`, `404.html`）が依然として `cdn.tailwindcss.com`（Tailwind Play CDN）に依存 | `tests/e2e/quality-gate.spec.mjs` L46 註記 |

---

## 2. SWOT ＆ クロス SWOT 分析

| | **強み (Strength)** | **弱み (Weakness)** |
| :--- | :--- | :--- |
| **内部要因** | ・県内 119 実施塾ネットワークと公立入試特化の精度<br>・Cloudflare エッジ完結（Pages + Functions + D1 + R2）による高速・低運用コスト<br>・Playwright `@critical-forms` 含む物理ロック付き品質ゲート | ・下層ページでの Tailwind Play CDN 残存による初回描画コスト<br>・HTML 各ページ内のインライン JS 肥大化（例：`apply/index.html` 約 147KB JS） |
| **外部要因** | **機会 (Opportunity)** | **脅威 (Threat)** |
| **SO / WO 戦略** | ・中学 1・2 年生からの早期母集団囲い込み（記事 SSG＋コラム SEO 強化）<br>・スマホ保護者向け申込 UX 最適化（手順動画＋自動補完） | ・旧サイト（WordPress）URL 変更に伴う検索評価毀損リスク → **301 網羅で解消済**<br>・コンビニ未入金キャンセルや重複申込による問い合わせ増加 → **Webhook 重複ガードで抑制済** |

---

## 3. 2系統 AISAS カスタマージャーニー

### 3.1 個人（保護者・受験生）導線
1. **Attention / Interest**: Google 検索（高校入試情報コラム / 模試検索）または実施塾からの案内でトップ (`/`) または `/news/[id]/` へ流入。
2. **Search**: トップページ `#schedule-selector` でお子様の学年タブを選択し、実施日・会場・時間割・出題範囲・料金を確認。近くの実施塾を確認する場合は `/schools.html` で学区検索。
3. **Action**: 「この日程で申し込む」CTA（`bg-orange-700`）またはスマホ追従バーから `/apply/` へ遷移。郵便番号・学校名サジェストを活用し、カードまたはコンビニ決済で申込完了（`/apply/success`）。
4. **Share / Retention**: 自動返信メール・受験票案内・結果返却を経て、次回月号（10月→12月→3月等）の継続申込へ循環。

### 3.2 塾・学校関係者（団体導入）導線
1. **Attention / Interest**: ヘッダーナビ「お問い合わせ > 塾・学校関係者様」またはフッター導線から `/contact/organization/`（または `/contact/` の団体タブ）へ到達。
2. **Action**: 貴塾・学校名・教室名を入力して送信 → Resend 経由で担当部門（`CONTACT_ADMIN_EMAILS`）へ即時通知。
