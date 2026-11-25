# [スコープ: 個別案件 / okayama-moshi] ORIGINAL_DNA.md — 岡山県統一模擬試験 現行資産棚卸し

## 1. クライアント・ブランド基本情報
- **正式名称**: 岡山県統一模擬試験（通称：おかもし） / 岡山県適性検査対策模試
- **運営委員会**: 岡山県統一模擬試験実行委員会（運営会社：中央教育研究所株式会社）
- **本店/事務局所在地**: 〒730-0013 広島県広島市中区八丁堀15番6号 広島ちゅうぎんビル3階
- **電話番号**: `082-227-3999`（受付：平日 10:00〜18:00）
- **公式メールアドレス**: `info@okayama-moshi.com`
- **公式サイト**: `https://okayama-moshi.com/`
- **プレビュー環境**: `https://feature-idea-b.okamoshi-hp.pages.dev/`

---

## 2. 提供商品・料金・受験方式体系

| 模試名称 | 対象学年 | 学年コード | 出題形式 | 受験料（税込） |
| :--- | :--- | :--- | :--- | :--- |
| **岡山県統一模擬試験** | 中学3年生・中学2年生・中学1年生 | `c3` / `c2` / `c1` | 5教科（国語・数学・英語・理科・社会 / 500点満点） | **5,500円**（会場・自宅共通） |
| **岡山県適性検査対策模試** | 小学6年生 | `p6`（一部データ互換 `e6` / `sho6`） | 適性検査型（適性検査・作文等） | **5,500円**（会場・自宅共通） |

- **決済手段（個人申込）**:
  - クレジットカード決済（Stripe Checkout `card`）
  - コンビニエンスストア決済（Stripe Checkout `konbini`：ファミリーマート / ローソン / ミニストップ / セイコーマート。申込締切日の3日前 23:59 まで受付、支払期限最大3日）
- **受験形態**:
  - **会場受験**: 岡山会場・倉敷会場・津山会場ほか（D1 `exam_venues` で回ごとに定義。受験票は試験約1週間前発送予定）
  - **自宅受験**: 全国どこからでも受験可能（問題冊子・解答用紙・返信用封筒を送付し、答案返送締切日までにポスト投函）

---

## 3. 保有データ・静的/動的資産インベントリ

### 3.1 公開Webページ一覧
| パス | 用途 | レンダリング・生成方式 |
| :--- | :--- | :--- |
| `/` (`index.html`) | 公式サイトトップ（ヒーロー、選ばれる3つの理由、日程/会場/範囲セレクタ、保護者の声、最新お知らせ、FAQ） | 静的HTML + SSG最新3件埋め込み + `style.min.css` インライン + `/api/exam-guides` 動的取得 |
| `/lp/` (`lp/index.html`) | 広告・キャンペーン向けランディングページ | 静的HTML + SSG最新3件埋め込み + `/api/exam-guides` 動的取得 |
| `/apply` (`apply/index.html`) | Web 個人お申し込みフォーム | 静的HTML + `/api/exam-guides`, `/api/address`, `/api/schools`, `/api/create-checkout-session` |
| `/apply/success` (`apply/success/index.html`) | お申し込み・決済完了サンクスページ（`noindex`） | 静的HTML + `/api/apply` 照合・通知メール発火 |
| `/schools.html` | 実施塾一覧（4学区 119教室） | 静的HTML + `/api/cram-schools` 動的取得（検索・学区フィルタ付き） |
| `/news.html`, `/news/` | お知らせ・受験情報一覧 | `build_ssg.py` による静的生成（クライアント fetch 排除済み） |
| `/news/[id]/` | 記事詳細ページ（現在 12 記事公開・`sitemap.xml` 収録） | `detail.html` テンプレートから `build_ssg.py` で静的生成 |
| `/news/preview/` | microCMS 下書きリアルタイムプレビュー（`noindex`） | `generate_preview_page.py` 生成 + `/api/news-preview` プロキシ取得 |
| `/contact/`, `/contact/individual/`, `/contact/organization/` | お問い合わせ（統合タブ / 個人専用 / 塾・学校団体専用） | 静的HTML + `/api/contact` + Turnstile |
| `/privacy.html`, `/tokushoho.html` | プライバシーポリシー・特定商取引法に基づく表記 | 静的HTML |
| `/404.html` | リニューアル案内・トップページ即時自動転送ページ | 静的HTML（`<meta refresh>` + JS `location.replace('/')`） |

### 3.2 マスターデータベース規模 (`okamoshi-master`)
- **`zip_codes`**: 日本郵便 `utf_ken_all.csv` 由来（約 12.4 万件、`db/seed/zip_codes.sql` は Git 除外）
- **`schools`**: 文科省学校コード一覧由来（約 2.9 万件、`db/seed/schools.sql` は Git 除外）
- **`cram_schools`**: 取扱実施塾 119 件（岡山・東備学区 58 / 倉敷学区 30 / 美作学区 24 / 西備学区 7）
- **`exam_schedules` / `exam_venues` / `exam_timetables` / `exam_scopes`**: スプレッドシート（`gas/sync-exam-guides.js`）から随時同期

### 3.3 ブログ・広報・動画資産
- **microCMS (`okamoshi-blog` / `blogs`)**: 受験コラム・日程告知・結果速報など 12 件公開記事（`scripts/fallback_articles.json` にローカルバックアップ保持）
- **Cloudflare R2 動画**: `apply-guide.mp4`（`manual_video_assets/scene_00`〜`scene_08.mp4` 連結による約3分の申込操作マニュアル動画）
- **画像資産 (`images/`)**: ヒーロー PC/SP、成績表/問題/解説サンプル、カルーセル、教室写真、OGP 画像など合計 60 ファイル（AVIF/WebP/JPEG/JPG）
