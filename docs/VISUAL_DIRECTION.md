# [スコープ: 個別案件 / okayama-moshi] VISUAL_DIRECTION.md — 画像・動画・ファビコンアセット最適化仕様

## 1. 画像最適化パイプライン (`scripts/optimize_images.py`)

ローカル macOS 環境（PIL / Pillow ＋ `sips`）で実行し、Cloudflare Pages / CI 環境（`CF_PAGES` / `CI`）では自動スキップしてリポジトリにコミット済みの最適化アセットをそのまま配信する設計。

1. **ヒーロー画像 (`hero-main.webp` → PC/SP 出し分け)**:
   - PC 用: 横幅 `1920px`（LANCZOS リサイズ）、`hero-main-pc.webp` (quality=80) ＋ `hero-main-pc.avif`
   - SP 用: 横幅 `800px`、`hero-main-sp.webp` (quality=80) ＋ `hero-main-sp.avif`
2. **学年別教材・成績表サンプル (中3 / 中1・中2 / 小6)**:
   - 対象: `3_top`, `3-mondai`, `3-kaisetu`, `2-top`, `2-mondai`, `2-kaisetu`, `6-top`, `6-mondai`, `6-kaisetu`（WebP quality=85 ＋ AVIF）
   - `3_top`, `2-top`, `6-top` は追加で SP 軽量版（幅 `640px`, `-sp.webp` / `-sp.avif`）を生成し、`preview-c3-report`, `preview-card-report` へも同期展開。
3. **中3成績表拡大モーダル（カルーセル 3 枚）**:
   - `3-carousel-1` 〜 `3-carousel-3`: 高視認性を保つため WebP/AVIF ともに quality=95 で変換。
4. **プレビュー・記事汎用カード**:
   - `preview-card-exam.webp` (max 480px), `preview-card-answer.webp` (max 360px), `article-classroom.webp` (max 512px) ＋ 各 `.avif`。

---

## 2. 動画配信アーキテクチャ (Cloudflare R2 + 遅延読み込み)

- **ホスティング**: Cloudflare R2（`https://pub-ba61870bbe1442af87f84c258e756736.r2.dev/apply-guide.mp4`）。`_headers` の CSP `media-src 'self' https://*.r2.dev https://media.okayama-moshi.com` で許可。
- **ローディング規律**:
  - 初期ロード時の通信・帯域消費をゼロにするため、`preload="none"` かつ `src` 未設定・`data-src` 属性保持とする。
  - トップページ（モーダル展開時）および `/apply/`（最上部アコーディオン `#apply-guide-video-accordion` 開閉時）にのみ `data-src` から `src` を動的セットして再生し、閉じた時点で `video.pause()` を実行する（Playwright 品質ゲートで自動検証）。
- **microCMS 記事内動画**:
  - `build_ssg.py` と `generate_preview_page.py` が記事本文内の `.mp4` リンク/iframe/プレーンURL を自動検出し、最大幅 `360px`・角丸 `12px`・`controls playsinline preload="none"` の `<video>` プレイヤーへ置換。

---

## 3. ブランドファビコン体系

- `favicon.svg` / `favicon-32x32.png` / `favicon.ico` / `apple-touch-icon.png`（180×180）をルートおよび `public/` に配置し、`build_ssg.py` の `ensure_favicon_links()` で全ページへ一貫付与。
- OGP 共通サムネイル: `https://okayama-moshi.com/og-image.jpg`
