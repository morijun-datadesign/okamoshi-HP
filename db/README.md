# D1 マスターデータ（郵便番号・全国学校コード）

申込フォームの「郵便番号 → 住所自動補完」「在籍学校名サジェスト」用のデータを Cloudflare D1 (`DB`) から配信します。

| エンドポイント | 内容 | キャッシュ |
| --- | --- | --- |
| `GET /api/address?zip=7000822` | 住所（都道府県・市区町村・町域）を1件返す | `public, max-age=86400` |
| `GET /api/schools?q=東山&type=junior` | 学校名の部分一致（最大15件・**岡山県を最上位**） | `public, max-age=3600` |

## 初回セットアップ

```bash
# 1. D1 作成 → 出力された database_id を wrangler.toml に記入
npx wrangler d1 create okamoshi-master

# 2. スキーマ適用
npx wrangler d1 migrations apply okamoshi-master --remote

# 3. シードSQL生成（日本郵便・文科省の公式データを自動取得 / Python3 標準ライブラリのみ）
python3 scripts/build_master_seed.py

# 4. 投入（郵便番号 約12.4万件 / 学校 約2.9万件）
npx wrangler d1 execute okamoshi-master --remote --file=db/seed/zip_codes.sql
npx wrangler d1 execute okamoshi-master --remote --file=db/seed/schools.sql
```

## データ更新

- 郵便番号: 日本郵便が毎月末に更新。`build_master_seed.py` → 手順4 を再実行（`DELETE` → 全件 `INSERT`）。
- 学校コード: 文科省が年数回更新。URL が毎回変わるため `scripts/build_master_seed.py` の `MEXT_URLS` を差し替えてから再実行。
  - https://www.mext.go.jp/b_menu/toukei/mext_01087.html

## ローカル確認

```bash
npx wrangler d1 migrations apply okamoshi-master --local
npx wrangler d1 execute okamoshi-master --local --file=db/seed/zip_codes.sql
npx wrangler d1 execute okamoshi-master --local --file=db/seed/schools.sql
npx wrangler pages dev .
```
