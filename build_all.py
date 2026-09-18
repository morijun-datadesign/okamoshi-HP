#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
岡山県統一模擬試験（おかもし） サイト全体一括ビルド & 最適化スクリプト
Cloudflare Pages のビルドコマンド（またはローカル開発用）として実行可能です。
"""

import os
import re
import datetime

print("==================================================")
print(" 岡山県統一模擬試験 Webサイト ビルド開始")
print("==================================================")

# 1. 共通スニペット
with open('js/header.snippet.html', 'r', encoding='utf-8') as f:
    header_html = f.read()
with open('js/footer.snippet.html', 'r', encoding='utf-8') as f:
    footer_html = f.read()

# Tailwind 設定ブロック
tailwind_config_block = """
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script id="tailwind-config">
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            "tertiary-container": "#6c4c00",
            "outline-variant": "#c0c9c2",
            "error": "#ba1a1a",
            "on-error": "#ffffff",
            "on-tertiary": "#ffffff",
            "outline": "#717973",
            "surface-dim": "#dcd9d9",
            "on-surface": "#1b1c1c",
            "on-secondary-fixed-variant": "#822801",
            "surface-tint": "#3a6752",
            "surface-container-high": "#eae7e7",
            "surface-container-low": "#f6f3f2",
            "background": "#f8fafc",
            "surface-container": "#f0eded",
            "on-tertiary-container": "#f1bd5a",
            "surface-variant": "#e4e2e1",
            "on-primary-fixed-variant": "#224f3c",
            "on-tertiary-fixed-variant": "#5e4200",
            "tertiary": "#4f3600",
            "surface-bright": "#ffffff",
            "inverse-primary": "#a1d1b8",
            "tertiary-fixed-dim": "#f2be5b",
            "on-secondary": "#ffffff",
            "on-surface-variant": "#414944",
            "on-primary-fixed": "#002114",
            "on-secondary-fixed": "#390c00",
            "surface-container-lowest": "#ffffff",
            "on-error-container": "#93000a",
            "on-background": "#1b1c1c",
            "error-container": "#ffdad6",
            "primary-container": "#2d5a46",
            "secondary-fixed-dim": "#ffb59c",
            "primary-fixed-dim": "#a1d1b8",
            "primary-fixed": "#bceed3",
            "on-secondary-container": "#6f2000",
            "surface": "#f8fafc",
            "primary": "#134230",
            "on-tertiary-fixed": "#271900",
            "inverse-surface": "#303030",
            "tertiary-fixed": "#ffdea7",
            "secondary-container": "#fe8357",
            "inverse-on-surface": "#f3f0ef",
            "secondary": "#a23e18",
            "on-primary": "#ffffff",
            "secondary-fixed": "#ffdbcf",
            "surface-container-highest": "#e4e2e1",
            "on-primary-container": "#9fcfb6"
          },
          borderRadius: { "DEFAULT": "0.25rem", "lg": "0.5rem", "xl": "0.75rem", "2xl": "1rem", "3xl": "1.5rem", "full": "9999px" },
          spacing: {
            "gutter-desktop": "1.5rem",
            "space-3xl": "4.5rem",
            "space-md": "1rem",
            "container-max": "75rem",
            "space-lg": "1.5rem",
            "space-xs": "0.5rem",
            "gutter-mobile": "1rem",
            "space-4xl": "6rem",
            "space-2xs": "0.25rem",
            "space-xl": "2rem",
            "space-2xl": "3rem",
            "space-sm": "0.75rem"
          },
          fontFamily: {
            "body-md": ["Noto Sans JP", "sans-serif"],
            "headline-xl": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "headline-sm": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "body-lg": ["Noto Sans JP", "sans-serif"],
            "headline-md": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "headline-lg-mobile": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "headline-xl-mobile": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "label-sm": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "label-md": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "body-sm": ["Noto Sans JP", "sans-serif"],
            "headline-lg": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "label-lg": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"]
          }
        }
      }
    };
  </script>
"""

def optimize_images_in_html(html_text):
    """ファーストビュー以外の画像に loading='lazy' を自動付与し、alt属性を保証する"""
    imgs = list(re.finditer(r'<img[^>]*>', html_text))
    new_html = html_text
    for i, m in enumerate(reversed(imgs)):
        tag = m.group(0)
        idx = len(imgs) - 1 - i
        new_tag = tag
        if idx > 0 and 'loading=' not in tag:
            new_tag = new_tag[:-1] + ' loading="lazy">'
        if 'alt=' not in tag or re.search(r'alt=[\"\']\s*[\"\']', tag):
            new_tag = new_tag[:-1] + ' alt="岡山県統一模擬試験 関連画像">'
        new_html = new_html[:m.start()] + new_tag + new_html[m.end():]
    return new_html


# ----------------------------------------------------
# A. BUILD INDEX.HTML (中3・中1・2・小6 統合トップページ)
# ----------------------------------------------------
def extract_direct_children(html):
    depth = 0
    start = -1
    children = []
    for m in re.finditer(r'(<div\b[^>]*>|</div>)', html):
        tag = m.group(0)
        if tag.startswith('<div'):
            if depth == 0:
                start = m.start()
            depth += 1
        else:
            depth -= 1
            if depth == 0 and start != -1:
                children.append(html[start:m.end()])
                start = -1
    return children

def modernize_panel(raw_panel, panel_key):
    m_wrap = re.search(r'<div class=["\']bg-surface-container-lowest[^"\']*["\']>', raw_panel)
    if not m_wrap:
        return raw_panel
    
    wrap_prefix = raw_panel[:m_wrap.start()]
    inner = raw_panel[m_wrap.end():]
    last_close = inner.rfind('</div>')
    if last_close == -1:
        return raw_panel
    inner_content = inner[:last_close]
    wrap_suffix = inner[last_close+6:]

    children = extract_direct_children(inner_content)
    if not children:
        return raw_panel

    groups = []
    if panel_key == 'chu3' and len(children) >= 7:
        groups = [
            [children[0]],
            [children[1]],
            [children[2]],
            [children[3], children[4]],
            [children[5], children[6]]
        ]
    else:
        groups = [[c] for c in children]

    card_chunks = []
    for i, grp in enumerate(groups):
        chunk = ''.join(grp)
        chunk = re.sub(r'\bpt-[24]\s+border-t\s+border-surface-container\b', '', chunk)
        chunk = re.sub(r'\bborder-t\s+border-surface-container\b', '', chunk)

        if i == 0:
            if panel_key == 'chu3':
                catch_text = '<span class="inline-block">志望校決定の秋！</span><span class="inline-block">合格に向けて今必要な「あと◯点」を掴む！</span>'
            elif panel_key == 'chu12':
                catch_text = '<span class="inline-block">中1・2の冬が分岐点！</span><span class="inline-block">基礎固めと入試を見据えた実力測定で差をつける！</span>'
            else:
                catch_text = '<span class="inline-block">岡山県立中等教育学校・中学校受検 完全対策！</span><span class="inline-block">志望校合格への突破口を開く特化型模試</span>'

            chunk = re.sub(
                r'<div class=["\']rounded-2xl bg-surface-container-low[^"\']*["\']>.*?</div>(?=</div>)',
                f'<div class="rounded-xl bg-emerald-50/70 p-3.5 sm:p-4 text-center border border-emerald-200/60 shadow-2xs mt-2"><p class="font-headline-lg text-base sm:text-xl md:text-2xl text-primary font-bold tracking-tight leading-snug">{catch_text}</p></div>',
                chunk,
                flags=re.DOTALL
            )
            chunk = chunk.replace('border-outline-variant/30', 'border-slate-100')

        elif i == 1:
            chunk = chunk.replace('whitespace-nowrap', '')
            chunk = re.sub(
                r'class=["\']font-bold text-[a-z0-9\s:-]+ text-primary whitespace-nowrap["\']',
                'class="font-bold text-lg sm:text-2xl tracking-tight text-primary flex flex-wrap items-baseline gap-x-1.5"',
                chunk
            )
            chunk = re.sub(
                r'class=["\']font-bold text-xl sm:text-2xl tracking-tight text-primary["\']',
                'class="font-bold text-lg sm:text-2xl tracking-tight text-primary flex flex-wrap items-baseline gap-x-1.5"',
                chunk
            )

        chunk = chunk.replace('bg-surface-container-low border border-outline-variant/30', 'bg-slate-50/80 border border-slate-200/70')
        chunk = chunk.replace('border-surface-container/60', 'border-slate-200/60')
        chunk = chunk.replace('border-surface-container', 'border-slate-200/60')

        card_html = f'<div class="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-100/80 space-y-4">\n{chunk}\n</div>'
        card_chunks.append(card_html)

    new_inner = '\n'.join(card_chunks)
    new_wrapper = f'<div class="bg-transparent md:bg-white rounded-none md:rounded-3xl p-0 md:p-8 lg:p-10 border-0 md:border md:border-slate-200/80 shadow-none md:shadow-sm space-y-4 sm:space-y-6">\n{new_inner}\n</div>'
    return wrap_prefix + new_wrapper + wrap_suffix


def build_index():
    with open('lp_3_1/code.html', 'r', encoding='utf-8') as f:
        c3 = f.read()
    with open('lp_1_2_1/code.html', 'r', encoding='utf-8') as f:
        c12 = f.read()
    with open('lp_6/code.html', 'r', encoding='utf-8') as f:
        c6 = f.read()

    m_chu3 = re.search(r'(<div[^>]*id=[\"\']tab-panel-chu3[\"\'].*?)(?=<!--\s*3\.\s*DETAILS|<section id=[\"\']features)', c3, re.DOTALL)
    panel_chu3 = m_chu3.group(1).strip() if m_chu3 else ''

    m_chu12 = re.search(r'(<div[^>]*id=[\"\']tab-panel-chu12[\"\'].*?)(?=<div[^>]*id=[\"\']tab-panel-chu3|<div[^>]*id=[\"\']tab-panel-sho6|<section id=[\"\']features)', c12, re.DOTALL)
    panel_chu12 = m_chu12.group(1).strip() if m_chu12 else ''

    m_sho6 = re.search(r'(<div[^>]*id=[\"\']tab-panel-sho6[\"\'].*?)(?=<div[^>]*id=[\"\']tab-panel-chu|<section id=[\"\']features)', c6, re.DOTALL)
    panel_sho6 = m_sho6.group(1).strip() if m_sho6 else ''

    def clean_and_balance_panel(raw_panel, panel_id, is_active=False):
        # 早期に閉じてしまう </section> を除去
        idx_sec = raw_panel.find('</section>')
        if idx_sec != -1:
            raw_panel = raw_panel[:idx_sec]
        
        # open/close div タグの数を完全に一致させる
        open_count = len(re.findall(r'<div\b', raw_panel))
        close_count = len(re.findall(r'</div>', raw_panel))
        if close_count < open_count:
            raw_panel += '</div>' * (open_count - close_count)
        elif close_count > open_count:
            for _ in range(close_count - open_count):
                last_idx = raw_panel.rfind('</div>')
                if last_idx != -1:
                    raw_panel = raw_panel[:last_idx] + raw_panel[last_idx+6:]

        # クラスを同一の幅制限とグリッドセル配置（重なりスライド用）で統一
        display_class = "block" if is_active else "hidden"
        unified_class = f'class="tab-panel {display_class} col-start-1 row-start-1 w-full max-w-[75rem] mx-auto space-y-space-xl"'
        raw_panel = re.sub(r'class=[\"\']tab-panel[^\"\']*[\"\']', unified_class, raw_panel, count=1)
        return raw_panel

    panel_chu3 = clean_and_balance_panel(panel_chu3, 'chu3', is_active=True)
    panel_chu12 = clean_and_balance_panel(panel_chu12, 'chu12', is_active=False)
    panel_sho6 = clean_and_balance_panel(panel_sho6, 'sho6', is_active=False)

    panel_chu3 = modernize_panel(panel_chu3, 'chu3')
    panel_chu12 = modernize_panel(panel_chu12, 'chu12')
    panel_sho6 = modernize_panel(panel_sho6, 'sho6')

    m_hero = re.search(r'(<!--\s*1\.\s*HERO SECTION\s*-->.*?)(?=<!--\s*2\.\s*NEXT EXAM)', c3, re.DOTALL)
    hero_section = m_hero.group(1).strip() if m_hero else ''

    m_rest = re.search(r'(<!--\s*3\.\s*DETAILS.*?)(?=</main>)', c3, re.DOTALL)
    rest_section = m_rest.group(1).strip() if m_rest else ''

    # 古いタブ切り替えスクリプトを除去して競合・重複を防止
    rest_section = re.sub(r'<script>.*?</script>', '', rest_section, flags=re.DOTALL)

    # Clean up internal links
    hero_section = hero_section.replace('data-path="apply"', 'href="apply.html"')
    rest_section = rest_section.replace('data-path="apply"', 'href="apply.html"')
    rest_section = rest_section.replace('data-path="partner-schools"', 'href="schools.html"')

    content = f"""<!DOCTYPE html>
<html lang="ja" class="scroll-smooth">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>岡山県統一模擬試験（おかもし）| 岡山県の高校入試・県立中受検対策模試 公式ポータル</title>
  <meta name="description" content="岡山県の高校受験・県立中高一貫校受検なら岡山県統一模擬試験（おかもし）。県内180校以上の学習塾が採用する高い信頼性と精緻な志望校合否判定。中3・中1・中2・小6対象の模試日程・実施要項・Webお申込み受付中。">
  <link rel="canonical" href="https://okamoshi.pages.dev/index.html">
  
  <meta property="og:title" content="岡山県統一模擬試験（おかもし）| 岡山県の高校入試・県立中受検対策模試 公式ポータル">
  <meta property="og:description" content="岡山県の高校受験・県立中高一貫校受検なら岡山県統一模擬試験（おかもし）。県内180校以上の学習塾が採用する高い信頼性と精緻な志望校合否判定。">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://okamoshi.pages.dev/index.html">
  <meta property="og:image" content="https://okamoshi.pages.dev/og-image.jpg">
  <meta property="og:site_name" content="岡山県統一模擬試験（おかもし）">
  <meta name="twitter:card" content="summary_large_image">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet">

  {tailwind_config_block}

  <script type="application/ld+json">
  {{
    "@context": "https://schema.org",
    "@graph": [
      {{
        "@type": "WebSite",
        "@id": "https://okamoshi.pages.dev/#website",
        "url": "https://okamoshi.pages.dev/",
        "name": "岡山県統一模擬試験（おかもし）",
        "description": "岡山県の高校入試・県立中高一貫校受検対策模試 公式ポータル",
        "inLanguage": "ja"
      }},
      {{
        "@type": "Organization",
        "@id": "https://okamoshi.pages.dev/#organization",
        "name": "岡山県統一模擬試験実行委員会",
        "url": "https://okamoshi.pages.dev/",
        "logo": "https://okamoshi.pages.dev/logo.png",
        "address": {{
          "@type": "PostalAddress",
          "streetAddress": "広島県広島市中区八丁堀15番6号 広島ちゅうぎんビル3階",
          "addressRegion": "広島県",
          "addressLocality": "広島市中区",
          "postalCode": "730-0017",
          "addressCountry": "JP"
        }},
        "contactPoint": {{
          "@type": "ContactPoint",
          "telephone": "+81-82-227-3999",
          "contactType": "customer support",
          "availableLanguage": "Japanese"
        }}
      }}
    ]
  }}
  </script>
  <style>
    @keyframes slideInFromRight {{
      0% {{
        opacity: 0;
        transform: translateX(100%);
      }}
      100% {{
        opacity: 1;
        transform: translateX(0);
      }}
    }}
    @keyframes slideOutToLeft {{
      0% {{
        opacity: 1;
        transform: translateX(0);
      }}
      100% {{
        opacity: 0;
        transform: translateX(-100%);
      }}
    }}
    @keyframes slideInFromLeft {{
      0% {{
        opacity: 0;
        transform: translateX(-100%);
      }}
      100% {{
        opacity: 1;
        transform: translateX(0);
      }}
    }}
    @keyframes slideOutToRight {{
      0% {{
        opacity: 1;
        transform: translateX(0);
      }}
      100% {{
        opacity: 0;
        transform: translateX(100%);
      }}
    }}

    .anim-slide-in-right {{
      animation: slideInFromRight 380ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
      z-index: 2;
    }}
    .anim-slide-out-left {{
      animation: slideOutToLeft 380ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
      z-index: 1;
      pointer-events: none;
    }}
    .anim-slide-in-left {{
      animation: slideInFromLeft 380ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
      z-index: 2;
    }}
    .anim-slide-out-right {{
      animation: slideOutToRight 380ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
      z-index: 1;
      pointer-events: none;
    }}
      body {{
      background-color: #f8fafc !important;
    }}
  </style>
</head>
<body class="bg-slate-50 font-body-md text-body-md text-slate-800 antialiased min-h-screen flex flex-col justify-between selection:bg-primary/20 selection:text-primary pt-16 sm:pt-20">

  {header_html}

  <main class="flex-1 w-full flex flex-col items-center">
    {hero_section}

    <section class="w-full max-w-[75rem] mx-auto px-4 sm:px-gutter-desktop py-space-xl sm:py-space-2xl overflow-hidden" id="exam-tabs-section">
      <div class="space-y-space-md mb-space-lg text-center max-w-3xl mx-auto">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed-variant text-xs font-bold shadow-xs">
          <span class="material-symbols-outlined text-sm">fact_check</span>
          <span>次回模試のご案内・実施要項</span>
        </div>
        <h2 class="font-headline-lg text-2xl sm:text-3xl lg:text-4xl text-primary font-bold tracking-tight">
          学年を選択して実施要項・出題範囲を確認
        </h2>
        <p class="font-body-md text-on-surface-variant text-sm sm:text-base leading-relaxed">
          「中3」「中1・2」「小6」のタブをタップすると、次回模試の実施日程、教科別時間割、出題範囲、受検料などの詳細が切り替わります。
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-space-xl" role="tablist" aria-label="学年選択タブ">
        <button type="button" id="tab-btn-chu3" onclick="switchExamTab('chu3')" role="tab" aria-selected="true" aria-controls="tab-panel-chu3"
          class="tab-btn w-full p-4 sm:p-5 rounded-2xl transition-all duration-200 flex items-center justify-between gap-3 bg-primary text-on-primary shadow-lg ring-2 ring-primary/20 font-bold cursor-pointer border border-primary text-left hover:-translate-y-0.5 focus:outline-none">
          <div class="flex flex-col min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="tab-title text-base sm:text-lg font-bold text-white tracking-tight">中3 おかもし</span>
              <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#c2410c] text-white shadow-xs">10月号</span>
            </div>
            <span class="tab-desc text-xs sm:text-sm text-primary-fixed font-normal truncate">志望校合否判定・岡山県入試徹底対策</span>
          </div>
          <span class="tab-badge px-3 py-1 rounded-full text-xs font-bold bg-[#fe8357] text-white shrink-0 shadow-xs">次回実施</span>
        </button>

        <button type="button" id="tab-btn-chu12" onclick="switchExamTab('chu12')" role="tab" aria-selected="false" aria-controls="tab-panel-chu12"
          class="tab-btn w-full p-4 sm:p-5 rounded-2xl transition-all duration-200 flex items-center justify-between gap-3 bg-white text-slate-800 hover:bg-slate-100/70 font-bold cursor-pointer border border-slate-200/80 shadow-xs text-left hover:-translate-y-0.5 focus:outline-none">
          <div class="flex flex-col min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="tab-title text-base sm:text-lg font-bold text-on-surface tracking-tight">中1・2 おかもし</span>
              <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-surface-container-highest text-secondary border border-outline-variant/30">12月号</span>
            </div>
            <span class="tab-desc text-xs sm:text-sm text-on-surface-variant font-normal truncate">公立高校入試基礎・標準・弱点克服</span>
          </div>
          <span class="tab-badge px-3 py-1 rounded-full text-xs font-bold bg-surface-container-highest text-secondary border border-outline-variant/30 shrink-0">次回実施</span>
        </button>

        <button type="button" id="tab-btn-sho6" onclick="switchExamTab('sho6')" role="tab" aria-selected="false" aria-controls="tab-panel-sho6"
          class="tab-btn w-full p-4 sm:p-5 rounded-2xl transition-all duration-200 flex items-center justify-between gap-3 bg-white text-slate-800 hover:bg-slate-100/70 font-bold cursor-pointer border border-slate-200/80 shadow-xs text-left hover:-translate-y-0.5 focus:outline-none">
          <div class="flex flex-col min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="tab-title text-base sm:text-lg font-bold text-on-surface tracking-tight">小6 適性検査模試</span>
              <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-surface-container-highest text-secondary border border-outline-variant/30">10月号</span>
            </div>
            <span class="tab-desc text-xs sm:text-sm text-on-surface-variant font-normal truncate">岡山県立中高一貫校受検対策</span>
          </div>
          <span class="tab-badge px-3 py-1 rounded-full text-xs font-bold bg-surface-container-highest text-secondary border border-outline-variant/30 shrink-0">次回実施</span>
        </button>
      </div>

      <div class="w-full max-w-[75rem] mx-auto overflow-hidden relative grid grid-cols-1 grid-rows-1" id="tab-panels-container">
        {panel_chu3}
        {panel_chu12}
        {panel_sho6}
      </div>
    </section>

    {rest_section}
  </main>

  {footer_html}

  <script>
    (function() {{
      const badgeConfig = {{
        'chu3': {{ inactiveText: 'text-secondary', inactiveBg: 'bg-surface-container-highest', activeBg: 'bg-[#fe8357]' }},
        'chu12': {{ inactiveText: 'text-secondary', inactiveBg: 'bg-surface-container-highest', activeBg: 'bg-[#fe8357]' }},
        'sho6': {{ inactiveText: 'text-secondary', inactiveBg: 'bg-surface-container-highest', activeBg: 'bg-[#fe8357]' }}
      }};

      const tabOrder = ['chu3', 'chu12', 'sho6'];
      let currentTabKey = 'chu3';
      let isAnimating = false;

      window.switchExamTab = function(tabKey) {{
        if (tabKey === currentTabKey && document.getElementById('tab-panel-' + tabKey)?.classList.contains('block')) {{
          return;
        }}
        if (isAnimating) return;

        const prevKey = currentTabKey;
        const prevIndex = tabOrder.indexOf(prevKey);
        const nextIndex = tabOrder.indexOf(tabKey);
        const isMovingRight = nextIndex > prevIndex;

        const currentPanel = document.getElementById('tab-panel-' + prevKey);
        const nextPanel = document.getElementById('tab-panel-' + tabKey);
        if (!nextPanel) return;

        isAnimating = true;

        const outClass = isMovingRight ? 'anim-slide-out-left' : 'anim-slide-out-right';
        const inClass = isMovingRight ? 'anim-slide-in-right' : 'anim-slide-in-left';

        // 1. ボタンのスタイル切り替え
        tabOrder.forEach(function(key) {{
          const btn = document.getElementById('tab-btn-' + key);
          if (!btn) return;

          if (key === tabKey) {{
            btn.setAttribute('aria-selected', 'true');
            btn.className = 'tab-btn w-full p-4 sm:p-5 rounded-2xl transition-all duration-200 flex items-center justify-between gap-3 bg-primary text-on-primary shadow-lg ring-2 ring-primary/20 font-bold cursor-pointer border border-primary text-left hover:-translate-y-0.5 focus:outline-none';
            
            const title = btn.querySelector('.tab-title');
            const desc = btn.querySelector('.tab-desc');
            const badge = btn.querySelector('.tab-badge');

            if (title) title.className = 'tab-title text-base sm:text-lg font-bold text-white tracking-tight';
            if (desc) desc.className = 'tab-desc text-xs sm:text-sm text-primary-fixed font-normal truncate';
            if (badge) badge.className = 'tab-badge px-3 py-1 rounded-full text-xs font-bold text-white shrink-0 shadow-xs bg-[#fe8357]';
          }} else {{
            btn.setAttribute('aria-selected', 'false');
            btn.className = 'tab-btn w-full p-4 sm:p-5 rounded-2xl transition-all duration-200 flex items-center justify-between gap-3 bg-white text-slate-800 hover:bg-slate-100/70 font-bold cursor-pointer border border-slate-200/80 shadow-xs text-left hover:-translate-y-0.5 focus:outline-none';

            const title = btn.querySelector('.tab-title');
            const desc = btn.querySelector('.tab-desc');
            const badge = btn.querySelector('.tab-badge');

            if (title) title.className = 'tab-title text-base sm:text-lg font-bold text-on-surface tracking-tight';
            if (desc) desc.className = 'tab-desc text-xs sm:text-sm text-on-surface-variant font-normal truncate';
            if (badge) {{
              const cfg = badgeConfig[key] || {{ inactiveText: 'text-on-surface-variant', inactiveBg: 'bg-surface-container-highest' }};
              badge.className = 'tab-badge px-3 py-1 rounded-full text-xs font-bold shrink-0 border border-outline-variant/30 ' + cfg.inactiveBg + ' ' + cfg.inactiveText;
            }}
          }}
        }});

        // 2. ダイナミックな 100% スライド（退場と登場の同時実行）
        nextPanel.classList.remove('hidden', 'anim-slide-in-right', 'anim-slide-in-left', 'anim-slide-out-left', 'anim-slide-out-right');
        void nextPanel.offsetWidth;
        nextPanel.classList.add('block', inClass);

        if (currentPanel && currentPanel !== nextPanel) {{
          currentPanel.classList.remove('anim-slide-in-right', 'anim-slide-in-left', 'anim-slide-out-left', 'anim-slide-out-right');
          void currentPanel.offsetWidth;
          currentPanel.classList.add(outClass);
        }}

        currentTabKey = tabKey;

        // 3. アニメーション完了時のクリーンアップ
        setTimeout(function() {{
          if (currentPanel && currentPanel !== nextPanel) {{
            currentPanel.classList.remove('block', outClass);
            currentPanel.classList.add('hidden');
          }}
          nextPanel.classList.remove(inClass);
          isAnimating = false;
        }}, 390);
      }};
    }})();
  </script>
  <script src="js/common.js"></script>
  <script src="js/microcms.js"></script>
</body>
</html>"""
    content = optimize_images_in_html(content)
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print("✓ index.html 生成完了")


# ----------------------------------------------------
# B. BUILD SITEMAP & ROBOTS
# ----------------------------------------------------
def build_sitemap():
    BASE_URL = "https://okamoshi.pages.dev"
    today = datetime.date.today().isoformat()
    pages = [
        {"loc": f"{BASE_URL}/", "priority": "1.0", "changefreq": "weekly"},
        {"loc": f"{BASE_URL}/index.html", "priority": "1.0", "changefreq": "weekly"},
        {"loc": f"{BASE_URL}/apply", "priority": "0.9", "changefreq": "monthly"},
        {"loc": f"{BASE_URL}/schools", "priority": "0.8", "changefreq": "monthly"},
        {"loc": f"{BASE_URL}/blog", "priority": "0.8", "changefreq": "daily"},
        {"loc": f"{BASE_URL}/privacy", "priority": "0.3", "changefreq": "yearly"},
        {"loc": f"{BASE_URL}/tokushoho", "priority": "0.3", "changefreq": "yearly"},
    ]

    xml_items = []
    for p in pages:
        xml_items.append(f"""  <url>
    <loc>{p['loc']}</loc>
    <lastmod>{today}</lastmod>
    <changefreq>{p['changefreq']}</changefreq>
    <priority>{p['priority']}</priority>
  </url>""")

    sitemap_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{chr(10).join(xml_items)}
</urlset>"""

    with open("sitemap.xml", "w", encoding="utf-8") as f:
        f.write(sitemap_xml)
    print("✓ sitemap.xml 生成完了")

# ----------------------------------------------------
# SYNC DIRECTORY INDEX.HTML (無限リダイレクト防止対策)
# ----------------------------------------------------
def sync_clean_url_directories():
    import shutil
    pages_to_sync = {
        'apply': 'apply.html',
        'schools': 'schools.html',
        'blog': 'blog.html',
        'privacy': 'privacy.html',
        'tokushoho': 'tokushoho.html'
    }
    for d, src in pages_to_sync.items():
        if os.path.exists(src):
            os.makedirs(d, exist_ok=True)
            shutil.copy(src, os.path.join(d, 'index.html'))
    print("✓ ディレクトリ別 index.html 生成完了 (/apply, /schools 等で200即答対応)")


# ----------------------------------------------------
# C. AUDIT & VALIDATION
# ----------------------------------------------------
def audit_all_pages():
    print("\n--- 全ページ品質・SEO自動検証 ---")
    pages = ['index.html', 'schools.html', 'tokushoho.html', 'privacy.html', 'blog.html', 'blog-detail.html', 'apply.html']
    all_passed = True

    for p in pages:
        if not os.path.exists(p):
            print(f"❌ {p}: ファイルが存在しません！")
            all_passed = False
            continue

        with open(p, 'r', encoding='utf-8') as f:
            c = f.read()

        # 1. H1 count
        h1s = re.findall(r'<h1[^>]*>(.*?)</h1>', c, re.DOTALL)
        h1_ok = len(h1s) == 1

        # 2. Meta description
        meta_desc = re.search(r'<meta[^>]*name=[\"\']description[\"\'][^>]*>', c)
        desc_ok = bool(meta_desc)

        # 3. Canonical
        canonical = re.search(r'<link[^>]*rel=[\"\']canonical[\"\'][^>]*>', c)
        canon_ok = bool(canonical)

        # 4. JSON-LD
        jsonld = re.search(r'<script[^>]*type=[\"\']application/ld\+json[\"\'][^>]*>', c)
        jsonld_ok = bool(jsonld)

        # 5. OGP
        ogp = re.search(r'<meta[^>]*property=[\"\']og:title[\"\'][^>]*>', c)
        ogp_ok = bool(ogp)

        # 6. Images without alt or lazy
        imgs = re.findall(r'<img[^>]*>', c)
        imgs_missing_alt = [img for img in imgs if 'alt=' not in img]
        # Images without lazy (excluding first img)
        imgs_missing_lazy = [img for i, img in enumerate(imgs) if i > 0 and 'loading=' not in img]

        status = "✓ 合格" if (h1_ok and desc_ok and canon_ok and jsonld_ok and ogp_ok and len(imgs_missing_alt) == 0 and len(imgs_missing_lazy) == 0) else "⚠ 要確認"
        print(f"[{status}] {p:16} | H1数: {len(h1s)} | meta: {desc_ok} | canon: {canon_ok} | JSON-LD: {jsonld_ok} | OGP: {ogp_ok} | 画像数: {len(imgs)} (alt欠損: {len(imgs_missing_alt)}, lazy未付与: {len(imgs_missing_lazy)})")

    return all_passed

# Run full build
def update_other_pages_styling():
    pages = ['schools.html', 'tokushoho.html', 'privacy.html', 'blog.html', 'blog-detail.html', 'apply.html']
    for p in pages:
        if not os.path.exists(p):
            continue
        with open(p, 'r', encoding='utf-8') as f:
            c = f.read()
        
        c = c.replace('"background": "#fcf9f8"', '"background": "#f8fafc"')
        c = c.replace('"surface": "#fcf9f8"', '"surface": "#f8fafc"')
        c = re.sub(r'<body class=["\']bg-background', '<body class="bg-slate-50', c)
        
        if 'background-color: #f8fafc' not in c:
            c = c.replace('</head>', '  <style>body { background-color: #f8fafc !important; }</style>\n</head>')

        with open(p, 'w', encoding='utf-8') as f:
            f.write(c)
    print("✓ 全下層ページの背景色を bg-slate-50 (#f8fafc) に統一完了")

build_index()
update_other_pages_styling()
build_sitemap()
sync_clean_url_directories()
audit_all_pages()

print("\n==================================================")
print(" 全ファイル ビルド・最適化 完了")
print("==================================================")
