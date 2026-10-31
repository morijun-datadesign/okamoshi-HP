#!/usr/bin/env python3
"""
microCMS 記事ステータス操作（2026-10-31 リリース前整理用・一回限り）
- 重複記事・決済リンク記事を DRAFT（非公開）へ変更（削除はしない）
- リニューアル告知記事の publishedAt を本番リリース日に更新

使い方: MICROCMS_API_KEY=xxxx python3 scripts/archive/blog-migration/microcms_status_ops.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

API_KEY = os.environ.get("MICROCMS_API_KEY", "")
if not API_KEY:
    sys.exit("MICROCMS_API_KEY が未設定です。環境変数で指定してください。")

DOMAIN = "okamoshi-blog"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

TO_DRAFT = ["leoodvgmoet", "b055d-p_k7", "20p7a-hecrv"]
PUBLISHED_AT_UPDATES = {"ynvbigkqcq": "2026-11-02T00:00:00+09:00"}


def req(url, method="GET", body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"X-MICROCMS-API-KEY": API_KEY, "User-Agent": UA}
    if data is not None:
        headers["Content-Type"] = "application/json"
    for attempt in range(5):
        try:
            r = urllib.request.Request(url, data=data, headers=headers, method=method)
            with urllib.request.urlopen(r, timeout=40) as resp:
                txt = resp.read().decode("utf-8")
                time.sleep(1.0)
                return resp.status, (json.loads(txt) if txt else {})
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(3 * (attempt + 1))
                continue
            return e.code, e.read().decode("utf-8", "ignore")
    return 429, "rate limited"


def main():
    for cid in TO_DRAFT:
        st, res = req(
            f"https://{DOMAIN}.microcms-management.io/api/v1/contents/blogs/{cid}/status",
            "PATCH",
            {"status": ["DRAFT"]},
        )
        print(f"[DRAFT] {cid}: {st} {res}")

    for cid, pub in PUBLISHED_AT_UPDATES.items():
        st, res = req(f"https://{DOMAIN}.microcms.io/api/v1/blogs/{cid}", "PATCH", {"publishedAt": pub})
        print(f"[publishedAt] {cid} -> {pub}: {st} {res}")

    # 検証: 公開APIから見える記事一覧
    st, res = req(f"https://{DOMAIN}.microcms.io/api/v1/blogs?limit=100&fields=id,title,publishedAt&orders=-publishedAt")
    print(f"\n=== 公開中の記事一覧 ({res.get('totalCount')}件) ===")
    for it in res.get("contents", []):
        print(f"  {it.get('publishedAt', '')[:19]}  {it['id']:<36} {it['title'][:40]}")


if __name__ == "__main__":
    main()
