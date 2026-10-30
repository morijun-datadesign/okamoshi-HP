#!/usr/bin/env python3
"""
移行対象として確定した13記事のみを抽出し、
本文の最終調整を行った上で microcms_import_selected13.csv を出力するスクリプト。
"""

import os
import re
import csv
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_JSON = os.path.join(BASE_DIR, "microcms_import_manual.json")
OUTPUT_CSV = os.path.join(BASE_DIR, "microcms_import_selected13.csv")
OUTPUT_JSON = os.path.join(BASE_DIR, "microcms_import_selected13.json")

# 抽出対象の13記事ID
SELECTED_IDS = [
    "20260914-1",
    "20260730-1",
    "20260721_1",
    "column-7",
    "column-6",
    "column-5",
    "column-4",
    "column-3",
    "column",
    "column-2",
    "10140831-2",
    "202408101-2",
    "okayama-highschoolexam_tokubetsu_1"
]

def adjust_content(cid, content):
    """記事ごとの個別微調整"""
    # No.2 (20260914-1): 「次なるステップへ踏み出そう！」以降を汎用的な新サイト申込誘導に置換
    if cid == "20260914-1":
        step_header = "<h2>次なるステップへ踏み出そう！</h2>"
        if step_header in content:
            parts = content.split(step_header)
            replacement_section = (
                "<h2>次なるステップへ踏み出そう！</h2>\n\n"
                "<p>志望校合格に向けて、定期的な模試受験で学習の成果を確認し、弱点を克服していくことが大切です。<br>"
                "本番と同じ緊張感を味わえる公開会場模試や自宅受験など、各学年の実施日程やお申し込みは以下よりご確認いただけます。</p>\n\n"
                '<p class="text-center"><a href="/apply" class="btn-primary">おかもし日程・お申し込みはこちら</a></p>'
            )
            content = parts[0].strip() + "\n\n" + replacement_section

    # No.5 (20260730-1): 末尾の古いリンク先を新サイトの /apply 等に正規化
    if cid == "20260730-1":
        content = content.replace("https://okayama-moshi.com/touitsu-moshi/", "/apply")
        content = content.replace("https://okayama-moshi.com/news/20260207-1/", "/apply")

    return content.strip()

def main():
    with open(INPUT_JSON, "r", encoding="utf-8") as f:
        items = json.load(f)

    # 13件のみ抽出（元の時系列順を維持）
    selected_items = []
    csv_rows = []

    for item in items:
        cid = item["id"]
        if cid in SELECTED_IDS:
            adjusted = dict(item)
            adjusted["content"] = adjust_content(cid, adjusted["content"])
            adjusted["content_length"] = len(adjusted["content"])
            selected_items.append(adjusted)

            csv_rows.append({
                "id": adjusted["id"],
                "title": adjusted["title"],
                "content": adjusted["content"],
                "publishedAt": adjusted["publishedAt"],
                "category": adjusted["category_id"]
            })

    # JSON出力
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(selected_items, f, ensure_ascii=False, indent=2)

    # CSV出力
    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "title", "content", "publishedAt", "category"])
        writer.writeheader()
        writer.writerows(csv_rows)

    print(f"Successfully generated {OUTPUT_CSV} ({len(csv_rows)} rows)")
    print(f"Successfully generated {OUTPUT_JSON}")

if __name__ == "__main__":
    main()
