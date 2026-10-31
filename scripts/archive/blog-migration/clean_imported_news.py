#!/usr/bin/env python3
"""
microcms_import.json の本文HTMLをクレンジングし、
microcms_import_clean.csv および microcms_import_clean.json を生成するスクリプト。
"""

import os
import re
import csv
import json
import html

# アーカイブ移動後: 入出力データは同階層の data/ 配下
BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
INPUT_JSON = os.path.join(BASE_DIR, "microcms_import.json")
OUTPUT_CSV = os.path.join(BASE_DIR, "microcms_import_clean.csv")
OUTPUT_JSON = os.path.join(BASE_DIR, "microcms_import_clean.json")

# 保持を許可するクラス（新サイトのコンポーネントデザインに適合するもの）
ALLOWED_CLASSES = {'btn-primary', 'info-box', 'point-box', 'attention-box', 'box-fact', 'box-action', 'text-center'}

def clean_html(raw_html):
    if not raw_html:
        return ""

    content = raw_html

    # 1. WordPress ブロックコメント (<!-- wp:... -->, <!-- /wp:... -->) の除去
    content = re.sub(r'<!--\s*/?wp:[^>]*-->', '', content)

    # 2. Instagram 埋め込みブロックの変換
    # 複雑なインラインSVG・スクリプトを公式Instagramリンクボタンにシンプル化
    def replace_instagram(match):
        permalink_m = re.search(r'data-instgrm-permalink="([^"]+)"', match.group(0))
        url = permalink_m.group(1).split('?')[0] if permalink_m else "https://www.instagram.com/okayama_moshi/"
        return f'<p class="text-center"><a href="{url}" class="btn-primary" target="_blank" rel="noopener noreferrer">公式Instagramの投稿を見る</a></p>'

    content = re.sub(r'<blockquote[^>]*class="[^"]*instagram-media[^"]*"[^>]*>.*?</blockquote>(?:\s*<script[^>]*></script>)?', replace_instagram, content, flags=re.DOTALL)
    # 単体の embed.js などの script タグを完全除去
    content = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.DOTALL)

    # 3. スペーサー (<div ... class="wp-block-spacer" ...></div>) の除去
    content = re.sub(r'<div[^>]*class="[^"]*wp-block-spacer[^"]*"[^>]*>.*?</div>', '', content, flags=re.DOTALL)
    content = re.sub(r'<div[^>]*wp-block-spacer[^>]*></div>', '', content)

    # 4. 破損したインラインSVGゴミタグ (<svg>や<g><g>...</g>) の除去
    content = re.sub(r'<(?:svg|g|path)[^>]*>.*?</(?:svg|g|path)>', '', content, flags=re.DOTALL)

    # 5. ボタンの変換: wp-block-button / wp-block-buttons
    # 例: <div class="wp-block-button..."><a class="wp-block-button__link..." href="...">テキスト</a></div>
    def replace_button(match):
        block = match.group(0)
        a_match = re.search(r'<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', block, flags=re.DOTALL)
        if a_match:
            href = a_match.group(1)
            inner_text = a_match.group(2)
            # inner_text 内のタグ・クラス・スタイルを簡易クレンジング
            inner_text = re.sub(r'<[^>]+>', '', inner_text).strip()
            return f'<p class="text-center"><a href="{href}" class="btn-primary" target="_blank" rel="noopener noreferrer">{inner_text}</a></p>'
        return ''

    content = re.sub(r'<div[^>]*class="[^"]*wp-block-buttons[^"]*"[^>]*>.*?</div>\s*</div>', replace_button, content, flags=re.DOTALL)
    content = re.sub(r'<div[^>]*class="[^"]*wp-block-button[^"]*"[^>]*>.*?</div>', replace_button, content, flags=re.DOTALL)

    # 6. カラムラッパーの解消 (wp-block-columns, wp-block-column)
    content = re.sub(r'</?div[^>]*class="[^"]*wp-block-columns[^"]*"[^>]*>', '', content)
    content = re.sub(r'</?div[^>]*class="[^"]*wp-block-column[^"]*"[^>]*>', '', content)

    # 7. 背景色付きブロックの変換
    def replace_bg_box(match):
        tag = match.group(1).lower()
        attrs = match.group(2)
        inner = match.group(3).strip()

        # 見出し (h2, h3, h4) の場合はスタイルを剥がして通常の見出しにする
        if tag in ['h2', 'h3', 'h4']:
            return f'<{tag}>{inner}</{tag}>'

        # 締切などの重要注意
        if "締め切り" in inner or "締切" in inner or "締め切りました" in inner:
            return f'<div class="attention-box"><p>{inner}</p></div>'
        # 情報・ポイント系 (水色、薄グレー等)
        if any(c in attrs for c in ['#d6effd', '#c9eaff', '#dedede', '#f2f2f2']):
            return f'<div class="info-box"><p>{inner}</p></div>'

        return f'<p>{inner}</p>'

    content = re.sub(r'<([a-zA-Z0-9]+)([^>]*has-background[^>]*)>(.*?)</\1>', replace_bg_box, content, flags=re.DOTALL)

    # 8. 画像のクレンジング (figure, img)
    def clean_img_tag(match):
        attrs = match.group(1)
        src_m = re.search(r'src="([^"]+)"', attrs)
        alt_m = re.search(r'alt="([^"]*)"', attrs)
        w_m = re.search(r'width="([^"]+)"', attrs)
        h_m = re.search(r'height="([^"]+)"', attrs)

        src = src_m.group(1) if src_m else ''
        alt = alt_m.group(1) if alt_m else ''
        wh = ''
        if w_m and h_m:
            wh = f' width="{w_m.group(1)}" height="{h_m.group(1)}"'

        return f'<img src="{src}" alt="{alt}"{wh} loading="lazy">'

    content = re.sub(r'<img([^>]+)>', clean_img_tag, content)
    # figureタグ自体の属性をすべて除去
    content = re.sub(r'<figure[^>]*>', '<figure>', content)
    # 不要なwp-block-image div
    content = re.sub(r'</?div[^>]*class="[^"]*wp-block-image[^"]*"[^>]*>', '', content)

    # 9. テーブルのクレンジング
    content = re.sub(r'<figure[^>]*class="[^"]*wp-block-table[^"]*"[^>]*>', '', content)
    content = re.sub(r'(</table>)\s*</figure>', r'\1', content)

    def clean_table_cell(match):
        tag = match.group(1).lower()
        attrs = match.group(2)
        kept_attrs = []
        for a in ['colspan', 'rowspan']:
            m = re.search(rf'{a}="([^"]+)"', attrs)
            if m:
                kept_attrs.append(f'{a}="{m.group(1)}"')
        attr_str = f" {' '.join(kept_attrs)}" if kept_attrs else ""
        return f'<{tag}{attr_str}>'

    content = re.sub(r'<(td|th)([^>]*)>', clean_table_cell, content)
    content = re.sub(r'<table[^>]*>', '<table>', content)
    content = re.sub(r'<tr[^>]*>', '<tr>', content)
    content = re.sub(r'<tbody[^>]*>', '<tbody>', content)
    content = re.sub(r'<thead[^>]*>', '<thead>', content)

    # 10. mark タグの除去
    content = re.sub(r'<mark[^>]*>(.*?)</mark>', r'\1', content)

    # 11. すべてのタグから不要な style 属性を完全に除去
    content = re.sub(r'\s+style="[^"]*"', '', content)
    content = re.sub(r"\s+style='[^']*'", '', content)

    # 12. 通常タグの不要な class, id, target, rel 以外の属性除去
    def clean_tag_attributes(match):
        is_closing = match.group(1)
        tag = match.group(2).lower()
        rest = match.group(3)

        if is_closing:
            return f'</{tag}>'

        # 既に整形済みのタグはスキップ
        if tag in ['img', 'td', 'th', 'table', 'tr', 'tbody', 'thead', 'figure']:
            return match.group(0)

        kept_attrs = []

        # a タグの href, target, rel
        if tag == 'a':
            for a in ['href', 'target', 'rel']:
                m = re.search(rf'{a}="([^"]+)"', rest)
                if m:
                    kept_attrs.append(f'{a}="{m.group(1)}"')

        # class のチェック (ALLOWED_CLASSES のみ許可)
        class_m = re.search(r'class="([^"]+)"', rest)
        if class_m:
            cls_parts = class_m.group(1).split()
            valid_cls = [c for c in cls_parts if c in ALLOWED_CLASSES]
            if valid_cls:
                kept_attrs.append(f'class="{" ".join(valid_cls)}"')

        attr_str = f" {' '.join(kept_attrs)}" if kept_attrs else ""
        return f'<{tag}{attr_str}>'

    content = re.sub(r'<(/)?([a-zA-Z0-9]+)([^>]*)>', clean_tag_attributes, content)

    # 13. 見出しタグ内の先頭・末尾 <br> および不要な空白・空見出しの除去
    for h in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
        content = re.sub(rf'<{h}>\s*(?:<br\s*/?>\s*)+', f'<{h}>', content, flags=re.IGNORECASE)
        content = re.sub(rf'(?:<br\s*/?>\s*)+</{h}>', f'</{h}>', content, flags=re.IGNORECASE)
        content = re.sub(rf'<{h}>\s*(?:&nbsp;|\s)*\s*</{h}>', '', content, flags=re.IGNORECASE)

    # 14. 段落タグ <p> 内の先頭・末尾 <br> のトリミング
    content = re.sub(r'<p>\s*(?:<br\s*/?>\s*)+', '<p>', content, flags=re.IGNORECASE)
    content = re.sub(r'(?:<br\s*/?>\s*)+</p>', '</p>', content, flags=re.IGNORECASE)

    # 15. 段落内の過剰な連続 <br> (2連続以上) を1つの <br> に正規化
    content = re.sub(r'(?:<br\s*/?>\s*){2,}', '<br>', content, flags=re.IGNORECASE)

    # 16. 空の <p> タグや <p><br></p> などの除去（複数回実行してネスト・連続を解消）
    for _ in range(5):
        # <p><br></p>, <p><br/><br/></p>, <p>&nbsp;</p>, <p></p>
        content = re.sub(r'<p>\s*(?:<br\s*/?>|&nbsp;|\s)*\s*</p>', '', content, flags=re.IGNORECASE)
        # 再度先頭・末尾の <br> をトリミング
        content = re.sub(r'<p>\s*(?:<br\s*/?>\s*)+', '<p>', content, flags=re.IGNORECASE)
        content = re.sub(r'(?:<br\s*/?>\s*)+</p>', '</p>', content, flags=re.IGNORECASE)
        # <div></div> (属性なし、または中身なし)
        content = re.sub(r'<div>\s*</div>', '', content)
        # 属性なしの単なる空コンテナ div のアンラップ
        content = re.sub(r'<div>(.*?)</div>', r'\1', content, flags=re.DOTALL)
        # 連続する空行の縮小
        content = re.sub(r'\n\s*\n\s*\n', '\n\n', content)

    # 17. 最終クリーンアップ
    content = re.sub(r'<p>\s*(?:<br\s*/?>|&nbsp;|\s)*\s*</p>', '', content, flags=re.IGNORECASE)

    return content.strip()

def main():
    with open(INPUT_JSON, "r", encoding="utf-8") as f:
        items = json.load(f)

    cleaned_items = []
    csv_rows = []
    image_urls_by_article = {}

    for item in items:
        cleaned_item = dict(item)
        original_content = item.get("content", "")
        cleaned_content = clean_html(original_content)
        cleaned_item["content"] = cleaned_content
        cleaned_item["content_length"] = len(cleaned_content)
        cleaned_items.append(cleaned_item)

        # 画像URLの収集
        imgs = re.findall(r'<img[^>]*src="([^"]+)"', original_content)
        if imgs:
            image_urls_by_article[item["id"]] = {
                "title": item["title"],
                "images": imgs
            }

        csv_rows.append({
            "id": cleaned_item["id"],
            "title": cleaned_item["title"],
            "content": cleaned_content,
            "publishedAt": cleaned_item["publishedAt"],
            "category": cleaned_item["category_id"]
        })

    # JSON出力
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(cleaned_items, f, ensure_ascii=False, indent=2)

    # CSV出力
    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "title", "content", "publishedAt", "category"])
        writer.writeheader()
        writer.writerows(csv_rows)

    print(f"Successfully processed {len(cleaned_items)} articles.")
    print(f"Generated: {OUTPUT_CSV}")
    print(f"Generated: {OUTPUT_JSON}")

    # 画像URL一覧のサマリー出力
    total_imgs = sum(len(v["images"]) for v in image_urls_by_article.values())
    print(f"\nTotal images found: {total_imgs} in {len(image_urls_by_article)} articles.")

if __name__ == "__main__":
    main()
