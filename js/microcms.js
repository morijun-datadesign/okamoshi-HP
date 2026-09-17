/**
 * microCMS 連携モジュール (岡山県統一模擬試験)
 * 
 * 非エンジニアの方へ：
 * microCMS 管理画面から取得した「サービスドメイン」と「APIキー」を以下の定数に設定してください。
 * 設定すると、ブログ記事や次回模試の案内テキストが自動で microCMS から取得・更新されます。
 */

const MICROCMS_CONFIG = {
  // 例: 'your-service' (your-service.microcms.io のプレフィックス)
  serviceDomain: 'YOUR_MICROCMS_SERVICE_DOMAIN',
  // microCMS の API キー (GET 権限のみでOK)
  apiKey: 'YOUR_MICROCMS_API_KEY',
  // エンドポイント名
  blogEndpoint: 'blogs',
  siteConfigEndpoint: 'site-config' // 時期に応じたテキスト書き換え用
};

/**
 * microCMS API からデータを取得する共通関数
 */
async function fetchFromMicroCMS(endpoint, queries = {}) {
  // 設定がデフォルト値のままの場合は null を返す（フォールバック表示用）
  if (!MICROCMS_CONFIG.serviceDomain || MICROCMS_CONFIG.serviceDomain === 'YOUR_MICROCMS_SERVICE_DOMAIN' ||
      !MICROCMS_CONFIG.apiKey || MICROCMS_CONFIG.apiKey === 'YOUR_MICROCMS_API_KEY') {
    return null;
  }

  const queryParams = new URLSearchParams(queries).toString();
  const url = `https://${MICROCMS_CONFIG.serviceDomain}.microcms.io/api/v1/${endpoint}${queryParams ? '?' + queryParams : ''}`;

  try {
    const res = await fetch(url, {
      headers: {
        'X-MICROCMS-API-KEY': MICROCMS_CONFIG.apiKey
      }
    });
    if (!res.ok) {
      console.warn(`[microCMS] リクエスト失敗: ${res.status} ${res.statusText}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('[microCMS] 通信エラー:', err);
    return null;
  }
}

/**
 * microCMS 画像最適化 API ヘルパー
 * 画像URLに自動で WebP 変換とリサイズパラメータを付与します
 */
function optimizeMicroCmsImage(url, options = {}) {
  if (!url) return '';
  try {
    const imgUrl = new URL(url);
    // microCMSの画像サーバー (images.microcms-assets.io) の場合、最適化パラメータを適用
    if (imgUrl.hostname.includes('microcms-assets.io')) {
      imgUrl.searchParams.set('auto', 'format,compress');
      imgUrl.searchParams.set('fm', options.format || 'webp');
      if (options.width) imgUrl.searchParams.set('w', options.width.toString());
      if (options.height) imgUrl.searchParams.set('h', options.height.toString());
      if (options.fit) imgUrl.searchParams.set('fit', options.fit);
      return imgUrl.toString();
    }
  } catch (e) {
    // URL パースエラー時はそのまま返却
  }
  return url;
}

/**
 * ブログ記事一覧を取得
 */
async function getBlogList(limit = 10, categoryId = null) {
  const queries = { limit };
  if (categoryId) {
    queries.filters = `category[equals]${categoryId}`;
  }
  return await fetchFromMicroCMS(MICROCMS_CONFIG.blogEndpoint, queries);
}

/**
 * ブログ個別記事を取得 (contentId)
 */
async function getBlogDetail(contentId) {
  if (!contentId) return null;
  return await fetchFromMicroCMS(`${MICROCMS_CONFIG.blogEndpoint}/${contentId}`);
}

/**
 * 時期に応じたサイトテキスト設定を取得 (次回模試タイトル、日程、申込締切など)
 */
async function getSiteConfig() {
  return await fetchFromMicroCMS(MICROCMS_CONFIG.siteConfigEndpoint);
}

/**
 * microCMS のデータを使ってページ内のテキストを動的に更新する (data-microcms 属性対応)
 * HTMLタグ内に data-microcms="next_exam_title" などと記述しておくだけで自動置換されます
 */
async function applyDynamicSiteConfig() {
  const config = await getSiteConfig();
  if (!config) return;

  document.querySelectorAll('[data-microcms]').forEach(elem => {
    const key = elem.getAttribute('data-microcms');
    if (config[key] !== undefined) {
      if (elem.tagName === 'IMG') {
        elem.src = optimizeMicroCmsImage(config[key].url || config[key]);
      } else {
        elem.textContent = config[key];
      }
    }
  });
}

// ページロード時にサイト設定を動的反映（設定がある場合のみ）
document.addEventListener('DOMContentLoaded', function() {
  applyDynamicSiteConfig();
});

window.MicroCMS = {
  fetch: fetchFromMicroCMS,
  optimizeImage: optimizeMicroCmsImage,
  getBlogList: getBlogList,
  getBlogDetail: getBlogDetail,
  getSiteConfig: getSiteConfig,
  applyDynamicSiteConfig: applyDynamicSiteConfig
};
