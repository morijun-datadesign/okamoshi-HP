---
name: Okayama Academic Trust Design System
colors:
  background: '#F8FAFC'
  surface: '#F8FAFC'
  surface-card: '#FFFFFF'
  primary: '#2D5A46'
  primary-hover: '#1E3D2F'
  primary-light: '#EBF3EE'
  secondary: '#C85A32'
  secondary-hover: '#D96B43'
  tertiary: '#D4A343'
  text-main: '#262626'
  text-sub: '#555555'
typography:
  font-heading: 'Plus Jakarta Sans, sans-serif'
  font-body: 'Noto Sans JP, sans-serif'
layout:
  container-max: '1200px'
  gutter-mobile: '1rem'
  gutter-desktop: '1.5rem'
---

## 岡山県統一模試（おかもし）デザインシステム・方針

本デザインシステムは「岡山県統一模試」のWebサイトに最適化されたモダン＆オーガニック・ミニマリズムの設計書です。過度な装飾や圧迫感のある枠線を廃し、信頼感・安心感・見やすさを最優先します。

### 1. カラーポリシー
- **ベース背景 (`#F8FAFC`):** 純白ではない目撃疲労を抑えた高級感のあるオフホワイト。
- **メインカラー (`#2D5A46` / モスグリーン):** ヘッダー、見出し、アクティブタブなど信頼を伝える領域に使用。
- **メインCTA (`#C85A32` / テラコッタ):** 「お申し込み」等のアクションボタン専用。高い視認性と購買意欲を高めるアクセント。
- **カード・コンテナ (`#FFFFFF`):** オフホワイトの背景の上に、純白のカードを「面分け」として配置。

### 2. 「脱・二重枠」レイアウト方針
- **枠線（border）の最小化:**
  - カードやコンテナを区切る際、二重枠や重い枠線は原則使用しない。
  - 背景色（オフホワイト `#F8FAFC` と 純白 `#FFFFFF`）の「面の差」と、ごく微細な影（`shadow-sm`）によって「かたまり（グループ）」を表現する。
- **スマホ表示（< 768px）の横幅最大化:**
  - スマホ表示時は外枠の大きな余白や無駄なネスト構造を排除し、左右パディングを `1rem (16px)` に統一する。
  - テキストが一文字だけで不自然に改行されないよう、フォントサイズと折り返しを最適化する。

### 3. コンポーネントルール
- **タブ切り替え:**
  - ボタンの並び順（左↔右）に合わせたダイナミックな左右スライドアニメーションを適用する。
- **ボタン:**
  - 角丸は `8px (rounded-lg)`。