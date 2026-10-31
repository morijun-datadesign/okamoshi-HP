# おかもし公式サイト — AI作業ルール（常駐・最優先）

> このファイルは AI エージェントがセッション開始時に自動で読み込む常駐ルールです。
> ユーザーが毎回指示しなくても、**すべてのタスクで以下の2大絶対ルールを100%遵守すること。**
> 正本は `GEMINI.md`。`.cursorrules` / `.idx/airules.md` / `.antigravity/rules.md` / `.agents/rules/okamoshi-core.md` は
> `node scripts/sync-ai-rules.mjs` で自動生成されるコピー（直接編集禁止・品質ゲートで同期を検査）。

- 思考プロセス（Scratchpad）、作業計画（Goal）、アクションログ、ファイル操作の解説、および会話の応答はすべて日本語で行う（内部的な思考や要約ステップでも英語を使わない）。
- 本番環境: Cloudflare Pages（プロジェクト `okamoshi-hp`、`main` ブランチ、`https://okayama-moshi.com`、公開ディレクトリはリポジトリ直下 `.`）。
- プレビュー環境: `feature/idea-b` ブランチ（Cloudflare Pages エイリアスURL: `https://feature-idea-b.okamoshi-hp.pages.dev`）。
  - **本番・プレビュー環境の整合性維持ルール**: サイト修正時はまずプレビュー環境（`feature/idea-b` ブランチ → `https://feature-idea-b.okamoshi-hp.pages.dev`）で確認するため、常に本番（`main`）とプレビュー（`feature/idea-b`）の両方で同じ最新状態・同じ環境変数が動くように整合性を保つこと。
  - **GAS 同期先の保護ルール**: `gas/sync-exam-guides.js` および `gas/sync-cram-schools.js` の同期先配列（`API_URLS`：本番URL `https://okayama-moshi.com/api/admin/...` ＋ プレビューURL `https://feature-idea-b.okamoshi-hp.pages.dev/api/admin/...`）は、本番とプレビュー双方のD1を常に同一状態に保つため**絶対に片方を削らないこと**。

---

## 【絶対ルール①】デザインシステム・UI思想の厳守（勝手なデザイン変更の禁止）

当サイトは「教育機関としての信頼・品格」と「保護者・受験生への温かみ・安心感」を両立させた固有のデザインシステムで構築されている。
**AIが良かれと思って新しい色・フォント・余白・角丸・影・アニメーションを導入することを固く禁ずる。**
デザインの変更が必要と考えた場合は、実装せずに提案としてユーザーに確認を取ること。

### 1. カラーパレット（実装値。これ以外の色は使用禁止）

| 役割 | Tailwind クラス / 値 | HEX |
|---|---|---|
| **メイン：深いフォレストグリーン** | `brand-green` / `primary` | `#134230` |
| グリーン（ホバー・濃色） | `brand-greenDark` | `#0A261B` |
| グリーン（中間アクセント） | `brand-greenAccent` / `bg-[#1f6b51]` | `#1F6B51` |
| グリーン（淡い背景） | `brand-greenLight` / `primary-fixed` / `bg-[#e8f5ee]` / `bg-[#ebf6f0]` | `#EBF4F0` 系 |
| グリーン（コンテナ） | `primary-container` | `#2D5A46` |
| 見出し濃色 | `text-[#1e3a2f]` / `text-emerald-950`（セクション見出しは `style="color:#064e3b"`） | `#1E3A2F` |
| UIグリーン（タブ・アクティブ状態） | `emerald-50`〜`emerald-950`（例: 選択タブ `bg-emerald-800`） | — |
| **CTA：バーントオレンジ（申込ボタン専用）** | `bg-orange-700 hover:bg-orange-800 shadow-orange-700/25` | `#C2410C` / `#9A3412` |
| テラコッタ（NEWバッジ・アクセント） | `bg-[#c85a32]` / `secondary` 系 | `#C85A32` |
| 日程・日付アクセント（ブラウン） | `text-[#8B3A18]` / `brand-dateBrown` | `#8B3A18` |
| 自宅受験ブラウン | `brand-homeBrown` | `#4A4031` |
| **ページ背景** | `bg-[#F1F5F9]`（= slate-100）／ セクション内 `bg-slate-50` | `#F1F5F9` |
| ウォームアイボリー（注意書き・補足の面） | `bg-[#fbf2e7]` / `bg-amber-50` / `bg-[#fef3c7]` | `#FBF2E7` 系 |
| カード・コンテナ | `bg-white`（`surface`） | `#FFFFFF` |
| テキスト階層（スレート） | 見出し・強調 `slate-900` ／ 本文 `slate-800`・`slate-700` ／ 補足 `slate-600` ／ **注釈 `slate-500`** ／ メタ情報 `slate-400` ／ 区切り `slate-300` | — |
| 枠線 | `border-slate-200/90`・`border-slate-200`・`border-slate-100` | — |
| 注意・警告テキスト | `text-rose-600`（注意事項）／ `amber-*`（補足の注意）／ `red-*`（入力エラー） | — |

- **使用禁止**: Tailwind 標準の `blue-*` `indigo-*` `violet-*` `purple-*` `fuchsia-*` `pink-*` `cyan-*` `lime-*` `yellow-*` `stone-*` `neutral-*` `green-*`。
  `bg-[#xxxxxx]` 形式の**新しい任意HEXの追加も禁止**（許可済みHEXは `scripts/quality-gate/static-checks.mjs` の `ALLOWED_HEX`）。
  → 品質ゲート `design/forbidden-color` `design/unregistered-hex` が自動で検出して FAIL にする。
- `zinc-*` `gray-*` `teal-*` `sky-*` は既存箇所のみ。新規追加は `slate-*` で行う。

### 2. タイポグラフィ・形状
- フォント: 本文 `font-sans`（Noto Sans JP）、見出し英数字 `font-headline`（Plus Jakarta Sans）。新しいフォント追加禁止。
- 角丸の上限は **8px**（`rounded-lg`。`rounded-xl`〜`3xl` も 8px に固定済み）。ピル型のみ `rounded-full`。`rounded-md`=6px。
- 影は `shadow-2xs` / `shadow-xs` / `shadow-sm` が基本。CTAのみ `shadow-md`〜`shadow-lg` + `shadow-orange-700/25`。
- 「脱・二重枠」: 枠線を重ねず、背景 `#F1F5F9` と白カードの面の差＋微細な影でグループを表現する。
- スマホ（<768px）は左右パディング `px-4`（16px）で横幅を最大化する。

### 3. 既存コンポーネントの完全踏襲（新規に「似たもの」を作らない）
要素の追加・修正時は、必ず既存のHTML構造とクラス名をそのままコピーして再利用し、ページ間のトーン＆マナーを100%一致させる。

- **セクション見出し（左縦バー）**
  ```html
  <div class="flex items-center gap-2.5 mb-3.5 sm:mb-4">
    <span class="w-1.5 h-5 bg-brand-green rounded-full inline-block shrink-0"></span>
    <h4 class="section-title text-base sm:text-lg font-bold text-emerald-950 tracking-tight" style="color: #064e3b !important;">見出し</h4>
  </div>
  ```
- **カード**: `bg-white rounded-lg border border-slate-200/90 shadow-2xs`（内側余白 `p-3.5 sm:p-4` / `p-4 sm:p-5`）
- **アコーディオン**
  ```html
  <details class="group bg-white rounded-lg border border-slate-200/90 hover:border-slate-300 overflow-hidden shadow-2xs transition-all">
    <summary class="flex justify-between items-center p-3.5 sm:p-4 font-bold text-slate-800 cursor-pointer list-none select-none bg-white hover:bg-slate-50 transition-colors">
      <span class="text-sm sm:text-base font-bold text-slate-800 group-hover:text-emerald-950 transition-colors">タイトル</span>
      <span class="w-7 h-7 bg-brand-green group-hover:bg-emerald-800 rounded-full flex items-center justify-center shrink-0 shadow-2xs transition-colors"><!-- chevron svg (group-open:rotate-180) --></span>
    </summary>
    <div class="p-4 bg-slate-50/70 border-t border-slate-200">…</div>
  </details>
  ```
- **申込CTAボタン**: `w-full py-4 px-6 rounded-lg bg-orange-700 hover:bg-orange-800 text-white font-bold … shadow-lg shadow-orange-700/25`
- **余白リズム**: リスト `space-y-3` / `space-y-3.5`、行区切り `pt-3 sm:pt-3.5 border-t border-slate-100`、ブロック間 `gap-6`。
- 実施日程・会場の会場名整形は `js/venue-format.js`（`formatVenuePlaceHtml` / `escapeHtml`）を使う。同じ関数をページ内に再定義しない。

### 4. 情報の可読性優先（重要テキストを切り捨てない）
- 会場名・注釈・日程・注意事項などの重要テキストに **`truncate` / `text-ellipsis` / `line-clamp-*` / `whitespace-nowrap`+`overflow-hidden` を使わない**。
- スプレッドシートのセル内改行は `whitespace-pre-line` + `break-words` で全文表示する。
- `※` から始まる注釈は本体と別要素にし、`font-size: 0.85em` + `text-slate-500` + `font-normal` の控えめなスタイルで主従のメリハリをつける。
- 複数行になっても隣接ラベルと日付の縦位置が崩れないよう `items-start` で上揃えにする。
- スプレッドシート/CMS 由来の文字列を `innerHTML` に入れる場合は必ず `escapeHtml()` を通す。

---

## 【絶対ルール②】完了の定義（Definition of Done）と自動品質ゲートの強制実行

いかなるコード変更（HTML / CSS / JS / Functions / スクリプト）であっても、**ユーザーへの完了報告や `git push` の前に必ず以下を実行し、全項目 PASS を確認すること。**

```bash
python3 scripts/build.py --skip-images   # Tailwind 再ビルド（css/style.min.css）＋ SSG
npm run quality-gate                      # 品質ゲート（1つでも FAIL なら exit 1）
```

| # | 検査 | 内容 |
|---|---|---|
| 1 | セキュリティ | APIキー・シークレットの直書き（分割難読化含む）、`.env` / `.dev.vars` 混入、非公開ファイルの公開露出（`_redirects` 未遮断） |
| 2 | ゴミ・リンク切れ | `undefined` `null` `NaN` `[object Object]` `【★画像挿入` `TODO` `読み込み中…` の表示、内部リンク切れ |
| 3 | 実ブラウザ描画 | Playwright で PC 1280px / iPhone 375px。`pageerror`・`console.error` ゼロ、会場一覧・記事本文・画像の描画、横スクロールなし、会場名の省略なし＆`※`注釈スタイル |
| 4 | SEO・一貫性 | `<title>`、description、OGP、`alt`、`<h1>`は1つ、見出し階層の飛びなし、許可外カラーなし、TypeScript型チェック |

- **FAIL した場合はユーザーに報告する前に自己修復**し、再実行して PASS させてから報告する。修復できない場合は、FAIL 内容と原因をそのまま正直に報告する（PASS と偽らない）。
- テストやチェックを**緩めて通すこと（閾値変更・除外追加・テスト削除）は禁止**。正当な理由で除外が必要な場合は `tests/e2e/known-issues.json` に理由付きで追加し、ユーザーに明示的に報告する。
- `git push` 時は `.githooks/pre-push` が自動で品質ゲートを実行し、FAIL ならプッシュをブロックする。`--no-verify` での回避は禁止。

### セキュリティ必須事項
- APIキー・シークレットはコードに直書きしない（フォールバック値としての直書きも禁止）。サーバー側は Cloudflare Pages の環境変数、GAS はスクリプトプロパティを使う。
- microCMS の APIキーをブラウザ側 JS に埋め込まない（`js/microcms-config.js` の `apiKey` は空のまま）。
- 公開ディレクトリはリポジトリ直下のため、新しい非公開ファイル/ディレクトリを追加したら `_redirects` に 404 遮断ルールを追加する。
