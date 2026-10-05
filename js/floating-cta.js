/**
 * 岡山県統一模擬試験（おかもし）
 * 申し込み追従（フロート）ボタン（Sticky CTA） 共通ページ制御スクリプト
 * floating-cta.js
 */
(function () {
  'use strict';

  // 1. ルーティング & パス判定
  const path = (window.location.pathname || '').toLowerCase();

  // 完全非表示（Disallowed）判定
  // - プライバシーポリシー
  // - 特定商取引法に基づく表記
  // - お申し込みフォーム完了位置・入力ページ (apply.html)
  // - お問い合わせフォーム (contact)
  const isPrivacy = path.includes('privacy');
  const isTokushoho = path.includes('tokushoho');
  const isApply = path.includes('apply');
  const isContact = path.includes('contact');

  // HTML/BODY要素の明示的フラグ (data-floating-cta="disabled")
  const hasDisableFlag = 
    document.documentElement.getAttribute('data-floating-cta') === 'disabled' ||
    (document.body && document.body.getAttribute('data-floating-cta') === 'disabled');

  if (isPrivacy || isTokushoho || isApply || isContact || hasDisableFlag) {
    // 既存のCTA要素があれば非表示にしてスクリプトを終了
    const hideExisting = () => {
      const existingCta = document.getElementById('floating-cta-bar');
      if (existingCta) {
        existingCta.style.display = 'none';
        existingCta.classList.add('hidden', 'translate-y-full', 'opacity-0');
        existingCta.setAttribute('aria-hidden', 'true');
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hideExisting);
    } else {
      hideExisting();
    }
    return;
  }

  // 2. 表示対象ページ（Allowed）の特定
  // - トップページ (index.html, ルートパス, または schedule-selector が存在するページ)
  const isTopPage = 
    document.getElementById('schedule-selector') !== null ||
    path === '/' || 
    path.endsWith('/index.html') || 
    path === '' ||
    (!path.includes('.html') && !path.includes('news') && !path.includes('schools') && !path.includes('detail') && !path.includes('blog'));

  // - お知らせ一覧・詳細
  const isNewsOrDetail = 
    path.includes('news') || 
    path.includes('detail') || 
    path.includes('blog');

  // - 実施塾一覧
  const isSchools = path.includes('schools');

  // 明示的な許可フラグ (data-floating-cta="enabled")
  const hasEnableFlag = 
    document.documentElement.getAttribute('data-floating-cta') === 'enabled' ||
    (document.body && document.body.getAttribute('data-floating-cta') === 'enabled');

  // 対象外ページの場合は終了
  if (!isTopPage && !isNewsOrDetail && !isSchools && !hasEnableFlag) {
    return;
  }

  // 3. CTA要素の確保または動的生成
  function getOrCreateCtaBar() {
    let ctaBar = document.getElementById('floating-cta-bar');
    if (!ctaBar && document.body) {
      ctaBar = document.createElement('div');
      ctaBar.id = 'floating-cta-bar';
      ctaBar.className = 'fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 p-3 md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.08)] transition-all duration-300 ease-out transform translate-y-full opacity-0 pointer-events-none';
      
      // ルート相対または階層に応じたリンク先パス
      const targetLink = isTopPage ? '#schedule-selector' : 'index.html#schedule-selector';

      ctaBar.innerHTML = `
        <div class="max-w-md mx-auto flex items-center justify-between gap-3">
          <div class="flex-1 min-w-0">
            <span id="floating-status-badge" class="inline-block text-[9px] font-bold text-emerald-900 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded">次回模試 受付中</span>
            <div id="floating-desc" class="text-xs font-bold text-slate-800 leading-tight truncate">岡山県統一模擬試験（おかもし）</div>
          </div>
          <a href="${targetLink}" class="py-2.5 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-md shadow-orange-500/25 active:scale-95 transition-all flex items-center gap-1.5 shrink-0">
            <span>模試に申し込む</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"></path></svg>
          </a>
        </div>
      `;
      document.body.appendChild(ctaBar);
    }
    return ctaBar;
  }

  // 4. 表示・非表示のアニメーション制御
  function showCta(ctaBar) {
    ctaBar.classList.remove('translate-y-full', 'opacity-0', 'pointer-events-none');
    ctaBar.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
  }

  function hideCta(ctaBar) {
    ctaBar.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
    ctaBar.classList.add('translate-y-full', 'opacity-0', 'pointer-events-none');
  }

  // 5. スクロール位置・セクションに応じた動的表示判定
  function updateFloatingCtaVisibility() {
    const ctaBar = getOrCreateCtaBar();
    if (!ctaBar) return;

    const vpHeight = window.innerHeight || document.documentElement.clientHeight;
    const scrollY = window.scrollY || window.pageYOffset;

    if (isTopPage) {
      // -------------------------------------------------------------
      // 【トップページの制御】
      // 1. ページ上部〜「3つの特徴」〜「模試の詳細・日程選択」エリア：非表示
      // 2. 「生徒の声（体験談）」セクション以降：スッとスライドイン表示
      // 3. お申し込みフォームや日程選択エリア内：非表示
      // -------------------------------------------------------------
      const scheduleSec = document.getElementById('schedule-selector');
      const studentVoicesSec = document.getElementById('student-voices');

      // 出現トリガーセクション（生徒の声、非表示時は後続要素）
      let triggerSec = studentVoicesSec;
      if (!triggerSec || triggerSec.classList.contains('hidden') || triggerSec.offsetHeight === 0) {
        triggerSec = scheduleSec ? scheduleSec.nextElementSibling : null;
      }

      let hasReachedTrigger = false;
      if (triggerSec) {
        const triggerRect = triggerSec.getBoundingClientRect();
        if (triggerRect.top <= vpHeight * 0.85) {
          hasReachedTrigger = true;
        }
      }

      // 日程選択・詳細エリア内にいるか
      let isInsideSchedule = false;
      if (scheduleSec) {
        const schedRect = scheduleSec.getBoundingClientRect();
        if (schedRect.top < vpHeight * 0.75 && schedRect.bottom > 80) {
          isInsideSchedule = true;
        }
      }

      // お申し込みフォーム・サマリーエリア内にいるか
      let isInsideApply = false;
      const applyContainers = document.querySelectorAll('#apply-form, [data-section="apply-summary"]');
      applyContainers.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < vpHeight && rect.bottom > 0) {
          isInsideApply = true;
        }
      });

      const shouldShow = hasReachedTrigger && !isInsideSchedule && !isInsideApply;

      if (shouldShow) {
        showCta(ctaBar);
      } else {
        hideCta(ctaBar);
      }

    } else {
      // -------------------------------------------------------------
      // 【お知らせ・詳細／実施塾一覧の制御】
      // スクロール開始（ヘッダー・ファーストビュー通過後）でスッとスライドイン表示
      // -------------------------------------------------------------
      if (scrollY > 160) {
        showCta(ctaBar);
      } else {
        hideCta(ctaBar);
      }
    }
  }

  // グローバル関数として公開
  window.checkFloatingCtaVisibility = updateFloatingCtaVisibility;

  // イベントリスナー設定
  function init() {
    getOrCreateCtaBar();
    window.addEventListener('scroll', updateFloatingCtaVisibility, { passive: true });
    window.addEventListener('resize', updateFloatingCtaVisibility, { passive: true });

    // IntersectionObserver のサポート
    if ('IntersectionObserver' in window && isTopPage) {
      const scheduleSec = document.getElementById('schedule-selector');
      const studentVoicesSec = document.getElementById('student-voices');
      const observer = new IntersectionObserver(() => {
        updateFloatingCtaVisibility();
      }, {
        threshold: [0, 0.2, 0.5, 0.8, 1.0]
      });

      if (scheduleSec) observer.observe(scheduleSec);
      if (studentVoicesSec) observer.observe(studentVoicesSec);
    }

    updateFloatingCtaVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
