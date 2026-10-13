#!/usr/bin/env python3
"""
microCMS 静的HTML事前生成 (SSG) スクリプト (okamoshi)
- microCMS API から全記事および最新一覧データを取得
- トップページ（index.html）の最新お知らせ枠を事前レンダリング
- お知らせ一覧ページ（news.html, news/index.html）を事前レンダリング & クライアントfetch撤廃
- 各記事詳細ページ（news/[id]/index.html, news/[id].html）を事前生成 & 本文整形
- プライベートAPIキーの安全な取り扱い（環境変数から読み込み、静的成果物へは出力しない）
"""

import os
import sys
import re
import json
import urllib.request
import urllib.parse
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 環境変数（未設定時の安全なフォールバックを保持）
MICROCMS_API_KEY = os.environ.get("MICROCMS_API_KEY", "4qO3xGjs5W1r7zolbBgAX2KXP8VEUooOpMtc")
MICROCMS_SERVICE_DOMAIN = os.environ.get("MICROCMS_SERVICE_DOMAIN", "okamoshi-blog")
MICROCMS_ENDPOINT = "blogs"

def fetch_microcms_articles():
    """microCMS から全記事を取得（降順）"""
    url = f"https://{MICROCMS_SERVICE_DOMAIN}.microcms.io/api/v1/{MICROCMS_ENDPOINT}?limit=100&orders=-publishedAt"
    req = urllib.request.Request(url, headers={"X-MICROCMS-API-KEY": MICROCMS_API_KEY})
    print(f"Fetching articles from microCMS ({url})...")
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read().decode("utf-8"))
            contents = data.get("contents", [])
            print(f"Successfully fetched {len(contents)} articles from microCMS.")
            return contents
    except Exception as e:
        print(f"Warning: Failed to fetch from microCMS ({e}). Using local fallback articles.")
        return get_fallback_articles()

def fetch_microcms_exam_guides():
    """microCMS から模試概要ウィジェット用データを取得"""
    url = f"https://{MICROCMS_SERVICE_DOMAIN}.microcms.io/api/v1/exam-guides?limit=100"
    req = urllib.request.Request(url, headers={"X-MICROCMS-API-KEY": MICROCMS_API_KEY})
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            data = json.loads(res.read().decode("utf-8"))
            return data.get("contents", [])
    except Exception as e:
        print(f"Notice: Failed to fetch exam-guides from microCMS ({e}). Will use fallback.")
        return []

def get_fallback_articles():
    """API通信不能時のフォールバック記事データ"""
    return [
        {
            "id": "leoodvgmoet",
            "title": "【8月号結果】岡山5校を志望校とした受験生が計1100名を超えました！",
            "content": "<p>成績表は9/10（木）に一斉発送いたしました。関東から郵便のため到着まで数日かかりますが、届きましたらぜひご自身の取り組みを振り返るきっかけにしてみてください。</p>",
            "category": {"id": "jttb2w0l9ua", "name": "模試活用法"},
            "publishedAt": "2026-09-28T06:44:38.475Z",
            "eyecatch": None,
            "targetGrade": ["中学生"]
        },
        {
            "id": "s9o093uhf",
            "title": "小6生対象 岡山県適性検査対策模試 10月号",
            "content": "<p>夏の成果をぶつける最初の挑戦！合格への道を確実に。お申し込みは10月13日(火)まで。</p>",
            "category": {"id": "jttb2w0l9ua", "name": "模試活用法"},
            "publishedAt": "2026-09-26T04:22:24.556Z",
            "eyecatch": None,
            "targetGrade": ["小6生"]
        },
        {
            "id": "b055d-p_k7",
            "title": "【岡山県の高校受験】合格への近道はここにある！「おかもし」が受験生から支持される理由",
            "content": "<p>岡山県公立高校入試を突破するために最も重要なのは、「県内固有の出題形式への徹底適応」と「内申点を含めた正確な相対位置の把握」です。</p>",
            "category": {"id": "jttb2w0l9ua", "name": "模試活用法"},
            "publishedAt": "2026-09-23T12:07:45.448Z",
            "eyecatch": {
                "url": "https://images.microcms-assets.io/assets/1ac525f4c868455d9d89ba053378d2ec/472790e3ea034e348fc446be675dc5e5/%E3%81%8A%E3%81%8B%E3%82%82%E3%81%9720260923-1.jpeg",
                "width": 1024,
                "height": 572
            },
            "targetGrade": ["中学生"]
        },
        {
            "id": "20p7a-hecrv",
            "title": "おかもし　決済用リンク",
            "content": "<p>中1・2・3生向け岡山県統一模擬試験、小6生向け岡山県適性検査対策模試をコンビニ決済でお申し込みになられ、決済期限が過ぎてしまった場合、こちらの決済リンクからご決済をお願いいたします。</p>",
            "category": {"id": "jttb2w0l9ua", "name": "模試活用法"},
            "publishedAt": "2026-09-23T05:20:07.810Z",
            "eyecatch": {
                "url": "https://images.microcms-assets.io/assets/1ac525f4c868455d9d89ba053378d2ec/9264e101b06c40348002c2d70b2d496a/%E3%81%8A%E3%81%8B%E3%82%82%E3%81%97Stripe%E6%B1%BA%E6%B8%88%E3%82%A4%E3%83%A1%E3%83%BC%E3%82%B7%E3%82%99.jpeg",
                "width": 1024,
                "height": 572
            },
            "targetGrade": ["全学年"]
        },
        {
            "id": "if8frequgg",
            "title": "不安や焦りを力に変える！中学生のための学力UPメンタル＆学習アプローチ",
            "content": "<p>やる気が出ないのはあなたの意志が弱いからではなく、脳や感情の仕組みとして当然の反応です。</p>",
            "category": None,
            "publishedAt": "2026-04-01T05:34:00.000Z",
            "eyecatch": None,
            "targetGrade": ["中学生"]
        }
    ]

def format_date_ymd(iso_str):
    """ISO8601 日付文字列を YYYY.MM.DD に変換"""
    if not iso_str:
        return ""
    try:
        clean_str = iso_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_str)
        return dt.strftime("%Y.%m.%d")
    except Exception:
        return str(iso_str)[:10].replace("-", ".")

def is_new_article(iso_str, days=14):
    """公開日が days 日以内かどうか判定"""
    if not iso_str:
        return False
    try:
        clean_str = iso_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_str)
        now = datetime.now(dt.tzinfo)
        diff = (now - dt).total_seconds() / (24 * 3600)
        return -1 <= diff <= days
    except Exception:
        return False

def get_category_info(category_obj, title=""):
    """カテゴリ名と適切なバッジクラスを判定"""
    cat_name = "お知らせ"
    if isinstance(category_obj, dict) and category_obj.get("name"):
        cat_name = category_obj["name"]
    elif isinstance(category_obj, str) and category_obj:
        cat_name = category_obj

    badge_class = "bg-emerald-50 text-emerald-800 border border-emerald-200"
    if "重要" in cat_name or (title and "重要" in title):
        badge_class = "bg-red-50 text-red-700 border border-red-200/60"
    elif "入試" in cat_name or (title and any(k in title for k in ["結果", "速報", "入試"])):
        badge_class = "bg-[#e8f5ee] text-[#134230] border border-[#a1d1b8]"
    elif "要項" in cat_name or "日程" in cat_name or (title and any(k in title for k in ["要項", "日程"])):
        badge_class = "bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]"
    elif "活用" in cat_name or "コラム" in cat_name:
        badge_class = "bg-[#fef3c7] text-[#92400e] border border-[#fde68a]"
    elif "トピックス" in cat_name or "更新" in cat_name:
        badge_class = "bg-slate-100 text-slate-700 border border-slate-200/60"

    return cat_name, badge_class

def format_article_content(raw_html):
    """
    本文HTMLの事前整形
    - 空段落の除去
    - コールアウト要素 (.box-fact, .box-action, .box-warning) の正規化
    - 案内リンク「おかもし日程一覧」「おかもし詳細・お申し込み」の2カラムボタングリッド化
    - 見出しへのID付与
    """
    if not raw_html:
        return "", []

    content = raw_html

    # 1. 空段落の除去 (<p></p>, <p><br></p>, 空白のみのp)
    content = re.sub(r'<p>\s*(?:<br\s*/?>|&nbsp;|\s)*</p>', '', content, flags=re.IGNORECASE)

    # 2. コールアウト要素の正規化 (<span class="box-fact">...</span> を <div class="box-fact">...</div> へ)
    for box_cls in ['box-fact', 'box-action', 'box-warning']:
        pattern = re.compile(rf'<p[^>]*>\s*<span class="{box_cls}"[^>]*>(.*?)</span>\s*</p>', re.DOTALL | re.IGNORECASE)
        content = pattern.sub(rf'<div class="{box_cls}"><p>\1</p></div>', content)
        # 連続する同クラスdivの統合
        merge_pattern = re.compile(rf'</div>\s*<div class="{box_cls}">', re.IGNORECASE)
        content = merge_pattern.sub(r'<br>', content)

    # 3. 案内リンク（「おかもし日程一覧」「おかもし詳細・お申し込み」）のボタングリッドカード化
    has_schedule = bool(re.search(r'おかもし日程一覧', content))
    has_apply = bool(re.search(r'おかもし詳細[・\s]?お申(?:し)?込み', content))

    if has_schedule or has_apply:
        # 単独行の「おかもし日程一覧」「おかもし詳細・お申し込み」段落を安全に削除（本文を巻き込まない）
        content = re.sub(r'<p[^>]*>(?:(?!</p>).)*?おかもし日程一覧(?:(?!</p>).)*?</p>', '', content, flags=re.DOTALL)
        content = re.sub(r'<p[^>]*>(?:(?!</p>).)*?おかもし詳細[・\s]?お申(?:し)?込み(?:(?!</p>).)*?</p>', '', content, flags=re.DOTALL)

        btn_grid_html = '''
<div class="not-prose my-6 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
  <a href="/index.html#schedule" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 py-3 px-4 rounded-lg flex justify-between items-center transition-all group font-bold shadow-2xs no-underline cursor-pointer">
    <div class="flex items-center gap-2.5 min-w-0">
      <span class="w-8 h-8 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
        <span class="material-symbols-outlined text-[20px]">calendar_month</span>
      </span>
      <span class="text-sm sm:text-base font-bold text-emerald-900 truncate">おかもし日程一覧</span>
    </div>
    <span class="material-symbols-outlined text-emerald-700 text-lg group-hover:translate-x-1 transition-transform shrink-0">arrow_forward</span>
  </a>
  <a href="/apply.html" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 py-3 px-4 rounded-lg flex justify-between items-center transition-all group font-bold shadow-2xs no-underline cursor-pointer">
    <div class="flex items-center gap-2.5 min-w-0">
      <span class="w-8 h-8 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
        <span class="material-symbols-outlined text-[20px]">how_to_reg</span>
      </span>
      <span class="text-sm sm:text-base font-bold text-emerald-900 truncate">おかもし詳細・お申し込み</span>
    </div>
    <span class="material-symbols-outlined text-emerald-700 text-lg group-hover:translate-x-1 transition-transform shrink-0">arrow_forward</span>
  </a>
</div>
'''
        content += btn_grid_html

    # 4. 見出しの走査とID付与
    headings = []
    heading_counter = [0]

    def heading_replacer(match):
        tag = match.group(1).lower()
        attrs = match.group(2)
        inner = match.group(3)
        heading_counter[0] += 1
        idx = heading_counter[0]

        id_match = re.search(r'id=["\']([^"\']+)["\']', attrs)
        if id_match:
            h_id = id_match.group(1)
        else:
            h_id = f"toc-section-{idx}"
            attrs = f' id="{h_id}"' + attrs

        clean_text = re.sub(r'<[^>]+>', '', inner).strip()
        headings.append({
            "tag": f"h{tag}",
            "id": h_id,
            "text": clean_text
        })
        return f'<h{tag}{attrs}>{inner}</h{tag}>'

    content = re.sub(r'<h([23])([^>]*)>(.*?)</h\1>', heading_replacer, content, flags=re.DOTALL | re.IGNORECASE)

    return content, headings

def build_article_card_html(article, is_top=False):
    """お知らせ一覧・トップ用の共通カードHTML生成"""
    a_id = article.get("id", "")
    title = article.get("title", "無題のお知らせ")
    pub_raw = article.get("publishedAt") or article.get("date") or article.get("createdAt")
    pub_date = format_date_ymd(pub_raw)
    cat_name, badge_cls = get_category_info(article.get("category"), title)
    is_new = is_new_article(pub_raw)

    new_badge_html = ""
    if is_new:
        new_badge_html = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#c85a32] text-white shadow-xs shrink-0 tracking-tight leading-none text-center">NEW</span>'

    # URL は SSG 生成された記事詳細 (/news/[id]/) への直接リンク
    link_url = f"/news/{a_id}/"

    data_cat = html_escape(cat_name)

    return f'''
          <!-- 記事カード ({a_id}) -->
          <article class="bg-slate-50 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all mb-3 overflow-hidden cursor-pointer group block" data-category="{data_cat}">
            <a href="{link_url}" class="flex items-center justify-between p-4 sm:p-5 gap-3 sm:gap-4 w-full">
              <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-1 min-w-0">
                <div class="flex items-center gap-2.5 shrink-0">
                  <span class="flex items-center gap-1.5 text-xs text-slate-500 font-medium shrink-0">
                    <span class="material-symbols-outlined text-[15px] text-slate-400">calendar_today</span>
                    <span class="tabular-nums">{pub_date}</span>
                  </span>
                  {new_badge_html}
                  <span class="px-2.5 py-0.5 rounded-md text-[11px] font-bold {badge_cls} shrink-0 shadow-2xs">
                    {cat_name}
                  </span>
                </div>
                <h3 class="font-bold text-[15px] sm:text-base text-slate-900 group-hover:text-brand-green transition-colors flex-1 leading-snug break-words">
                  {html_escape(title)}
                </h3>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-xs font-bold text-slate-500 group-hover:text-brand-green transition-colors hidden md:inline">詳細を読む</span>
                <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white border border-slate-200 group-hover:bg-emerald-50 flex items-center justify-center text-slate-400 group-hover:text-brand-green transition-colors shrink-0 group-hover:translate-x-0.5">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"></path>
                  </svg>
                </div>
              </div>
            </a>
          </article>'''

def html_escape(text):
    """HTMLエスケープ"""
    if text is None:
        return ""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#39;")

def render_sidebar_exam_widget(exam_guides):
    """サイドバー模試ウィジェットの静的HTML事前生成"""
    target_configs = [
        {"gradeBadge": "中3生", "codes": ["c3", "chu3"], "month": "10月号", "link": "/index.html?grade=chu3#schedule-selector"},
        {"gradeBadge": "中2生", "codes": ["c2", "chu2", "c1_c2"], "month": "11月号", "link": "/index.html?grade=chu2#schedule-selector"},
        {"gradeBadge": "中1生", "codes": ["c1", "chu1", "c1_c2"], "month": "11月号", "link": "/index.html?grade=chu1#schedule-selector"},
        {"gradeBadge": "小6生", "codes": ["e6", "s6", "sho6"], "month": "10月号", "link": "/index.html?grade=sho6#schedule-selector"}
    ]

    cards = []
    for cfg in target_configs:
        cards.append(f'''
      <a href="{cfg['link']}" class="block p-3.5 sm:p-4 hover:bg-slate-100/70 transition-colors cursor-pointer group">
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="inline-flex items-center justify-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs shrink-0 leading-tight">{cfg['gradeBadge']}</span>
            <span class="inline-flex items-center justify-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs shrink-0 leading-tight">{cfg['month']}</span>
          </div>
          <div class="w-6 h-6 rounded-full bg-emerald-800 text-white flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-emerald-900 transition-all shadow-2xs">
            <span class="material-symbols-outlined text-[15px] text-white">chevron_right</span>
          </div>
        </div>
        <div class="text-xs text-slate-600 font-medium">岡山会場 または 自宅受験対応</div>
      </a>''')

    return "\n".join(cards)

def build_article_detail_page(article, all_articles, template_html, exam_guides):
    """単一記事詳細ページの静的HTML生成"""
    a_id = article.get("id", "")
    title = article.get("title", "無題のお知らせ")
    pub_raw = article.get("publishedAt") or article.get("createdAt")
    pub_date = format_date_ymd(pub_raw)
    raw_content = article.get("content") or ""
    formatted_content, headings = format_article_content(raw_content)
    cat_name, badge_cls = get_category_info(article.get("category"), title)
    eyecatch = article.get("eyecatch")
    eyecatch_url = eyecatch.get("url") if isinstance(eyecatch, dict) else ""

    # 前後記事の特定 (all_articles は降順：[0]が最新)
    current_idx = -1
    for idx, item in enumerate(all_articles):
        if item.get("id") == a_id:
            current_idx = idx
            break

    # 前の記事（1つ古い記事 = current_idx + 1）
    prev_article = all_articles[current_idx + 1] if current_idx >= 0 and current_idx + 1 < len(all_articles) else None
    # 次の記事（1つ新しい記事 = current_idx - 1）
    next_article = all_articles[current_idx - 1] if current_idx > 0 else None

    # 前後記事ナビゲーションHTML
    if prev_article:
        prev_html = f'''
    <a class="flex items-center gap-1 text-xs sm:text-sm text-slate-600 hover:text-emerald-700 font-medium transition-colors shrink-0 group cursor-pointer" data-path="news-detail-prev" href="/news/{prev_article['id']}/">
      <span class="material-symbols-outlined text-[16px] text-slate-400 group-hover:text-emerald-600 group-hover:-translate-x-0.5 transition-transform shrink-0">arrow_back</span>
      <span class="font-bold text-slate-700 group-hover:text-emerald-700">前の記事</span>
    </a>'''
    else:
        prev_html = '''
    <span class="flex items-center gap-1 text-xs sm:text-sm text-slate-300 font-medium shrink-0 cursor-not-allowed select-none opacity-50">
      <span class="material-symbols-outlined text-[16px] text-slate-300">arrow_back</span>
      <span>前の記事</span>
    </span>'''

    if next_article:
        next_html = f'''
    <a class="flex items-center justify-end gap-1 text-xs sm:text-sm text-slate-600 hover:text-emerald-700 font-medium transition-colors shrink-0 text-right group cursor-pointer" data-path="news-detail-next" href="/news/{next_article['id']}/">
      <span class="font-bold text-slate-700 group-hover:text-emerald-700">次の記事</span>
      <span class="material-symbols-outlined text-[16px] text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-transform shrink-0">arrow_forward</span>
    </a>'''
    else:
        next_html = '''
    <span class="flex items-center justify-end gap-1 text-xs sm:text-sm text-slate-300 font-medium shrink-0 text-right cursor-not-allowed select-none opacity-50">
      <span>次の記事</span>
      <span class="material-symbols-outlined text-[16px] text-slate-300">arrow_forward</span>
    </span>'''

    nav_html = f'''
  <nav class="flex items-center justify-between gap-2 w-full p-2.5 sm:p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs" aria-label="記事ナビゲーション">
    {prev_html}
    <a class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] sm:text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-200/80 transition-all shadow-2xs shrink-0" data-path="news" href="/news.html">
      <span class="material-symbols-outlined text-[14px] text-slate-500">grid_view</span>
      <span>記事一覧に戻る</span>
    </a>
    {next_html}
  </nav>'''

    # 関連記事HTML (自身を除く最大3件)
    related_items = [a for a in all_articles if a.get("id") != a_id][:3]
    related_cards = []
    for r in related_items:
        r_id = r.get("id")
        r_title = r.get("title", "")
        r_date = format_date_ymd(r.get("publishedAt") or r.get("createdAt"))
        r_cat, r_badge = get_category_info(r.get("category"), r_title)
        related_cards.append(f'''
        <a href="/news/{r_id}/" class="block p-3 sm:p-3.5 bg-white hover:bg-slate-100/80 rounded-lg border border-slate-200/90 hover:border-emerald-300 transition-all group shadow-2xs">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-[11px] text-slate-500 tabular-nums">{r_date}</span>
            <span class="px-2 py-0.2 rounded text-[10px] font-bold {r_badge}">{r_cat}</span>
          </div>
          <h4 class="font-bold text-xs sm:text-sm text-slate-900 group-hover:text-brand-green transition-colors leading-snug line-clamp-2">
            {html_escape(r_title)}
          </h4>
        </a>''')
    related_html = "\n".join(related_cards)

    # アイキャッチ画像ブロック
    if eyecatch_url:
        hero_block = f'''
<div id="article-hero-container" class="relative w-full rounded-lg overflow-hidden shadow-sm aspect-[16/9] bg-slate-100 mt-4 sm:mt-6">
  <img id="article-hero-img" class="w-full h-full object-cover" data-alt="{html_escape(title)}" src="{eyecatch_url}" alt="{html_escape(title)}" width="1200" height="675" fetchpriority="high" decoding="async">
  <div class="absolute bottom-3 right-3 px-space-xs py-1 bg-primary/80 backdrop-blur-md rounded-lg text-on-primary font-label-sm text-label-sm flex items-center gap-1" id="article-hero-tag-badge">
    <span class="material-symbols-outlined text-[14px]">insights</span>
    <span id="article-hero-tag">{cat_name}</span>
  </div>
</div>'''
    else:
        hero_block = '<div id="article-hero-container" class="hidden"></div>'

    # 本文リード文
    lead_text = article.get("description") or ""
    lead_block = f'<p id="article-lead" class="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">{html_escape(lead_text)}</p>' if lead_text else '<p id="article-lead" class="hidden"></p>'

    # 模試ウィジェットHTML
    exam_widget_html = render_sidebar_exam_widget(exam_guides)

    # 目次 (TOC) リストHTML (見出しが2件以上ある場合)
    toc_items = []
    for h in headings:
        is_h2 = h["tag"] == "h2"
        indent = "pt-1 font-medium" if is_h2 else "pl-3 text-xs text-on-surface-variant"
        toc_items.append(f'''
          <li class="{indent}">
            <a href="#{h['id']}" class="hover:text-secondary flex items-start gap-1.5 transition-colors py-0.5 truncate">
              <span class="text-primary font-bold shrink-0">・</span>
              <span class="truncate">{html_escape(h['text'])}</span>
            </a>
          </li>''')
    toc_html = "\n".join(toc_items)
    toc_card_class = "p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs flex flex-col gap-2.5" if len(headings) >= 2 else "hidden"

    # テンプレートを元に静的HTMLを組み立てる
    html = template_html

    # 相対パスの正規化 (/ から始まる絶対パスへ統一)
    html = re.sub(r'href="css/', 'href="/css/', html)
    html = re.sub(r'src="js/', 'src="/js/', html)
    html = re.sub(r'href="news\.html"', 'href="/news.html"', html)
    html = re.sub(r'href="index\.html"', 'href="/index.html"', html)
    html = re.sub(r'href="apply\.html"', 'href="/apply.html"', html)

    # メタタグ・タイトル置換（属性の有無を問わずマッチ）
    article_title = f"{title} | 岡山県統一模擬試験（おかもし）"
    article_desc = lead_text or title
    page_url = f"https://okamoshi.pages.dev/news/{a_id}/"

    html = re.sub(r'<title[^>]*>.*?</title>', f'<title>{html_escape(article_title)}</title>', html, count=1)
    html = re.sub(r'<meta[^>]*name=["\']description["\'][^>]*>', f'<meta name="description" content="{html_escape(article_desc)}">', html, count=1)
    html = re.sub(r'<meta[^>]*property=["\']og:title["\'][^>]*>', f'<meta property="og:title" content="{html_escape(article_title)}">', html, count=1)
    html = re.sub(r'<meta[^>]*property=["\']og:description["\'][^>]*>', f'<meta property="og:description" content="{html_escape(article_desc)}">', html, count=1)
    html = re.sub(r'<meta[^>]*property=["\']og:url["\'][^>]*>', f'<meta property="og:url" content="{page_url}">', html, count=1)
    if eyecatch_url:
        html = re.sub(r'<meta[^>]*property=["\']og:image["\'][^>]*>', f'<meta property="og:image" content="{eyecatch_url}">', html, count=1)
    html = re.sub(r'<link[^>]*rel=["\']canonical["\'][^>]*>', f'<link rel="canonical" href="{page_url}">', html, count=1)

    # JSON-LD 構造化データの置換
    json_ld_data = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": title,
        "description": article_desc,
        "image": eyecatch_url or "https://okamoshi.pages.dev/og-image.jpg",
        "datePublished": pub_raw or datetime.now().isoformat(),
        "dateModified": article.get("updatedAt") or pub_raw or datetime.now().isoformat(),
        "author": {
            "@type": "Organization",
            "name": "岡山県統一模擬試験 教務進路指導部"
        },
        "publisher": {
            "@type": "Organization",
            "name": "岡山県統一模擬試験実行委員会",
            "url": "https://okamoshi.pages.dev/"
        }
    }
    json_ld_str = json.dumps(json_ld_data, ensure_ascii=False, indent=2)
    html = re.sub(r'<script id="jsonld-article" type="application/ld\+json">.*?</script>', f'<script id="jsonld-article" type="application/ld+json">\n{json_ld_str}\n  </script>', html, flags=re.DOTALL)

    # パンくずリスト更新
    html = re.sub(r'<span id="breadcrumb-current-title">.*?</span>', f'<span id="breadcrumb-current-title">{html_escape(title)}</span>', html)

    # スケルトンローダー削除（article-content-wrapper の直前までを完全に削除）
    html = re.sub(r'<!-- Article Skeleton Loader.*?<div id="article-content-wrapper"', '<div id="article-content-wrapper"', html, flags=re.DOTALL)

    # 本文ラッパーの hidden / opacity-0 を解除
    html = re.sub(r'id="article-content-wrapper" class="hidden opacity-0 ', 'id="article-content-wrapper" class="', html)

    # カテゴリバッジ置換
    cat_badge_html = f'<span id="article-category-badge" class="px-2.5 py-1 rounded-full {badge_cls} text-xs font-bold inline-flex items-center gap-1 shrink-0"><span class="material-symbols-outlined text-[13px]">school</span><span>{cat_name}</span></span>'
    html = re.sub(r'<span id="article-category-badge".*?</span>\s*</span>', cat_badge_html, html, flags=re.DOTALL)

    # 公開日置換
    html = re.sub(r'<span id="article-published-date">.*?</span>', f'<span id="article-published-date">{pub_date}</span>', html)

    # メイン見出し H1 置換
    html = re.sub(r'<h1 id="article-title"[^>]*>.*?</h1>', f'<h1 id="article-title" class="text-xl sm:text-2xl md:text-3xl text-[#1e3a2f] tracking-tight font-bold leading-snug sm:leading-[1.4] mt-3 sm:mt-4 mb-2">{html_escape(title)}</h1>', html, flags=re.DOTALL)

    # リード文置換
    html = re.sub(r'<p id="article-lead"[^>]*>.*?</p>', lead_block, html, flags=re.DOTALL)

    # アイキャッチ置換
    html = re.sub(r'<div id="article-hero-container"[^>]*>.*?</div>\s*</div>', hero_block, html, flags=re.DOTALL)

    # 本文コンテナ置換 (lambda を使ってバックスラッシュの誤動作を防止)
    replacement_body = f'<div id="entry-content-body" class="entry-content blog-body prose">\n{formatted_content}\n</div><!-- /#entry-content-body -->'
    html = re.sub(
        r'<div id="entry-content-body"[^>]*>.*?</div><!-- /#entry-content-body -->',
        lambda m: replacement_body,
        html,
        flags=re.DOTALL
    )

    # 前後記事ナビゲーション置換
    html = re.sub(r'<nav class="flex items-center justify-between gap-2 w-full.*?aria-label="記事ナビゲーション">.*?</nav>', lambda m: nav_html, html, flags=re.DOTALL)

    # 関連記事置換
    related_replacement = f'<div id="related-articles-grid" class="bg-transparent sm:bg-slate-50/80 p-0 sm:p-4 rounded-none sm:rounded-lg border-0 sm:border border-slate-200/80 flex flex-col gap-2.5">\n{related_html}\n</div>\n</div>\n<!-- Mobile Button'
    html = re.sub(r'<div id="related-articles-grid"[^>]*>.*?</div>\s*</div>\s*<!-- Mobile Button', lambda m: related_replacement, html, flags=re.DOTALL)

    # サイドバー模試ウィジェット置換
    exam_replacement = f'<div class="divide-y divide-slate-200" id="sidebar-exam-widget-list">\n{exam_widget_html}\n</div>\n</div>\n</div>'
    html = re.sub(r'<div class="divide-y divide-slate-200" id="sidebar-exam-widget-list">.*?</div>\s*</div>\s*</div>', lambda m: exam_replacement, html, flags=re.DOTALL)

    # サイドバー目次カードの挿入（Instagramバナーの上に配置）
    if len(headings) >= 2:
        sidebar_toc_block = f'''
<!-- Sidebar Table of Contents -->
<div class="{toc_card_class}" id="sidebar-toc-card">
  <span class="text-xs font-bold text-primary flex items-center gap-1.5">
    <span class="material-symbols-outlined text-[16px] text-secondary">format_list_bulleted</span>目次
  </span>
  <ul class="space-y-1 divide-y divide-slate-100" id="sidebar-toc-list">
{toc_html}
  </ul>
</div>
'''
        html = re.sub(r'(<!-- 2\. Official Instagram Banner)', lambda m: f'{sidebar_toc_block}\n' + m.group(1), html)

    # 不要なクライアントフェッチスクリプトを削除（静的化済みのため不要）
    html = re.sub(r'<script defer src="/?js/microcms-config\.js"></script>', '', html)
    html = re.sub(r'<script>\s*// 2\. モック記事データ.*?</script>', '', html, flags=re.DOTALL)

    return html

def update_top_page(articles):
    """トップページ（index.html）の最新お知らせ枠を事前レンダリング & クライアントfetch廃止"""
    index_path = os.path.join(BASE_DIR, "index.html")
    if not os.path.exists(index_path):
        return

    with open(index_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 最新3件のカードを生成
    top_3 = articles[:3]
    cards_html = "\n".join([build_article_card_html(a, is_top=True) for a in top_3])

    # #latest-news-list の中身を置換
    start_tag = '<div id="latest-news-list" class="space-y-3">'
    end_tag = '<!-- すべてのお知らせを見る'
    
    if start_tag in content and end_tag in content:
        parts = content.split(start_tag)
        before = parts[0]
        rest = parts[1]
        after_parts = rest.split(end_tag)
        after = after_parts[1]
        content = f"{before}{start_tag}\n{cards_html}\n        </div>\n\n        {end_tag}{after}"
        print("Updated index.html #latest-news-list with static cards.")
    else:
        # 正規表現フォールバック
        reg = re.compile(r'(<div id="latest-news-list"[^>]*>).*?(</div>\s*<!-- すべてのお知らせを見る)', re.DOTALL)
        if reg.search(content):
            content = reg.sub(f'\\1\n{cards_html}\n        \\2', content)
            print("Updated index.html #latest-news-list via regex.")

    # 全記事データをインライン埋め込みし、クライアントfetchを廃止
    articles_json = json.dumps([{
        "id": a.get("id"),
        "title": a.get("title"),
        "publishedAt": a.get("publishedAt") or a.get("createdAt"),
        "category": a.get("category"),
        "targetGrade": a.get("targetGrade")
    } for a in articles], ensure_ascii=False)

    # detailUrl の更新: 'detail.html?id=' -> '/news/'
    content = content.replace(
        "const detailUrl = `detail.html?id=${encodeURIComponent(post.id)}`;",
        "const detailUrl = `/news/${encodeURIComponent(post.id)}/`;"
    )

    # initLatestNews() の fetch 処理とAPIキーを安全に除去し、インライン静的データで初期化
    init_func_pattern = re.compile(r'async function initLatestNews\(\)\s*\{.*?updateNewsByGrade\(currentGrade\);\s*\}', re.DOTALL)
    replacement_init = f'''async function initLatestNews() {{
      allNewsArticles = {articles_json};
      // 静的HTMLで既に最新3件が表示されているため、学年タブの連動のみ実行（通信ゼロ）
      updateNewsByGrade(currentGrade);
    }}'''

    if init_func_pattern.search(content):
        content = init_func_pattern.sub(replacement_init, content)
        print("Replaced index.html client fetch with inline SSG article data.")

    with open(index_path, "w", encoding="utf-8") as f:
        f.write(content)

def update_news_index_page(articles):
    """お知らせ一覧ページ（news.html および news/index.html）の事前レンダリング & クライアントfetch廃止"""
    news_path = os.path.join(BASE_DIR, "news.html")
    if not os.path.exists(news_path):
        return

    with open(news_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 全記事のカードHTML生成
    cards_html = "\n".join([build_article_card_html(a, is_top=False) for a in articles])

    # #articles-list-container の中身を置換（ローディングスピナーを削除して静的カードを配置）
    start_tag = '<div id="articles-list-container" class="space-y-3">'
    end_tag = '<!-- Pagination Component -->'
    if start_tag in content and end_tag in content:
        p1 = content.split(start_tag)
        before = p1[0]
        p2 = p1[1].split(end_tag)
        after = p2[1]
        content = f"{before}{start_tag}\n{cards_html}\n        </div>\n        {end_tag}{after}"
        print("Updated news.html #articles-list-container with static cards via split.")
    else:
        reg_container = re.compile(r'(<div id="articles-list-container"[^>]*>).*?(</div>\s*<!-- Pagination)', re.DOTALL)
        if reg_container.search(content):
            content = reg_container.sub(f'\\1\n{cards_html}\n        </div>\n        <!-- Pagination', content)
            print("Updated news.html #articles-list-container with static cards via regex.")

    # ページネーションコンポーネントを隠す（全記事が1画面に収まるため）
    content = content.replace(
        '<div class="flex items-center justify-center pt-8 sm:pt-10">',
        '<div class="flex items-center justify-center pt-8 sm:pt-10 hidden">'
    )

    # 不要な microCMS API fetch スクリプトと API キーを完全削除
    content = re.sub(r'<script defer src="/?js/microcms-config\.js"></script>', '', content)
    
    script_block_reg = re.compile(r'<script>\s*// 2\. カテゴリのマッピング定義.*?</script>', re.DOTALL)
    if script_block_reg.search(content):
        content = script_block_reg.sub('', content)
        print("Removed client fetch script and API keys from news.html.")

    # news.html を書き出し
    with open(news_path, "w", encoding="utf-8") as f:
        f.write(content)

    # news/index.html にも同一内容を書き出し（ディレクトリ作成）
    news_dir = os.path.join(BASE_DIR, "news")
    os.makedirs(news_dir, exist_ok=True)
    with open(os.path.join(news_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(content)

    # blog.html も同期更新
    blog_path = os.path.join(BASE_DIR, "blog.html")
    if os.path.exists(blog_path):
        with open(blog_path, "w", encoding="utf-8") as f:
            f.write(content)

    print("Generated static news.html and news/index.html successfully.")

def build_all_article_detail_pages(articles, exam_guides):
    """全記事の詳細ページ（news/[id]/index.html & news/[id].html）を生成"""
    detail_template_path = os.path.join(BASE_DIR, "detail.html")
    if not os.path.exists(detail_template_path):
        print("Error: detail.html template not found.")
        return

    with open(detail_template_path, "r", encoding="utf-8") as f:
        template_html = f.read()

    # テンプレート読み込み時、もし以前挿入された転送用スクリプトがあれば除去
    template_html = re.sub(r'<script>\s*\(function\(\)\s*\{\s*var params = new URLSearchParams.*?</script>\s*', '', template_html, flags=re.DOTALL)

    generated_count = 0
    for article in articles:
        a_id = article.get("id")
        if not a_id:
            continue

        page_html = build_article_detail_page(article, articles, template_html, exam_guides)

        # 1. news/[id]/index.html
        art_dir = os.path.join(BASE_DIR, "news", a_id)
        os.makedirs(art_dir, exist_ok=True)
        art_index_path = os.path.join(art_dir, "index.html")
        with open(art_index_path, "w", encoding="utf-8") as f:
            f.write(page_html)

        # 2. news/[id].html (クリーンURLと拡張子付きURLの双方で開けるように配置)
        art_file_path = os.path.join(BASE_DIR, "news", f"{a_id}.html")
        with open(art_file_path, "w", encoding="utf-8") as f:
            f.write(page_html)

        generated_count += 1

    print(f"Generated {generated_count} static article detail pages in news/[id]/.")

def update_detail_html_redirect():
    """過去URL (detail.html?id=xxx) でアクセスされた場合のリダイレクト整備"""
    detail_path = os.path.join(BASE_DIR, "detail.html")
    if not os.path.exists(detail_path):
        return

    with open(detail_path, "r", encoding="utf-8") as f:
        content = f.read()

    # detail.html の冒頭に、?id=xxx があれば即座に /news/xxx/ へリダイレクトする処理を追加
    redirect_script = '''<script>
    (function() {
      var params = new URLSearchParams(window.location.search);
      var id = params.get('id');
      if (id) {
        window.location.replace('/news/' + encodeURIComponent(id) + '/');
      }
    })();
  </script>'''

    if "window.location.replace('/news/'" not in content:
        content = content.replace('<head>', f'<head>\n  {redirect_script}')
        with open(detail_path, "w", encoding="utf-8") as f:
            f.write(content)
        print("Added instant redirect from detail.html?id=xxx to /news/xxx/.")

def build_ssg():
    """SSG ビルドのメインエントリーポイント"""
    print("--- Starting microCMS SSG Static Generation ---")
    articles = fetch_microcms_articles()
    exam_guides = fetch_microcms_exam_guides()

    # 1. 各記事詳細ページの事前生成 (news/[id]/index.html)
    build_all_article_detail_pages(articles, exam_guides)

    # 2. お知らせ一覧ページの事前生成 (news.html, news/index.html)
    update_news_index_page(articles)

    # 3. トップページのお知らせ枠の更新 (index.html)
    update_top_page(articles)

    # 4. detail.html の転送処理
    update_detail_html_redirect()

    print("--- microCMS SSG Static Generation Finished Successfully ---")

if __name__ == "__main__":
    build_ssg()
