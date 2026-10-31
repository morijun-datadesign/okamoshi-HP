#!/usr/bin/env python3
"""
scripts/fallback_articles.json（APIキー未設定時の SSG フォールバック用スナップショット）を
microCMS の「公開中（PUBLISH）」記事だけで再生成する。

- GET専用キー（下書き全取得なし）の場合は Content API のレスポンス自体が公開記事のみとなる
- 万が一「下書き全取得」権限付きキーで実行された場合でも、Management API が利用可能ならステータスで DRAFT / CLOSED を除外する
- 使い方: python3 scripts/refresh_fallback_articles.py（環境変数 MICROCMS_API_KEY または .dev.vars / .env を自動参照）
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env_key(name):
    val = os.environ.get(name, "").strip()
    if val:
        return val
    for fname in (".dev.vars", ".env"):
        fpath = os.path.join(ROOT_DIR, fname)
        if os.path.exists(fpath):
            with open(fpath, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    if k.strip() == name:
                        return v.strip().strip("'\"")
    return ""


API_KEY = load_env_key("MICROCMS_API_KEY")
if not API_KEY:
    sys.exit("MICROCMS_API_KEY が未設定です。")

DOMAIN = os.environ.get("MICROCMS_SERVICE_DOMAIN", "okamoshi-blog")
ENDPOINT = os.environ.get("MICROCMS_ENDPOINT", "blogs")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fallback_articles.json")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


def get(url):
    req = urllib.request.Request(url, headers={"X-MICROCMS-API-KEY": API_KEY, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        time.sleep(0.5)
        return json.loads(r.read().decode("utf-8"))


def main():
    published = None
    try:
        mgmt = get(f"https://{DOMAIN}.microcms-management.io/api/v1/contents/{ENDPOINT}?limit=100")
        published = {c["id"] for c in mgmt.get("contents", []) if "PUBLISH" in (c.get("status") or [])}
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            print(f"Notice: Management API skipped (HTTP {e.code} - GET専用キー). Using Content API published items directly.")
        else:
            raise

    content = get(f"https://{DOMAIN}.microcms.io/api/v1/{ENDPOINT}?limit=100&orders=-publishedAt")
    items = content.get("contents", [])
    if published is not None:
        items = [c for c in items if c["id"] in published]
    else:
        items = [c for c in items if c.get("publishedAt")]

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(items)} published articles -> {OUT}")
    for c in items:
        print(f"  {str(c.get('publishedAt', ''))[:10]}  {c['id']}  {c['title'][:40]}")


if __name__ == "__main__":
    main()
