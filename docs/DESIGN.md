# [スコープ: 個別案件 / okayama-moshi] DESIGN.md — デザインシステム ＆ UI規約統合仕様

> 本ドキュメントはルート [`DESIGN.md`](../DESIGN.md)・[`GEMINI.md`](../GEMINI.md)（【絶対ルール①】）・[`tailwind.config.js`](../tailwind.config.js)・[`css/input.css`](../css/input.css)・[`scripts/quality-gate/static-checks.mjs`](../scripts/quality-gate/static-checks.mjs) の実装値を統合したデザイン正本です。AI・開発者による独断での新色・新フォント・角丸変更・影追加は厳禁です。

---

## 1. カラーパレット契約

### 1.1 正式トークン一覧（`tailwind.config.js` / `GEMINI.md`）
| 役割 | Tailwind クラス / トークン | 実装 HEX | 用途 |
| :--- | :--- | :--- | :--- |
| **メイン：フォレストグリーン** | `brand-green` / `primary` | `#134230` | ヘッダー帯・左縦バー・主タイトル装飾・プライマリ基軸色 |
| **濃色グリーン（ホバー）** | `brand-greenDark` | `#0A261B` | ボタン・要素ホバー濃色 |
| **中間アクセントグリーン** | `brand-greenAccent` | `#1F6B51` | 補助強調ボタン・アクセント |
| **淡いグリーン面** | `brand-greenLight` / `primary-fixed` | `#EBF4F0` | 選択中背景・強調帯の面分け |
| **グリーンコンテナ** | `primary-container` | `#2D5A46` | フォーム見出し・カード装飾コンテナ |
| **見出し濃色** | `.section-title` / `text-emerald-950` | `#064e3b` / `#1E3A2F` | セクション大見出し（`color: #064e3b !important`）・強調見出し |
| **UIグリーン（タブ・選択状態）** | `emerald-50` 〜 `emerald-950` | — | 学年タブ・アコーディオンボタン・ステータスバッジ |
| **CTA：バーントオレンジ** | `bg-orange-700 hover:bg-orange-800` | `#C2410C` / `#9A3412` | **お申し込みボタン専用**（`shadow-orange-700/25`） |
| **テラコッタ（NEWバッジ等）** | `bg-[#c85a32]`（※CSS上書き `#b5451f`） | `#C85A32` / `#b5451f` | NEW バッジ・アクセント（WCAG AA `>=4.5:1` 準拠上書き済み） |
| **日程・日付ブラウン** | `brand-dateBrown` / `text-[#8B3A18]` | `#8B3A18` | 実施日程・日付テキストの強調 |
| **自宅受験ブラウン** | `brand-homeBrown` | `#4A4031` | 自宅受験バッジ・区分表示 |
| **ページベース背景** | `surface-container` / `bg-[#F1F5F9]` | `#F1F5F9` | サイト全体の基調オフホワイト（`slate-100` 相当） |
| **ウォームアイボリー面** | `bg-[#fbf2e7]` / `bg-amber-50` | `#FBF2E7` 系 | 注意事項・補足案内ボックスの背景面 |
| **カード面** | `bg-white` / `surface` | `#FFFFFF` | 白カードによる面の差でグループ化表現 |
| **テキスト・枠線（スレート）** | `slate-900`〜`slate-300` | — | 見出し `slate-900` / 本文 `slate-800`・`slate-700` / 補足 `slate-600` / **注釈 `slate-500`** / 枠線 `border-slate-200/90` |
| **警告・エラー** | `text-rose-600` / `amber-*` / `red-*` | — | 注意事項・入力バリデーションエラー |

### 1.2 使用禁止カラー ＆ 登録済み任意 HEX ホワイトリスト
- **禁止 Tailwind 標準色系統**（品質ゲート `design/forbidden-color` で自動 FAIL）:
  `blue-*`, `indigo-*`, `violet-*`, `purple-*`, `fuchsia-*`, `pink-*`, `cyan-*`, `lime-*`, `yellow-*`, `stone-*`, `neutral-*`, `green-*`
- **新規任意 HEX 禁止**（`static-checks.mjs` の `ALLOWED_HEX` 38色のみ許可）:
  `#f1f5f9`, `#134230`, `#e8f5ee`, `#fef3c7`, `#fde68a`, `#92400e`, `#1e3a2f`, `#8b3a18`, `#c85a32`, `#a1d1b8`, `#fbf2e7`, `#ebf6f0`, `#ead6c0`, `#c7e6d7`, `#9e3a14`, `#7a5b18`, `#5c3d1e`, `#475569`, `#1f6b51`, `#ecfdf5`, `#c84b31`, `#a7f3d0`, `#374151`, `#111827`, `#065f46`, `#ffdbcf`, `#dcfce7`, `#c3e6d2`, `#86efac`, `#166534`, `#0c2b20`, `#06c755`, `#05b34c`, `#ebf4f0`, `#0a261b`, `#2d5a46`, `#4a4031`, `#0f5b47`

---

## 2. タイポグラフィ・形状・脱二重枠規律

- **フォントファミリー**:
  - 本文・日本語全体 (`font-sans`): `"Noto Sans JP", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif`
  - 見出し英数字 (`font-headline`): `"Plus Jakarta Sans", "Noto Sans JP", "Hiragino Kaku Gothic ProN", sans-serif`
  - アイコン: `Material Symbols Outlined`（必要アイコンのみのサブセット読み込み＋CLS防止 `1em×1em` 固定ボックス）
- **iOS Safari ズーム防止**: 全 `input` / `select` / `textarea` は `font-size: 16px !important` を強制（`css/input.css`）。
- **角丸上限**: **8px**（`rounded-lg` = 8px。`tailwind.config.js` にて `rounded-xl` / `2xl` / `3xl` もすべて `8px` に固定。ピル型ボタン・バッジのみ `rounded-full`）。
- **影・脱二重枠**: 原則 `shadow-2xs` / `shadow-xs` / `shadow-sm` と背景差（`#F1F5F9` vs `#FFFFFF`）でグループを表現し、重い二重枠線を排する。CTA のみ `shadow-md`〜`shadow-lg` + `shadow-orange-700/25`。
- **スマホ余白**: `< 768px` では外枠ネストを排し左右 `px-4`（16px）で横幅を最大化する。

---

## 3. 既存共通コンポーネント契約

- **セクション見出し（左縦バー）**:
  `w-1.5 h-5 bg-brand-green rounded-full` ＋ `section-title font-bold text-emerald-950` (`style="color: #064e3b !important;"`)
- **標準カード**: `bg-white rounded-lg border border-slate-200/90 shadow-2xs`（内側 `p-3.5 sm:p-4` / `p-4 sm:p-5`）
- **アコーディオン (`<details class="group ...">`)**: 右端に `w-7 h-7 bg-brand-green group-hover:bg-emerald-800 rounded-full` の回転シェブロン配置、展開領域 `p-4 bg-slate-50/70 border-t border-slate-200`
- **会場名・注釈の可読性規約 (`js/venue-format.js`)**:
  - 重要テキストに `truncate` / `text-ellipsis` / `line-clamp-*` / `whitespace-nowrap + overflow-hidden` を使用しない。
  - `formatVenuePlaceHtml(placeText)` により、`※` 以降を別 `<div>` へ分離して `font-size: 0.85em` + `text-slate-500` で描画し、セル内改行を `whitespace-pre-line break-words` で保持する。
  - 外部・スプレッドシート由来文字列の `innerHTML` 挿入時は必ず `escapeHtml()` を通す。

---

## 4. microCMS リッチエディタ用カスタム装飾仕様 (`css/input.css`)

- **文字装飾クラス**:
  - `.text-point-red`: `#dc2626` 太字強調
  - `.text-brand-green`: `#16a34a` 太字強調
  - `.marker-yellow`: 下部 40% 黄色蛍光ペン風ライン (`linear-gradient(transparent 60%, #fef08a 60%)`)
- **コールアウトボックスクラス**:
  - `.box-fact`, `.box-action`, `.box-warning`, `.point-box`, `.attention-box`, `.info-box`
  - ブロック表示 + 上下 `12px` マージン、リスト内 (`li:has(...)`) での黒丸抑止、同一段落内1改行マージと `<br><br>` 空行分割を SSG (`build_ssg.py`) ＆ プレビュー (`generate_preview_page.py`) の双方で一貫適用。
