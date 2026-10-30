#!/usr/bin/env python3
"""
過去記事に含まれる画像を legacy_images/ 配下にダウンロードし、
本文HTML内の画像を microCMS 貼付用目印テキストに置換した
microcms_import_manual.csv を出力するスクリプト。
"""

import os
import re
import csv
import json
import urllib.request
import urllib.parse
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_JSON = os.path.join(BASE_DIR, "microcms_import_clean.json")
OUTPUT_CSV = os.path.join(BASE_DIR, "microcms_import_manual.csv")
OUTPUT_JSON = os.path.join(BASE_DIR, "microcms_import_manual.json")
IMAGES_DIR = os.path.join(BASE_DIR, "legacy_images")

def encode_url(url):
    """日本語などの非ASCII文字を含むURLを安全にエンコード"""
    parsed = urllib.parse.urlsplit(url)
    encoded_path = urllib.parse.quote(parsed.path)
    encoded_query = urllib.parse.quote(parsed.query, safe="=&?+")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, encoded_path, encoded_query, parsed.fragment))

def get_filename_from_url(url, index):
    """URLから安全なファイル名を生成"""
    parsed = urllib.parse.urlsplit(url)
    raw_name = os.path.basename(parsed.path)
    decoded_name = urllib.parse.unquote(raw_name).strip()

    # Google user content など拡張子がない・または特殊な場合
    if "googleusercontent.com" in url or not decoded_name or "." not in decoded_name:
        return f"{index:02d}_google_drive_image.png"

    clean_name = re.sub(r'[\\/*?:"<>|]', '_', decoded_name)
    return f"{index:02d}_{clean_name}"

def download_image(url, save_path):
    """画像をダウンロードして保存"""
    safe_url = encode_url(url)
    print(f"Downloading: {safe_url} -> {os.path.basename(save_path)}")
    req = urllib.request.Request(safe_url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"
    })
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = resp.read()
            with open(save_path, "wb") as f:
                f.write(data)
        return True
    except Exception as e:
        print(f"  [ERROR] Failed to download {url}: {e}")
        return False

def main():
    os.makedirs(IMAGES_DIR, exist_ok=True)

    with open(INPUT_JSON, "r", encoding="utf-8") as f:
        items = json.load(f)

    # 日付降順にソート
    items.sort(key=lambda x: x.get("publishedAt", ""), reverse=True)

    manual_items = []
    csv_rows = []
    summary_list = []

    for idx, item in enumerate(items, 1):
        cid = item["id"]
        pub_date = item.get("publishedAt", "")[:10]
        title = item["title"]
        content = item.get("content", "")

        # 記事内画像のURLを検索（出現順）
        img_matches = list(re.finditer(r'<figure>\s*<img[^>]*src="([^"]+)"[^>]*>\s*</figure>|<img[^>]*src="([^"]+)"[^>]*>', content))

        folder_name = ""
        saved_files = []

        if img_matches:
            folder_name = f"{pub_date}_{cid}"
            article_img_dir = os.path.join(IMAGES_DIR, folder_name)
            os.makedirs(article_img_dir, exist_ok=True)

            img_counter = 0
            def replace_img(m):
                nonlocal img_counter
                img_counter += 1
                img_url = m.group(1) or m.group(2)
                filename = get_filename_from_url(img_url, img_counter)
                save_path = os.path.join(article_img_dir, filename)

                if not os.path.exists(save_path) or os.path.getsize(save_path) == 0:
                    download_image(img_url, save_path)
                saved_files.append((filename, img_url))

                return f'<p>【★画像挿入: {filename}】</p>'

            new_content = re.sub(
                r'<figure>\s*<img[^>]*src="([^"]+)"[^>]*>\s*</figure>|<img[^>]*src="([^"]+)"[^>]*>',
                replace_img,
                content
            )
        else:
            new_content = content

        manual_item = dict(item)
        manual_item["content"] = new_content
        manual_item["content_length"] = len(new_content)
        manual_item["images_folder"] = folder_name
        manual_item["images_count"] = len(saved_files)
        manual_item["images_files"] = [f[0] for f in saved_files]
        manual_items.append(manual_item)

        csv_rows.append({
            "id": manual_item["id"],
            "title": manual_item["title"],
            "content": new_content,
            "publishedAt": manual_item["publishedAt"],
            "category": manual_item["category_id"]
        })

        summary_list.append({
            "index": idx,
            "date": pub_date,
            "id": cid,
            "title": title,
            "folder": folder_name if folder_name else "-",
            "count": len(saved_files)
        })

    # JSON出力
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(manual_items, f, ensure_ascii=False, indent=2)

    # CSV出力
    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "title", "content", "publishedAt", "category"])
        writer.writeheader()
        writer.writerows(csv_rows)

    print(f"\nSuccessfully generated {OUTPUT_CSV} and {OUTPUT_JSON}")
    total_imgs = sum(s["count"] for s in summary_list)
    print(f"Total images targeted: {total_imgs}")

if __name__ == "__main__":
    main()
