/**
 * 岡山県統一模擬試験（おかもし） 共通スクリプト
 */

// 次回模試ドロップダウン（PC）のトグル
function toggleNextExamDropdown(event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const dropdown = document.getElementById('nav-next-exam-dropdown');
  const btn = document.getElementById('nav-next-exam-btn');
  const chevron = document.getElementById('nav-next-exam-chevron');

  if (!dropdown) return;

  const isHidden = dropdown.classList.contains('hidden');
  if (isHidden) {
    dropdown.classList.remove('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    if (chevron) chevron.classList.add('rotate-180');
  } else {
    dropdown.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (chevron) chevron.classList.remove('rotate-180');
  }
}

// ドロップダウンから学年タブを選択
function selectNavExamTab(tabKey) {
  const dropdown = document.getElementById('nav-next-exam-dropdown');
  if (dropdown) dropdown.classList.add('hidden');
  const chevron = document.getElementById('nav-next-exam-chevron');
  if (chevron) chevron.classList.remove('rotate-180');

  // モバイルメニューも閉じる
  const mobileMenu = document.getElementById('mobile-menu');
  if (mobileMenu) mobileMenu.classList.add('hidden');

  if (typeof window.switchExamTab === 'function') {
    // トップページにいる場合
    window.switchExamTab(tabKey);
    const target = document.getElementById('exam-tabs-section') || document.getElementById('tab-btn-' + tabKey) || document.getElementById('features-section');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  } else {
    // 他のページにいる場合はトップページへ学年パラメータ付きで遷移
    window.location.href = 'index.html?tab=' + tabKey + '#exam-tabs-section';
  }
}

// モバイルメニューのトグル
function toggleMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const icon = document.getElementById('mobile-menu-icon');
  if (!menu) return;

  const isHidden = menu.classList.contains('hidden');
  if (isHidden) {
    menu.classList.remove('hidden');
    if (icon) icon.textContent = 'close';
    document.body.style.overflow = 'hidden';
  } else {
    menu.classList.add('hidden');
    if (icon) icon.textContent = 'menu';
    document.body.style.overflow = '';
  }
}

// 外側クリックでドロップダウンを閉じる
document.addEventListener('click', function(e) {
  const container = document.getElementById('nav-next-exam-container');
  const dropdown = document.getElementById('nav-next-exam-dropdown');
  const chevron = document.getElementById('nav-next-exam-chevron');
  if (container && dropdown && !container.contains(e.target)) {
    dropdown.classList.add('hidden');
    if (chevron) chevron.classList.remove('rotate-180');
  }
});

// ページ読み込み時にURLパラメータ (?tab=xxx) をチェック
document.addEventListener('DOMContentLoaded', function() {
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam = urlParams.get('tab');
  if (tabParam && typeof window.switchExamTab === 'function') {
    window.switchExamTab(tabParam);
    setTimeout(function() {
      const target = document.getElementById('exam-tabs-section') || document.getElementById('tab-btn-' + tabParam);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    }, 150);
  }
});
