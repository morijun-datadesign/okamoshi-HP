/**
 * sidebar-exam-widget.js
 * お知らせ詳細ページ・右サイドバー「次回の模試・お申し込み」ウィジェット
 * Cloudflare D1 (/api/exam-guides) から最新の模試スケジュールを動的取得し、
 * 各学年（中3・中2・中1・小6）の現在受付中（申込締切前）の最新回をレンダリングします。
 */
(function() {
  'use strict';

  function parseDeadlineToTimestamp(dlStr) {
    if (!dlStr) return 0;
    const clean = String(dlStr).trim();
    // 例: "2026-12-14 23:59", "2026-12-14T23:59:59+09:00", "2026/12/14 23:59"
    const m = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2}))?/);
    if (!m) return 0;
    const y = parseInt(m[1], 10);
    const mon = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    const h = m[4] ? parseInt(m[4], 10) : 23;
    const min = m[5] ? parseInt(m[5], 10) : 59;
    return new Date(y, mon - 1, d, h, min, 59, 999).getTime();
  }

  function extractPeriodText(round) {
    if (!round) return '12/26(土)〜1/11(月)';
    const venues = Array.isArray(round.venuesList) ? round.venuesList : [];
    const home = venues.find(function(v) {
      return (v.badge || v.name || '').indexOf('自宅') !== -1;
    });
    if (home && home.date) {
      return home.date.replace(/^202\d年/, '').replace(/(\d{4})年/g, '');
    }
    for (let i = 0; i < venues.length; i++) {
      if (venues[i].date) {
        return venues[i].date.replace(/^202\d年/, '');
      }
    }
    return '12/26(土)〜1/11(月)';
  }

  function extractVenuesSummary(round) {
    if (!round) return '岡山・倉敷・津山・自宅';
    const venues = Array.isArray(round.venuesList) ? round.venuesList : [];
    if (venues.length === 0) return '岡山・倉敷・津山・自宅';

    const hasHome = venues.some(function(v) {
      return (v.badge || v.name || '').indexOf('自宅') !== -1;
    });
    const physical = [];
    venues.forEach(function(v) {
      const name = (v.badge || v.name || '').replace(/会場$/, '').trim();
      if (name && name.indexOf('自宅') === -1 && physical.indexOf(name) === -1) {
        physical.push(name);
      }
    });

    if (physical.length > 0 && hasHome) {
      return physical.join('・') + '・自宅';
    } else if (physical.length > 0) {
      return physical.join('・') + '会場';
    } else if (hasHome) {
      return '自宅受験対応';
    }
    return '岡山・倉敷・津山・自宅';
  }

  function extractDeadlineText(round) {
    if (!round || !round.deadline) return '2026年12月14日(月)';
    let dl = String(round.deadline).trim();
    dl = dl.replace(/\s*\d{1,2}:\d{2}(?:まで)?$/, '').trim();
    return dl || '2026年12月14日(月)';
  }

  async function updateSidebarExamWidget() {
    const container = document.getElementById('sidebar-exam-widget-list');
    if (!container) return;

    const targetConfigs = [
      {
        gradeBadge: '中3生',
        gradeCodes: ['c3', 'chu3'],
        link: '/index.html?grade=chu3#schedule-selector'
      },
      {
        gradeBadge: '中2生',
        gradeCodes: ['c2', 'chu2'],
        link: '/index.html?grade=chu2#schedule-selector'
      },
      {
        gradeBadge: '中1生',
        gradeCodes: ['c1', 'chu1'],
        link: '/index.html?grade=chu1#schedule-selector'
      },
      {
        gradeBadge: '小6生',
        gradeCodes: ['p6', 'sho6', 'e6', 's6'],
        link: '/index.html?grade=sho6#schedule-selector'
      }
    ];

    let gradesData = null;
    try {
      const res = await fetch('/api/exam-guides?_t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.grades) {
          gradesData = data.grades;
        }
      }
    } catch (err) {
      console.warn('[sidebar-exam-widget] Failed to fetch /api/exam-guides:', err);
    }

    if (!gradesData) {
      return; // 取得失敗時は現在の静的HTMLをそのまま保持
    }

    const now = (typeof getCurrentDate === 'function') ? getCurrentDate().getTime() : Date.now();

    const renderedCards = targetConfigs.map(function(cfg) {
      // 該当学年のデータ取得
      let gradeInfo = null;
      for (let i = 0; i < cfg.gradeCodes.length; i++) {
        const code = cfg.gradeCodes[i];
        if (gradesData[code]) {
          gradeInfo = gradesData[code];
          break;
        }
      }

      const rounds = (gradeInfo && Array.isArray(gradeInfo.rounds)) ? gradeInfo.rounds : [];

      // rounds が空（未設定またはデータ取得不完全）の場合の安全なフォールバック
      if (!rounds || rounds.length === 0) {
        if (cfg.gradeBadge === '小6生') {
          return [
            '<div class="block p-3.5 sm:p-4 opacity-70 bg-slate-50/50">',
            '  <div class="flex items-center justify-between gap-2 mb-2">',
            '    <div class="flex items-center gap-1.5 flex-wrap">',
            '      <span class="inline-flex items-center justify-center px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold text-xs shrink-0 leading-tight">' + cfg.gradeBadge + '</span>',
            '      <span class="inline-flex items-center justify-center px-2 py-0.5 rounded bg-slate-200 text-slate-600 font-bold text-xs shrink-0 leading-tight">受付終了</span>',
            '    </div>',
            '  </div>',
            '  <div class="text-xs text-slate-500 font-medium">今年度の受付は終了しました</div>',
            '</div>'
          ].join('\n');
        } else {
          return [
            '<a href="' + cfg.link + '" class="block p-3.5 sm:p-4 hover:bg-slate-100/70 transition-colors cursor-pointer group">',
            '  <div class="flex items-center justify-between gap-2 mb-2">',
            '    <div class="flex items-center gap-1.5 flex-wrap">',
            '      <span class="inline-flex items-center justify-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs shrink-0 leading-tight">' + cfg.gradeBadge + '</span>',
            '      <span class="inline-flex items-center justify-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs shrink-0 leading-tight">12月号</span>',
            '    </div>',
            '    <div class="w-6 h-6 rounded-full bg-emerald-800 text-white flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-emerald-900 transition-all shadow-2xs">',
            '      <span class="material-symbols-outlined text-[15px] text-white">chevron_right</span>',
            '    </div>',
            '  </div>',
            '  <div class="space-y-1.5 text-xs sm:text-sm leading-snug">',
            '    <div class="flex items-center justify-between gap-2">',
            '      <span class="text-slate-500 shrink-0 font-medium flex items-center gap-1 text-xs sm:text-sm">',
            '        <span class="material-symbols-outlined text-[14px] text-slate-400">schedule</span>日程',
            '      </span>',
            '      <span class="font-bold text-secondary text-right truncate text-xs sm:text-sm">12/26(土)〜1/11(月)</span>',
            '    </div>',
            '    <div class="flex items-center justify-between gap-2">',
            '      <span class="text-slate-500 shrink-0 font-medium flex items-center gap-1 text-xs sm:text-sm">',
            '        <span class="material-symbols-outlined text-[14px] text-slate-400">location_on</span>会場',
            '      </span>',
            '      <span class="text-right truncate font-medium text-slate-700 text-xs sm:text-sm">岡山・倉敷・津山・自宅</span>',
            '    </div>',
            '    <div class="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60">',
            '      <span class="text-slate-500 shrink-0 font-medium flex items-center gap-1 text-xs sm:text-sm">',
            '        <span class="material-symbols-outlined text-[14px] text-slate-400">event</span>申込締切',
            '      </span>',
            '      <span class="font-bold text-slate-800 text-right text-xs sm:text-sm">2026年12月14日(月)</span>',
            '    </div>',
            '  </div>',
            '</a>'
          ].join('\n');
        }
      }

      // 申込締切が現在日時以降（受付中）の模試を抽出
      const activeRounds = rounds.filter(function(r) {
        if (r.status === 'finished') return false;
        const dlMs = parseDeadlineToTimestamp(r.applyDeadlineRaw);
        if (dlMs > 0 && dlMs < now) return false;
        return true;
      });

      // 直近の受付中模試
      const targetRound = activeRounds.length > 0 ? activeRounds[0] : null;

      if (!targetRound) {
        // 受付中の模試がない場合（受付終了）
        return [
          '<div class="block p-3.5 sm:p-4 opacity-70 bg-slate-50/50">',
          '  <div class="flex items-center justify-between gap-2 mb-2">',
          '    <div class="flex items-center gap-1.5 flex-wrap">',
          '      <span class="inline-flex items-center justify-center px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold text-xs shrink-0 leading-tight">' + cfg.gradeBadge + '</span>',
          '      <span class="inline-flex items-center justify-center px-2 py-0.5 rounded bg-slate-200 text-slate-600 font-bold text-xs shrink-0 leading-tight">受付終了</span>',
          '    </div>',
          '  </div>',
          '  <div class="text-xs text-slate-500 font-medium">今年度の受付は終了しました</div>',
          '</div>'
        ].join('\n');
      }

      // 月号表示の整形（例: "12月号"）
      let issueText = targetRound.monthName || (targetRound.monthNum ? targetRound.monthNum + '月号' : '次回模試');
      issueText = String(issueText).trim();
      if (issueText && !issueText.endsWith('号') && /^\d+月$/.test(issueText)) {
        issueText += '号';
      }

      const periodText = extractPeriodText(targetRound);
      const venuesSummary = extractVenuesSummary(targetRound);
      const deadlineText = extractDeadlineText(targetRound);

      return [
        '<a href="' + cfg.link + '" class="block p-3.5 sm:p-4 hover:bg-slate-100/70 transition-colors cursor-pointer group">',
        '  <div class="flex items-center justify-between gap-2 mb-2">',
        '    <div class="flex items-center gap-1.5 flex-wrap">',
        '      <span class="inline-flex items-center justify-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs shrink-0 leading-tight">' + cfg.gradeBadge + '</span>',
        '      <span class="inline-flex items-center justify-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs shrink-0 leading-tight">' + issueText + '</span>',
        '    </div>',
        '    <div class="w-6 h-6 rounded-full bg-emerald-800 text-white flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-emerald-900 transition-all shadow-2xs">',
        '      <span class="material-symbols-outlined text-[15px] text-white">chevron_right</span>',
        '    </div>',
        '  </div>',
        '  <div class="space-y-1.5 text-xs sm:text-sm leading-snug">',
        '    <div class="flex items-center justify-between gap-2">',
        '      <span class="text-slate-500 shrink-0 font-medium flex items-center gap-1 text-xs sm:text-sm">',
        '        <span class="material-symbols-outlined text-[14px] text-slate-400">schedule</span>日程',
        '      </span>',
        '      <span class="font-bold text-secondary text-right truncate text-xs sm:text-sm">' + periodText + '</span>',
        '    </div>',
        '    <div class="flex items-center justify-between gap-2">',
        '      <span class="text-slate-500 shrink-0 font-medium flex items-center gap-1 text-xs sm:text-sm">',
        '        <span class="material-symbols-outlined text-[14px] text-slate-400">location_on</span>会場',
        '      </span>',
        '      <span class="text-right truncate font-medium text-slate-700 text-xs sm:text-sm">' + venuesSummary + '</span>',
        '    </div>',
        '    <div class="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60">',
        '      <span class="text-slate-500 shrink-0 font-medium flex items-center gap-1 text-xs sm:text-sm">',
        '        <span class="material-symbols-outlined text-[14px] text-slate-400">event</span>申込締切',
        '      </span>',
        '      <span class="font-bold text-slate-800 text-right text-xs sm:text-sm">' + deadlineText + '</span>',
        '    </div>',
        '  </div>',
        '</a>'
      ].join('\n');
    });

    container.innerHTML = renderedCards.join('\n');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateSidebarExamWidget);
  } else {
    updateSidebarExamWidget();
  }
})();
