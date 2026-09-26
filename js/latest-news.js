/**
 * 最新のお知らせ（3件）動的取得 & 描画スクリプト
 * 2枚目テキストリストスタイル & 学年別 microCMS フィルタリング
 */
(function() {
  const DEFAULT_CONFIG = {
    serviceDomain: 'okamoshi-blog',
    apiKey: '4qO3xGjs5W1r7zolbBgAX2KXP8VEUooOpMtc',
    endpoint: 'blogs'
  };

  const FALLBACK_NEWS = [
    {
      id: "s9o093uhf",
      title: "小6生対象 岡山県適性検査対策模試 10月号",
      publishedAt: "2026-09-26T09:00:00.000Z",
      category: { name: "模試活用法", key: "article" },
      targetGrade: ["小6生"]
    },
    {
      id: "b055d-p_k7",
      title: "【岡山県の高校受験】合格への近道はここにある！「おかもし」が受験生から支持される理由",
      publishedAt: "2026-09-23T10:00:00.000Z",
      category: { name: "模試活用法", key: "article" },
      targetGrade: ["中学生"]
    },
    {
      id: "20p7a-hecrv",
      title: "おかもし　決済用リンク",
      publishedAt: "2026-09-23T05:00:00.000Z",
      category: { name: "模試活用法", key: "article" },
      targetGrade: ["全学年"]
    },
    {
      id: "0qf1y_rb2",
      title: "（サンプル）まずはこの記事を開きましょう",
      publishedAt: "2026-09-23T04:56:59.888Z",
      category: { name: "更新情報", key: "important" },
      targetGrade: ["全学年"]
    }
  ];

  function formatNewsDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  }

  function isNewNewsArticle(publishedAt) {
    if (!publishedAt) return false;
    const pubTime = new Date(publishedAt).getTime();
    if (isNaN(pubTime)) return false;
    const now = Date.now();
    const diffDays = (now - pubTime) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 10;
  }

  function getNewsBadgeColor(catName) {
    if (!catName) return 'bg-surface-container-high text-on-surface';
    if (catName.includes('重要')) return 'bg-error-container text-on-error-container border border-error/20';
    if (catName.includes('入試') || catName.includes('受検')) return 'bg-[#e8f5ee] text-[#134230] border border-[#a1d1b8]';
    if (catName.includes('活用法') || catName.includes('コラム')) return 'bg-[#fef3c7] text-[#92400e] border border-[#fde68a]';
    if (catName.includes('要項') || catName.includes('日程') || catName.includes('模試')) return 'bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]';
    return 'bg-surface-container-high text-on-surface';
  }

  function renderNews(posts) {
    const container = document.getElementById('latest-news-list') || document.getElementById('latest-news-grid');
    if (!container) return;

    if (!posts || posts.length === 0) {
      container.innerHTML = `
        <div class="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 text-center text-on-surface-variant">
          現在お知らせはありません。
        </div>
      `;
      return;
    }

    container.innerHTML = posts.map(post => {
      const catName = (typeof post.category === 'object' && post.category !== null) ? (post.category.name || 'お知らせ') : (post.category || 'お知らせ');
      const badgeClass = getNewsBadgeColor(catName);
      const pubDateIso = post.publishedAt || post.createdAt;
      const dateStr = formatNewsDate(pubDateIso);
      const isNew = isNewNewsArticle(pubDateIso);
      const detailUrl = `detail.html?id=${encodeURIComponent(post.id)}`;

      const newBadgeHtml = isNew
        ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#c85a32] text-white shadow-sm shrink-0 tracking-tight leading-tight">NEW</span>`
        : '';

      return `
        <article class="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden group">
          <a href="${detailUrl}" class="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:px-5 sm:py-3.5 gap-2 sm:gap-4">
            <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-1 min-w-0">
              <!-- メタ領域: [NEW] [日付] [カテゴリバッジ] -->
              <div class="flex items-center gap-2 shrink-0">
                ${newBadgeHtml}
                <span class="flex items-center gap-1 text-xs text-on-surface-variant font-medium">
                  <span class="material-symbols-outlined text-[14px] text-outline">calendar_today</span>
                  <span>${dateStr}</span>
                </span>
                <span class="px-2.5 py-0.5 rounded text-[11px] font-bold ${badgeClass} shrink-0">
                  ${catName}
                </span>
              </div>

              <!-- 記事タイトル -->
              <h3 class="font-bold text-sm sm:text-[15px] text-on-surface group-hover:text-primary transition-colors truncate flex-1">
                ${post.title || '無題の記事'}
              </h3>
            </div>

            <!-- 右端アクション: 詳細を読む (PCで表示) -->
            <div class="flex items-center gap-1 text-xs font-bold text-secondary shrink-0 group-hover:translate-x-0.5 transition-transform self-end sm:self-center">
              <span>詳細を読む</span>
              <span class="material-symbols-outlined text-[16px]">chevron_right</span>
            </div>
          </a>
        </article>
      `;
    }).join('');
  }

  function getFallback(grade) {
    const isSho6 = (grade === 'sho6');
    return FALLBACK_NEWS.filter(post => {
      const grades = post.targetGrade || [];
      if (grades.includes('全学年')) return true;
      if (isSho6 && grades.includes('小6生')) return true;
      if (!isSho6 && (grades.includes('中学生') || grades.includes('中3生') || grades.includes('中2生') || grades.includes('中1生'))) return true;
      return false;
    }).slice(0, 3);
  }

  async function loadNews(grade) {
    const container = document.getElementById('latest-news-list') || document.getElementById('latest-news-grid');
    if (!container) return;

    if (!grade) {
      const section = document.getElementById('latest-news-section');
      if (section && section.getAttribute('data-default-grade')) {
        grade = section.getAttribute('data-default-grade');
      } else {
        const activeBtn = document.querySelector('.tab-btn[aria-selected="true"]');
        if (activeBtn) {
          grade = (activeBtn.id === 'tab-btn-sho6') ? 'sho6' : 'chu3';
        } else {
          const urlParams = new URLSearchParams(window.location.search);
          grade = urlParams.get('grade') || 'chu3';
        }
      }
    }

    const isSho6 = (grade === 'sho6');
    const filterQuery = isSho6
      ? 'targetGrade[contains]小6生[or]targetGrade[contains]全学年'
      : 'targetGrade[contains]中学生[or]targetGrade[contains]全学年';

    const cfg = (typeof MICROCMS_CONFIG !== 'undefined' && MICROCMS_CONFIG.serviceDomain) ? MICROCMS_CONFIG : DEFAULT_CONFIG;

    try {
      const url = `https://${cfg.serviceDomain}.microcms.io/api/v1/${cfg.endpoint}?orders=-publishedAt&limit=3&filters=${encodeURIComponent(filterQuery)}`;
      const res = await fetch(url, {
        headers: { 'X-MICROCMS-API-KEY': cfg.apiKey }
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data && data.contents && data.contents.length > 0) {
        renderNews(data.contents);
      } else {
        renderNews(getFallback(grade));
      }
    } catch (err) {
      console.warn('microCMS最新お知らせ取得フォールバック:', err);
      renderNews(getFallback(grade));
    }
  }

  window.loadLatestNews = loadNews;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { loadNews(); });
  } else {
    loadNews();
  }
})();
