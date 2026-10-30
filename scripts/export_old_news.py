#!/usr/bin/env python3
"""
旧サイト (https://okayama-moshi.com/) から過去のお知らせ記事を自動取得し、
microCMS インポート用 CSV および確認用 JSON を生成するスクリプト。
"""

import os
import sys
import re
import csv
import json
import html
import urllib.request
import urllib.parse
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE_DIR, "microcms_import.csv")
JSON_PATH = os.path.join(BASE_DIR, "microcms_import.json")

# microCMS カテゴリ定義 (okamoshi-blog)
CATEGORY_MAP = {
    "高校入試情報": "pk_1pp08tt",
    "中高一貫校入試情報": "onhrhf9e5wv",
    "模試活用法": "jttb2w0l9ua",
    "更新情報": "508lep4cmp"
}

def determine_category_id(title, tags, categories):
    """タイトルやWPタグ・カテゴリから microCMS カテゴリIDを推定"""
    text = (title + " " + " ".join(tags) + " " + " ".join(categories)).lower()

    if any(k in text for k in ["適性検査", "中高一貫", "操山中", "大安寺", "天城中", "美作中"]):
        return CATEGORY_MAP["中高一貫校入試情報"]
    elif any(k in text for k in ["高校入試", "入試制度", "特別入学者選抜", "募集定員", "高校選び", "方針"]):
        return CATEGORY_MAP["高校入試情報"]
    elif any(k in text for k in ["学習コラム", "勉強のコツ", "時間管理", "モチベーション", "やる気", "活用法", "成績アップ", "合格戦略"]):
        return CATEGORY_MAP["模試活用法"]
    elif any(k in text for k in ["実施要項", "実施しました", "会場模試", "決済用リンク", "お支払い方法", "トピックス", "日程一覧", "更新情報"]):
        return CATEGORY_MAP["更新情報"]

    return CATEGORY_MAP["更新情報"]

def normalize_slug_for_microcms(raw_slug, date_str, index):
    """
    microCMS のコンテンツID制約（半角英数字・ハイフン・アンダースコアのみ）に適合させる。
    URLエンコードされた日本語スラッグの場合は、日付ベースの安全な半角英数IDを生成。
    """
    unquoted = urllib.parse.unquote(raw_slug).strip()
    
    # すでに半角英数字・ハイフン・アンダースコアのみで構成されているか判定
    if re.match(r'^[a-zA-Z0-9_-]+$', raw_slug):
        return raw_slug

    # 日本語スラッグの場合は、特定のスラッグ変換または日付+連番
    dt_clean = date_str[:10].replace("-", "") if len(date_str) >= 10 else f"2026{index:02d}"
    
    # 既知の日本語スラッグに対する分かりやすい英数IDマッピング
    known_map = {
        "【保護者・受験生必読】令和8年度-岡山県立高校入": f"{dt_clean}-highschool-quota",
        "2025年度おかもし6月号会場模試を実施しました": f"{dt_clean}-june-report",
        "2024年度おかもし-8月号-会場を実施しました": f"{dt_clean}-august-report",
        "おかもし個人受験　受験料のお支払い方法": f"{dt_clean}-payment-method"
    }

    if unquoted in known_map:
        return known_map[unquoted]

    # フォールバック
    return f"{dt_clean}-post-{index}"

def clean_content_html(raw_html):
    """
    本文HTMLの不要な空白・WordPress特有のコメント等を除去して整形
    """
    if not raw_html:
        return ""
    
    content = raw_html
    # WordPress ブロックコメント (<!-- wp:... -->, <!-- /wp:... -->) を除去
    content = re.sub(r'<!--\s*/?wp:[^>]*-->', '', content)
    # 連続する空行を1行に整理
    content = re.sub(r'\n{3,}', '\n\n', content)
    return content.strip()

def fetch_all_old_news():
    """WordPress REST API から全件記事を取得"""
    api_url = "https://okayama-moshi.com/wp-json/wp/v2/news?per_page=100&_embed"
    print(f"Fetching all news articles from {api_url} ...")
    
    req = urllib.request.Request(api_url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"
    })
    
    with urllib.request.urlopen(req, timeout=15) as res:
        data = json.loads(res.read().decode("utf-8"))
        print(f"Successfully fetched {len(data)} articles from WordPress REST API.")
        return data

def main():
    raw_articles = fetch_all_old_news()

    # 日付降順にソート (新しい順)
    raw_articles.sort(key=lambda x: x.get("date", ""), reverse=True)

    formatted_items = []
    csv_rows = []

    for idx, item in enumerate(raw_articles, 1):
        wp_id = item.get("id")
        raw_slug = item.get("slug", "")
        unquoted_slug = urllib.parse.unquote(raw_slug)
        title = html.unescape(item.get("title", {}).get("rendered", "")).strip()
        date_local = item.get("date", "")
        date_gmt = item.get("date_gmt", "")
        
        # microCMS 用 ISO 8601 日時 (UTC)
        if date_gmt:
            published_at = f"{date_gmt}.000Z"
        elif date_local:
            published_at = f"{date_local}+09:00"
        else:
            published_at = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")

        # タグ・カテゴリ
        tags = []
        categories = []
        for term_list in item.get("_embedded", {}).get("wp:term", []):
            for t in term_list:
                taxonomy = t.get("taxonomy")
                name = t.get("name")
                if taxonomy == "category":
                    categories.append(name)
                elif taxonomy == "post_tag":
                    tags.append(name)

        # microCMS カテゴリID判定
        category_id = determine_category_id(title, tags, categories)
        category_name = [k for k, v in CATEGORY_MAP.items() if v == category_id][0]

        # microCMS コンテンツID (半角英数字・ハイフン・アンダースコア)
        microcms_id = normalize_slug_for_microcms(raw_slug, date_local, idx)

        # 本文HTML
        raw_content = item.get("content", {}).get("rendered", "")
        cleaned_content = clean_content_html(raw_content)

        # ターゲット学年の推定
        target_grades = ["全学年"]
        if "小6" in title or "適性" in title:
            target_grades = ["小6生"]
        elif "中3" in title or "中学生" in title:
            target_grades = ["中学生"]

        article_obj = {
            "id": microcms_id,
            "original_slug": unquoted_slug,
            "wp_id": wp_id,
            "title": title,
            "date": date_local,
            "publishedAt": published_at,
            "category_id": category_id,
            "category_name": category_name,
            "tags": tags,
            "targetGrade": target_grades,
            "url": f"https://okayama-moshi.com/news/{unquoted_slug}/",
            "content_length": len(cleaned_content),
            "content": cleaned_content
        }
        formatted_items.append(article_obj)

        # CSV用行 (microCMS Blogsスキーマ準拠: id, title, content, publishedAt, category)
        csv_rows.append({
            "id": microcms_id,
            "title": title,
            "content": cleaned_content,
            "publishedAt": published_at,
            "category": category_id
        })

    # 1. CSV書き出し (microcms_import.csv)
    fieldnames = ["id", "title", "content", "publishedAt", "category"]
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        for r in csv_rows:
            writer.writerow(r)
    
    print(f"Generated {CSV_PATH} ({len(csv_rows)} rows)")

    # 2. JSON書き出し (microcms_import.json)
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(formatted_items, f, ensure_ascii=False, indent=2)

    print(f"Generated {JSON_PATH} ({len(formatted_items)} items)")

    # 3. 取得結果のサマリー表示
    print("\n" + "=" * 90)
    print(f"【旧サイトお知らせ記事 取得サマリー (全 {len(formatted_items)} 件)】")
    print("=" * 90)
    print(f"{'No':<3} | {'コンテンツID (microCMS)':<28} | {'公開日 (JST)':<10} | {'カテゴリ':<10} | {'タイトル'}")
    print("-" * 90)
    for i, a in enumerate(formatted_items, 1):
        d_str = a['date'][:10]
        c_name = a['category_name']
        print(f"{i:02d}  | {a['id']:<28} | {d_str:<10} | {c_name:<10} | {a['title']}")
    print("=" * 90)

if __name__ == "__main__":
    main()
