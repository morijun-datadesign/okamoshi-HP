/**
 * 岡山県統一模擬試験（おかもし）
 * 共通現在日時取得ユーティリティ (common-date.js)
 * 
 * URLクエリパラメータ ?test_date=YYYY-MM-DD (または YYYY-MM-DDTHH:mm:ss 等) を検知し、
 * テスト用日時シミュレーションをサイト全体で統一して提供します。
 */
(function(window) {
  'use strict';

  function getCurrentDate() {
    try {
      if (typeof window !== 'undefined' && window.location) {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('test_date')) {
          const raw = urlParams.get('test_date') || '';
          const parsed = new Date(raw.replace(/ /g, '+'));
          if (!isNaN(parsed.getTime())) {
            return parsed;
          }
        }
      }
    } catch (e) {}
    return new Date();
  }

  function getTestDateString() {
    try {
      if (typeof window !== 'undefined' && window.location) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('test_date') || null;
      }
    } catch (e) {}
    return null;
  }

  window.getCurrentDate = getCurrentDate;
  window.getTestDateString = getTestDateString;
})(typeof window !== 'undefined' ? window : this);
