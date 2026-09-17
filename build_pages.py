import re
import os

# Read common snippets
with open('js/header.snippet.html', 'r', encoding='utf-8') as f:
    header_html = f.read()
with open('js/footer.snippet.html', 'r', encoding='utf-8') as f:
    footer_html = f.read()

# Helper for Tailwind config
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
            "background": "#fcf9f8",
            "surface-container": "#f0eded",
            "on-tertiary-container": "#f1bd5a",
            "surface-variant": "#e4e2e1",
            "on-primary-fixed-variant": "#224f3c",
            "on-tertiary-fixed-variant": "#5e4200",
            "tertiary": "#4f3600",
            "surface-bright": "#fcf9f8",
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
            "surface": "#fcf9f8",
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

# Helper to add loading="lazy" and alt to images
def optimize_images_in_html(html_text):
    imgs = list(re.finditer(r'<img[^>]*>', html_text))
    new_html = html_text
    for i, m in enumerate(reversed(imgs)):
        tag = m.group(0)
        idx = len(imgs) - 1 - i
        new_tag = tag
        if idx > 0 and 'loading=' not in tag:
            new_tag = new_tag[:-1] + ' loading="lazy">'
        if 'alt=' not in tag:
            new_tag = new_tag[:-1] + ' alt="模試・学習関連画像">'
        new_html = new_html[:m.start()] + new_tag + new_html[m.end():]
    return new_html


# ==========================================
# 1. BUILD BLOG.HTML
# ==========================================
def build_blog():
    with open('_1/code.html', 'r', encoding='utf-8') as f:
        c = f.read()

    main_m = re.search(r'<main[^>]*>(.*?)</main>', c, re.DOTALL)
    main_content = main_m.group(1).strip() if main_m else ''

    # Update article links to blog-detail.html
    main_content = re.sub(r'<a([^>]*)href=[\"\']#[\"\']([^>]*)>', r'<a\1href="blog-detail.html"\2>', main_content)
    main_content = optimize_images_in_html(main_content)
    main_content = re.sub(r'(<div[^>]*class=[\"\'][^\"\']*grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3[^\"\']*[\"\'])', r'\1 id="blog-posts-container"', main_content, count=1)

    html = f"""<!DOCTYPE html>
<html lang="ja" class="scroll-smooth">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>お知らせ・お役立ちブログ | 岡山県統一模擬試験（おかもし）</title>
  <meta name="description" content="岡山県統一模擬試験（おかもし）の最新情報、高校入試傾向分析、内申点対策、志望校選びのヒントをお届けする公式ブログ・お知らせ一覧です。">
  <link rel="canonical" href="https://okamoshi.pages.dev/blog.html">
  
  <!-- OGP -->
  <meta property="og:title" content="お知らせ・お役立ちブログ | 岡山県統一模擬試験（おかもし）">
  <meta property="og:description" content="岡山県の高校入試傾向分析、内申点対策、模試活用法などを発信する公式ブログです。">
  <meta property="og:type" content="blog">
  <meta property="og:url" content="https://okamoshi.pages.dev/blog.html">
  <meta property="og:image" content="https://okamoshi.pages.dev/og-image.jpg">
  <meta property="og:site_name" content="岡山県統一模擬試験（おかもし）">
  <meta name="twitter:card" content="summary_large_image">

  <!-- Fonts & Icons -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet">

  {tailwind_config_block}

  <!-- JSON-LD 構造化データ -->
  <script type="application/ld+json">
  {{
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": "お知らせ・お役立ちブログ | 岡山県統一模擬試験",
    "description": "岡山県統一模擬試験の最新情報、高校入試傾向分析、内申点対策ブログ",
    "url": "https://okamoshi.pages.dev/blog.html",
    "publisher": {{
      "@type": "Organization",
      "name": "岡山県統一模擬試験実行委員会",
      "url": "https://okamoshi.pages.dev/"
    }}
  }}
  </script>
</head>
<body class="bg-background font-body-md text-body-md text-on-surface antialiased min-h-screen flex flex-col justify-between selection:bg-primary/20 selection:text-primary pt-16 sm:pt-20">

  {header_html}

  <main class="flex-1 w-full flex flex-col items-center">
    {main_content}
  </main>

  {footer_html}

  <script src="js/common.js"></script>
  <script src="js/microcms.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', async function() {{
      if (typeof MicroCMS === 'undefined') return;
      const data = await MicroCMS.getBlogList(9);
      if (data && data.contents && data.contents.length > 0) {{
        const container = document.getElementById('blog-posts-container');
        if (!container) return;
        
        container.innerHTML = data.contents.map(post => {{
          const thumb = post.eyecatch ? MicroCMS.optimizeImage(post.eyecatch.url, {{ width: 600, height: 400 }}) : 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=600&q=80';
          const pubDate = new Date(post.publishedAt || post.createdAt).toLocaleDateString('ja-JP', {{ year: 'numeric', month: '2-digit', day: '2-digit' }}).replace(/\\//g, '.');
          const cat = post.category ? post.category.name : 'お知らせ';
          return `
            <article class="group flex flex-col bg-surface-container-lowest rounded-2xl overflow-hidden border border-outline-variant/30 hover:border-primary/40 shadow-sm hover:shadow-md transition-all duration-300">
              <a href="blog-detail.html?id=${{post.id}}" class="block relative aspect-[16/10] overflow-hidden bg-surface-container">
                <img src="${{thumb}}" alt="${{post.title}}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                <span class="absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-xs font-bold bg-surface/90 text-primary backdrop-blur-sm shadow-xs">${{cat}}</span>
              </a>
              <div class="p-5 sm:p-6 flex flex-col flex-1 justify-between">
                <div class="space-y-2.5">
                  <div class="text-xs text-on-surface-variant flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-sm">calendar_today</span>
                    <time datetime="${{post.publishedAt || post.createdAt}}">${{pubDate}}</time>
                  </div>
                  <h3 class="font-headline-sm text-base sm:text-lg font-bold text-on-surface group-hover:text-primary transition-colors leading-snug line-clamp-2">
                    <a href="blog-detail.html?id=${{post.id}}">${{post.title}}</a>
                  </h3>
                  <p class="text-xs sm:text-sm text-on-surface-variant line-clamp-2 leading-relaxed">
                    ${{post.description || ''}}
                  </p>
                </div>
                <div class="pt-4 mt-4 border-t border-surface-container/60 flex items-center justify-between text-xs font-bold text-primary">
                  <span>記事を読む</span>
                  <span class="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </div>
              </div>
            </article>
          `;
        }}).join('');
      }}
    }});
  </script>
</body>
</html>"""

    with open('blog.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print('blog.html written')


# ==========================================
# 2. BUILD BLOG-DETAIL.HTML
# ==========================================
def build_blog_detail():
    with open('_3/code.html', 'r', encoding='utf-8') as f:
        c = f.read()

    main_m = re.search(r'<main[^>]*>(.*?)</main>', c, re.DOTALL)
    main_content = main_m.group(1).strip() if main_m else ''

    # Breadcrumb back link
    main_content = main_content.replace('href="#"', 'href="blog.html"')
    main_content = main_content.replace('data-path="portal"', 'data-path="portal" href="index.html"')
    main_content = main_content.replace('data-path="blog"', 'data-path="blog" href="blog.html"')
    main_content = optimize_images_in_html(main_content)

    html = f"""<!DOCTYPE html>
<html lang="ja" class="scroll-smooth">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title id="page-title">【岡山県の高校受験】合格への近道はここにある！先輩受験生が語る「おかもし」活用法 | 岡山県統一模擬試験</title>
  <meta id="page-desc" name="description" content="岡山県公立高校入試の出題傾向とおかもしの合致点、内申点を加味した合否判定、先輩受験生たちの体験談を詳しく解説します。">
  <link rel="canonical" href="https://okamoshi.pages.dev/blog-detail.html">
  
  <!-- OGP -->
  <meta id="og-title" property="og:title" content="【岡山県の高校受験】合格への近道はここにある！先輩受験生が語る「おかもし」活用法">
  <meta id="og-desc" property="og:description" content="岡山県公立高校入試の出題傾向とおかもしの合致点、内申点を加味した合否判定、先輩受験生たちの体験談を解説。">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://okamoshi.pages.dev/blog-detail.html">
  <meta id="og-image" property="og:image" content="https://okamoshi.pages.dev/og-image.jpg">
  <meta property="og:site_name" content="岡山県統一模擬試験（おかもし）">
  <meta name="twitter:card" content="summary_large_image">

  <!-- Fonts & Icons -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet">

  {tailwind_config_block}

  <!-- JSON-LD 構造化データ (BlogPosting) -->
  <script id="jsonld-article" type="application/ld+json">
  {{
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": "【岡山県の高校受験】合格への近道はここにある！先輩受験生が語る「おかもし」活用法",
    "description": "岡山県公立高校入試の出題傾向とおかもしの合致点、内申点を加味した合否判定、先輩受験生たちの体験談を解説。",
    "image": "https://okamoshi.pages.dev/og-image.jpg",
    "datePublished": "2026-08-10T10:00:00+09:00",
    "dateModified": "2026-08-10T10:00:00+09:00",
    "author": {{
      "@type": "Organization",
      "name": "岡山県統一模擬試験 教務進路指導部"
    }},
    "publisher": {{
      "@type": "Organization",
      "name": "岡山県統一模擬試験実行委員会",
      "url": "https://okamoshi.pages.dev/"
    }}
  }}
  </script>
</head>
<body class="bg-background font-body-md text-body-md text-on-surface antialiased min-h-screen flex flex-col justify-between selection:bg-primary/20 selection:text-primary pt-16 sm:pt-20">

  {header_html}

  <main class="flex-1 w-full flex flex-col items-center">
    {main_content}
  </main>

  {footer_html}

  <script src="js/common.js"></script>
  <script src="js/microcms.js"></script>
  <script>
    // microCMS から記事詳細を動的取得する (IDパラメータがある場合)
    document.addEventListener('DOMContentLoaded', async function() {{
      const params = new URLSearchParams(window.location.search);
      const articleId = params.get('id');
      if (!articleId || typeof MicroCMS === 'undefined') return;

      const post = await MicroCMS.getBlogDetail(articleId);
      if (post) {{
        // タイトルやメタ情報の更新
        document.title = post.title + ' | 岡山県統一模擬試験';
        const pageTitle = document.getElementById('page-title');
        if (pageTitle) pageTitle.textContent = post.title + ' | 岡山県統一模擬試験';
        
        const h1 = document.querySelector('main h1');
        if (h1) h1.textContent = post.title;

        if (post.description) {{
          const metaDesc = document.querySelector('meta[name="description"]');
          if (metaDesc) metaDesc.setAttribute('content', post.description);
        }}

        // アイキャッチ画像の最適化・更新
        if (post.eyecatch) {{
          const heroImg = document.querySelector('main article img');
          if (heroImg) {{
            heroImg.src = MicroCMS.optimizeImage(post.eyecatch.url, {{ width: 1200, height: 630 }});
            heroImg.alt = post.title;
          }}
        }}

        // 本文更新
        if (post.content) {{
          const contentArea = document.querySelector('main .prose') || document.querySelector('main article .space-y-6');
          if (contentArea) contentArea.innerHTML = post.content;
        }}

        // JSON-LD 更新
        const jsonLd = document.getElementById('jsonld-article');
        if (jsonLd) {{
          const articleData = {{
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": post.title,
            "description": post.description || post.title,
            "image": post.eyecatch ? MicroCMS.optimizeImage(post.eyecatch.url) : "https://okamoshi.pages.dev/og-image.jpg",
            "datePublished": post.publishedAt || post.createdAt,
            "dateModified": post.updatedAt || post.publishedAt || post.createdAt,
            "author": {{
              "@type": "Organization",
              "name": post.author || "岡山県統一模擬試験 教務進路指導部"
            }},
            "publisher": {{
              "@type": "Organization",
              "name": "岡山県統一模擬試験実行委員会",
              "url": "https://okamoshi.pages.dev/"
            }}
          }};
          jsonLd.textContent = JSON.stringify(articleData);
        }}
      }}
    }});
  </script>
</body>
</html>"""

    with open('blog-detail.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print('blog-detail.html written')


# Run builders
build_blog()
build_blog_detail()
