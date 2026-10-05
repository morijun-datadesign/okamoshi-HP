/**
 * 岡山県統一模擬試験（おかもし） 共通ヘッダー制御スクリプト
 * header.js
 */

(function () {
  // --- ドロップダウンのホバー隙間解消スタイルの注入 ---
  (function injectDropdownBridgeStyle() {
    var styleId = "header-contact-dropdown-bridge-style";
    if (!document.getElementById(styleId)) {
      var style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        #nav-contact-container { position: relative; }
        #nav-contact-container:hover #nav-contact-dropdown,
        #nav-contact-container:focus-within #nav-contact-dropdown,
        #nav-contact-container.is-open #nav-contact-dropdown { display: block !important; }
        #nav-contact-container:hover #nav-contact-chevron,
        #nav-contact-container.is-open #nav-contact-chevron { transform: rotate(180deg) !important; }
        #nav-contact-dropdown::before {
          content: "" !important;
          position: absolute !important;
          top: -14px !important;
          left: 0 !important;
          right: 0 !important;
          height: 16px !important;
          display: block !important;
          background: transparent !important;
        }
        #nav-next-exam-dropdown::before {
          content: "" !important;
          position: absolute !important;
          top: -14px !important;
          left: 0 !important;
          right: 0 !important;
          height: 16px !important;
          display: block !important;
          background: transparent !important;
        }
      `;
      document.head.appendChild(style);
    }
  })();

  // --- PC ドロップダウン制御 ---
  window.toggleNextExamDropdown = function (event) {
    if (event) event.stopPropagation();
    window.closeContactDropdown();
    var dropdown = document.getElementById("nav-next-exam-dropdown");
    var chevron = document.getElementById("nav-next-exam-chevron");
    var btn = document.getElementById("nav-next-exam-btn");
    if (!dropdown) return;
    var isOpen = !dropdown.classList.contains("hidden");
    if (isOpen) {
      dropdown.classList.add("hidden");
      if (chevron) chevron.style.transform = "rotate(0deg)";
      if (btn) btn.setAttribute("aria-expanded", "false");
    } else {
      dropdown.classList.remove("hidden");
      if (chevron) chevron.style.transform = "rotate(180deg)";
      if (btn) btn.setAttribute("aria-expanded", "true");
    }
  };

  window.closeNextExamDropdown = function () {
    var dropdown = document.getElementById("nav-next-exam-dropdown");
    var chevron = document.getElementById("nav-next-exam-chevron");
    var btn = document.getElementById("nav-next-exam-btn");
    if (dropdown && !dropdown.classList.contains("hidden")) {
      dropdown.classList.add("hidden");
      if (chevron) chevron.style.transform = "rotate(0deg)";
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
  };

  window.toggleContactDropdown = function (event) {
    if (event) event.stopPropagation();
    window.closeNextExamDropdown();
    var container = document.getElementById("nav-contact-container");
    var btn = document.getElementById("nav-contact-btn");
    if (!container) return;
    var isOpen = container.classList.contains("is-open");
    if (isOpen) {
      window.closeContactDropdown();
    } else {
      container.classList.add("is-open");
      if (btn) btn.setAttribute("aria-expanded", "true");
    }
  };

  window.closeContactDropdown = function () {
    var container = document.getElementById("nav-contact-container");
    var btn = document.getElementById("nav-contact-btn");
    var dropdown = document.getElementById("nav-contact-dropdown");
    if (container) {
      container.classList.remove("is-open");
    }
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.blur();
    }
    if (dropdown) {
      dropdown.style.display = "none";
      setTimeout(function () {
        dropdown.style.display = "";
      }, 350);
    }
  };

  window.handleContactNavClick = function (event, url) {
    window.closeContactDropdown();
    if (url) {
      window.location.href = url;
    }
  };

  window.selectNavExamTab = function (tabKey) {
    window.closeNextExamDropdown();
    var targetElem = document.getElementById("next-exam");
    if (typeof window.switchExamTab === "function" && targetElem) {
      var effectiveKey = tabKey;
      if (
        (tabKey === "chu1" || tabKey === "chu2") &&
        !document.getElementById("tab-btn-" + tabKey) &&
        document.getElementById("tab-btn-chu12")
      ) {
        effectiveKey = "chu12";
      }
      window.switchExamTab(effectiveKey);
      try {
        var newUrl = window.location.pathname + "?grade=" + tabKey + "#next-exam";
        history.replaceState(null, "", newUrl);
      } catch (e) {}
      setTimeout(function () {
        targetElem.scrollIntoView({ behavior: "smooth" });
      }, 100);
      return;
    }
    window.location.href = "/index.html?grade=" + tabKey + "#next-exam";
  };

  window.handleNavExamGuideClick = function (event, targetId) {
    if (typeof window.closeNextExamDropdown === "function") {
      window.closeNextExamDropdown();
    }
    var effectiveId = (targetId === "about" || targetId === "features") ? "features" : targetId;
    var isTopPage =
      window.location.pathname.endsWith("index.html") ||
      window.location.pathname === "/" ||
      window.location.pathname.endsWith("/");
    if (isTopPage) {
      var elem =
        document.getElementById(effectiveId) ||
        document.getElementById(targetId) ||
        (effectiveId === "features"
          ? document.getElementById("features")
          : document.getElementById("schedule-selector"));
      if (elem) {
        if (event) event.preventDefault();
        elem.scrollIntoView({ behavior: "smooth" });
        try {
          history.pushState(null, "", "#" + effectiveId);
        } catch (e) {}
      }
    } else {
      window.location.href = "/index.html#" + effectiveId;
    }
  };

  window.handleMobileNavExamGuideClick = function (event, targetId) {
    if (typeof window.closeMobileMenu === "function") {
      window.closeMobileMenu();
    }
    window.handleNavExamGuideClick(event, targetId);
  };

  // --- モバイルドロワー制御 ---
  window.openMobileMenu = function () {
    var drawer = document.getElementById("mobile-menu-drawer");
    var backdrop = document.getElementById("mobile-menu-backdrop");
    var btn = document.getElementById("mobile-menu-open-btn");
    if (drawer && backdrop) {
      drawer.classList.remove("translate-x-full");
      backdrop.classList.remove("opacity-0", "pointer-events-none");
      backdrop.classList.add("opacity-100", "pointer-events-auto");
      document.body.style.overflow = "hidden";
      if (btn) btn.setAttribute("aria-expanded", "true");
    }
  };

  window.closeMobileMenu = function () {
    var drawer = document.getElementById("mobile-menu-drawer");
    var backdrop = document.getElementById("mobile-menu-backdrop");
    var btn = document.getElementById("mobile-menu-open-btn");
    if (drawer && backdrop) {
      drawer.classList.add("translate-x-full");
      backdrop.classList.remove("opacity-100", "pointer-events-auto");
      backdrop.classList.add("opacity-0", "pointer-events-none");
      document.body.style.overflow = "";
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
  };

  window.toggleMobileExamAccordion = function () {
    var menu = document.getElementById("mobile-exam-menu");
    var chevron = document.getElementById("mobile-exam-chevron");
    var btn = document.getElementById("mobile-exam-accordion-btn");
    if (!menu) return;
    var isOpen = !menu.classList.contains("hidden");
    if (isOpen) {
      menu.classList.add("hidden");
      if (chevron) chevron.style.transform = "rotate(0deg)";
      if (btn) btn.setAttribute("aria-expanded", "false");
    } else {
      menu.classList.remove("hidden");
      if (chevron) chevron.style.transform = "rotate(180deg)";
      if (btn) btn.setAttribute("aria-expanded", "true");
    }
  };

  // モバイルメニュー内のアコーディオン展開時、展開部分がドロワー下部の固定CTAに隠れないよう自動スクロール
  window.revealMobileMenuSection = function (target) {
    if (!target) return;
    var scroller = document.getElementById("mobile-menu-scroll") || target.closest(".overflow-y-auto");
    if (!scroller) return;
    requestAnimationFrame(function () {
      var sRect = scroller.getBoundingClientRect();
      var tRect = target.getBoundingClientRect();
      var visibleBottom = sRect.bottom;
      // ドロワー下部の固定CTA（お申し込みはこちら）がスクロール領域に重なる場合はその上端を表示下限とする
      var footer = scroller.nextElementSibling;
      if (footer) visibleBottom = Math.min(visibleBottom, footer.getBoundingClientRect().top);
      var delta = tRect.bottom - (visibleBottom - 16);
      if (delta <= 0) return;
      // セクション見出しが上に見切れない範囲でスクロール
      var maxDelta = tRect.top - sRect.top - 8;
      if (maxDelta <= 0) return;
      scroller.scrollTo({ top: scroller.scrollTop + Math.min(delta, maxDelta), behavior: "smooth" });
    });
  };

  window.toggleMobileContactAccordion = function () {
    var menu = document.getElementById("mobile-contact-menu");
    var chevron = document.getElementById("mobile-contact-chevron");
    var btn = document.getElementById("mobile-contact-accordion-btn");
    if (!menu) return;
    var isOpen = !menu.classList.contains("hidden");
    if (isOpen) {
      menu.classList.add("hidden");
      if (chevron) chevron.style.transform = "rotate(0deg)";
      if (btn) btn.setAttribute("aria-expanded", "false");
    } else {
      menu.classList.remove("hidden");
      if (chevron) chevron.style.transform = "rotate(180deg)";
      if (btn) btn.setAttribute("aria-expanded", "true");
      window.revealMobileMenuSection(menu.parentElement);
    }
  };

  window.selectMobileNavExamTab = function (tabKey) {
    window.closeMobileMenu();
    var targetElem = document.getElementById("next-exam");
    if (typeof window.switchExamTab === "function" && targetElem) {
      var effectiveKey = tabKey;
      if (
        (tabKey === "chu1" || tabKey === "chu2") &&
        !document.getElementById("tab-btn-" + tabKey) &&
        document.getElementById("tab-btn-chu12")
      ) {
        effectiveKey = "chu12";
      }
      window.switchExamTab(effectiveKey);
      try {
        var newUrl = window.location.pathname + "?grade=" + tabKey + "#next-exam";
        history.replaceState(null, "", newUrl);
      } catch (e) {}
      setTimeout(function () {
        targetElem.scrollIntoView({ behavior: "smooth" });
      }, 100);
      return;
    }
    window.location.href = "/index.html?grade=" + tabKey + "#next-exam";
  };

  // --- ドキュメント外部クリック検知 ---
  document.addEventListener("click", function (e) {
    var examContainer = document.getElementById("nav-next-exam-container");
    if (examContainer && !examContainer.contains(e.target)) {
      window.closeNextExamDropdown();
    }
    var contactContainer = document.getElementById("nav-contact-container");
    if (contactContainer && !contactContainer.contains(e.target)) {
      window.closeContactDropdown();
    }
  });
})();
