# ブログ移行（WordPress → microCMS）アーカイブ

2026年10月のブログ移行で使用した一回限りのスクリプト群です。本番ビルド（`scripts/build.py`）からは参照されません。
`/scripts/*` は `_redirects` で 404 遮断されているため、Web からは閲覧できません。

| ファイル | 内容 |
|---|---|
| `export_old_news.py` → `clean_imported_news.py` → `download_and_prep_manual_import.py` → `export_selected13.py` | 旧サイト記事の抽出・整形・画像DL・13記事選定 |
| `update_microcms_selected13.py` | 13記事の画像アップロード・本文差し替え・公開日時更新 |
| `microcms_status_ops.py` | 重複記事の DRAFT 化・リニューアル記事の公開日時更新 |
| `data/` | 入出力データ（JSON/CSV は Git 管理、画像 `legacy_images/` と生データは `.gitignore` 対象） |

- APIキーはすべて環境変数 `MICROCMS_API_KEY` で渡す（コードへの直書き禁止）。
  例: `MICROCMS_API_KEY=xxxx python3 scripts/archive/blog-migration/microcms_status_ops.py`
