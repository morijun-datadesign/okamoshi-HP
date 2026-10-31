#!/usr/bin/env python3
"""
detail.html を元に、下書きプレビュー用ページ news/preview/index.html を生成するスクリプト。
"""

import os
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DETAIL_FILE = os.path.join(BASE_DIR, "detail.html")
PREVIEW_DIR = os.path.join(BASE_DIR, "news", "preview")
PREVIEW_FILE = os.path.join(PREVIEW_DIR, "index.html")

def main():
    os.makedirs(PREVIEW_DIR, exist_ok=True)

    with open(DETAIL_FILE, "r", encoding="utf-8") as f:
        html = f.read()

    # 1. 既存のリダイレクトスクリプトを除去
    html = re.sub(r"<script>\s*\(function\(\)\s*\{\s*var params = new URLSearchParams.*?</script>\s*", "", html, flags=re.DOTALL)

    # 2. noindex メタタグを追加し、タイトルを変更
    meta_replacement = """  <meta name="robots" content="noindex, nofollow">
  <title id="page-title">【プレビュー】記事詳細 | 岡山県統一模擬試験（おかもし）</title>"""
    html = re.sub(r"<title id=\"page-title\">.*?</title>", meta_replacement, html, count=1)

    # 3. リンクやアセットのルート相対パス化
    html = re.sub(r'href="css/', 'href="/css/', html)
    html = re.sub(r'src="js/', 'src="/js/', html)
    html = re.sub(r'src="images/', 'src="/images/', html)
    html = re.sub(r'href="images/', 'href="/images/', html)
    html = re.sub(r'href="news\.html"', 'href="/news.html"', html)
    html = re.sub(r'href="index\.html', 'href="/index.html', html)
    html = re.sub(r'href="apply\.html"', 'href="/apply"', html)
    html = re.sub(r'href="schools\.html"', 'href="/schools.html"', html)
    html = re.sub(r'href="schools_PC\.html"', 'href="/schools.html"', html)
    html = re.sub(r'href="privacy\.html"', 'href="/privacy.html"', html)
    html = re.sub(r'href="tokushoho\.html"', 'href="/tokushoho.html"', html)
    html = re.sub(r'href="contact/', 'href="/contact/', html)
    html = re.sub(r'href="\.\./contact/', 'href="/contact/', html)
    html = re.sub(r'href="detail\.html', 'href="/detail.html', html)

    # 4. プレビュー用トップ固定バーの挿入 (<body> 直後)
    preview_bar_html = """
  <!-- プレビューモード専用トップ固定バー -->
  <div id="preview-mode-bar" class="sticky top-0 z-[100] bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-xs sm:text-sm py-2 px-4 shadow-md flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="material-symbols-outlined text-base">visibility</span>
      <span>microCMS 画面プレビュー（確認用）</span>
      <span id="preview-status-pill" class="px-2 py-0.5 rounded text-[10px] bg-slate-900 text-amber-300 font-mono tracking-wider">LOADING...</span>
    </div>
    <div class="text-xs font-semibold text-slate-900/90 hidden sm:flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[15px]">lock</span>
      <span>検索エンジン非公開（noindex）</span>
    </div>
  </div>
"""
    html = re.sub(r"(<body[^>]*>)", r"\1\n" + preview_bar_html, html, count=1)

    # 5. ヘルパー関数群（トップレベルスコープに確実に定義）
    helpers_and_render_logic = """
    // ----------------------------------------------------
    // プレビュー共通ヘルパー関数群（スコープエラー防止）
    // ----------------------------------------------------

    // カテゴリに応じたバッジスタイル決定
    function getCategoryBadgeClass(categoryText) {
      if (!categoryText) return 'bg-[#134230] text-white';
      if (categoryText.includes('お知らせ') || categoryText.includes('更新')) {
        return 'bg-[#134230] text-white';
      } else if (categoryText.includes('入試') || categoryText.includes('一貫') || categoryText.includes('高校')) {
        return 'bg-[#0f5b47] text-white';
      } else if (categoryText.includes('活用') || categoryText.includes('コラム') || categoryText.includes('勉強')) {
        return 'bg-[#1e3a2f] text-white';
      }
      return 'bg-[#134230] text-white';
    }

    // 日付フォーマット (YYYY.MM.DD)
    function formatArticleDate(dateStr) {
      if (!dateStr) return '';
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr).substring(0, 10).replace(/-/g, '.');
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}.${m}.${day}`;
      } catch (e) {
        return String(dateStr).substring(0, 10).replace(/-/g, '.');
      }
    }

    // HTMLエスケープ
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // 画像プリロード待機
    function preloadImage(src) {
      return new Promise((resolve) => {
        if (!src) { resolve(false); return; }
        const img = new Image();
        let settled = false;
        const done = (ok) => {
          if (!settled) {
            settled = true;
            resolve(ok);
          }
        };
        img.onload = () => done(true);
        img.onerror = () => done(false);
        img.src = src;
        setTimeout(() => done(false), 1200);
      });
    }

    // 記事コンテンツのフェードイン表示制御（スケルトンUIからのスムーズな切り替え）
    function showArticleContent() {
      const skeletonEl = document.getElementById('article-skeleton');
      const contentWrapper = document.getElementById('article-content-wrapper');
      if (skeletonEl) skeletonEl.style.display = 'none';
      if (contentWrapper) {
        contentWrapper.classList.remove('hidden');
        void contentWrapper.offsetWidth; // リフロー強制
        contentWrapper.classList.add('animate-fade-in');
        contentWrapper.classList.remove('opacity-0');
      }
    }

    // 5. 記事詳細データのレンダリング
    async function renderPostDetail(post) {
      if (!post) throw new Error('記事データが空です');
      
      // カテゴリ名の安全な取得
      let catName = 'お知らせ';
      if (post.category) {
        if (typeof post.category === 'object' && post.category.name) {
          catName = post.category.name;
        } else if (typeof post.category === 'string') {
          catName = post.category;
        }
      }

      // カテゴリバッジ
      const catBadge = document.getElementById('article-category-badge');
      if (catBadge) {
        catBadge.className = 'px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 shrink-0 ' + getCategoryBadgeClass(catName);
        catBadge.innerHTML = `<span class="material-symbols-outlined text-[13px]">school</span><span>${escapeHtml(catName)}</span>`;
      }

      // タイトル
      const titleEl = document.getElementById('article-title');
      if (titleEl) {
        titleEl.textContent = post.title || '（タイトル未設定）';
      }

      // 公開日・更新日
      const pubEl = document.getElementById('article-published-date');
      const rawDate = post.publishedAt || post.createdAt || post.date || new Date().toISOString();
      if (pubEl) {
        pubEl.textContent = formatArticleDate(rawDate);
      }

      // アイキャッチ画像のチラつき防止＆ロード待機
      const heroContainer = document.getElementById('article-hero-container');
      const heroImg = document.getElementById('article-hero-img');
      const heroTag = document.getElementById('article-hero-tag');

      if (heroContainer && heroImg) {
        const eyecatchUrl = post.eyecatch && (typeof post.eyecatch === 'object' ? post.eyecatch.url : post.eyecatch);
        if (eyecatchUrl) {
          try {
            await preloadImage(eyecatchUrl);
            heroImg.src = eyecatchUrl;
            heroImg.alt = post.title || 'ブログアイキャッチ';
            heroContainer.classList.remove('hidden');
            heroImg.classList.remove('opacity-0');
            if (heroTag) heroTag.textContent = catName;
          } catch (imgErr) {
            console.warn('[Preview] Eyecatch load error:', imgErr);
            heroContainer.classList.add('hidden');
          }
        } else {
          heroContainer.classList.add('hidden');
          heroImg.src = '';
        }
      }

      // 本文HTMLの反映
      const contentBody = document.getElementById('entry-content-body');
      if (contentBody) {
        if (post.content) {
          contentBody.innerHTML = post.content;
          contentBody.querySelectorAll('p').forEach(p => {
            if (!p.textContent.trim() && (!p.children.length || (p.children.length === 1 && p.children[0].tagName === 'BR'))) {
              p.remove();
            }
          });
          if (typeof normalizeCalloutBoxes === 'function') {
            normalizeCalloutBoxes(contentBody);
          }
        } else {
          contentBody.innerHTML = `
            <div class="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
              <span class="material-symbols-outlined text-4xl text-slate-400">edit_note</span>
              <p class="font-bold text-base mt-2">本文がまだ入力されていません</p>
              <p class="text-sm mt-1">microCMSのエディタで本文を入力して画面プレビューを更新してください。</p>
            </div>
          `;
        }
      }

      // 目次の再生成
      if (typeof generateTableOfContents === 'function') {
        generateTableOfContents();
      }

      // ページタイトル更新
      document.title = `【プレビュー】${post.title || '記事詳細'} | 岡山県統一模擬試験（おかもし）`;

      // スケルトンを消してフェードイン表示
      showArticleContent();
    }
"""

    render_pattern = re.compile(r"// 4\. アイキャッチ画像の.*?showArticleContent\(\);\s*\}", re.DOTALL)
    if render_pattern.search(html):
        html = render_pattern.sub(helpers_and_render_logic.strip(), html)
        print("Replaced preloadImage, showArticleContent, and renderPostDetail with comprehensive helpers.")
    else:
        # 代替パターン
        alt_pattern = re.compile(r"// 5\.\s*記事本文・メタの画面反映.*?showArticleContent\(\);\s*\}", re.DOTALL)
        if alt_pattern.search(html):
            html = alt_pattern.sub(helpers_and_render_logic.strip(), html)
            print("Replaced renderPostDetail with comprehensive helpers.")
        else:
            print("Warning: render_pattern not matched.")

    # 6. loadArticleDetail 関数の置き換え（Functions API ＋ microCMS 直接フォールバックの二重構成 ＆ 確実な起動）
    preview_load_func = """
    async function loadArticleDetail() {
      const params = new URLSearchParams(window.location.search);
      const articleId = params.get('id') ? params.get('id').trim() : '';
      const draftKey = params.get('draftKey') ? params.get('draftKey').trim() : '';
      const statusPill = document.getElementById('preview-status-pill');


      if (!articleId) {
        if (statusPill) {
          statusPill.textContent = 'NO ID';
          statusPill.className = 'px-2 py-0.5 rounded text-[10px] bg-rose-600 text-white font-mono tracking-wider';
        }
        showPreviewError('URLパラメータに記事ID（<code>id</code>）が指定されていません。<br>例: <code>/news/preview/?id={CONTENT_ID}&draftKey={DRAFT_KEY}</code>');
        return;
      }

      let post = null;
      let lastErrorMessage = '';

      // 1. まず Cloudflare Pages Functions (/api/news-preview) を試行
      try {
        let apiUrl = `/api/news-preview?id=${encodeURIComponent(articleId)}`;
        if (draftKey.length > 0) {
          apiUrl += `&draftKey=${encodeURIComponent(draftKey)}`;
        }
        const res = await fetch(apiUrl);
        if (res.ok) {
          post = await res.json();
        } else {
          const errData = await res.json().catch(() => ({}));
          lastErrorMessage = errData.message || `API HTTP ${res.status}`;
          console.warn('[Preview] Functions API returned error:', lastErrorMessage);
        }
      } catch (funcErr) {
        console.warn('[Preview] Functions API fetch failed:', funcErr);
        lastErrorMessage = funcErr.message || String(funcErr);
      }

      // ※ブラウザから microCMS へ直接アクセスする旧フォールバックは、APIキーが公開されるため廃止（Functions 経由のみ）

      // 2. 取得結果の描画
      if (post) {
        try {
          if (statusPill) {
            statusPill.textContent = draftKey.length > 0 ? 'DRAFT' : 'PUBLISHED';
            statusPill.className = draftKey.length > 0
              ? 'px-2 py-0.5 rounded text-[10px] bg-slate-900 text-amber-300 font-mono tracking-wider'
              : 'px-2 py-0.5 rounded text-[10px] bg-emerald-700 text-white font-mono tracking-wider';
          }

          await renderPostDetail(post);

          // 記事バッジ欄にプレビュー中タグを追加
          const badgesContainer = document.getElementById('article-badges-container');
          if (badgesContainer && !document.getElementById('article-draft-badge')) {
            const previewBadge = document.createElement('span');
            previewBadge.id = 'article-draft-badge';
            previewBadge.className = 'px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold flex items-center gap-1 border border-amber-300 shadow-2xs';
            previewBadge.innerHTML = `<span class="material-symbols-outlined text-[13px]">visibility</span>${draftKey.length > 0 ? '下書きプレビュー' : '公開中プレビュー'}`;
            badgesContainer.appendChild(previewBadge);
          }

          if (typeof loadRelatedArticles === 'function') {
            loadRelatedArticles(post, articleId);
          }
        } catch (renderErr) {
          console.error('[Preview] Render error:', renderErr);
          if (statusPill) {
            statusPill.textContent = 'RENDER ERROR';
            statusPill.className = 'px-2 py-0.5 rounded text-[10px] bg-rose-600 text-white font-mono tracking-wider';
          }
          showPreviewError(`記事の描画中にエラーが発生しました。<br><span class="text-xs font-mono text-rose-700 mt-1 block bg-rose-100/60 p-2 rounded">${renderErr.message}</span>`);
        }
      } else {
        if (statusPill) {
          statusPill.textContent = 'NOT FOUND';
          statusPill.className = 'px-2 py-0.5 rounded text-[10px] bg-rose-600 text-white font-mono tracking-wider';
        }
        showPreviewError(`プレビューデータの取得に失敗しました。<br><span class="text-xs font-mono text-rose-700 mt-1 block bg-rose-100/60 p-2 rounded">${lastErrorMessage}</span>`);
      }
    }

    function showPreviewError(errorMessage) {
      const skeletonEl = document.getElementById('article-skeleton');
      if (skeletonEl) skeletonEl.style.display = 'none';
      const contentWrapper = document.getElementById('article-content-wrapper');
      if (contentWrapper) {
        contentWrapper.classList.remove('hidden', 'opacity-0');
      }
      const heroContainer = document.getElementById('article-hero-container');
      if (heroContainer) heroContainer.classList.add('hidden');
      const titleEl = document.getElementById('article-title');
      if (titleEl) titleEl.textContent = 'プレビューを表示できませんでした';
      const contentBody = document.getElementById('entry-content-body');
      if (contentBody) {
        contentBody.innerHTML = `
          <div class="p-8 text-center text-slate-800 flex flex-col items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 shadow-sm max-w-xl mx-auto my-8">
            <span class="material-symbols-outlined text-5xl text-amber-600">error</span>
            <p class="font-bold text-lg text-slate-900">プレビューデータの取得に失敗しました</p>
            <div class="text-sm text-slate-700 leading-relaxed text-left bg-white/80 p-4 rounded-xl border border-amber-200/60 w-full">
              ${errorMessage}
            </div>
            <p class="text-xs text-slate-500 mt-1">microCMS管理画面で「画面プレビュー」ボタンを押すか、URLパラメータを確認してください。</p>
          </div>
        `;
      }
      showArticleContent();
    }

    // ページの読み込み完了時に確実に loadArticleDetail を起動
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', loadArticleDetail);
    } else {
      loadArticleDetail();
    }
"""

    load_pattern = re.compile(r"async function loadArticleDetail\(\)\s*\{.*?(?=// 関連記事の動的取得)", re.DOTALL)
    if load_pattern.search(html):
        html = load_pattern.sub(preview_load_func + "\n\n    ", html)
        print("Replaced loadArticleDetail and added automatic invocation.")
    else:
        alt_pattern = re.compile(r"async function loadArticleDetail\(\)\s*\{.*?function showPreviewError.*?showArticleContent\(\);\s*\}", re.DOTALL)
        if alt_pattern.search(html):
            html = alt_pattern.sub(preview_load_func, html)
            print("Replaced previous preview load function successfully.")
        else:
            print("Error: Could not locate loadArticleDetail function.")
            return

    with open(PREVIEW_FILE, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Generated {PREVIEW_FILE} successfully ({len(html)} bytes)")

if __name__ == "__main__":
    main()
