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
    html = re.sub(r'href="apply\.html"', 'href="/apply.html"', html)
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
  <div id="preview-mode-bar" class="sticky top-0 z-[100] bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-xs sm:text-sm py-2.5 px-4 shadow-md flex items-center justify-between">
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

    # 5. loadArticleDetail 関数をプレビューAPI連携版に置き換え
    preview_load_func = """async function loadArticleDetail() {
      const params = new URLSearchParams(window.location.search);
      const articleId = params.get('id');
      const draftKey = params.get('draftKey') || '';
      const statusPill = document.getElementById('preview-status-pill');

      if (!articleId) {
        if (statusPill) {
          statusPill.textContent = 'NO ID';
          statusPill.className = 'px-2 py-0.5 rounded text-[10px] bg-rose-600 text-white font-mono tracking-wider';
        }
        showPreviewError('URLパラメータに記事ID（<code>id</code>）が指定されていません。<br>例: <code>/news/preview/?id={CONTENT_ID}&draftKey={DRAFT_KEY}</code>');
        return;
      }

      try {
        let apiUrl = `/api/news-preview?id=${encodeURIComponent(articleId)}`;
        if (draftKey) {
          apiUrl += `&draftKey=${encodeURIComponent(draftKey)}`;
        }

        const res = await fetch(apiUrl);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `HTTP ${res.status}`);
        }

        const post = await res.json();

        // プレビュー表示用ステータス更新
        if (statusPill) {
          statusPill.textContent = draftKey ? 'DRAFT' : 'PUBLISHED';
          statusPill.className = draftKey 
            ? 'px-2 py-0.5 rounded text-[10px] bg-slate-900 text-amber-300 font-mono tracking-wider'
            : 'px-2 py-0.5 rounded text-[10px] bg-emerald-700 text-white font-mono tracking-wider';
        }

        // 記事詳細を描画
        await renderPostDetail(post);

        // 記事ヘッダーのバッジ欄にプレビュー中タグを追加
        const badgesContainer = document.getElementById('article-badges-container');
        if (badgesContainer && !document.getElementById('article-draft-badge')) {
          const previewBadge = document.createElement('span');
          previewBadge.id = 'article-draft-badge';
          previewBadge.className = 'px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold flex items-center gap-1 border border-amber-300 shadow-2xs';
          previewBadge.innerHTML = `<span class="material-symbols-outlined text-[13px]">visibility</span>${draftKey ? '下書きプレビュー' : '公開中プレビュー'}`;
          badgesContainer.appendChild(previewBadge);
        }

        // 関連記事の読み込み
        loadRelatedArticles(post, articleId);
      } catch (err) {
        console.error('[Preview] Failed to load preview article:', err);
        if (statusPill) {
          statusPill.textContent = 'ERROR';
          statusPill.className = 'px-2 py-0.5 rounded text-[10px] bg-rose-600 text-white font-mono tracking-wider';
        }
        showPreviewError(`プレビューデータの取得に失敗しました。<br><span class="text-xs font-mono text-rose-700 font-normal mt-1 block bg-rose-100/60 p-2 rounded">${err.message}</span>`);
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
    }"""

    # loadArticleDetail の置換
    load_pattern = re.compile(r"async function loadArticleDetail\(\)\s*\{.*?(?=// 関連記事の動的取得)", re.DOTALL)
    if load_pattern.search(html):
        html = load_pattern.sub(preview_load_func + "\n\n    ", html)
        print("Replaced loadArticleDetail successfully.")
    else:
        print("Error: Could not locate loadArticleDetail function.")
        return

    with open(PREVIEW_FILE, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Generated {PREVIEW_FILE} successfully ({len(html)} bytes)")

if __name__ == "__main__":
    main()
