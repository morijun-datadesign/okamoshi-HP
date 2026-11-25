# [スコープ: 個別案件 / okayama-moshi] visual-upgrade-prompts.md — 本番画像・動画アセット台帳

> 本案件は AI 画像生成プロンプトではなく、本番運用中の実写・教材スキャン・R2 操作動画アセットを `images/`（計 60 ファイル）および `manual_video_assets/`（台本＋シーン別素材）で直接管理しています。

---

## 1. 本番サイト画像アセット一覧 (`images/` 全 60 ファイル)

| スロット / 用途 | ベースファイル名 | 配信フォーマット | 主な参照ページ |
| :--- | :--- | :--- | :--- |
| **ヒーロービジュアル（PC）** | `hero-main-pc`, `hero-main` | `.avif`, `.webp` | `index.html`, `lp/index.html` |
| **ヒーロービジュアル（SP）** | `hero-main-sp` | `.avif`, `.webp` | `index.html`, `lp/index.html` |
| **中3 成績表トップ・サンプル** | `3_top`, `3_top-sp`, `おかもしサイト用_おかもし成績表_中3_top.001` | `.avif`, `.webp`, `.jpg`, `.jpeg` | `index.html`, `lp/index.html` |
| **中3 成績表モーダルカルーセル** | `3-carousel-1`, `3-carousel-2`, `3-carousel-3` | `.avif`, `.webp`, `.jpg` | `index.html`, `lp/index.html` |
| **中3 問題・解答解説サンプル** | `3-mondai`, `3-kaisetu` | `.avif`, `.webp`, `.jpeg` | `index.html`, `lp/index.html` |
| **中1・中2 成績表・問題・解説** | `2-top`, `2-top-sp`, `2-mondai`, `2-kaisetu` | `.avif`, `.webp`, `.jpeg` | `index.html`, `lp/index.html` |
| **小6（適性検査）成績表・問題・解説** | `6-top`, `6-top-sp`, `6-mondai`, `6-kaisetu` | `.avif`, `.webp`, `.jpeg` | `index.html`, `lp/index.html` |
| **選ばれる3つの理由 プレビューカード** | `preview-c3-report`, `preview-card-report`, `preview-card-exam`, `preview-card-answer` | `.avif`, `.webp` | `index.html`, `lp/index.html` |
| **お知らせ・コラム汎用サムネイル** | `article-classroom`, `Web-1366---1-scaled` | `.avif`, `.webp` | `news.html`, `detail.html` |
| **共通 OGP / フォールバック画像** | ルート直下 `og-image.jpg`, `hero-banner.jpg` | `.jpg` | 全ページ OGP |

---

## 2. 申込手順マニュアル動画アセット構成 (`manual_video_assets/` ＆ R2)

- **録画・結合スクリプト**: `scripts/record-manual-video.mjs`（Playwright による自動録画操作）
- **台本管理**: `manual_video_assets/google_vids_script.md`
- **分割シーン素材（Git 除外 `.mp4`）**: `scene_00.mp4`（7秒オープニングタイトル）〜 `scene_08.mp4` → 結合出力 `full_manual.mp4`
- **本番 R2 配信ファイル**: `https://pub-ba61870bbe1442af87f84c258e756736.r2.dev/apply-guide.mp4`
  - 設置箇所①：トップページ（`index.html`）操作手順案内モーダル
  - 設置箇所②：Web お申し込みフォーム（`apply/index.html`）最上部アコーディオン `#apply-guide-video-accordion`
