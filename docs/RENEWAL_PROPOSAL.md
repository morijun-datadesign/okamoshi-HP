# [スコープ: 個別案件 / okayama-moshi] RENEWAL_PROPOSAL.md — 本番運用マニュアル ＆ 技術改善ロードマップ

## 1. 日常運用・デプロイ標準手順

### 1.1 ビルド ＆ 品質ゲート ＆ ブランチ完全同期手順
サイト改修時はプレビュー（`feature/idea-b`）と本番（`main`）の SHA を必ず完全一致させます。

```bash
# 1. CSS 再ビルド + microCMS SSG + index.html インライン CSS 更新
python3 scripts/build.py --skip-images

# 2. スマート品質ゲート検証（本番反映前・フル変更時は --full を使用）
npm run quality-gate:smart

# 3. プレビュー＆本番ブランチの同一コミット同期プッシュ
#    git push 時に pre-push フックが自動起動（--no-verify 禁止）
```

### 1.2 模試日程・実施塾データの更新手順（GAS 連携）
1. 事務局用 Google スプレッドシートの「模試データ管理 > D1へデータを同期する」（`gas/sync-exam-guides.js`）または「★サイト連携 > 実施塾データをWebサイト(D1)へ同期」（`gas/sync-cram-schools.js`）を実行。
2. スクリプトは `API_URLS` に登録された **本番 (`https://okayama-moshi.com/...`)** と **プレビュー (`https://feature-idea-b.okamoshi-hp.pages.dev/...`)** 双方の D1 を同時に洗い替え更新する。

### 1.3 microCMS 記事公開・更新手順
1. microCMS (`okamoshi-blog` / `blogs`) で下書き作成時は `https://okayama-moshi.com/news/preview/?id=<ID>&draftKey=<KEY>` で即時表示確認が可能。
2. 記事公開後、`MICROCMS_API_KEY` を設定した環境で `python3 scripts/build.py --skip-images` を実行すると、`scripts/fallback_articles.json`・`news/[id]/index.html`・`news.html`・`index.html`・`lp/index.html`・`sitemap.xml` が一括再生成される。

### 1.4 郵便番号・文科省学校マスター定期更新手順 (`db/README.md`)
```bash
python3 scripts/build_master_seed.py
npx wrangler d1 execute okamoshi-master --remote --file=db/seed/zip_codes.sql
npx wrangler d1 execute okamoshi-master --remote --file=db/seed/schools.sql
```

---

## 2. 認識済み技術課題・改善ロードマップ

| 優先度 | 対象課題 | 概要・改善方針 | 関連ファイル |
| :--- | :--- | :--- | :--- |
| **完了** | **下層ページの Tailwind Play CDN 脱却** | 2026-11-25 完了：`tailwind.config.js` へ全下層ページトークンを統合し、全 31 HTML（`apply/`, `contact/`, `schools.html`, `news.html`, `detail.html`, `lp/`, `privacy.html`, `tokushoho.html`, `404.html` 及び全 SSG 記事）から `cdn.tailwindcss.com` を撤去して `/css/style.min.css` へ完全統一。品質ゲート（`perf/tailwind-cdn` ＆ Playwright）で CDN ゼロを自動強制。 | `tailwind.config.js`, `scripts/build.py`, `scripts/quality-gate/static-checks.mjs`, `tests/e2e/quality-gate.spec.mjs` |
| **中（一部完了）** | **大型 HTML 内インライン JS の外部モジュール分割** | 2026-11-25 `apply/index.html` → `js/apply-form.js`、`apply/success/index.html` → `js/apply-success.js`、`schools.html` → `js/schools-search.js` の外部モジュール化を完了。残る `index.html`（約 95KB JS）・`lp/index.html`（約 138KB JS）の分離を将来検討する。 | `js/apply-form.js`, `js/apply-success.js`, `js/schools-search.js`, `index.html`, `lp/index.html` |
| **低** | **`wrangler.toml` / `CLOUDFLARE` デプロイ設定の一元確認** | 現在 `wrangler.toml` 本体は Git 管理外（`.gitignore`）・テンプレートとして `wrangler.toml.example` を保持。ダッシュボード環境変数とバインディング（`DB`）の整合監視を継続する。 | `wrangler.toml.example` |
