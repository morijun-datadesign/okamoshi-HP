#!/usr/bin/env python3
"""
scripts/fallback_articles.json（APIキー未設定時の SSG フォールバック用スナップショット）を
microCMS の「公開中（PUBLISH）」記事だけで再生成する。

- Management API でステータスを確認し、DRAFT / CLOSED の記事は除外する
  （Content API は「下書き全取得」権限付きキーだと下書きも返すため、ステータスで厳密に判定）
- 使い方: MICROCMS_API_KEY=xxxx python3 scripts/refresh_fallback_articles.py
"""
import json
import os
import sys
import time
import urllib.request

API_KEY = os.environ.get("MICROCMS_API_KEY", "")
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
    mgmt = get(f"https://{DOMAIN}.microcms-management.io/api/v1/contents/{ENDPOINT}?limit=100")
    published = {c["id"] for c in mgmt.get("contents", []) if "PUBLISH" in (c.get("status") or [])}
    content = get(f"https://{DOMAIN}.microcms.io/api/v1/{ENDPOINT}?limit=100&orders=-publishedAt")
    items = [c for c in content.get("contents", []) if c["id"] in published]
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(items)} published articles -> {OUT}")
    for c in items:
        print(f"  {str(c.get('publishedAt', ''))[:10]}  {c['id']}  {c['title'][:40]}")


if __name__ == "__main__":
    main()
