#!/usr/bin/env python3
"""
microCMS 13記事の一括更新スクリプト
1. 既存記事一覧の取得・マッピング（13記事とその他記事の一覧化）
2. legacy_images/ の画像25枚を microCMS メディアへアップロード（キャッシュによる冪等性確保）
3. 各記事本文内の画像プレースホルダーを <figure><img ...></figure> に置換、1枚目をアイキャッチに設定
4. 13記事すべてを公開（PUBLISH）状態にし、指定された publishedAt を Content API PATCH で更新
"""

import os
import re
import json
import time
import uuid
import mimetypes
import urllib.request
import urllib.error

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEGACY_IMAGES_DIR = os.path.join(BASE_DIR, "legacy_images")
CACHE_FILE = os.path.join(BASE_DIR, "scripts", ".microcms_media_cache.json")

API_KEY = os.environ.get("MICROCMS_API_KEY", "4qO3xGjs5W1r7zolbBgAX2KXP8VEUooOpMtc")
SERVICE_DOMAIN = "okamoshi-blog"
ENDPOINT = "blogs"

# 13記事のターゲット情報定義
TARGET_ARTICLES = [
    {
        "id": "20260914-1",
        "title_keyword": "8月号結果",
        "publishedAt": "2026-09-14T09:00:00+09:00",
        "image_dir": None
    },
    {
        "id": "20260730-1",
        "title_keyword": "岡山県の高校受験",
        "publishedAt": "2026-07-30T09:00:00+09:00",
        "image_dir": None
    },
    {
        "id": "20260721_1",
        "title_keyword": "会場受験のススメ",
        "publishedAt": "2026-07-21T09:00:00+09:00",
        "image_dir": "2026-07-21_20260721_1"
    },
    {
        "id": "column-7",
        "title_keyword": "勉強のコツ完全ガイド",
        "publishedAt": "2025-07-04T09:00:00+09:00",
        "image_dir": "2024-12-27_column-7"
    },
    {
        "id": "column-6",
        "title_keyword": "時間管理術と集中力アップ法",
        "publishedAt": "2025-02-26T09:00:00+09:00",
        "image_dir": "2024-12-27_column-6"
    },
    {
        "id": "column-5",
        "title_keyword": "志望校の決め方に悩む中学生",
        "publishedAt": "2024-12-03T09:00:00+09:00",
        "image_dir": "2024-11-24_column-5"
    },
    {
        "id": "column-4",
        "title_keyword": "友達と勉強する?一人で勉強する?",
        "publishedAt": "2024-11-26T09:00:00+09:00",
        "image_dir": "2024-11-23_column-4"
    },
    {
        "id": "column-3",
        "title_keyword": "受験勉強のモチベーションUP術",
        "publishedAt": "2024-11-19T09:00:00+09:00",
        "image_dir": "2024-11-12_column-3"
    },
    {
        "id": "column",
        "title_keyword": "志望校が決まらなくても大丈夫",
        "publishedAt": "2024-11-08T09:00:00+09:00",
        "image_dir": "2024-11-11_column"
    },
    {
        "id": "column-2",
        "title_keyword": "勉強のやる気が出ない時こそチャンス",
        "publishedAt": "2024-11-08T09:00:00+09:00",
        "image_dir": "2024-11-08_column-2"
    },
    {
        "id": "10140831-2",
        "title_keyword": "おかもし志望校記入用紙",
        "publishedAt": "2024-08-30T09:00:00+09:00",
        "image_dir": None
    },
    {
        "id": "202408101-2",
        "title_keyword": "あなただけの合格戦略を立てよう",
        "publishedAt": "2024-08-30T09:00:00+09:00",
        "image_dir": "2024-08-10_202408101-2"
    },
    {
        "id": "okayama-highschoolexam_tokubetsu_1",
        "title_keyword": "特別入学者選抜とは",
        "publishedAt": "2024-07-31T09:00:00+09:00",
        "image_dir": None
    }
]

def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_cache(cache):
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)

def api_request(url, method="GET", data=None, is_management=False, content_type="application/json", max_retries=5):
    headers = {
        "X-MICROCMS-API-KEY": API_KEY,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    if content_type:
        headers["Content-Type"] = content_type

    req_data = None
    if data is not None:
        if isinstance(data, (dict, list)):
            req_data = json.dumps(data).encode("utf-8")
        elif isinstance(data, (bytes, bytearray)):
            req_data = bytes(data)

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=40) as resp:
                res_body = resp.read().decode("utf-8")
                time.sleep(1.0)
                return json.loads(res_body) if res_body else {}
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_sec = 3 * (attempt + 1)
                print(f"  [429 Rate Limit] Waiting {wait_sec}s before retry ({attempt+1}/{max_retries})...")
                time.sleep(wait_sec)
                continue
            raise e
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(2)
                continue
            raise e
    raise Exception(f"Failed after {max_retries} attempts for {url}")

def upload_image(file_path, max_retries=5):
    cache = load_cache()
    rel_path = os.path.relpath(file_path, BASE_DIR)
    if rel_path in cache:
        print(f"  [Cache hit] {rel_path} -> {cache[rel_path]}")
        return cache[rel_path]

    boundary = "----WebKitFormBoundary" + uuid.uuid4().hex
    filename = os.path.basename(file_path)
    mime_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"

    with open(file_path, "rb") as f:
        file_bytes = f.read()

    body = bytearray()
    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(f"Content-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n".encode("utf-8"))
    body.extend(f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"))
    body.extend(file_bytes)
    body.extend(f"\r\n--{boundary}--\r\n".encode("utf-8"))

    url = f"https://{SERVICE_DOMAIN}.microcms-management.io/api/v1/media"
    headers = {
        "X-MICROCMS-API-KEY": API_KEY,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Content-Type": f"multipart/form-data; boundary={boundary}"
    }

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, data=bytes(body), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=40) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                img_url = res.get("url")
                if not img_url:
                    raise Exception(f"Upload failed: no url in response: {res}")
                print(f"  [Uploaded] {filename} -> {img_url}")
                cache[rel_path] = img_url
                save_cache(cache)
                time.sleep(2.0)
                return img_url
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_sec = 4 * (attempt + 1)
                print(f"  [Upload 429 Rate Limit] Waiting {wait_sec}s before retry ({attempt+1}/{max_retries})...")
                time.sleep(wait_sec)
                continue
            raise e
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(2)
                continue
            raise e
    raise Exception(f"Failed to upload {filename} after {max_retries} attempts.")

def main():
    print("=== Step 1: Fetching all existing articles from microCMS ===")
    list_url = f"https://{SERVICE_DOMAIN}.microcms.io/api/v1/{ENDPOINT}?limit=100"
    all_res = api_request(list_url)
    all_articles = all_res.get("contents", [])
    print(f"Fetched {len(all_articles)} total articles.")

    article_by_id = {a["id"]: a for a in all_articles}

    target_ids = {t["id"] for t in TARGET_ARTICLES}
    other_articles = [a for a in all_articles if a["id"] not in target_ids]

    print(f"\n--- Other / Legacy / Test articles ({len(other_articles)} items) ---")
    for oa in other_articles:
        oid = oa.get("id")
        pub = oa.get("publishedAt", "None")[:19]
        title = oa.get("title", "")
        print(f"  - [{oid}] (Pub: {pub}) {title}")

    print("\n=== Step 2 & 3: Uploading images, replacing placeholders & patching articles ===")
    updated_summary = []

    for t in TARGET_ARTICLES:
        cid = t["id"]
        target_pub = t["publishedAt"]
        title_keyword = t["title_keyword"]
        img_subdir = t["image_dir"]

        article = article_by_id.get(cid)
        if not article:
            print(f"[ERROR] Target article id={cid} not found in microCMS!")
            continue

        title = article.get("title", "")
        print(f"\nProcessing [{cid}] {title}")

        content = article.get("content", "")
        current_eyecatch = article.get("eyecatch")

        # 画像プレースホルダーの検索
        # 例: <p>【★画像挿入: 01_xxx.jpg】</p> または 【★画像挿入: 01_xxx.jpg】
        placeholders = re.findall(r"【★画像挿入:\s*([^】]+)】", content)

        uploaded_urls = []
        new_content = content

        if img_subdir:
            dir_path = os.path.join(LEGACY_IMAGES_DIR, img_subdir)
            if os.path.exists(dir_path):
                # ディレクトリ内の実体画像一覧
                available_files = {os.path.basename(f): os.path.join(dir_path, f) for f in os.listdir(dir_path) if not f.startswith(".")}
            else:
                available_files = {}

            for p_raw in placeholders:
                p_clean = p_raw.strip()
                if p_clean in available_files:
                    file_path = available_files[p_clean]
                    img_url = upload_image(file_path)
                    uploaded_urls.append(img_url)

                    # 本文内のプレースホルダーを <figure><img ...></figure> に置換
                    fig_tag = f'<figure><img src="{img_url}" alt="{title}" loading="lazy"></figure>'

                    # <p>【★画像挿入: ...】</p> 全体を置換
                    pattern = re.compile(r"<p>\s*【★画像挿入:\s*" + re.escape(p_raw) + r"】\s*</p>")
                    if pattern.search(new_content):
                        new_content = pattern.sub(fig_tag, new_content)
                    else:
                        pattern_simple = re.compile(r"【★画像挿入:\s*" + re.escape(p_raw) + r"】")
                        new_content = pattern_simple.sub(fig_tag, new_content)
                else:
                    print(f"  [Notice] File '{p_clean}' not found on disk for article {cid}. Removing placeholder.")
                    # 実体がないプレースホルダー（例: 02_google_drive_image.png）は空に置換
                    pattern = re.compile(r"<p>\s*【★画像挿入:\s*" + re.escape(p_raw) + r"】\s*</p>")
                    if pattern.search(new_content):
                        new_content = pattern.sub("", new_content)
                    else:
                        new_content = new_content.replace(f"【★画像挿入: {p_raw}】", "")

        # アイキャッチの選定
        first_img_url = uploaded_urls[0] if uploaded_urls else None
        patch_payload = {
            "publishedAt": target_pub
        }

        # 本文の変更がある場合
        if new_content != content:
            patch_payload["content"] = new_content

        # アイキャッチ未設定かつアップロード画像がある場合
        if not current_eyecatch and first_img_url:
            patch_payload["eyecatch"] = first_img_url

        # A. Management API でステータスを PUBLISH に変更
        status_url = f"https://{SERVICE_DOMAIN}.microcms-management.io/api/v1/contents/{ENDPOINT}/{cid}/status"
        try:
            status_res = api_request(status_url, method="PATCH", data={"status": ["PUBLISH"]}, is_management=True)
            print(f"  [Status -> PUBLISH] id={cid}")
        except Exception as e:
            print(f"  [Status error] id={cid}: {e}")

        # B. Content API で PATCH 更新（publishedAt, content, eyecatch）
        patch_url = f"https://{SERVICE_DOMAIN}.microcms.io/api/v1/{ENDPOINT}/{cid}"
        try:
            patch_res = api_request(patch_url, method="PATCH", data=patch_payload)
            print(f"  [Content patched] id={cid} publishedAt={target_pub}")
            updated_summary.append({
                "id": cid,
                "title": title,
                "publishedAt": target_pub,
                "images_inserted": len(uploaded_urls),
                "eyecatch_set": bool(patch_payload.get("eyecatch"))
            })
        except Exception as e:
            print(f"  [Patch error] id={cid}: {e}")

    print("\n=== Final Verification ===")
    print(f"Successfully processed {len(updated_summary)} articles.")
    for s in updated_summary:
        print(f"  - [{s['id']}] {s['title'][:35]} -> Pub: {s['publishedAt']} (Images: {s['images_inserted']}, Eyecatch: {s['eyecatch_set']})")

if __name__ == "__main__":
    main()
