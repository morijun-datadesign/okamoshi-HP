# [スコープ: 個別案件 / okayama-moshi] CONTENT_SPEC.md — ページ構成・機能仕様

## 1. トップページ (`index.html`) ＆ LP (`lp/index.html`)
1. **共通ヘッダー (`js/header.js`)**:
   - ロゴ・グローバルナビ（「おかもしの特徴」「次回模試・日程」「実施塾一覧」「お知らせ」「お問い合わせ」ドロップダウン）・CTA「お申し込みはこちら」・SP ドロワーメニュー。
2. **ファーストビュー**:
   - PC/SP 出し分け `<picture>` ヒーロー画像（`hero-main-pc.avif` / `hero-main-sp.avif`）、主要 `<h1>`（中学生 岡山県統一模擬試験 / 小学6年 岡山県適性検査対策模試）。
3. **選ばれる3つの理由 (`#features`)**:
   - 教材・成績表のカルーセルプレビュー＋SP 下部フローティング操作バー（`.features-nav-bar`）、成績表拡大モーダル（`3-carousel-1〜3`）。
4. **模試日程・会場・時間割・出題範囲セレクタ (`#schedule-selector`)**:
   - 初回非同期で `/api/exam-guides` を取得。学年タブ（中3 / 中2 / 中1 / 小6）と月号ピルで動的切替。
   - 会場別詳細・Google マップリンク・持参物・`※` 注釈分離表示 (`venue-format.js`)・出題単元・申込締切判定（`common-date.js` `?test_date=` 対応）・「この日程で申し込む」バーントオレンジ CTA。
5. **生徒・保護者の声 (`#student-voices`)**: 合格・活用コメント紹介。
6. **最新のお知らせ (`#latest-news-list`)**: SSG により最新 3 件の静的カード＋全記事 JSON インライン埋め込み（学年フィルタ切替対応）。
7. **よくある質問 (`#faq`)** ＆ **申込ガイド動画モーダル (R2)**。

---

## 2. Web お申し込みフォーム (`/apply/` ＆ `/apply/success/`)
- **操作解説動画アコーディオン**: `#apply-guide-video-accordion`（展開時のみ R2 `.mp4` ロード）。
- **STEP 1（模試・受験形式）**: 学年ボタン（`小6`, `中1`, `中2`, `中3`）選択 → D1 連動で対象模試・受験会場（`岡山会場`, `倉敷会場`, `津山会場`, `自宅受験`）を動的表示。複数回同時申込対応（1件 `5,500円` 合算）。
- **STEP 2（受験生情報）**: 氏名・フリガナ・性別・在籍小中学校名（ラベル統一「在籍小中学校名」＋ `/api/schools` インクリメンタルサジェスト）。
- **STEP 3（保護者・ご連絡先情報）**: 保護者氏名・フリガナ・メール（確認欄二重入力）・電話番号（E.164 変換対応）・郵便番号 7 桁即時バリデーション＆ `/api/address` 自動住所補完＋住所一致検証。
- **STEP 4（お支払い方法）**: クレジットカード決済 / コンビニ決済（申込締切 3 日前 23:59 を過ぎると自動で `disabled` 化）。確認パネル `#convenienceWarningPanel` と規約二重同意。
- **STEP 5（連絡事項・サマリー・Turnstile・送信）**: 確認サマリー表示、Turnstile (`0x4AAAAAAFUVxr1HR8KQNRY0`) 検証、`localStorage` 保存後 `POST /api/create-checkout-session` → Stripe Checkout 遷移。
- **完了画面 (`/apply/success`)**: `session_id` と `exam_type` によりリード文（「岡山県統一模擬試験」/「岡山県適性検査対策模試」）を動的出し分け、コンビニ時のみ `#convenienceStoreNotice` 表示、`POST /api/apply` により即時通知メール発火。

---

## 3. お問い合わせ・実施塾一覧・お知らせ・法務ページ
- **お問い合わせ (`/contact/`, `/contact/individual/`, `/contact/organization/`)**:
  - 統合ページはタブ切替（個人・団体）、個別ページは直接フォーム表示。個人は学年選択（小6〜中3等）・生徒氏名・連絡先、団体は貴塾/学校名・教室名・連絡先を入力し Turnstile + `POST /api/contact`。
- **実施塾一覧 (`/schools.html`)**:
  - `/api/cram-schools` から全 119 教室を取得し、4 学区（「岡山・東備学区」「倉敷学区」「美作学区」「西備学区」）別に表示＋キーワード/学区フィルタリング。
- **お知らせ (`/news.html`, `/news/`, `/news/[id]/`, `/news/preview/`)**:
  - `build_ssg.py` により静的生成された一覧・12 記事詳細ページ（右サイドバー `sidebar-exam-widget.js` 付き）と、microCMS 下書きキー付き `/api/news-preview` プレビューページ。
- **法務・404 (`/privacy.html`, `/tokushoho.html`, `/404.html`)**:
  - 個人情報保護方針、特商法表記、旧 URL 流入用 404 リニューアル転送ページ。
