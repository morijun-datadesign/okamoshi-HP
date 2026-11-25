/**
 * 実施塾一覧 検索・学区スクロール連動・D1取得スクリプト（schools.html より分離）
 */
    (function() {
      function normalizeStr(str) {
        if (!str) return '';
        return str
          .toLowerCase()
          .replace(/[！-～]/g, function(s) {
            return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
          })
          .replace(/　/g, ' ')
          .replace(/[ァ-ヶ]/g, function(m) {
            return String.fromCharCode(m.charCodeAt(0) - 0x60); // カタカナ -> ひらがな
          })
          .replace(/[\s\-_・]/g, '');
      }
      // 2. 学区ごとのテーブルとバッジ要素
      const districtConfigs = [
        { areaId: 'area-okayama', tableId: 'tableOkayama', badgeId: 'badge-okayama', total: 0 },
        { areaId: 'area-kurashiki', tableId: 'tableKurashiki', badgeId: 'badge-kurashiki', total: 0 },
        { areaId: 'area-mimasaka', tableId: 'tableMimasaka', badgeId: 'badge-mimasaka', total: 0 },
        { areaId: 'area-seibi', tableId: 'tableSeibi', badgeId: 'badge-seibi', total: 0 }
      ];
      const searchInput = document.getElementById('jukuSearch');
      const clearBtn = document.getElementById('clearSearchBtn');
      function filterSchools() {
        const rawQuery = searchInput ? searchInput.value.trim() : '';
        const normQuery = normalizeStr(rawQuery);
        if (clearBtn) {
          if (rawQuery.length > 0) {
            clearBtn.classList.remove('hidden');
          } else {
            clearBtn.classList.add('hidden');
          }
        }
        districtConfigs.forEach(function(cfg) {
          const tbody = document.getElementById(cfg.tableId);
          const badge = document.getElementById(cfg.badgeId);
          if (!tbody) return;
          const rows = tbody.querySelectorAll('.juku-row');
          const noResultRow = tbody.querySelector('.no-results-row');
          let visibleCount = 0;
          rows.forEach(function(row) {
            const name = row.getAttribute('data-name') || row.children[0].textContent;
            const tel = row.getAttribute('data-tel') || row.children[1].textContent;
            const normText = normalizeStr(name + ' ' + tel);
            if (!normQuery || normText.includes(normQuery)) {
              row.style.display = '';
              visibleCount++;
            } else {
              row.style.display = 'none';
            }
          });
          if (noResultRow) {
            if (visibleCount === 0 && normQuery.length > 0) {
              noResultRow.classList.remove('hidden');
            } else {
              noResultRow.classList.add('hidden');
            }
          }
          if (badge) {
            if (normQuery.length > 0) {
              badge.textContent = visibleCount;
              if (visibleCount === 0) {
                badge.classList.add('opacity-40');
              } else {
                badge.classList.remove('opacity-40');
              }
            } else {
              badge.textContent = cfg.total;
              badge.classList.remove('opacity-40');
            }
          }
        });
      }
      if (searchInput) {
        searchInput.addEventListener('input', filterSchools);
      }
      if (clearBtn) {
        clearBtn.addEventListener('click', function() {
          if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
            filterSchools();
          }
        });
      }
      const navBtns = document.querySelectorAll('.district-nav-btn');
      const sections = districtConfigs.map(function(c) {
        return document.getElementById(c.areaId);
      }).filter(Boolean);
      let currentActiveDistrict = 'area-okayama';
      function scrollActiveTabIntoView(targetBtn) {
        if (!targetBtn) return;
        const tabsContainer = document.getElementById('districtTabs');
        if (!tabsContainer) {
          try {
            targetBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          } catch (e) {}
          return;
        }
        const containerRect = tabsContainer.getBoundingClientRect();
        const btnRect = targetBtn.getBoundingClientRect();
        const scrollOffset = (btnRect.left + btnRect.width / 2) - (containerRect.left + containerRect.width / 2);
        if (Math.abs(scrollOffset) > 2) {
          tabsContainer.scrollBy({ left: scrollOffset, behavior: 'smooth' });
        }
      }
      function setActiveTab(targetId, shouldScroll) {
        if (!targetId) return;
        if (typeof shouldScroll === 'undefined') shouldScroll = true;
        const isChanged = (currentActiveDistrict !== targetId);
        currentActiveDistrict = targetId;
        let activeBtn = null;
        navBtns.forEach(function(btn) {
          const isTarget = btn.getAttribute('data-target') === targetId || btn.getAttribute('href') === '#' + targetId;
          const badge = btn.querySelector('.count-badge');
          if (isTarget) {
            activeBtn = btn;
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            btn.style.setProperty('background-color', '#004d3d', 'important');
            btn.style.setProperty('color', '#ffffff', 'important');
            btn.style.setProperty('border-color', '#004d3d', 'important');
            if (badge) {
              badge.style.setProperty('background-color', '#ffffff', 'important');
              badge.style.setProperty('color', '#004d3d', 'important');
            }
          } else {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
            btn.style.removeProperty('background-color');
            btn.style.removeProperty('color');
            btn.style.removeProperty('border-color');
            if (badge) {
              badge.style.removeProperty('background-color');
              badge.style.removeProperty('color');
            }
          }
        });
        if (shouldScroll && isChanged && activeBtn) {
          scrollActiveTabIntoView(activeBtn);
        }
      }
      setActiveTab('area-okayama', false);
      let isClickScrolling = false;
      let scrollEndDebounce = null;
      function getTargetScrollTop(targetEl) {
        const header = document.querySelector('header');
        const anchorBar = document.getElementById('district-anchor');
        const totalOffset = (header ? header.offsetHeight : 64) + (anchorBar ? anchorBar.offsetHeight : 54) + 12;
        const rect = targetEl.getBoundingClientRect();
        return window.pageYOffset + rect.top - totalOffset;
      }
      function updateActiveTabOnScroll() {
        if ((window.innerHeight + window.pageYOffset) >= document.documentElement.scrollHeight - 60) {
          if (sections.length > 0) {
            setActiveTab(sections[sections.length - 1].id, true);
            return;
          }
        }
        const header = document.querySelector('header');
        const anchorBar = document.getElementById('district-anchor');
        const offsetThreshold = (header ? header.offsetHeight : 64) + (anchorBar ? anchorBar.offsetHeight : 54) + 40;
        for (let i = sections.length - 1; i >= 0; i--) {
          const sec = sections[i];
          if (sec) {
            const rect = sec.getBoundingClientRect();
            if (rect.top <= offsetThreshold) {
              setActiveTab(sec.id, true);
              break;
            }
          }
        }
      }
      function handleTabClick(btn, e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const targetId = btn.getAttribute('data-target') || (btn.getAttribute('href') || '').replace('#', '');
        const targetEl = document.getElementById(targetId);
        if (!targetId || !targetEl) return;
        setActiveTab(targetId, true);
        scrollActiveTabIntoView(btn);
        // 2. ページ縦スクロールとスクロールリスナーのロック制御
        isClickScrolling = true;
        if (scrollEndDebounce) clearTimeout(scrollEndDebounce);
        scrollEndDebounce = setTimeout(function() {
          isClickScrolling = false;
        }, 1200);
        const targetTop = getTargetScrollTop(targetEl);
        window.scrollTo({
          top: targetTop,
          behavior: 'smooth'
        });
      }
      navBtns.forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          handleTabClick(btn, e);
        });
      });
      window.addEventListener('touchstart', function() {
        if (isClickScrolling) {
          isClickScrolling = false;
          if (scrollEndDebounce) clearTimeout(scrollEndDebounce);
        }
      }, { passive: true });
      let scrollTimeout;
      window.addEventListener('scroll', function() {
        if (isClickScrolling) {
          if (scrollEndDebounce) clearTimeout(scrollEndDebounce);
          scrollEndDebounce = setTimeout(function() {
            isClickScrolling = false;
            updateActiveTabOnScroll();
          }, 150);
          return;
        }
        if (scrollTimeout) cancelAnimationFrame(scrollTimeout);
        scrollTimeout = requestAnimationFrame(updateActiveTabOnScroll);
      }, { passive: true });
      // 4. Cloudflare D1 からの動的取得 & 描画一本化 (/api/cram-schools)
      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }
      function renderLoadingState() {
        const loadingHtml = '<tr class="loading-row">' +
          '<td colspan="2" class="py-12 px-4 text-center">' +
          '<div class="inline-flex flex-col items-center justify-center gap-2.5 text-on-surface-variant">' +
          '<div class="w-6 h-6 border-2 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin"></div>' +
          '<span class="text-xs text-on-surface-variant font-medium">データを読み込み中...</span>' +
          '</div>' +
          '</td>' +
          '</tr>';
        districtConfigs.forEach(function(cfg) {
          const tbody = document.getElementById(cfg.tableId);
          if (tbody) {
            tbody.innerHTML = loadingHtml;
          }
          const badge = document.getElementById(cfg.badgeId);
          if (badge) {
            badge.textContent = '-';
            badge.classList.remove('opacity-40');
          }
        });
      }
      function renderErrorState() {
        const errorHtml = '<tr class="error-row bg-surface-container-lowest">' +
          '<td colspan="2" class="py-12 px-4 text-center">' +
          '<div class="inline-flex flex-col items-center justify-center gap-3 text-on-surface-variant max-w-md mx-auto">' +
          '<span class="material-symbols-outlined text-3xl text-rose-500">wifi_off</span>' +
          '<p class="text-sm font-medium text-on-surface leading-relaxed">データを取得できませんでした。電波の良い環境でページを再読み込みしてください</p>' +
          '<button type="button" onclick="window.loadCramSchoolsFromD1()" class="retry-fetch-btn inline-flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs sm:text-sm font-bold rounded-lg shadow-xs transition-colors cursor-pointer">' +
          '<span class="material-symbols-outlined text-base">refresh</span>' +
          '<span>再読み込み</span>' +
          '</button>' +
          '</div>' +
          '</td>' +
          '</tr>';
        districtConfigs.forEach(function(cfg) {
          const tbody = document.getElementById(cfg.tableId);
          if (tbody) {
            tbody.innerHTML = errorHtml;
          }
          const badge = document.getElementById(cfg.badgeId);
          if (badge) {
            badge.textContent = '-';
            badge.classList.add('opacity-40');
          }
        });
        document.querySelectorAll('.retry-fetch-btn').forEach(function(btn) {
          btn.onclick = function() {
            loadCramSchoolsFromD1();
          };
        });
      }
      function renderDynamicSchools(data) {
        if (!data || !data.success || !Array.isArray(data.schools)) {
          renderErrorState();
          return;
        }
        const areaToTable = {
          'okayama-east': { tableId: 'tableOkayama', badgeId: 'badge-okayama', cfgIndex: 0 },
          'kurashiki': { tableId: 'tableKurashiki', badgeId: 'badge-kurashiki', cfgIndex: 1 },
          'mimasaka': { tableId: 'tableMimasaka', badgeId: 'badge-mimasaka', cfgIndex: 2 },
          'seibi': { tableId: 'tableSeibi', badgeId: 'badge-seibi', cfgIndex: 3 }
        };
        const grouped = {
          'okayama-east': [],
          'kurashiki': [],
          'mimasaka': [],
          'seibi': []
        };
        data.schools.forEach(function(s) {
          const area = s.area_id || 'okayama-east';
          if (grouped[area]) {
            grouped[area].push(s);
          } else {
            grouped['okayama-east'].push(s);
          }
        });
        Object.keys(areaToTable).forEach(function(areaKey) {
          const info = areaToTable[areaKey];
          const tbody = document.getElementById(info.tableId);
          const badge = document.getElementById(info.badgeId);
          const list = grouped[areaKey] || [];
          if (!tbody) return;
          if (districtConfigs[info.cfgIndex]) {
            districtConfigs[info.cfgIndex].total = list.length;
          }
          if (badge) {
            badge.setAttribute('data-total', list.length);
            badge.textContent = list.length;
          }
          let html = '';
          if (list.length === 0) {
            html += '<tr class="bg-surface-container-lowest">' +
              '<td colspan="2" class="py-10 px-4 text-center text-on-surface-variant">' +
              '<div class="inline-flex flex-col items-center justify-center gap-1.5 text-sm text-outline">' +
              '<span class="material-symbols-outlined text-3xl text-outline-variant">info</span>' +
              '<span>この学区に該当する教室は見つかりませんでした</span>' +
              '</div>' +
              '</td>' +
              '</tr>';
          } else {
            list.forEach(function(s, idx) {
              const isStripe = idx % 2 === 1;
              const stripeClass = isStripe ? 'bg-surface-container-low/40 ' : '';
              const nameEsc = escapeHtml(s.name);
              const telEsc = escapeHtml(s.phone_number || '');
              const cleanTel = (s.phone_number || '').replace(/[^0-9]/g, '');
              let nameHtml = '';
              if (s.website_url && s.website_url.trim() !== '') {
                const urlEsc = escapeHtml(s.website_url.trim());
                nameHtml = '<a class="inline-flex items-center gap-1.5 hover:underline text-primary group font-medium transition-colors" href="' + urlEsc + '" target="_blank" rel="noopener noreferrer" title="' + nameEsc + ' の公式サイトを開く（新規タブ）">' +
                  '<span>' + nameEsc + '</span>' +
                  '<span class="material-symbols-outlined text-[15px] opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all">open_in_new</span>' +
                  '</a>';
              } else {
                nameHtml = '<span class="text-on-surface font-normal">' + nameEsc + '</span>';
              }
              let telHtml = '';
              if (s.phone_number && s.phone_number.trim() !== '') {
                telHtml = '<a class="hover:text-primary transition-colors inline-flex items-center gap-1.5 text-on-surface-variant font-mono" href="tel:' + cleanTel + '" title="' + nameEsc + ' に電話をかける">' +
                  '<span class="material-symbols-outlined text-[16px] text-outline">call</span>' +
                  '<span>' + telEsc + '</span>' +
                  '</a>';
              } else {
                telHtml = '<span class="text-outline text-body-sm">-</span>';
              }
              html += '<tr class="' + stripeClass + 'hover:bg-primary-fixed/20 transition-colors juku-row" data-name="' + nameEsc + '" data-tel="' + telEsc + '">' +
                '<td class="py-space-sm px-space-md">' + nameHtml + '</td>' +
                '<td class="py-space-sm px-space-md font-mono text-on-surface-variant">' + telHtml + '</td>' +
                '</tr>';
            });
          }
          html += '<tr class="hidden no-results-row bg-surface-container-lowest">' +
            '<td colspan="2" class="py-10 px-4 text-center text-on-surface-variant">' +
            '<div class="inline-flex flex-col items-center justify-center gap-1.5 text-sm text-outline">' +
            '<span class="material-symbols-outlined text-3xl text-outline-variant">search_off</span>' +
            '<span>該当する塾・教室が見つかりませんでした</span>' +
            '</div>' +
            '</td>' +
            '</tr>';
          tbody.innerHTML = html;
        });
        filterSchools();
      }
      function loadCramSchoolsFromD1() {
        renderLoadingState();
        fetch('/api/cram-schools')
          .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
          })
          .then(function(data) {
            renderDynamicSchools(data);
          })
          .catch(function(err) {
            console.error('[schools.html] D1 fetch failed:', err);
            renderErrorState();
          });
      }
      window.loadCramSchoolsFromD1 = loadCramSchoolsFromD1;
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadCramSchoolsFromD1);
      } else {
        loadCramSchoolsFromD1();
      }
      // 5. ヘッダーナビゲーション用ドロップダウン制御
      window.toggleNextExamDropdown = function(event) {
        if (event) event.stopPropagation();
        closeContactDropdown();
        const dropdown = document.getElementById('nav-next-exam-dropdown');
        const chevron = document.getElementById('nav-next-exam-chevron');
        const btn = document.getElementById('nav-next-exam-btn');
        if (!dropdown) return;
        const isOpen = !dropdown.classList.contains('hidden');
        if (isOpen) {
          dropdown.classList.add('hidden');
          if (chevron) chevron.style.transform = 'rotate(0deg)';
          if (btn) btn.setAttribute('aria-expanded', 'false');
        } else {
          dropdown.classList.remove('hidden');
          if (chevron) chevron.style.transform = 'rotate(180deg)';
          if (btn) btn.setAttribute('aria-expanded', 'true');
        }
      };
      window.closeNextExamDropdown = function() {
        const dropdown = document.getElementById('nav-next-exam-dropdown');
        const chevron = document.getElementById('nav-next-exam-chevron');
        const btn = document.getElementById('nav-next-exam-btn');
        if (dropdown && !dropdown.classList.contains('hidden')) {
          dropdown.classList.add('hidden');
          if (chevron) chevron.style.transform = 'rotate(0deg)';
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      };
      window.toggleContactDropdown = function(event) {
        if (event) event.stopPropagation();
        closeNextExamDropdown();
        const container = document.getElementById('nav-contact-container');
        const btn = document.getElementById('nav-contact-btn');
        if (!container) return;
        const isOpen = container.classList.contains('is-open');
        if (isOpen) {
          closeContactDropdown();
        } else {
          container.classList.add('is-open');
          if (btn) btn.setAttribute('aria-expanded', 'true');
        }
      };
      window.closeContactDropdown = function() {
        const container = document.getElementById('nav-contact-container');
        const btn = document.getElementById('nav-contact-btn');
        if (container && container.classList.contains('is-open')) {
          container.classList.remove('is-open');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      };
      window.toggleMobileMenu = function() {
        const menu = document.getElementById('mobile-menu');
        const icon = document.getElementById('mobile-menu-icon');
        if (!menu) return;
        const isHidden = menu.classList.contains('hidden');
        if (isHidden) {
          menu.classList.remove('hidden');
          if (icon) icon.textContent = 'close';
        } else {
          menu.classList.add('hidden');
          if (icon) icon.textContent = 'menu';
        }
      };
      window.selectNavExamTab = function(grade) {
        window.location.href = '/index.html#next-exam';
      };
      document.addEventListener('click', function(e) {
        const examContainer = document.getElementById('nav-next-exam-container');
        if (examContainer && !examContainer.contains(e.target)) {
          closeNextExamDropdown();
        }
        const contactContainer = document.getElementById('nav-contact-container');
        if (contactContainer && !contactContainer.contains(e.target)) {
          closeContactDropdown();
        }
      });
    })();
