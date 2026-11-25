/**
 * お申し込みフォーム メインロジック（apply/index.html より分離）
 */
    function getCurrentDate() {
      if (typeof window.getCurrentDate === 'function' && window.getCurrentDate !== getCurrentDate) {
        return window.getCurrentDate();
      }
      try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('test_date')) {
          const raw = urlParams.get('test_date') || '';
          const parsed = new Date(raw.replace(/ /g, '+'));
          if (!isNaN(parsed.getTime())) return parsed;
        }
      } catch (e) {}
      return new Date();
    }
    const MICROCMS_CONFIG = {
      serviceDomain: 'okamoshi-blog',
      apiKey: '',
      endpoint: 'exam-guides'
    };
    const CREATE_CHECKOUT_API_URL = '/api/create-checkout-session';
    const APPLY_API_URL = '/api/apply';
    const EXAMS_DATABASE = [
      {
        id: 'chu3_10',
        grade: 'chu3',
        gradeLabel: '中3',
        gradeName: '中3生',
        issueName: '10月号',
        title: '岡山県統一模擬試験（おかもし）',
        badge: '中3対象・受付中',
        examDate: '2026年11月1日(日)',
        deadline: '2026-10-05T23:59:59+09:00', // 2026年10月5日(月) 23:59
        deadlineDisplay: '10/5(月) 23:59',
        price: 5500,
        status: 'open',
        isDefaultChecked: false,
        venues: [
          { value: 'venue_okayama', label: '岡山会場（会場未定）' },
          { value: 'venue_kurashiki', label: '倉敷会場（会場未定）' },
          { value: 'venue_tsuyama', label: '津山会場（会場未定）' },
          { value: 'home', label: '自宅受験（問題冊子郵送・期日内答案返送）' }
        ]
      },
      {
        id: 'chu3_12',
        grade: 'chu3',
        gradeLabel: '中3',
        gradeName: '中3生',
        issueName: '12月号',
        title: '岡山県統一模擬試験（おかもし）',
        badge: '中3対象・予約受付',
        examDate: '2026年12月26日(土)・27日(日)',
        deadline: '2026-12-14T23:59:59+09:00', // 2026年12月14日(月) 23:59
        deadlineDisplay: '12/14(月) 23:59',
        price: 5500,
        status: 'open',
        isDefaultChecked: false,
        venues: [
          { value: 'venue_okayama', label: '岡山会場（会場未定）' },
          { value: 'venue_kurashiki', label: '倉敷会場（会場未定）' },
          { value: 'venue_tsuyama', label: '津山会場（会場未定）' },
          { value: 'home', label: '自宅受験（問題冊子郵送・期日内答案返送）' }
        ]
      },
      {
        id: 'chu2_12',
        grade: 'chu2',
        gradeLabel: '中2',
        gradeName: '中2生',
        issueName: '12月号',
        title: '岡山県統一模擬試験（おかもし）',
        badge: '中2対象・受付中',
        examDate: '2026年12月14日(日)',
        deadline: '2026-11-10T23:59:59+09:00',
        deadlineDisplay: '11/10(火) 23:59',
        price: 5500,
        status: 'open',
        isDefaultChecked: false,
        venues: [
          { value: 'venue_okayama', label: '岡山会場（会場未定）' },
          { value: 'venue_kurashiki', label: '倉敷会場（会場未定）' },
          { value: 'venue_tsuyama', label: '津山会場（会場未定）' },
          { value: 'home', label: '自宅受験（問題冊子郵送・期日内答案返送）' }
        ]
      },
      {
        id: 'chu2_03',
        grade: 'chu2',
        gradeLabel: '中2',
        gradeName: '中2生',
        issueName: '3月号',
        title: '岡山県統一模擬試験（おかもし）',
        badge: '中2対象・予約受付',
        examDate: '2027年3月14日(日)',
        deadline: '2027-03-07T23:59:59+09:00',
        deadlineDisplay: '2027/3/7(日) 23:59',
        price: 5500,
        status: 'open',
        isDefaultChecked: false,
        venues: [
          { value: 'venue_okayama', label: '岡山会場（会場未定）' },
          { value: 'venue_kurashiki', label: '倉敷会場（会場未定）' },
          { value: 'venue_tsuyama', label: '津山会場（会場未定）' },
          { value: 'home', label: '自宅受験（問題冊子郵送・期日内答案返送）' }
        ]
      },
      {
        id: 'chu1_12',
        grade: 'chu1',
        gradeLabel: '中1',
        gradeName: '中1生',
        issueName: '12月号',
        title: '岡山県統一模擬試験（おかもし）',
        badge: '中1対象・受付中',
        examDate: '2026年12月14日(日)',
        deadline: '2026-11-10T23:59:59+09:00',
        deadlineDisplay: '11/10(火) 23:59',
        price: 5500,
        status: 'open',
        isDefaultChecked: false,
        venues: [
          { value: 'venue_okayama', label: '岡山会場（会場未定）' },
          { value: 'venue_kurashiki', label: '倉敷会場（会場未定）' },
          { value: 'venue_tsuyama', label: '津山会場（会場未定）' },
          { value: 'home', label: '自宅受験（問題冊子郵送・期日内答案返送）' }
        ]
      },
      {
        id: 'chu1_03',
        grade: 'chu1',
        gradeLabel: '中1',
        gradeName: '中1生',
        issueName: '3月号',
        title: '岡山県統一模擬試験（おかもし）',
        badge: '中1対象・予約受付',
        examDate: '2027年3月14日(日)',
        deadline: '2027-03-07T23:59:59+09:00',
        deadlineDisplay: '2027/3/7(日) 23:59',
        price: 5500,
        status: 'open',
        isDefaultChecked: false,
        venues: [
          { value: 'venue_okayama', label: '岡山会場（会場未定）' },
          { value: 'venue_kurashiki', label: '倉敷会場（会場未定）' },
          { value: 'venue_tsuyama', label: '津山会場（会場未定）' },
          { value: 'home', label: '自宅受験（問題冊子郵送・期日内答案返送）' }
        ]
      },
      {
        id: 'sho6_10',
        grade: 'sho6',
        gradeLabel: '小6',
        gradeName: '小6生',
        issueName: '10月号',
        title: '岡山県立中高一貫校 適性検査対策模試',
        badge: '小6対象・受付中',
        examDate: '2026年11月1日(日)',
        deadline: '2026-10-13T23:59:59+09:00',
        deadlineDisplay: '10/13(火) 23:59',
        price: 5500,
        status: 'open',
        isDefaultChecked: false,
        venues: [
          { value: 'venue_okayama', label: '岡山会場（岡山操山中対応・会場未定）' },
          { value: 'venue_kurashiki', label: '倉敷会場（倉敷天城中対応・会場未定）' },
          { value: 'venue_tsuyama', label: '津山会場（津山中対応・会場未定）' },
          { value: 'home', label: '自宅受験（問題冊子郵送・期日内答案返送）' }
        ]
      },
      {
        id: 'sho6_12',
        grade: 'sho6',
        gradeLabel: '小6',
        gradeName: '小6生',
        issueName: '12月号',
        title: '岡山県立中高一貫校 適性検査対策模試',
        badge: '小6対象・予約受付',
        examDate: '2026年12月13日(日)',
        deadline: '2026-12-06T23:59:59+09:00',
        deadlineDisplay: '12/6(日) 23:59',
        price: 5500,
        status: 'open',
        isDefaultChecked: false,
        venues: [
          { value: 'venue_okayama', label: '岡山会場（岡山操山中対応・会場未定）' },
          { value: 'venue_kurashiki', label: '倉敷会場（倉敷天城中対応・会場未定）' },
          { value: 'venue_tsuyama', label: '津山会場（津山中対応・会場未定）' },
          { value: 'home', label: '自宅受験（問題冊子郵送・期日内答案返送）' }
        ]
      }
    ];
    let currentSelectedGrade = null;
    let initialTargetGrade = null; // URLパラメータで指定された初期学年
    let initialTargetMonth = null; // URLパラメータで指定された初期月号（数値: 例 10）
    let _examGuidesCache = null; // microCMS exam-guides キャッシュ
    let selectedExamsState = {}; // { [examId]: { ...exam, venue, venueLabel } }
    // 2. 日時・パラメータパース & 整形ユーティリティ
    /**
     * URLパラメータの学年指定を正規化 ('sho6' | 'chu1' | 'chu2' | 'chu3' | null)
     * 日本語表記（中3, 中２, 中学3年, 小6等）および内部コード（chu3, c3, sho6, p6等）に柔軟対応
     */
    function normalizeGradeParam(param) {
      if (!param) return null;
      try {
        const p = decodeURIComponent(String(param)).trim().toLowerCase();
        if (['chu3', 'c3', '3', '中3', '中３', '中学3年', '中学3年生', '中三'].includes(p) || p.includes('中3') || p.includes('中３') || p.includes('中学3')) {
          return 'chu3';
        }
        if (['chu2', 'c2', '2', '中2', '中２', '中学2年', '中学2年生', '中二'].includes(p) || p.includes('中2') || p.includes('中２') || p.includes('中学2')) {
          return 'chu2';
        }
        if (['chu1', 'c1', '1', '中1', '中１', '中学1年', '中学1年生', '中一'].includes(p) || p.includes('中1') || p.includes('中１') || p.includes('中学1')) {
          return 'chu1';
        }
        if (['sho6', 'p6', 'e6', 's6', '6', '小6', '小６', '小学6年', '小学6年生', '小六'].includes(p) || p.includes('小6') || p.includes('小６') || p.includes('小学6')) {
          return 'sho6';
        }
      } catch (e) {}
      return null;
    }
    /**
     * URLパラメータや模試情報から月号数値をパース (例: "10", "10月号", "10月", 10 -> 10)
     */
    function parseMonthParam(param) {
      if (param === null || param === undefined) return null;
      try {
        const p = decodeURIComponent(String(param)).trim();
        const match = p.match(/(\d+)/);
        if (match) {
          return parseInt(match[1], 10);
        }
      } catch (e) {}
      return null;
    }
    /**
     * 申込締切日時をパースしてタイムスタンプ(ms)を返却
     * ISO文字列、または日本語表記（例: "2026年10月5日(月)", "12月14日(月)", "10/25(日) 23:59"）に対応
     */
    function parseDeadline(deadlineRaw) {
      if (!deadlineRaw || typeof deadlineRaw !== 'string') return null;
      const str = deadlineRaw.trim();
      if (!str) return null;
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        const t = new Date(str).getTime();
        if (!isNaN(t)) return t;
      }
      // 2. 日本語形式 (例: "2026年10月5日(月)", "12月14日(月)", "10/25(日) 23:59")
      const currentYear = new Date().getFullYear();
      let year = currentYear;
      const yearMatch = str.match(/(\d{4})[年\/-]/);
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
      }
      const monthMatch = str.match(/(\d{1,2})[月\/-]/);
      const dayMatch = str.match(/[月\/-](\d{1,2})[日]?/);
      if (monthMatch && dayMatch) {
        const month = parseInt(monthMatch[1], 10);
        const day = parseInt(dayMatch[1], 10);
        if (!yearMatch) {
          const currentMonth = new Date().getMonth() + 1;
          if (currentMonth >= 9 && month <= 3) {
            year = currentYear + 1;
          }
        }
        let hour = 23;
        let minute = 59;
        let second = 59;
        const timeMatch = str.match(/(\d{1,2})[:：](\d{1,2})/);
        if (timeMatch) {
          hour = parseInt(timeMatch[1], 10);
          minute = parseInt(timeMatch[2], 10);
        }
        const d = new Date(year, month - 1, day, hour, minute, second);
        return d.getTime();
      }
      return null;
    }
    /**
     * 申込締切表示テキストを整形（例: "10/25(日) 23:59"）
     */
    function formatDeadlineDisplay(deadlineRaw, parsedTime) {
      const t = parsedTime || parseDeadline(deadlineRaw);
      if (t) {
        const d = new Date(t);
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const m = d.getMonth() + 1;
        const dt = d.getDate();
        const day = days[d.getDay()];
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${m}/${dt}(${day}) ${hh}:${mm}`;
      }
      return deadlineRaw || '締切日時未定';
    }
    /**
     * 模試カード用：申込締切の2行並記表示（クレジットカード ＆ コンビニ）
     */
    function formatCardDeadlineParallel(deadlineRaw, parsedTime) {
      const t = parsedTime || parseDeadline(deadlineRaw);
      if (!t) {
        return '<span class="text-xs sm:text-sm text-slate-500 font-medium">申込締切: 近日公開予定</span>';
      }
      const d = new Date(t);
      const days = ['日', '月', '火', '水', '木', '金', '土'];
      const m = d.getMonth() + 1;
      const dt = d.getDate();
      const day = days[d.getDay()];
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      const cardDeadlineText = `${m}/${dt}(${day}) ${hours}:${mins}`;
      const konbiniDeadlineDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 3, 23, 59, 59, 999);
      const konbiniM = konbiniDeadlineDate.getMonth() + 1;
      const konbiniDt = konbiniDeadlineDate.getDate();
      const konbiniDay = days[konbiniDeadlineDate.getDay()];
      const now = getCurrentDate().getTime();
      const isCardExpired = now > t;
      const isKonbiniExpired = isCardExpired || now > konbiniDeadlineDate.getTime();
      const cardText = isCardExpired
        ? '<span class="text-rose-600 font-bold">受付終了</span>'
        : `<span class="text-slate-900 font-bold">${cardDeadlineText}</span>`;
      const konbiniText = isKonbiniExpired
        ? '<span class="text-rose-600 font-bold">受付終了</span>'
        : `<span class="text-slate-900 font-bold">${konbiniM}/${konbiniDt}(${konbiniDay}) 23:59</span>`;
      return `
        <div class="text-xs sm:text-sm leading-tight text-slate-700 space-y-0.5 pt-0.5">
          <div class="font-bold text-slate-800">申込締切：</div>
          <div class="pl-2 space-y-0.5 font-bold">
            <div class="text-slate-900">・クレジットカード：${cardText}</div>
            <div class="text-slate-900">・コンビニ：${konbiniText}</div>
          </div>
        </div>
      `;
    }
    /**
     * schedules から代表日または実施期間を整形表示
     */
    function formatExamDate(session, fallbackExamDate) {
      if (session && Array.isArray(session.schedules) && session.schedules.length > 0) {
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const venueSch = session.schedules.find(sch => {
          const types = Array.isArray(sch.venue_type) ? sch.venue_type : [sch.venue_type || ''];
          return !types.some(t => t && t.includes('自宅')) && (sch.date_start || sch.date_text);
        }) || session.schedules[0];
        if (venueSch) {
          if (venueSch.date_text) return venueSch.date_text;
          if (venueSch.date_start) {
            const d = new Date(venueSch.date_start);
            if (!isNaN(d.getTime())) {
              const y = d.getFullYear();
              const m = d.getMonth() + 1;
              const dt = d.getDate();
              const day = days[d.getDay()];
              if (venueSch.date_end) {
                const dEnd = new Date(venueSch.date_end);
                if (!isNaN(dEnd.getTime()) && (dEnd.getDate() !== dt || dEnd.getMonth() !== d.getMonth())) {
                  const mEnd = dEnd.getMonth() + 1;
                  const dtEnd = dEnd.getDate();
                  const dayEnd = days[dEnd.getDay()];
                  return `${y}年${m}/${dt}(${day})〜${mEnd}/${dtEnd}(${dayEnd})`;
                }
              }
              return `${y}年${m}月${dt}日(${day})`;
            }
          }
        }
      }
      return fallbackExamDate || '実施日未定';
    }
    /**
     * 会場ラベル・区分から括弧付き施設名等を除いた短縮区分名（「岡山会場」「倉敷会場」「津山会場」「自宅受験」）を抽出
     */
    function extractVenueTypeShort(rawLabel, rawType) {
      const stripParens = (val) => String(val || '')
        .replace(/^🏠\s*/, '')
        .replace(/[（(][^（）()]*[）)]/g, '')
        .replace(/[（(][^）)]*$/, '')
        .trim();
      const fromType = stripParens(rawType);
      if (fromType && fromType !== '会場') return fromType;
      const fromLabel = stripParens(rawLabel);
      if (fromLabel) return fromLabel;
      const raw = String(rawType || rawLabel || '').trim().toLowerCase();
      if (raw === 'venue_okayama') return '岡山会場';
      if (raw === 'venue_kurashiki') return '倉敷会場';
      if (raw === 'venue_tsuyama') return '津山会場';
      if (raw === 'home') return '自宅受験';
      return '';
    }
    /**
     * D1 の round データ（venuesList または venueDetails）から会場選択肢を動的生成
     * スプレッドシート（venues）に設定された会場名・会場区分を動的に反映
     */
    function buildVenueOptionsFromRound(round, fallbackVenues) {
      const venues = [];
      const rawVenues = (round && (round.venuesList || round.venueDetails)) || [];
      if (Array.isArray(rawVenues) && rawVenues.length > 0) {
        rawVenues.forEach((v, idx) => {
          const typeName = (v.badge || v.name || '').replace(/^🏠\s*/, '').trim();
          const schoolName = (v.school || v.place || '').trim();
          const isHome = typeName.includes('自宅') || schoolName.includes('自宅') || (v.id && String(v.id).includes('home'));
          if (isHome) return; // 自宅受験は末尾に標準フォーマットで追加
          let label = '';
          const venueText = schoolName || '会場未定';
          if (venueText.includes(typeName)) {
            label = venueText;
          } else {
            label = `${typeName}（${venueText}）`;
          }
          let valKey = 'venue_' + idx;
          if (typeName.includes('岡山')) valKey = 'venue_okayama';
          else if (typeName.includes('倉敷')) valKey = 'venue_kurashiki';
          else if (typeName.includes('津山')) valKey = 'venue_tsuyama';
          if (!venues.some(item => item.label === label)) {
            venues.push({
              value: valKey,
              label: label,
              venueType: extractVenueTypeShort(label, typeName)
            });
          }
        });
      }
      venues.push({
        value: 'home',
        label: '自宅受験（問題冊子郵送・期日内答案返送）',
        venueType: '自宅受験'
      });
      if (venues.length === 1 && fallbackVenues && fallbackVenues.length > 0) {
        return fallbackVenues;
      }
      return venues;
    }
    /**
     * schedules から会場名（venue_name）および「自宅受験」を動的選択肢として抽出
     */
    function extractVenuesFromSchedules(session, fallbackVenues) {
      const venues = [];
      if (session && Array.isArray(session.schedules) && session.schedules.length > 0) {
        session.schedules.forEach((sch, sIdx) => {
          const types = Array.isArray(sch.venue_type) ? sch.venue_type : [sch.venue_type || ''];
          const isHome = types.some(t => t && (t.includes('自宅') || t.includes('自宅受験') || t.includes('自宅受検'))) ||
                         (sch.venue_name && sch.venue_name.includes('自宅'));
          if (!isHome) {
            const typeName = types[0] || '会場';
            const rawName = (sch.venue_name || '').trim();
            let label = '';
            const venueText = rawName || '会場未定';
            if (venueText.includes(typeName)) {
              label = venueText;
            } else {
              label = `${typeName}（${venueText}）`;
            }
            let valKey = 'venue_' + sIdx;
            if (typeName.includes('岡山')) valKey = 'venue_okayama';
            else if (typeName.includes('倉敷')) valKey = 'venue_kurashiki';
            else if (typeName.includes('津山')) valKey = 'venue_tsuyama';
            if (!venues.some(v => v.label === label)) {
              venues.push({
                value: valKey,
                label: label,
                venueType: extractVenueTypeShort(label, typeName)
              });
            }
          }
        });
      }
      venues.push({
        value: 'home',
        label: '自宅受験（問題冊子郵送・期日内答案返送）',
        venueType: '自宅受験'
      });
      if (venues.length === 1 && fallbackVenues && fallbackVenues.length > 0) {
        return fallbackVenues;
      }
      return venues;
    }
    function selectFormGrade(gradeKey, targetMonth = null) {
      currentSelectedGrade = gradeKey || null;
      const grades = ['sho6', 'chu1', 'chu2', 'chu3'];
      grades.forEach(g => {
        const btn = document.getElementById('grade-btn-' + g);
        if (!btn) return;
        const title = btn.querySelector('span');
        if (gradeKey && g === gradeKey) {
          btn.className = 'grade-select-btn flex items-center justify-center py-2.5 sm:py-3 px-1 sm:px-2 rounded-lg bg-primary-fixed/50 border-2 border-primary-container ring-2 ring-primary-container/20 cursor-pointer hover:bg-primary-fixed/60 transition-all text-center shadow-xs';
          if (title) title.className = 'font-bold text-sm sm:text-base text-primary-container leading-none';
        } else {
          btn.className = 'grade-select-btn flex items-center justify-center py-2.5 sm:py-3 px-1 sm:px-2 rounded-lg bg-surface-container-low border border-outline-variant/30 cursor-pointer hover:bg-surface-container transition-all text-center';
          if (title) title.className = 'font-bold text-sm sm:text-base text-on-surface leading-none';
        }
      });
      renderExamCards(gradeKey, targetMonth);
      if (typeof updateSchoolInputPlaceholder === 'function') {
        updateSchoolInputPlaceholder(gradeKey);
      }
    }
    // 4. microCMSデータ連動 & 締切フィルタリング & 動的レンダリング
    /**
     * 学年キーに応じた模試一覧を生成（D1/API優先 + フォールバック補完）
     * 1) 選択学年の rounds（または sessions）を抽出
     * 2) 申込締切日時と現在日時をリアルタイム比較（締切を過ぎた模試は自動除外）
     * 3) D1の venuesList / venueDetails から希望会場選択肢を動的生成
     */
    function getAvailableExamsForGrade(gradeKey) {
      const now = getCurrentDate().getTime();
      const gradeLabels = { sho6: '小6', chu1: '中1', chu2: '中2', chu3: '中3' };
      const gradeLabel = gradeLabels[gradeKey] || '中3';
      const gradePrefix = `${gradeLabel}対象`;
      const gradeCodeMap = { chu3: 'c3', chu2: 'c2', chu1: 'c1', sho6: 'p6', c3: 'c3', c2: 'c2', c1: 'c1', p6: 'p6' };
      const targetCode = gradeCodeMap[gradeKey] || 'c3';
      let targetGradeData = null;
      if (_examGuidesCache) {
        if (_examGuidesCache[targetCode]) {
          targetGradeData = _examGuidesCache[targetCode];
        } else if (Array.isArray(_examGuidesCache)) {
          targetGradeData = _examGuidesCache.find(g => {
            if (targetCode && (g.grade_code === targetCode || (targetCode === 'p6' && (g.grade_code === 's6' || g.grade_code === 'e6' || g.grade_code === 'p6')))) {
              return true;
            }
            if (g.grade_name && g.grade_name.includes(gradeLabel)) {
              return true;
            }
            return false;
          });
        }
      }
      const fallbackList = EXAMS_DATABASE.filter(e => e.grade === gradeKey);
      let candidateExams = [];
      let activeIssueStr = '';
      if (targetGradeData) {
        if (targetGradeData.active_issue || targetGradeData.activeIssue) {
          const rawActive = targetGradeData.active_issue || targetGradeData.activeIssue;
          activeIssueStr = Array.isArray(rawActive)
            ? (rawActive[0] || '')
            : String(rawActive);
        } else if (Array.isArray(targetGradeData.rounds)) {
          const activeRound = targetGradeData.rounds.find(r => r.status === 'active');
          if (activeRound) {
            activeIssueStr = (activeRound.monthName || (activeRound.monthNum ? `${activeRound.monthNum}月号` : '')).trim();
          }
        }
      }
      if (targetGradeData && Array.isArray(targetGradeData.rounds) && targetGradeData.rounds.length > 0) {
        targetGradeData.rounds.forEach((r, idx) => {
          let issueName = (r.monthName || `${r.monthNum}月号` || '').trim();
          if (issueName && !issueName.endsWith('号') && /^\d+月$/.test(issueName)) {
            issueName += '号';
          }
          const fallback = fallbackList.find(f => f.issueName && issueName && (f.issueName === issueName || f.issueName.includes(issueName) || issueName.includes(f.issueName)))
            || fallbackList[idx]
            || {};
          const deadlineRaw = r.applyDeadlineRaw || r.deadline || fallback.deadline || '';
          const deadlineTime = parseDeadline(deadlineRaw);
          if (deadlineTime && deadlineTime <= now) {
            return;
          }
          const title = r.title || fallback.title || (gradeKey === 'sho6' ? '岡山県立中高一貫校 適性検査対策模試' : '岡山県統一模擬試験（おかもし）');
          const examDate = (r.venuesList && r.venuesList[0] && r.venuesList[0].date) ? r.venuesList[0].date : (fallback.examDate || '実施日未定');
          const deadlineDisplay = formatDeadlineDisplay(deadlineRaw, deadlineTime);
          const price = typeof r.fee === 'number' && r.fee > 0 ? r.fee : (fallback.price || 5500);
          const venues = buildVenueOptionsFromRound(r, fallback.venues);
          const gradeName = targetGradeData.gradeName || fallback.gradeName || `${gradeLabel}生`;
          candidateExams.push({
            id: r.id || `${gradeKey}_${r.monthNum || idx}`,
            grade: gradeKey,
            gradeLabel: gradeLabel,
            gradeName: gradeName,
            issueName: issueName || fallback.issueName || '',
            title: title,
            examDate: examDate,
            deadline: deadlineRaw,
            applyDeadlineRaw: deadlineRaw,
            deadlineTime: deadlineTime,
            deadlineDisplay: deadlineDisplay,
            price: price,
            status: r.status || 'open',
            venues: venues,
            originalIndex: idx
          });
        });
      } else if (targetGradeData && Array.isArray(targetGradeData.sessions) && targetGradeData.sessions.length > 0) {
        targetGradeData.sessions.forEach((s, idx) => {
          let issueName = (s.issue_name || s.session_label || '').trim();
          if (issueName && !issueName.endsWith('号') && /^\d+月$/.test(issueName)) {
            issueName += '号';
          }
          const fallback = fallbackList.find(f => f.issueName && issueName && (f.issueName === issueName || f.issueName.includes(issueName) || issueName.includes(f.issueName)))
            || fallbackList[idx]
            || {};
          const deadlineRaw = s.deadline || s.application_deadline || s.applicationDeadline || fallback.deadline || '';
          const deadlineTime = parseDeadline(deadlineRaw);
          if (deadlineTime && deadlineTime <= now) {
            return;
          }
          const title = s.title || fallback.title || (gradeKey === 'sho6' ? '岡山県立中高一貫校 適性検査対策模試' : '岡山県統一模擬試験（おかもし）');
          const examDate = formatExamDate(s, fallback.examDate);
          const deadlineDisplay = formatDeadlineDisplay(deadlineRaw, deadlineTime);
          let price = fallback.price || 5500;
          if (s.fee) {
            const parsedFee = parseInt(String(s.fee).replace(/[^0-9]/g, ''), 10);
            if (!isNaN(parsedFee) && parsedFee > 0) price = parsedFee;
          }
          const venues = extractVenuesFromSchedules(s, fallback.venues);
          const gradeName = targetGradeData.grade_name || fallback.gradeName || `${gradeLabel}生`;
          candidateExams.push({
            id: `${gradeKey}_${s.id || issueName || idx}`,
            grade: gradeKey,
            gradeLabel: gradeLabel,
            gradeName: gradeName,
            issueName: issueName || fallback.issueName || '',
            title: title,
            examDate: examDate,
            deadline: deadlineRaw,
            applyDeadlineRaw: deadlineRaw,
            deadlineTime: deadlineTime,
            deadlineDisplay: deadlineDisplay,
            price: price,
            status: 'open',
            venues: venues,
            originalIndex: idx
          });
        });
      } else {
        fallbackList.forEach(fb => {
          const fbDeadlineTime = parseDeadline(fb.deadline);
          if (fb.status !== 'closed' && (!fbDeadlineTime || fbDeadlineTime > now)) {
            candidateExams.push({
              ...fb,
              gradeName: fb.gradeName || `${gradeLabel}生`,
              deadlineTime: fbDeadlineTime
            });
          }
        });
      }
      let activeIndexInCandidates = -1;
      if (activeIssueStr) {
        activeIndexInCandidates = candidateExams.findIndex(e => e.issueName && (e.issueName === activeIssueStr || e.issueName.includes(activeIssueStr) || activeIssueStr.includes(e.issueName)));
      }
      candidateExams = candidateExams.map((exam, index) => {
        let badge = '';
        if (activeIndexInCandidates !== -1) {
          if (index === activeIndexInCandidates || index < activeIndexInCandidates) {
            badge = `${gradePrefix}・受付中`;
          } else {
            badge = `${gradePrefix}・予約受付`;
          }
        } else {
          if (index === 0) {
            badge = `${gradePrefix}・受付中`;
          } else {
            badge = `${gradePrefix}・予約受付`;
          }
        }
        return {
          ...exam,
          badge: badge,
          isDefaultChecked: false // 初期値はすべてチェックを外す
        };
      });
      return candidateExams;
    }
    function renderExamCards(gradeKey, targetMonth = null) {
      const container = document.getElementById('examOptionGroup');
      if (!container) return;
      selectedExamsState = {}; // 初期選択は未選択状態（空）にリセット
      if (!gradeKey) {
        container.innerHTML = `
          <div class="p-6 sm:p-8 rounded-lg bg-surface-container-low border border-outline-variant/30 text-center space-y-2.5">
            <span class="material-symbols-outlined text-3xl sm:text-4xl text-outline">school</span>
            <p class="font-bold text-on-surface text-sm sm:text-base">まず上の学年（小6 / 中1〜中3）を選択してください</p>
            <p class="text-xs sm:text-sm text-on-surface-variant">学年を選択すると、お申し込み可能な模試一覧が表示されます。</p>
          </div>
        `;
        updateSummary();
        return;
      }
      const availableExams = getAvailableExamsForGrade(gradeKey);
      if (availableExams.length === 0) {
        container.innerHTML = `
          <div class="p-6 rounded-lg bg-surface-container-low border border-outline-variant/30 text-center space-y-2">
            <span class="material-symbols-outlined text-3xl text-outline">event_busy</span>
            <p class="font-bold text-on-surface text-sm sm:text-base">現在受付中のお申し込み可能な模試はございません</p>
            <p class="text-xs text-on-surface-variant">次回の実施日程・要項発表まで今しばらくお待ちください。</p>
          </div>
        `;
        updateSummary();
        return;
      }
      let effectiveTargetMonth = null;
      if (targetMonth !== null && targetMonth !== undefined) {
        effectiveTargetMonth = parseMonthParam(targetMonth);
      } else if (typeof initialTargetMonth !== 'undefined' && initialTargetMonth !== null && gradeKey === initialTargetGrade) {
        effectiveTargetMonth = initialTargetMonth;
      }
      container.innerHTML = availableExams.map((exam) => {
        let isChecked = false;
        if (effectiveTargetMonth !== null) {
          const mNum = parseMonthParam(exam.issueName) || (exam.id ? parseMonthParam(exam.id) : null);
          if (mNum === effectiveTargetMonth) {
            isChecked = true;
          }
        }
        if (isChecked) {
          selectedExamsState[exam.id] = {
            ...exam,
            venue: '',
            venueLabel: '',
            venueType: ''
          };
        }
        const venueOptionsHtml = [
          `<option value="" selected disabled class="text-rose-500 font-normal">選択してください</option>`,
          ...(exam.venues || []).map(v => `
            <option value="${v.value}" data-venue-type="${v.venueType || extractVenueTypeShort(v.label, '')}" class="text-slate-900 font-normal">${v.label}</option>
          `)
        ].join('');
        const cardClasses = isChecked
          ? 'relative flex flex-col p-4 sm:p-5 rounded-lg shadow-2xs sm:shadow-sm gap-3.5 transition-all duration-200 bg-primary-fixed/30 border-2 border-primary-container ring-1 ring-primary-container/20'
          : 'relative flex flex-col p-4 sm:p-5 rounded-lg bg-white border border-slate-300 shadow-2xs sm:shadow-sm gap-3.5 transition-all duration-200';
        const badgeGradeClass = isChecked
          ? 'inline-flex items-center justify-center px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-md bg-white text-slate-800 border border-slate-200 font-bold text-base shrink-0 shadow-2xs leading-normal transition-colors'
          : 'inline-flex items-center justify-center px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60 font-bold text-base shrink-0 shadow-2xs leading-normal transition-colors';
        const badgeIssueClass = isChecked
          ? 'inline-flex items-center justify-center px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-md bg-white text-slate-800 border border-slate-200 font-bold text-base shrink-0 shadow-2xs leading-normal transition-colors'
          : 'inline-flex items-center justify-center px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60 font-bold text-base shrink-0 shadow-2xs leading-normal transition-colors';
        const venueWrapperClass = isChecked
          ? 'pt-3 border-t border-outline-variant/20 grid grid-cols-1 md:grid-cols-12 gap-2 items-center'
          : 'pt-3 border-t border-outline-variant/20 grid grid-cols-1 md:grid-cols-12 gap-2 items-center opacity-50 pointer-events-none';
        const venueDisabledAttr = isChecked ? '' : 'disabled';
        const isVenueEmpty = !selectedExamsState[exam.id]?.venue;
        const venueSelectClass = isChecked
          ? (isVenueEmpty
              ? 'absolute inset-0 w-full h-full pl-3 pr-9 rounded-lg font-body-sm text-base appearance-none border shadow-2xs cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary-container text-red-500 bg-red-50 border-red-300'
              : 'absolute inset-0 w-full h-full pl-3 pr-9 rounded-lg font-body-sm text-base appearance-none border shadow-2xs cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary-container text-slate-900 font-medium bg-white border-slate-300')
          : 'absolute inset-0 w-full h-full pl-3 pr-9 rounded-lg font-body-sm text-base appearance-none border shadow-2xs cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary-container text-gray-400 bg-gray-50 border-gray-200';
        const venueArrowClass = isChecked
          ? (isVenueEmpty ? 'text-red-500' : 'text-slate-500')
          : 'text-gray-400';
        const venueDisplayColorClass = isChecked
          ? (isVenueEmpty ? 'text-red-500' : 'text-slate-900 font-medium')
          : 'text-gray-400';
        return `
          <div class="${cardClasses}" id="card-${exam.id}">
            <label class="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" id="check-${exam.id}" name="selected_exams" value="${exam.id}"
                onchange="toggleExamSelection('${exam.id}')"
                ${isChecked ? 'checked' : ''}
                class="mt-1 w-5 h-5 text-primary-container accent-primary-container rounded cursor-pointer shrink-0">
              <div class="flex flex-col gap-2 sm:gap-2.5 flex-1 min-w-0">
                <!-- 上段：バッジと金額（右端1行化） -->
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 sm:gap-2 shrink-0" id="badge-group-${exam.id}">
                    <span id="badge-grade-${exam.id}" class="${badgeGradeClass}">${exam.gradeName}</span>
                    <span id="badge-issue-${exam.id}" class="${badgeIssueClass}">${exam.issueName}</span>
                  </div>
                  <!-- 金額（¥5,500 (税込) を1行化） -->
                  <div class="flex items-baseline gap-1 shrink-0 whitespace-nowrap ml-auto">
                    <span class="font-headline-sm text-lg sm:text-xl font-extrabold text-primary-container">¥${exam.price.toLocaleString()}</span>
                    <span class="font-body-sm text-xs text-on-surface-variant font-bold">(税込)</span>
                  </div>
                </div>
                <!-- 中段：模試タイトル（十分な横幅を確保して1行表示） -->
                <div class="w-full min-w-0">
                  <span class="font-headline-sm text-base sm:text-lg font-bold text-on-surface leading-snug tracking-tight block">${exam.title}</span>
                </div>
                <!-- 下段：申込締切（クレジットカード／コンビニ 2行並記） -->
                <div class="border-t border-slate-100 pt-1.5 mt-0.5">
                  ${formatCardDeadlineParallel(exam.deadline || exam.applyDeadlineRaw, exam.deadlineTime)}
                </div>
              </div>
            </label>
            <!-- 会場・受験形式セレクトボックス（初期状態は無効化・チェックで活性化） -->
            <div class="${venueWrapperClass}" id="venue-wrapper-${exam.id}">
              <label class="md:col-span-4 font-label-md text-xs sm:text-sm font-bold text-primary flex items-center gap-1.5 pl-1" for="venue-${exam.id}">
                <span class="material-symbols-outlined text-base">apartment</span>受験方法・希望会場
                <span class="bg-secondary text-on-secondary font-label-sm text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-1">必須</span>
              </label>
              <div class="md:col-span-8 relative">
                <select id="venue-${exam.id}" ${venueDisabledAttr} required
                  aria-label="受験方法・希望会場"
                  onchange="updateExamVenue('${exam.id}', this)"
                  class="${venueSelectClass}" style="color: transparent;">
                  ${venueOptionsHtml}
                </select>
                <!-- 選択中の会場名表示（ネイティブselectは改行不可・iOSで「...」省略されるため、折り返し可能なラベルで全文表示） -->
                <!-- スマホ時は13px・左右余白を詰めて表示幅を確保（右側は矢印アイコン幅＋余白分のpr-8を確保し文字と被らないようにする） -->
                <span id="venue-display-${exam.id}" aria-hidden="true" class="relative flex items-center min-h-10 sm:min-h-11 py-2 pl-2.5 pr-8 sm:pl-3 sm:pr-9 font-body-sm text-[13px] sm:text-base leading-snug tracking-tight sm:tracking-normal whitespace-normal break-words text-left pointer-events-none ${venueDisplayColorClass}">選択してください</span>
                <span id="venue-arrow-${exam.id}" class="material-symbols-outlined absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 pointer-events-none ${venueArrowClass} text-base transition-colors">expand_more</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
      if (Object.keys(selectedExamsState).length > 0) {
        const examInlineError = document.getElementById('examSelectionInlineError');
        if (examInlineError) examInlineError.classList.add('hidden');
      }
      availableExams.forEach((exam) => {
        const sel = document.getElementById('venue-' + exam.id);
        if (sel) updateVenueSelectStyle(sel);
      });
      updateSummary();
    }
    function toggleExamSelection(examId) {
      const chk = document.getElementById('check-' + examId);
      const card = document.getElementById('card-' + examId);
      const venueSelect = document.getElementById('venue-' + examId);
      const venueWrapper = document.getElementById('venue-wrapper-' + examId);
      const exams = getAvailableExamsForGrade(currentSelectedGrade);
      const examData = exams.find(e => e.id === examId);
      if (!chk || !examData) return;
      if (chk.checked) {
        const venueVal = venueSelect ? venueSelect.value : '';
        const venueOpt = (venueSelect && venueSelect.selectedIndex > 0) ? venueSelect.options[venueSelect.selectedIndex] : null;
        const venueText = venueOpt ? venueOpt.text : '';
        const venueTypeVal = venueOpt ? (venueOpt.getAttribute('data-venue-type') || extractVenueTypeShort(venueText, venueVal)) : '';
        selectedExamsState[examId] = {
          ...examData,
          venue: venueVal,
          venueLabel: venueText,
          venueType: venueTypeVal
        };
        if (card) {
          card.classList.remove('bg-white', 'border-slate-300', 'border-slate-200/80', 'bg-surface-container-lowest', 'border-outline-variant/30');
          card.classList.add('bg-primary-fixed/30', 'border-2', 'border-primary-container', 'ring-1', 'ring-primary-container/20');
        }
        const badgeGrade = document.getElementById('badge-grade-' + examId);
        const badgeIssue = document.getElementById('badge-issue-' + examId);
        if (badgeGrade) {
          badgeGrade.className = 'inline-flex items-center justify-center px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-md bg-white text-slate-800 border border-slate-200 font-bold text-base shrink-0 shadow-2xs leading-normal transition-colors';
        }
        if (badgeIssue) {
          badgeIssue.className = 'inline-flex items-center justify-center px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-md bg-white text-slate-800 border border-slate-200 font-bold text-base shrink-0 shadow-2xs leading-normal transition-colors';
        }
        if (venueWrapper) venueWrapper.classList.remove('opacity-50', 'pointer-events-none');
        if (venueSelect) {
          venueSelect.disabled = false;
          updateVenueSelectStyle(venueSelect);
        }
        const examInlineError = document.getElementById('examSelectionInlineError');
        if (examInlineError) examInlineError.classList.add('hidden');
        if (typeof clearFormError === 'function') clearFormError();
      } else {
        delete selectedExamsState[examId];
        if (card) {
          card.classList.remove('bg-primary-fixed/30', 'border-2', 'border-primary-container', 'ring-1', 'ring-primary-container/20');
          card.classList.add('bg-white', 'border-slate-300');
        }
        const badgeGrade = document.getElementById('badge-grade-' + examId);
        const badgeIssue = document.getElementById('badge-issue-' + examId);
        if (badgeGrade) {
          badgeGrade.className = 'inline-flex items-center justify-center px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60 font-bold text-base shrink-0 shadow-2xs leading-normal transition-colors';
        }
        if (badgeIssue) {
          badgeIssue.className = 'inline-flex items-center justify-center px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60 font-bold text-base shrink-0 shadow-2xs leading-normal transition-colors';
        }
        if (venueWrapper) venueWrapper.classList.add('opacity-50', 'pointer-events-none');
        if (venueSelect) {
          venueSelect.disabled = true;
          updateVenueSelectStyle(venueSelect);
        }
      }
      updateSummary();
    }
    function updateVenueSelectStyle(selectElem) {
      if (!selectElem) return;
      const examId = selectElem.id.replace('venue-', '');
      const chk = document.getElementById('check-' + examId);
      const isExamChecked = chk ? chk.checked : false;
      const isVenueSelected = !!selectElem.value;
      const arrow = selectElem.parentElement ? selectElem.parentElement.querySelector('.material-symbols-outlined') : null;
      selectElem.classList.remove(
        'text-gray-400', 'bg-gray-50', 'border-gray-200',
        'text-red-500', 'bg-red-50', 'border-red-300', 'border-red-400',
        'text-rose-500', 'bg-rose-50/50', 'border-rose-200/80',
        'text-slate-900', 'font-medium', 'bg-white', 'border-slate-200/80', 'border-slate-300'
      );
      if (arrow) {
        arrow.classList.remove('text-gray-400', 'text-red-400', 'text-rose-400', 'text-slate-400', 'text-slate-500', 'text-on-surface-variant');
      }
      const display = document.getElementById('venue-display-' + examId);
      if (display) {
        const opt = selectElem.selectedIndex >= 0 ? selectElem.options[selectElem.selectedIndex] : null;
        display.textContent = opt ? opt.text : '選択してください';
        display.classList.remove('text-gray-400', 'text-red-500', 'text-slate-900', 'font-medium');
        if (!isExamChecked) {
          display.classList.add('text-gray-400');
        } else if (!isVenueSelected) {
          display.classList.add('text-red-500');
        } else {
          display.classList.add('text-slate-900', 'font-medium');
        }
      }
      if (!isExamChecked) {
        selectElem.classList.add('text-gray-400', 'bg-gray-50', 'border-gray-200');
        if (arrow) arrow.classList.add('text-gray-400');
      } else if (!isVenueSelected) {
        // 2. 模試選択中 かつ 会場未選択：警告表示（赤系ハイライト）
        selectElem.classList.add('text-red-500', 'bg-red-50', 'border-red-300');
        if (arrow) arrow.classList.add('text-red-400');
      } else {
        selectElem.classList.add('text-slate-900', 'font-medium', 'bg-white', 'border-slate-300');
        if (arrow) arrow.classList.add('text-slate-500');
      }
    }
    function updateExamVenue(examId, selectElem) {
      updateVenueSelectStyle(selectElem);
      if (selectedExamsState[examId]) {
        const val = selectElem.value;
        const opt = selectElem.selectedIndex > 0 ? selectElem.options[selectElem.selectedIndex] : null;
        const textVal = opt ? opt.text : '';
        selectedExamsState[examId].venue = val;
        selectedExamsState[examId].venueLabel = textVal;
        selectedExamsState[examId].venueType = opt ? (opt.getAttribute('data-venue-type') || extractVenueTypeShort(textVal, val)) : '';
        if (val) {
          selectElem.classList.remove('apply-input-error', '!border-red-500', '!ring-2', '!ring-red-200');
          if (typeof clearFormError === 'function') clearFormError();
        }
        updateSummary();
      }
    }
    // 4. お申し込みサマリー（合計金額・内訳）のリアルタイム更新
    function updateSummary() {
      refreshConvenienceDeadline();
      const selectedList = Object.values(selectedExamsState);
      const totalAmount = selectedList.reduce((sum, item) => sum + item.price, 0);
      const countElem = document.getElementById('summarySelectedCount');
      if (countElem) {
        countElem.textContent = `${selectedList.length}回分選択中`;
      }
      const totalElem = document.getElementById('summaryTotalAmount');
      if (totalElem) {
        totalElem.textContent = '¥' + totalAmount.toLocaleString();
      }
      const listContainer = document.getElementById('summarySelectedList');
      if (listContainer) {
        if (selectedList.length === 0) {
          listContainer.innerHTML = `
            <div class="py-2 text-center text-xs text-secondary font-bold">
              受験する模試を選択してください（未選択）
            </div>
          `;
        } else {
          listContainer.innerHTML = selectedList.map((item, idx) => `
            <div class="flex flex-col gap-1.5 ${idx > 0 ? 'pt-2.5 border-t border-slate-200/60' : ''}">
              <div class="flex items-start justify-between gap-2">
                <span class="font-bold text-emerald-950 text-xs sm:text-[14px] leading-snug">${item.title} (${item.issueName})</span>
                <span class="font-headline-sm text-xs sm:text-[15px] font-bold text-emerald-950 shrink-0">¥${item.price.toLocaleString()}</span>
              </div>
              <div class="flex items-center gap-2 text-slate-600 font-body-sm text-[11px] sm:text-xs">
                ${item.venueLabel ? `
                  <span class="font-medium text-slate-700">形式: ${item.venueLabel}</span>
                ` : `
                  <span class="px-2 py-0.5 rounded bg-secondary/10 text-secondary font-bold">形式: 会場未選択（要選択）</span>
                `}
              </div>
            </div>
          `).join('');
        }
      }
    }
    function getConvenienceDeadline() {
      const KONBINI_DEFAULT_EXPIRES_AFTER_DAYS = 3;
      const now = getCurrentDate();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let expiresAfterDays = KONBINI_DEFAULT_EXPIRES_AFTER_DAYS;
      let isDeadlineDay = false;
      let isClosed = false;
      const selectedExams = Object.values(selectedExamsState || {});
      const deadlines = selectedExams
        .map(exam => exam && exam.deadlineTime)
        .filter(t => typeof t === 'number' && Number.isFinite(t));
      if (deadlines.length > 0) {
        const earliestTime = Math.min(...deadlines);
        const earliestDate = new Date(earliestTime);
        const deadlineDay = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), earliestDate.getDate());
        const konbiniDeadlineDate = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), earliestDate.getDate() - 3, 23, 59, 59, 999);
        if (now.getTime() > konbiniDeadlineDate.getTime()) {
          isClosed = true;
        }
        const diffDays = Math.round((deadlineDay.getTime() - today.getTime()) / 86400000);
        if (diffDays <= 0) isDeadlineDay = true;
        expiresAfterDays = Math.max(1, Math.min(KONBINI_DEFAULT_EXPIRES_AFTER_DAYS, Math.max(1, diffDays - 3)));
      }
      const payBy = new Date(today.getFullYear(), today.getMonth(), today.getDate() + expiresAfterDays);
      const m = payBy.getMonth() + 1;
      const d = payBy.getDate();
      const days = ['日', '月', '火', '水', '木', '金', '土'];
      const w = days[payBy.getDay()];
      return {
        fullText: `${m}月${d}日(${w}) 23:59`,
        dateText: `${m}月${d}日(${w})`,
        shortText: `${m}/${d}(${w})`,
        expiresAfterDays,
        isDeadlineDay,
        isClosed,
        totalDays: expiresAfterDays + 1
      };
    }
    function syncConvenienceAvailability(dl) {
      if (!dl) dl = getConvenienceDeadline();
      const konbiniRadio = document.getElementById('payment-method-konbini-radio') || document.querySelector('input[name="payment_method"][value="convenience_store"]');
      const konbiniLabel = document.getElementById('payment-method-konbini-label') || konbiniRadio?.closest('label');
      const closedNotice = document.getElementById('convenience-closed-notice');
      const deadlineBadge = document.getElementById('convenience-deadline-text');
      if (dl.isClosed) {
        if (konbiniRadio) {
          konbiniRadio.disabled = true;
          if (konbiniRadio.checked) {
            konbiniRadio.checked = false;
            const cardRadio = document.querySelector('input[name="payment_method"][value="credit_card"]');
            if (cardRadio) cardRadio.checked = true;
            updatePaymentMethodSummary('credit_card');
          }
        }
        if (konbiniLabel) {
          konbiniLabel.classList.add('opacity-60', 'cursor-not-allowed', 'bg-slate-100');
          konbiniLabel.classList.remove('hover:bg-surface-container', 'cursor-pointer');
        }
        if (closedNotice) closedNotice.classList.remove('hidden');
        if (deadlineBadge) deadlineBadge.classList.add('hidden');
      } else {
        if (konbiniRadio) {
          konbiniRadio.disabled = false;
        }
        if (konbiniLabel) {
          konbiniLabel.classList.remove('opacity-60', 'cursor-not-allowed', 'bg-slate-100');
          konbiniLabel.classList.add('hover:bg-surface-container', 'cursor-pointer');
        }
        if (closedNotice) closedNotice.classList.add('hidden');
        if (deadlineBadge) deadlineBadge.classList.remove('hidden');
      }
    }
    function refreshConvenienceDeadline() {
      const dl = getConvenienceDeadline();
      syncConvenienceAvailability(dl);
      const badge = document.getElementById('convenience-deadline-text');
      if (badge) {
        badge.textContent = dl.isDeadlineDay
          ? `本日（${dl.shortText}）中にお支払いが必要です`
          : `お申込み完了後${dl.totalDays}日以内（${dl.shortText}まで）にお支払い`;
      }
      const fullElem = document.getElementById('convenienceDeadlineFull');
      if (fullElem) fullElem.textContent = dl.isDeadlineDay ? `本日 ${dl.fullText}` : dl.fullText;
      const summaryNoticeDate = document.getElementById('summaryConvenienceDeadlineDate');
      if (summaryNoticeDate) summaryNoticeDate.textContent = dl.isDeadlineDay ? `本日 ${dl.dateText}` : dl.dateText;
      const agreeText = document.getElementById('agreeConvenienceDeadlineText');
      if (agreeText) agreeText.textContent = dl.isDeadlineDay ? `本日 ${dl.shortText} 中` : `${dl.shortText}まで`;
      const dayNotice = document.getElementById('convenienceDeadlineDayNotice');
      if (dayNotice) dayNotice.classList.toggle('hidden', !dl.isDeadlineDay);
      return dl;
    }
    function updatePaymentMethodSummary(method) {
      const elem = document.getElementById('summaryPaymentMethod');
      const warningPanel = document.getElementById('convenienceWarningPanel');
      const submitWarning = document.getElementById('convenienceSubmitWarning');
      const fullElem = document.getElementById('convenienceDeadlineFull');
      const dateElem = document.getElementById('convenienceDeadlineDate');
      const deadlineBadge = document.getElementById('convenience-deadline-text');
      const summaryNotice = document.getElementById('summaryConvenienceNotice');
      const summaryNoticeDate = document.getElementById('summaryConvenienceDeadlineDate');
      const convAgreeContainer = document.getElementById('convenienceAgreeContainer');
      const convAgreeInput = document.getElementById('agreeConvenienceTerms');
      const convAgreeDeadlineText = document.getElementById('agreeConvenienceDeadlineText');
      const dl = refreshConvenienceDeadline();
      if (method === 'credit_card') {
        if (elem) {
          elem.innerHTML = `
            <div class="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-800">
              <span class="material-symbols-outlined text-base text-slate-600">credit_card</span>
              <span>クレジットカード決済（Stripe）</span>
            </div>
          `;
        }
        if (warningPanel) warningPanel.classList.add('hidden');
        if (submitWarning) submitWarning.classList.add('hidden');
        if (summaryNotice) summaryNotice.classList.add('hidden');
        if (convAgreeContainer) convAgreeContainer.classList.add('hidden');
        if (convAgreeInput) {
          convAgreeInput.required = false;
          convAgreeInput.checked = false;
        }
      } else if (method === 'convenience_store') {
        if (elem) {
          elem.innerHTML = `
            <div class="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-800">
              <span class="material-symbols-outlined text-base text-slate-600">storefront</span>
              <span>コンビニ決済（決済番号発行）</span>
            </div>
          `;
        }
        if (dateElem) dateElem.textContent = dl.dateText;
        if (warningPanel) warningPanel.classList.remove('hidden');
        if (submitWarning) submitWarning.classList.remove('hidden');
        if (summaryNotice) summaryNotice.classList.remove('hidden');
        if (convAgreeContainer) convAgreeContainer.classList.remove('hidden');
        if (convAgreeInput) convAgreeInput.required = true;
      } else {
        if (elem) {
          elem.innerHTML = `
            <span class="text-xs sm:text-sm font-medium text-amber-700">お支払い方法を選択してください（未選択）</span>
          `;
        }
        if (warningPanel) warningPanel.classList.add('hidden');
        if (submitWarning) submitWarning.classList.add('hidden');
        if (summaryNotice) summaryNotice.classList.add('hidden');
        if (convAgreeContainer) convAgreeContainer.classList.add('hidden');
        if (convAgreeInput) {
          convAgreeInput.required = false;
          convAgreeInput.checked = false;
        }
      }
      updateSubmitButtonState();
    }
    function updateRemarksCounter() {
      const elem = document.getElementById('remarks');
      const countElem = document.getElementById('remarksCounter');
      if (elem && countElem) {
        const len = elem.value.length;
        countElem.textContent = len > 0 ? `${len} / 300文字` : '最大300文字';
      }
    }
    function updateSubmitButtonState() {
      if (typeof isSubmitting !== 'undefined' && isSubmitting) return; // 送信処理中は状態を上書きしない
      const submitBtn = document.getElementById('submitApplyBtn');
      const noticeText = document.getElementById('agreementNoticeText');
      if (!submitBtn) return;
      const agreeTerms = document.getElementById('agreeTerms');
      const convAgreeInput = document.getElementById('agreeConvenienceTerms');
      const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value || null;
      const isTermsAgreed = !!agreeTerms?.checked;
      const isConvRequired = (paymentMethod === 'convenience_store');
      const isConvAgreed = !isConvRequired || !!convAgreeInput?.checked;
      const canSubmit = isTermsAgreed && isConvAgreed;
      if (canSubmit) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('bg-slate-300', 'text-slate-500', 'cursor-not-allowed', 'shadow-none', 'hover:bg-slate-300');
        submitBtn.classList.add('bg-orange-600', 'hover:bg-orange-700', 'text-white', 'shadow-md', 'shadow-orange-700/25', 'hover:shadow-lg', 'hover:shadow-orange-700/35', 'cursor-pointer');
        submitBtn.removeAttribute('title');
        if (noticeText) noticeText.classList.add('hidden');
      } else {
        submitBtn.disabled = true;
        submitBtn.classList.remove('bg-orange-600', 'hover:bg-orange-700', 'text-white', 'shadow-md', 'shadow-orange-700/25', 'hover:shadow-lg', 'hover:shadow-orange-700/35', 'cursor-pointer');
        submitBtn.classList.add('bg-slate-300', 'text-slate-500', 'cursor-not-allowed', 'shadow-none', 'hover:bg-slate-300');
        if (noticeText) {
          noticeText.classList.remove('hidden');
          if (!isTermsAgreed && isConvRequired && !isConvAgreed) {
            noticeText.textContent = '※ お支払いへ進むには、上記の規約およびコンビニ決済期限への同意が必要です';
          } else if (!isTermsAgreed) {
            noticeText.textContent = '※ お支払いへ進むには、上記の規約・個人情報の取扱いに同意してください';
          } else if (isConvRequired && !isConvAgreed) {
            noticeText.textContent = '※ お支払いへ進むには、コンビニ決済期限および自動キャンセルへの確認が必要です';
          }
        }
        if (!isTermsAgreed) {
          submitBtn.title = '「個人情報の取扱い」および「特定商取引法に基づく表記」への同意が必要です';
        } else if (!isConvAgreed) {
          submitBtn.title = 'コンビニ決済期限および自動キャンセルについての確認・同意が必要です';
        }
      }
    }
    function initAgreementListeners() {
      const agreeTerms = document.getElementById('agreeTerms');
      const convAgreeInput = document.getElementById('agreeConvenienceTerms');
      const submitBtnWrapper = document.getElementById('submitApplyBtnWrapper');
      if (agreeTerms) {
        agreeTerms.addEventListener('change', function() {
          updateSubmitButtonState();
          if (this.checked) {
            const formError = document.getElementById('formErrorMessage');
            const formErrorText = document.getElementById('formErrorMessageText');
            if (formError && !formError.classList.contains('hidden') && formErrorText?.textContent?.includes('同意')) {
              formError.classList.add('hidden');
            }
            this.closest('label')?.classList.remove('ring-2', 'ring-red-400', 'rounded');
          }
        });
      }
      if (convAgreeInput) {
        convAgreeInput.addEventListener('change', function() {
          updateSubmitButtonState();
          if (this.checked) {
            const formError = document.getElementById('formErrorMessage');
            const formErrorText = document.getElementById('formErrorMessageText');
            if (formError && !formError.classList.contains('hidden') && formErrorText?.textContent?.includes('コンビニ決済期限')) {
              formError.classList.add('hidden');
            }
            this.closest('label')?.classList.remove('ring-2', 'ring-red-400', 'rounded');
          }
        });
      }
      if (submitBtnWrapper) {
        submitBtnWrapper.addEventListener('click', function(e) {
          const submitBtn = document.getElementById('submitApplyBtn');
          if (submitBtn && submitBtn.disabled) {
            e.preventDefault();
            e.stopPropagation();
            const agreeTerms = document.getElementById('agreeTerms');
            const convAgreeInput = document.getElementById('agreeConvenienceTerms');
            const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value || null;
            if (!agreeTerms?.checked) {
              const target = agreeTerms;
              const container = target ? target.closest('label') : null;
              showFormError('「個人情報の取扱い」および「特定商取引法に基づく表記」への同意が必要です。', target, container);
              if (target) target.focus();
            } else if (paymentMethod === 'convenience_store' && !convAgreeInput?.checked) {
              const target = convAgreeInput;
              const container = target ? target.closest('label') : null;
              showFormError('コンビニ決済期限および自動キャンセルについての確認・同意が必要です。', target, container);
              if (target) target.focus();
            }
          }
        });
      }
      updateSubmitButtonState();
    }
    function normalizeToHalfWidth(str) {
      if (!str) return '';
      return String(str)
        .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/[Ａ-Ｚａ-ｚ]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/[　]/g, ' ')
        .replace(/[ー―‐‑‒–—ｰ−─━〜～－˗֊⁃⁻₋﹘﹣]/g, '-')
        .trim();
    }
    function normalizeToFullWidthKana(str) {
      if (!str) return '';
      return String(str)
        .replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60))
        .trim();
    }
    const KANJI_VARIANT_MAP = {
      '髙': '高',
      '﨑': '崎',
      '﨑': '崎',
      '德': '徳',
      '濵': '浜',
      '濱': '浜',
      '齊': '斉',
      '齋': '斉',
      '澁': '渋',
      '廣': '広',
      '瀨': '瀬',
      '邊': '辺',
      '邉': '辺',
      '羽': '羽',
      '塚': '塚',
      '塚': '塚',
      '黑': '黒',
      '祥': '祥',
      '福': '福',
      '靖': '靖',
      '淸': '清',
      '益': '益',
      '禮': '礼',
      '神': '神',
      '祐': '祐',
      '礼': '礼',
      '祉': '祉',
      '祖': '祖',
      '祝': '祝',
      '眞': '真',
      '槇': '槙',
      '瑤': '瑶',
      '榮': '栄',
      '龍': '竜',
      '藪': '薮',
      '嶋': '島',
      '峯': '峰',
      '條': '条',
      '莊': '荘',
      '壽': '寿',
      '亙': '亘',
      '惠': '恵',
      '恆': '恒',
      '晋': '晋',
      '裵': '裴'
    };
    function replaceKanjiVariants(str) {
      if (!str) return '';
      return String(str).split('').map(char => KANJI_VARIANT_MAP[char] || char).join('');
    }
    // 5. 郵便番号 → 住所自動入力（自社エッジAPI /api/address・Cloudflare D1）
    const ADDRESS_API_TIMEOUT_MS = 4000;
    const addressCache = new Map();
    let addressAbortController = null;
    let lastSearchedZip = '';
    let _postalSuccessTimer = null;
    const DEFAULT_ADDR2_PLACEHOLDER = '例: 1丁目5-1 または 1-5-1';
    const DEFAULT_ADDR2_HINT = '※ 町名より後の丁目・番地・号をご入力ください（町名が重複しても自動で整理されます）。';
    let lastFoundAddress = null;

    function normalizeCompactText(str) {
      return String(str || '')
        .normalize('NFKC')
        .replace(/[\s\u3000]+/g, '')
        .trim();
    }

    function stripPrefCityPrefix(raw, pref = '', city = '') {
      let s = String(raw || '').trim();
      if (!s) return '';
      const cleanPref = String(pref || '').trim();
      if (cleanPref && s.startsWith(cleanPref)) {
        const rest = s.slice(cleanPref.length).replace(/^[\s\u3000]+/, '');
        if (rest.replace(/[\s\u3000]+/g, '')) {
          s = rest;
        }
      }
      const cleanCity = String(city || '').trim();
      if (cleanCity) {
        if (s.startsWith(cleanCity)) {
          const rest = s.slice(cleanCity.length).replace(/^[\s\u3000]+/, '');
          if (rest.replace(/[\s\u3000]+/g, '')) {
            s = rest;
          }
        } else {
          const subMatch = cleanCity.match(/^(.+郡)(.+[町村])$/) || cleanCity.match(/^(.+市)(.+区)$/);
          if (subMatch && subMatch[2] && s.startsWith(subMatch[2])) {
            const rest = s.slice(subMatch[2].length).replace(/^[\s\u3000]+/, '');
            if (rest.replace(/[\s\u3000]+/g, '')) {
              s = rest;
            }
          }
        }
      }
      return s.trim();
    }

    function findDuplicateTownSuffix(town, street) {
      const cleanTown = String(town || '').trim();
      const cleanStreet = String(street || '').trim();
      const lenTown = cleanTown.length;
      if (lenTown < 3 || !cleanStreet) return '';
      for (let len = lenTown - 1; len >= 2; len--) {
        const suffix = cleanTown.slice(lenTown - len);
        if (/[0-9０-９]/.test(suffix)) continue;
        if (cleanStreet.startsWith(suffix)) {
          const after = cleanStreet.slice(suffix.length);
          if (/^(?:[\s\u3000]+)?[0-9０-９〇一二三四五六七八九十]/.test(after)) {
            return suffix;
          }
        }
      }
      return '';
    }

    function dedupeSingleAddressLine(rawAddr1, pref = '', city = '') {
      let s = stripPrefCityPrefix(String(rawAddr1 || '').trim(), pref, city);
      if (!s) return '';
      for (let i = 0; i < 4; i++) {
        const m = s.match(/^([^\s\u3000]+)[\s\u3000]+(.+)$/);
        if (!m) break;
        const head = stripPrefCityPrefix(m[1].trim(), pref, city);
        const tail = stripPrefCityPrefix(m[2].trim(), pref, city);
        if (head && !/[0-9０-９]/.test(head)) {
          if (tail.startsWith(head)) {
            s = tail;
            continue;
          }
          const dupSuffix = findDuplicateTownSuffix(head, tail);
          if (dupSuffix) {
            const rest = tail.slice(dupSuffix.length).replace(/^[\s\u3000]+/, '');
            s = rest ? `${head} ${rest}` : head;
            break;
          }
        }
        const normalizedPair = `${head} ${tail}`.trim();
        if (normalizedPair !== s) {
          s = normalizedPair;
          break;
        }
        break;
      }
      return s.trim();
    }

    function stripTownPrefixFromStreet(rawStreet, town = '', pref = '', city = '') {
      let s = stripPrefCityPrefix(String(rawStreet || '').trim(), pref, city);
      s = dedupeSingleAddressLine(s, pref, city);
      const cleanTown = stripPrefCityPrefix(String(town || '').trim(), pref, city);
      if (!cleanTown || !s) return s;
      if (s.startsWith(cleanTown)) {
        const rest = s.slice(cleanTown.length).replace(/^[\s\u3000]+/, '').trim();
        if (rest) {
          return dedupeSingleAddressLine(rest, pref, city);
        }
      }
      const dupSuffix = findDuplicateTownSuffix(cleanTown, s);
      if (dupSuffix) {
        const rest = s.slice(dupSuffix.length).replace(/^[\s\u3000]+/, '').trim();
        if (rest) {
          return dedupeSingleAddressLine(rest, pref, city);
        }
      }
      return s;
    }

    function combineTownAndStreet(pref, city, town, street) {
      const cleanTown = stripPrefCityPrefix(String(town || '').trim(), pref, city);
      const cleanStreet = stripPrefCityPrefix(String(street || '').trim(), pref, city);
      if (!cleanTown) return dedupeSingleAddressLine(cleanStreet, pref, city);
      if (!cleanStreet) return dedupeSingleAddressLine(cleanTown, pref, city);
      if (cleanStreet.startsWith(cleanTown)) {
        return dedupeSingleAddressLine(cleanStreet, pref, city);
      }
      const dupSuffix = findDuplicateTownSuffix(cleanTown, cleanStreet);
      if (dupSuffix) {
        const rest = cleanStreet.slice(dupSuffix.length).replace(/^[\s\u3000]+/, '');
        return rest ? `${cleanTown} ${rest}` : cleanTown;
      }
      return dedupeSingleAddressLine(`${cleanTown} ${cleanStreet}`, pref, city);
    }

    function extractAddressPartsFromLine1(prefInput, addressLine1) {
      let raw1 = String(addressLine1 || '').trim();
      if (lastFoundAddress) {
        const expectedFull = `${lastFoundAddress.prefecture || ''}${lastFoundAddress.city || ''}${lastFoundAddress.town || ''}`;
        if (expectedFull && normalizeCompactText(raw1) === normalizeCompactText(expectedFull)) {
          return {
            pref: lastFoundAddress.prefecture || String(prefInput || '').trim() || '岡山県',
            city: lastFoundAddress.city || '',
            town: lastFoundAddress.town || '',
          };
        }
      }
      let pref = '';
      const prefMatch = raw1.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/);
      if (prefMatch) {
        pref = prefMatch[1];
        raw1 = raw1.slice(pref.length).trim();
      } else if (prefInput) {
        pref = String(prefInput).trim();
        if (raw1.startsWith(pref)) {
          raw1 = raw1.slice(pref.length).trim();
        }
      }
      if (!pref) pref = '岡山県';
      let city = '';
      let town = '';
      const countyMatch = raw1.match(/^([^0-9]+?郡[^0-9]+?[町村])(.*)$/);
      const ordinanceCityMatch = raw1.match(/^([^0-9]+?市[^0-9]+?区)(.*)$/);
      const generalMatch = raw1.match(/^([^0-9]+?[市区町村])(.*)$/);
      if (countyMatch) {
        city = countyMatch[1].trim();
        town = countyMatch[2].trim();
      } else if (ordinanceCityMatch) {
        city = ordinanceCityMatch[1].trim();
        town = ordinanceCityMatch[2].trim();
      } else if (generalMatch) {
        city = generalMatch[1].trim();
        town = generalMatch[2].trim();
      } else {
        city = raw1;
        town = '';
      }
      return { pref, city, town };
    }

    function updateAddressLine2Guidance(town = '', customMessage = null) {
      const addr2Input = document.getElementById('addressLine2');
      const hintElem = document.getElementById('addressLine2Hint');
      const cleanTown = String(town || '').trim();
      if (addr2Input) {
        if (cleanTown) {
          addr2Input.placeholder =
            cleanTown.length <= 5
              ? `例: 1丁目5-1（${cleanTown}の後の番地）`
              : '例: 1丁目5-1（町名の後の番地）';
        } else {
          addr2Input.placeholder = DEFAULT_ADDR2_PLACEHOLDER;
        }
      }
      if (hintElem) {
        if (customMessage) {
          hintElem.textContent = customMessage;
          hintElem.className = 'text-[11px] sm:text-xs font-medium text-emerald-800';
        } else if (cleanTown) {
          hintElem.textContent = `「${cleanTown}」は上の欄に入力済みです。その後の丁目・番地・号からご入力ください。`;
          hintElem.className = 'text-[11px] sm:text-xs font-medium text-emerald-800';
        } else {
          hintElem.textContent = DEFAULT_ADDR2_HINT;
          hintElem.className = 'text-[11px] sm:text-xs text-slate-500';
        }
      }
    }

    function cleanAddressLine2Input(showNotice = true) {
      const addr2Input = document.getElementById('addressLine2');
      const addr1Input = document.getElementById('addressLine1');
      const prefElem = document.getElementById('prefecture');
      if (!addr2Input) return false;
      const before = addr2Input.value;
      const parts = extractAddressPartsFromLine1(prefElem?.value || '', addr1Input?.value || '');
      const cleaned = stripTownPrefixFromStreet(before, parts.town, parts.pref, parts.city);
      if (cleaned !== before.trim()) {
        addr2Input.value = cleaned;
        if (showNotice) {
          updateAddressLine2Guidance(
            parts.town,
            parts.town
              ? `※ 上の欄と重複していた「${parts.town}」・地域名を自動で整理しました。`
              : '※ 重複していた地域名・町名を自動で整理しました。'
          );
        }
        return true;
      }
      return false;
    }

    function initAddressLine2Guard() {
      const addr2Input = document.getElementById('addressLine2');
      const addr1Input = document.getElementById('addressLine1');
      if (!addr2Input) return;
      addr2Input.addEventListener('blur', function() {
        if (isRestoringProfile || isClearingProfile) return;
        cleanAddressLine2Input(true);
      });
      if (addr1Input) {
        addr1Input.addEventListener('input', function() {
          if (isRestoringProfile || isClearingProfile) return;
          if (lastFoundAddress) {
            const expectedFull = `${lastFoundAddress.prefecture || ''}${lastFoundAddress.city || ''}${lastFoundAddress.town || ''}`;
            if (normalizeCompactText(this.value) !== normalizeCompactText(expectedFull)) {
              const parts = extractAddressPartsFromLine1(document.getElementById('prefecture')?.value || '', this.value);
              updateAddressLine2Guidance(parts.town);
            } else {
              updateAddressLine2Guidance(lastFoundAddress.town);
            }
          }
        });
      }
    }
    function normalizeZipCode(raw) {
      if (!raw) return '';
      return String(raw)
        .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/[^\d]/g, '')
        .slice(0, 7);
    }
    function showPostalMessage(text, isError = true) {
      if (_postalSuccessTimer) {
        clearTimeout(_postalSuccessTimer);
        _postalSuccessTimer = null;
      }
      const msgElem = document.getElementById('postalMsg');
      const zipInput = document.getElementById('postalCode');
      if (zipInput) {
        if (isError) {
          zipInput.classList.add('apply-input-error', '!border-red-500', '!ring-2', '!ring-red-200');
        } else {
          zipInput.classList.remove('apply-input-error', '!border-red-500', '!ring-2', '!ring-red-200');
        }
      }
      if (!msgElem) return;
      msgElem.textContent = text;
      msgElem.className = `text-xs font-bold mt-1.5 ${isError ? 'text-rose-600' : 'text-emerald-700'}`;
      msgElem.classList.remove('hidden');
    }
    function clearPostalMessage() {
      if (_postalSuccessTimer) {
        clearTimeout(_postalSuccessTimer);
        _postalSuccessTimer = null;
      }
      const msgElem = document.getElementById('postalMsg');
      const zipInput = document.getElementById('postalCode');
      if (zipInput) {
        zipInput.classList.remove('apply-input-error', '!border-red-500', '!ring-2', '!ring-red-200');
      }
      if (!msgElem) return;
      msgElem.textContent = '';
      msgElem.classList.add('hidden');
    }
    async function fetchAddress(zip7, signal) {
      if (addressCache.has(zip7)) return addressCache.get(zip7);
      const res = await fetch(`/api/address?zip=${zip7}`, { signal, headers: { Accept: 'application/json' } });
      if (res.status === 404 || res.status === 400) {
        addressCache.set(zip7, null);
        return null;
      }
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      const data = await res.json();
      if (!data || data.error || (!data.prefecture && !data.city)) {
        addressCache.set(zip7, null);
        return null;
      }
      addressCache.set(zip7, data);
      return data;
    }
    function smoothScrollToPostalSection() {
      const zipInput = document.getElementById('postalCode');
      if (!zipInput) return;
      const container = zipInput.closest('.flex.flex-col') || zipInput;
      const header = document.querySelector('header');
      const headerHeight = header ? header.offsetHeight : (window.innerWidth < 640 ? 64 : 72);
      const topPadding = 14; // ヘッダー下の適度な余白
      const rect = container.getBoundingClientRect();
      const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const targetScrollTop = Math.max(0, currentScrollTop + rect.top - headerHeight - topPadding);
      if (Math.abs(currentScrollTop - targetScrollTop) > 15) {
        window.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth'
        });
      }
    }
    function applyAddressResult(zipInput, cleanZip, data, isManualTrigger = false) {
      const prefSelect = document.getElementById('prefecture');
      const addr1Input = document.getElementById('addressLine1');
      const addr2Input = document.getElementById('addressLine2');
      zipInput.value = cleanZip;
      lastSearchedZip = cleanZip;
      lastFoundAddress = {
        prefecture: data.prefecture || '',
        city: data.city || '',
        town: data.town || '',
      };
      addr1Input.value = `${data.prefecture || ''}${data.city || ''}${data.town || ''}`;
      addr1Input.dispatchEvent(new Event('input', { bubbles: true }));
      if (prefSelect) prefSelect.value = data.prefecture || '';
      updateAddressLine2Guidance(lastFoundAddress.town);
      if (addr2Input && addr2Input.value.trim()) {
        cleanAddressLine2Input(false);
      }
      addr1Input.classList.remove('animate-address-filled');
      void addr1Input.offsetWidth; // Reflowをトリガーしてアニメーションをリセット
      addr1Input.classList.add('animate-address-filled');
      setTimeout(() => {
        addr1Input.classList.remove('animate-address-filled');
      }, 2300);
      // 2. 「丁目・番地・号」入力欄へのフォーカス
      if (!isRestoringProfile && addr2Input) {
        setTimeout(() => {
          addr2Input.focus();
          if (typeof addr2Input.setSelectionRange === 'function' && addr2Input.value) {
            addr2Input.setSelectionRange(addr2Input.value.length, addr2Input.value.length);
          }
        }, 50);
        addr2Input.classList.remove('animate-address-next');
        void addr2Input.offsetWidth;
        addr2Input.classList.add('animate-address-next');
        setTimeout(() => {
          addr2Input.classList.remove('animate-address-next');
        }, 1800);
      }
      showPostalMessage('✓ 住所を自動入力しました。続けて「丁目・番地・号」をご入力ください', false);
      _postalSuccessTimer = setTimeout(() => {
        clearPostalMessage();
      }, 5000);
    }
    async function searchAddressByPostalCode(isManualTrigger = false) {
      if (isRestoringProfile) return;
      const zipInput = document.getElementById('postalCode');
      const prefSelect = document.getElementById('prefecture');
      const addr1Input = document.getElementById('addressLine1');
      if (!zipInput || !prefSelect || !addr1Input) return;
      const cleanZip = normalizeZipCode(zipInput.value);
      if (zipInput.value !== cleanZip) {
        zipInput.value = cleanZip;
      }
      if (cleanZip.length !== 7) {
        if (isManualTrigger || cleanZip.length > 0) {
          showPostalMessage(`郵便番号は7桁で入力してください（現在${cleanZip.length}桁です）`, true);
        }
        return;
      }
      if (!isManualTrigger && cleanZip === lastSearchedZip && addressCache.has(cleanZip)) {
        const cached = addressCache.get(cleanZip);
        if (!cached || (!cached.prefecture && !cached.city)) {
          showPostalMessage('該当する住所が見つかりません。郵便番号にお間違いがないかご確認ください', true);
        }
        return;
      }
      if (addressCache.has(cleanZip)) {
        const cached = addressCache.get(cleanZip);
        if (cached && (cached.prefecture || cached.city)) {
          applyAddressResult(zipInput, cleanZip, cached, isManualTrigger);
        } else {
          lastSearchedZip = cleanZip;
          showPostalMessage('該当する住所が見つかりません。郵便番号にお間違いがないかご確認ください', true);
        }
        return;
      }
      if (addressAbortController) addressAbortController.abort();
      const controller = new AbortController();
      addressAbortController = controller;
      const timeoutId = setTimeout(() => controller.abort(), ADDRESS_API_TIMEOUT_MS);
      clearPostalMessage();
      try {
        const data = await fetchAddress(cleanZip, controller.signal);
        if (normalizeZipCode(zipInput.value) !== cleanZip) return;
        if (data && (data.prefecture || data.city)) {
          applyAddressResult(zipInput, cleanZip, data, isManualTrigger);
        } else {
          addressCache.set(cleanZip, null);
          lastSearchedZip = cleanZip;
          showPostalMessage('該当する住所が見つかりません。郵便番号にお間違いがないかご確認ください', true);
        }
      } catch (err) {
        if (addressAbortController !== controller) return; // 新しいリクエストに置き換わった
        console.error('Postal code search failed:', err);
        showPostalMessage('住所の取得に失敗しました。お手数ですが直接ご入力ください。', true);
      } finally {
        clearTimeout(timeoutId);
        if (addressAbortController === controller) {
          addressAbortController = null;
        }
      }
    }
    function initPostalCodeAutoSearch() {
      const zipInput = document.getElementById('postalCode');
      if (!zipInput) return;
      zipInput.addEventListener('focus', function() {
        if (isRestoringProfile) return;
        setTimeout(smoothScrollToPostalSection, 50);
        setTimeout(smoothScrollToPostalSection, 260);
      });
      const handleZipInput = function(e) {
        if (isRestoringProfile) return;
        if (e && e.isComposing) return;
        const clean = normalizeZipCode(zipInput.value);
        if (zipInput.value !== clean) {
          zipInput.value = clean;
        }
        if (clean.length === 7) {
          searchAddressByPostalCode(false);
        } else {
          lastSearchedZip = '';
          lastFoundAddress = null;
          updateAddressLine2Guidance('');
          if (addressAbortController) {
            addressAbortController.abort();
            addressAbortController = null;
          }
          clearPostalMessage();
        }
      };
      zipInput.addEventListener('input', handleZipInput);
      zipInput.addEventListener('compositionend', handleZipInput);
      zipInput.addEventListener('blur', function() {
        if (isRestoringProfile || isClearingProfile) return;
        const clean = normalizeZipCode(this.value);
        if (this.value !== clean) {
          this.value = clean;
        }
        if (clean.length > 0 && clean.length < 7) {
          showPostalMessage(`郵便番号は7桁で入力してください（現在${clean.length}桁です）`, true);
        }
      });
      zipInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchAddressByPostalCode(true);
        }
      });
    }
    window.searchAddressByPostalCode = searchAddressByPostalCode;
    window.fillMockAddress = () => searchAddressByPostalCode(true);
    const SCHOOL_SUGGEST_DEBOUNCE_MS = 80;
    const schoolSuggestCache = new Map();
    let schoolSuggestAbortController = null;
    let schoolSuggestTimer = null;
    let currentHighlightedIndex = -1;
    let currentSuggestions = [];
    let isNationalSchoolSearch = false; // 初期選択: 岡山県内
    const SCHOOL_SCOPE_ACTIVE_CLASS = 'px-2.5 sm:px-3 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer bg-emerald-100/90 text-emerald-900 border border-emerald-400/70 shadow-2xs font-bold text-xs';
    const SCHOOL_SCOPE_INACTIVE_CLASS = 'px-2.5 sm:px-3 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-medium text-xs border border-transparent';
    function escapeSuggestHtml(str) {
      return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function getSchoolTypeParam(gradeKey) {
      if (gradeKey === 'sho6') return 'elementary';
      if (gradeKey && gradeKey.startsWith('chu')) return 'junior';
      return '';
    }
    function updateSchoolScopeButtonsUI(isNational) {
      const prefBtn = document.getElementById('schoolScopePrefBtn');
      const allBtn = document.getElementById('schoolScopeAllBtn');
      if (!prefBtn || !allBtn) return;
      if (!isNational) {
        prefBtn.className = SCHOOL_SCOPE_ACTIVE_CLASS;
        prefBtn.setAttribute('aria-selected', 'true');
        prefBtn.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0"></span><span>岡山県内</span>';
        allBtn.className = SCHOOL_SCOPE_INACTIVE_CLASS;
        allBtn.setAttribute('aria-selected', 'false');
        allBtn.innerHTML = '<span>県外・全国</span>';
      } else {
        prefBtn.className = SCHOOL_SCOPE_INACTIVE_CLASS;
        prefBtn.setAttribute('aria-selected', 'false');
        prefBtn.innerHTML = '<span>岡山県内</span>';
        allBtn.className = SCHOOL_SCOPE_ACTIVE_CLASS;
        allBtn.setAttribute('aria-selected', 'true');
        allBtn.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0"></span><span>県外・全国</span>';
      }
    }
    async function setSchoolSearchScope(isNational, shouldFocus = true) {
      isNationalSchoolSearch = isNational;
      updateSchoolScopeButtonsUI(isNational);
      const input = document.getElementById('currentSchool');
      if (!input) return;
      if (shouldFocus) {
        input.focus();
      }
      if (!isRestoringProfile) {
        saveProfileToStorage();
      }
      const val = input.value.trim();
      if (val.length > 0 && shouldFocus) {
        await executeSchoolSearch(val, currentSelectedGrade, isNational, true);
      }
    }
    async function executeSchoolSearch(query, gradeKey, isNational, forceRefresh = false) {
      clearTimeout(schoolSuggestTimer);
      const type = getSchoolTypeParam(gradeKey);
      const scopeKey = isNational ? 'all' : 'okayama';
      const cacheKey = `${type}|${scopeKey}|${query}`;
      if (!forceRefresh && schoolSuggestCache.has(cacheKey)) {
        const cached = schoolSuggestCache.get(cacheKey);
        renderSchoolSuggestions(cached, query, isNational, gradeKey);
        return;
      }
      if (schoolSuggestAbortController) {
        try { schoolSuggestAbortController.abort(); } catch (_) {}
      }
      const controller = new AbortController();
      schoolSuggestAbortController = controller;
      try {
        const params = new URLSearchParams({ q: query });
        if (type) params.set('type', type);
        if (isNational) {
          params.set('all', 'true');
        } else {
          params.set('pref', '岡山県');
        }
        if (forceRefresh) {
          params.set('_t', Date.now().toString());
        }
        const res = await fetch(`/api/schools?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
          cache: forceRefresh ? 'no-store' : 'default'
        });
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
        const data = await res.json();
        const results = Array.isArray(data.results) ? data.results : [];
        schoolSuggestCache.set(cacheKey, results);
        const input = document.getElementById('currentSchool');
        if (input && input.value.trim() === query) {
          renderSchoolSuggestions(results, query, isNational, gradeKey);
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.error('School search failed:', err);
      }
    }
    function requestSchoolSuggestions(query, gradeKey, immediate = false) {
      clearTimeout(schoolSuggestTimer);
      const isNational = isNationalSchoolSearch;
      if (immediate) {
        executeSchoolSearch(query, gradeKey, isNational, false);
      } else {
        schoolSuggestTimer = setTimeout(() => {
          executeSchoolSearch(query, gradeKey, isNational, false);
        }, SCHOOL_SUGGEST_DEBOUNCE_MS);
      }
    }
    function renderSchoolSuggestions(suggestions, query, isNational, gradeKey) {
      const dropdown = document.getElementById('schoolSuggestDropdown');
      if (!dropdown) return;
      currentSuggestions = suggestions;
      currentHighlightedIndex = -1;
      if (suggestions.length === 0) {
        const scopeHint = !isNational
          ? '岡山県内に該当する学校が見つかりませんでした。<br><span class="text-emerald-700 font-medium">※県外の学校をお探しの場合は上の「県外・全国」をお選びください。</span>'
          : '該当する学校名が見つかりませんでした。';
        dropdown.innerHTML = `
          <div class="p-4 text-xs text-slate-600 text-center space-y-1.5">
            <div>${scopeHint}</div>
            <div class="text-[11px] text-slate-500">※候補にない学校名もそのまま直接ご入力いただけます</div>
          </div>
        `;
        dropdown.classList.remove('hidden');
        return;
      }
      const itemsHtml = suggestions.map((item, idx) => {
        const isElem = item.type === '小学校';
        const badgeColor = isElem
          ? 'bg-amber-100 text-amber-800 border-amber-200'
          : 'bg-emerald-100 text-emerald-800 border-emerald-200';
        const label = item.label || `${item.name} (${item.prefecture})`;
        return `
          <div class="school-suggest-item px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-emerald-50/80 cursor-pointer transition-colors" data-index="${idx}" onmousedown="selectSchoolSuggestion(${idx})">
            <span class="px-2 py-0.5 rounded text-[11px] font-bold border shrink-0 ${badgeColor}">${escapeSuggestHtml(item.type)}</span>
            <span class="text-xs sm:text-sm font-bold text-slate-800 truncate min-w-0 flex-1">${escapeSuggestHtml(label)}</span>
          </div>
        `;
      }).join('');
      const scopeBadge = !isNational ? '岡山県内のみ表示中' : '全国から表示中（県外優先）';
      dropdown.innerHTML = `
        <div class="divide-y divide-slate-100 max-h-60 overflow-y-auto">
          ${itemsHtml}
        </div>
        <div class="px-3.5 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>文部科学省 学校コード準拠</span>
          <span class="font-medium ${isNational ? 'text-emerald-700' : 'text-slate-500'}">${scopeBadge}</span>
        </div>
      `;
      dropdown.classList.remove('hidden');
    }
    function hideSchoolSuggestions() {
      const dropdown = document.getElementById('schoolSuggestDropdown');
      if (dropdown) dropdown.classList.add('hidden');
      currentHighlightedIndex = -1;
    }
    function selectSchoolSuggestion(index) {
      const item = currentSuggestions[index];
      if (!item) return;
      const input = document.getElementById('currentSchool');
      if (input) {
        input.value = item.name;
        input.dataset.selectedSchool = item.name;
        input.dataset.prefecture = item.prefecture || '';
        lastValidSchoolName = item.name;
        clearSchoolInlineMessage();
        if (item.prefecture && item.prefecture !== '岡山県') {
          isNationalSchoolSearch = true;
          updateSchoolScopeButtonsUI(true);
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        saveProfileToStorage();
      }
      hideSchoolSuggestions();
    }
    const PERSON_NAME_FIELD_IDS = [
      'studentLastName', 'studentFirstName',
      'studentKanaLastName', 'studentKanaFirstName',
      'parentLastName', 'parentFirstName',
      'parentKanaLastName', 'parentKanaFirstName'
    ];
    let lastValidSchoolName = '';

    function toKatakanaText(str) {
      return String(str || '').replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
    }

    function getCurrentPersonNameTokens() {
      const tokens = new Set();
      const addToken = (raw) => {
        const compact = normalizeCompactText(raw);
        if (!compact) return;
        tokens.add(compact);
        tokens.add(toKatakanaText(compact));
      };
      for (const id of PERSON_NAME_FIELD_IDS) {
        const val = document.getElementById(id)?.value || '';
        addToken(val);
        const parts = String(val).trim().split(/[\s\u3000]+/).filter(Boolean);
        for (const p of parts) addToken(p);
      }
      const pairs = [
        ['studentLastName', 'studentFirstName'],
        ['studentKanaLastName', 'studentKanaFirstName'],
        ['parentLastName', 'parentFirstName'],
        ['parentKanaLastName', 'parentKanaFirstName']
      ];
      for (const [lId, fId] of pairs) {
        const lVal = document.getElementById(lId)?.value || '';
        const fVal = document.getElementById(fId)?.value || '';
        if (lVal || fVal) addToken(`${lVal}${fVal}`);
      }
      return tokens;
    }

    function validateSchoolNameValue(rawSchool) {
      const compact = normalizeCompactText(rawSchool);
      if (!compact) {
        return {
          valid: false,
          code: 'empty',
          message: '在籍小中学校名を入力してください。'
        };
      }
      const personTokens = getCurrentPersonNameTokens();
      if (personTokens.has(compact) || personTokens.has(toKatakanaText(compact))) {
        return {
          valid: false,
          code: 'matches_person_name',
          message: '在籍校欄にお名前が入力されています。在籍されている小・中学校名をご入力ください。'
        };
      }
      return { valid: true };
    }

    function setSchoolInlineMessage(message, isError = true) {
      const schoolInput = document.getElementById('currentSchool');
      const errElem = document.getElementById('currentSchoolError');
      if (schoolInput) {
        if (isError) {
          schoolInput.classList.add('apply-input-error', '!border-red-500', '!ring-2', '!ring-red-200');
        } else {
          schoolInput.classList.remove('apply-input-error', '!border-red-500', '!ring-2', '!ring-red-200');
        }
      }
      if (errElem) {
        errElem.textContent = message ? `※ ${String(message).replace(/^※\s*/, '')}` : '';
        errElem.className = isError
          ? 'text-xs font-bold text-rose-600'
          : 'text-xs font-medium text-amber-800';
        if (message) {
          errElem.classList.remove('hidden');
        } else {
          errElem.classList.add('hidden');
        }
      }
    }

    function clearSchoolInlineMessage() {
      setSchoolInlineMessage('', false);
    }

    function guardSchoolAgainstPersonAutofill() {
      if (isRestoringProfile || isClearingProfile) return false;
      const schoolInput = document.getElementById('currentSchool');
      if (!schoolInput) return false;
      const currentVal = schoolInput.value.trim();
      if (!currentVal) return false;

      const compact = normalizeCompactText(currentVal);
      const personTokens = getCurrentPersonNameTokens();
      if (!personTokens.has(compact) && !personTokens.has(toKatakanaText(compact))) {
        return false;
      }

      if (lastValidSchoolName && validateSchoolNameValue(lastValidSchoolName).valid) {
        schoolInput.value = lastValidSchoolName;
        setSchoolInlineMessage('自動入力により在籍校欄へお名前が入力されかけたため、元の学校名へ戻しました。', false);
      } else {
        schoolInput.value = '';
        delete schoolInput.dataset.selectedSchool;
        setSchoolInlineMessage('自動入力により在籍校欄へお名前が入力されかけたためクリアしました。在籍されている小・中学校名をご入力ください。', false);
      }
      hideSchoolSuggestions();
      return true;
    }

    function initSchoolValidationAndAutofillGuard() {
      const schoolInput = document.getElementById('currentSchool');
      if (!schoolInput) return;

      const initialVal = schoolInput.value.trim();
      if (initialVal && validateSchoolNameValue(initialVal).valid) {
        lastValidSchoolName = initialVal;
      }

      const scheduleAutofillCheck = () => {
        if (isRestoringProfile || isClearingProfile) return;
        guardSchoolAgainstPersonAutofill();
        setTimeout(guardSchoolAgainstPersonAutofill, 0);
        setTimeout(guardSchoolAgainstPersonAutofill, 80);
      };

      for (const fieldId of PERSON_NAME_FIELD_IDS) {
        const el = document.getElementById(fieldId);
        if (!el) continue;
        el.addEventListener('input', scheduleAutofillCheck);
        el.addEventListener('change', scheduleAutofillCheck);
      }

      schoolInput.addEventListener('input', function() {
        if (isRestoringProfile || isClearingProfile) return;
        const val = this.value.trim();
        if (!val) {
          lastValidSchoolName = '';
          clearSchoolInlineMessage();
          return;
        }
        const res = validateSchoolNameValue(val);
        if (res.valid) {
          lastValidSchoolName = val;
          clearSchoolInlineMessage();
        }
      });

      schoolInput.addEventListener('blur', function() {
        if (isRestoringProfile || isClearingProfile) return;
        setTimeout(() => {
          if (isRestoringProfile || isClearingProfile) return;
          const val = schoolInput.value.trim();
          if (!val) {
            clearSchoolInlineMessage();
            return;
          }
          const res = validateSchoolNameValue(val);
          if (!res.valid) {
            setSchoolInlineMessage(res.message, true);
          } else {
            lastValidSchoolName = val;
            clearSchoolInlineMessage();
          }
        }, 150);
      });
    }
    function updateSchoolInputPlaceholder(gradeKey) {
      const input = document.getElementById('currentSchool');
      const label = document.querySelector('label[for="currentSchool"]');
      if (!input) return;
      input.placeholder = '在籍校を入力（学校名を入力すると候補が表示されます）';
      if (label) label.textContent = '在籍小中学校名';
      const dropdown = document.getElementById('schoolSuggestDropdown');
      if (dropdown && !dropdown.classList.contains('hidden') && input.value.trim().length > 0) {
        executeSchoolSearch(input.value.trim(), gradeKey, isNationalSchoolSearch, true);
      }
    }
    function initSchoolAutoSuggest() {
      const input = document.getElementById('currentSchool');
      const dropdown = document.getElementById('schoolSuggestDropdown');
      if (!input || !dropdown) return;
      input.addEventListener('input', function() {
        const val = this.value.trim();
        if (val.length === 0) {
          clearTimeout(schoolSuggestTimer);
          if (schoolSuggestAbortController) schoolSuggestAbortController.abort();
          hideSchoolSuggestions();
          return;
        }
        if (this.dataset.selectedSchool === val) {
          delete this.dataset.selectedSchool;
          return;
        }
        requestSchoolSuggestions(val, currentSelectedGrade);
      });
      input.addEventListener('focus', function() {
        const val = this.value.trim();
        if (val.length > 0) {
          requestSchoolSuggestions(val, currentSelectedGrade, true);
        }
      });
      input.addEventListener('keydown', function(e) {
        const dropdownHidden = dropdown.classList.contains('hidden');
        if (dropdownHidden || currentSuggestions.length === 0) return;
        if (e.isComposing) return; // IME変換中の Enter / 矢印は候補操作に使わない
        const items = dropdown.querySelectorAll('.school-suggest-item');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          currentHighlightedIndex = (currentHighlightedIndex + 1) % currentSuggestions.length;
          updateHighlightedItem(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          currentHighlightedIndex = (currentHighlightedIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
          updateHighlightedItem(items);
        } else if (e.key === 'Enter') {
          if (currentHighlightedIndex >= 0 && currentHighlightedIndex < currentSuggestions.length) {
            e.preventDefault();
            selectSchoolSuggestion(currentHighlightedIndex);
          }
        } else if (e.key === 'Escape') {
          hideSchoolSuggestions();
        }
      });
      function updateHighlightedItem(items) {
        items.forEach((el, i) => {
          if (i === currentHighlightedIndex) {
            el.classList.add('bg-emerald-100/90');
            el.scrollIntoView({ block: 'nearest' });
          } else {
            el.classList.remove('bg-emerald-100/90');
          }
        });
      }
      const scopeContainer = document.getElementById('schoolScopeContainer');
      document.addEventListener('click', function(e) {
        if (
          !input.contains(e.target) &&
          !dropdown.contains(e.target) &&
          !(scopeContainer && scopeContainer.contains(e.target))
        ) {
          hideSchoolSuggestions();
        }
      });
    }
    window.selectSchoolSuggestion = selectSchoolSuggestion;
    window.updateSchoolInputPlaceholder = updateSchoolInputPlaceholder;
    window.setSchoolSearchScope = setSchoolSearchScope;
    // 5.5 フォームエラー表示 & 通知ハンドラー（alert廃止・インライン化）
    let _formToastTimeout = null;
    function showFormError(message, targetElem = null, scrollTarget = null) {
      const cleanMsg = message.replace(/^※\s*/, '');
      const formattedMsg = `※ ${cleanMsg}`;
      const errorContainer = document.getElementById('formErrorMessage');
      const errorText = document.getElementById('formErrorMessageText');
      if (errorContainer && errorText) {
        errorText.textContent = formattedMsg;
        errorContainer.classList.remove('hidden');
      }
      // 2. 模試選択エリアのエラー（該当する場合）
      const examGroup = document.getElementById('examOptionGroup');
      const examInlineError = document.getElementById('examSelectionInlineError');
      if (targetElem === examGroup || scrollTarget === examGroup) {
        if (examInlineError) examInlineError.classList.remove('hidden');
      } else {
        if (examInlineError) examInlineError.classList.add('hidden');
      }
      const toast = document.getElementById('formToastNotification');
      const toastText = document.getElementById('formToastText');
      if (toast && toastText) {
        toastText.textContent = cleanMsg;
        toast.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-4');
        toast.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
        if (_formToastTimeout) clearTimeout(_formToastTimeout);
        _formToastTimeout = setTimeout(() => {
          hideFormToast();
        }, 5000);
      }
      // 4. 既存のエラー枠線をすべて解除
      document.querySelectorAll('.apply-input-error').forEach(el => {
        el.classList.remove('apply-input-error', '!border-red-500', '!ring-2', '!ring-red-200');
      });
      // 5. 対象要素のハイライト & 入力変更時の自動解除
      if (targetElem && targetElem !== examGroup) {
        targetElem.classList.add('apply-input-error', '!border-red-500', '!ring-2', '!ring-red-200');
        const clearHandler = () => {
          targetElem.classList.remove('apply-input-error', '!border-red-500', '!ring-2', '!ring-red-200');
          clearFormError();
          targetElem.removeEventListener('input', clearHandler);
          targetElem.removeEventListener('change', clearHandler);
        };
        targetElem.addEventListener('input', clearHandler);
        targetElem.addEventListener('change', clearHandler);
      }
      const elementToScroll = scrollTarget || targetElem || errorContainer;
      if (elementToScroll) {
        elementToScroll.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (targetElem && typeof targetElem.focus === 'function' && targetElem !== examGroup) {
          setTimeout(() => {
            try {
              targetElem.focus({ preventScroll: true });
            } catch (e) {
              targetElem.focus();
            }
          }, 350);
        }
      }
    }
    function hideFormToast() {
      const toast = document.getElementById('formToastNotification');
      if (toast) {
        toast.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
        toast.classList.add('opacity-0', 'pointer-events-none', '-translate-y-4');
      }
    }
    function clearFormError() {
      const errorContainer = document.getElementById('formErrorMessage');
      if (errorContainer) errorContainer.classList.add('hidden');
      const examInlineError = document.getElementById('examSelectionInlineError');
      if (examInlineError) examInlineError.classList.add('hidden');
      hideFormToast();
    }
    // 5.6 基本情報の localStorage 自動保存・自動復元（リピート申込支援）
    const OKAMOSHI_STORAGE_PROFILE_KEY = 'okamoshi_saved_profile';
    let isClearingProfile = false;
    /**
     * バリデーション通過済みの基本情報を安全に localStorage へ保存
     * ※ 受験回、希望会場、志望校、決済・クレジットカード情報は厳格に対象外
     */
    function saveProfileToStorage() {
      if (isClearingProfile) return;
      try {
        if (typeof window.localStorage === 'undefined') return;
        const selectedGender = document.querySelector('input[name="gender"]:checked')?.value || '';
        const rawSchoolVal = document.getElementById('currentSchool')?.value.trim() || '';
        const safeSchoolVal = validateSchoolNameValue(rawSchoolVal).valid ? rawSchoolVal : '';
        const profileData = {
          student_last_name: document.getElementById('studentLastName')?.value.trim() || '',
          student_first_name: document.getElementById('studentFirstName')?.value.trim() || '',
          student_kana_last_name: document.getElementById('studentKanaLastName')?.value.trim() || '',
          student_kana_first_name: document.getElementById('studentKanaFirstName')?.value.trim() || '',
          student_gender: selectedGender,
          gender: selectedGender,
          current_school: safeSchoolVal,
          school_is_national: !!isNationalSchoolSearch,
          school_scope: isNationalSchoolSearch ? 'national' : 'pref',
          school_prefecture: safeSchoolVal ? (document.getElementById('currentSchool')?.dataset?.prefecture || '') : '',
          parent_last_name: document.getElementById('parentLastName')?.value.trim() || '',
          parent_first_name: document.getElementById('parentFirstName')?.value.trim() || '',
          parent_kana_last_name: document.getElementById('parentKanaLastName')?.value.trim() || '',
          parent_kana_first_name: document.getElementById('parentKanaFirstName')?.value.trim() || '',
          parent_email: document.getElementById('parentEmail')?.value.trim() || '',
          parent_tel: document.getElementById('parentTel')?.value.trim() || '',
          postal_code: document.getElementById('postalCode')?.value.trim() || '',
          address_line1: document.getElementById('addressLine1')?.value.trim() || '',
          address_line2: document.getElementById('addressLine2')?.value.trim() || '',
          address_line3: document.getElementById('addressLine3')?.value.trim() || '',
          saved_at: new Date().toISOString()
        };
        if (profileData.student_last_name || profileData.parent_last_name || profileData.parent_email || profileData.student_gender) {
          window.localStorage.setItem(OKAMOSHI_STORAGE_PROFILE_KEY, JSON.stringify(profileData));
        }
      } catch (err) {
        console.warn('[AutoFill] localStorage save failed:', err);
      }
    }
    /**
     * 性別ラジオボタンの変更リスナー初期化（選択時に localStorage 保存）
     */
    function initGenderStorageListeners() {
      const genderRadios = document.querySelectorAll('input[name="gender"]');
      genderRadios.forEach(radio => {
        radio.addEventListener('change', function() {
          if (!isClearingProfile) {
            saveProfileToStorage();
            const formError = document.getElementById('formErrorMessage');
            const formErrorText = document.getElementById('formErrorMessageText');
            if (formError && !formError.classList.contains('hidden') && formErrorText?.textContent?.includes('性別')) {
              formError.classList.add('hidden');
            }
          }
        });
      });
    }
    let isRestoringProfile = false;
    /**
     * ページ表示時に保存された基本情報を自動復元
     */
    function restoreSavedProfile() {
      try {
        if (typeof window.localStorage === 'undefined') return;
        const raw = window.localStorage.getItem(OKAMOSHI_STORAGE_PROFILE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return;
        isRestoringProfile = true;
        let restoredCount = 0;
        if (data.postal_code) {
          lastSearchedZip = normalizeZipCode(data.postal_code);
        }
        const applyValue = (elemId, val) => {
          if (!val) return;
          const el = document.getElementById(elemId);
          if (el && !el.value) {
            el.value = val;
            restoredCount++;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        };
        applyValue('studentLastName', data.student_last_name);
        applyValue('studentFirstName', data.student_first_name);
        applyValue('studentKanaLastName', data.student_kana_last_name);
        applyValue('studentKanaFirstName', data.student_kana_first_name);
        const savedGender = data.student_gender || data.gender;
        if (savedGender) {
          const currentChecked = document.querySelector('input[name="gender"]:checked');
          if (!currentChecked) {
            const targetRadio = document.querySelector(`input[name="gender"][value="${savedGender}"]`);
            if (targetRadio) {
              targetRadio.checked = true;
              restoredCount++;
              targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }
        let isNational = false;
        if (typeof data.school_is_national === 'boolean') {
          isNational = data.school_is_national;
        } else if (data.school_scope === 'national' || data.school_scope === 'all') {
          isNational = true;
        } else if (data.school_prefecture && data.school_prefecture !== '岡山県') {
          isNational = true;
        } else if (data.current_school) {
          const otherPrefs = [
            '北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島',
            '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川',
            '新潟', '富山', '石川', '福井', '山梨', '長野', '岐阜',
            '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫',
            '奈良', '和歌山', '鳥取', '島根', '広島', '山口',
            '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎',
            '熊本', '大分', '宮崎', '鹿児島', '沖縄'
          ];
          const schoolVal = String(data.current_school);
          if (otherPrefs.some(p => schoolVal.includes(p)) && !schoolVal.includes('岡山')) {
            isNational = true;
          }
        }
        if (isNational) {
          setSchoolSearchScope(true, false);
        } else {
          setSchoolSearchScope(false, false);
        }
        applyValue('parentLastName', data.parent_last_name);
        applyValue('parentFirstName', data.parent_first_name);
        applyValue('parentKanaLastName', data.parent_kana_last_name);
        applyValue('parentKanaFirstName', data.parent_kana_first_name);
        // 氏名・フリガナを先に反映した上で、在籍校の誤保存データをガードして復元
        if (data.current_school && validateSchoolNameValue(data.current_school).valid) {
          applyValue('currentSchool', data.current_school);
          lastValidSchoolName = String(data.current_school).trim();
        }
        applyValue('parentEmail', data.parent_email);
        if (data.parent_email) {
          applyValue('parentEmailConfirm', data.parent_email);
        }
        applyValue('parentTel', data.parent_tel);
        applyValue('postalCode', normalizeZipCode(data.postal_code));
        applyValue('addressLine1', data.address_line1);
        applyValue('addressLine2', data.address_line2);
        applyValue('addressLine3', data.address_line3);
        if (data.address_line1) {
          const restoredParts = extractAddressPartsFromLine1('', data.address_line1);
          updateAddressLine2Guidance(restoredParts.town);
          if (data.address_line2) {
            cleanAddressLine2Input(false);
          }
        }
        if (restoredCount > 0) {
          const banner = document.getElementById('autofillNoticeBanner');
          if (banner) {
            banner.classList.remove('hidden');
          }
        }
      } catch (err) {
        console.warn('[AutoFill] localStorage restore failed:', err);
      } finally {
        setTimeout(() => {
          isRestoringProfile = false;
        }, 200);
      }
    }
    /**
     * 自動反映バナーを閉じる
     */
    function dismissAutofillBanner() {
      const banner = document.getElementById('autofillNoticeBanner');
      if (banner) {
        banner.classList.add('hidden');
      }
    }
    /**
     * 保存された基本情報を localStorage から消去し、入力欄をクリア
     */
    function clearSavedProfile() {
      if (!window.confirm('端末に保存された入力情報を消去しますか？')) {
        return;
      }
      isClearingProfile = true;
      try {
        if (typeof window.localStorage !== 'undefined') {
          window.localStorage.removeItem(OKAMOSHI_STORAGE_PROFILE_KEY);
        }
        const targetIds = [
          'studentLastName', 'studentFirstName',
          'studentKanaLastName', 'studentKanaFirstName',
          'currentSchool',
          'parentLastName', 'parentFirstName',
          'parentKanaLastName', 'parentKanaFirstName',
          'parentEmail', 'parentEmailConfirm',
          'parentTel',
          'postalCode',
          'addressLine1', 'addressLine2', 'addressLine3'
        ];
        targetIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        const genderRadios = document.querySelectorAll('input[name="gender"]');
        genderRadios.forEach(radio => {
          if (radio.checked) {
            radio.checked = false;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        dismissAutofillBanner();
        lastValidSchoolName = '';
        lastFoundAddress = null;
        clearSchoolInlineMessage();
        updateAddressLine2Guidance('');
        const msgElem = document.getElementById('storageClearSuccessMsg');
        if (msgElem) {
          msgElem.classList.remove('hidden');
          setTimeout(() => {
            msgElem.classList.add('hidden');
          }, 3500);
        }
      } catch (err) {
        console.warn('[AutoFill] localStorage clear failed:', err);
      } finally {
        setTimeout(() => {
          isClearingProfile = false;
        }, 100);
      }
    }
    window.dismissAutofillBanner = dismissAutofillBanner;
    window.clearSavedProfile = clearSavedProfile;
    function parseJapaneseAddress(prefInput, addressLine1, addressLine2, addressLine3) {
      const { pref, city, town } = extractAddressPartsFromLine1(prefInput, addressLine1);
      const raw2 = String(addressLine2 || '').trim();
      const raw3 = String(addressLine3 || '').trim();
      const addr1 = combineTownAndStreet(pref, city, town, raw2);
      // 4. 建物名・部屋番号
      const addr2 = raw3;
      return { pref, city, addr1, addr2, town };
    }
    let isSubmitting = false;
    let _originalSubmitBtnHtml = '';
    function showLoadingOverlay() {
      const overlay = document.getElementById('stripeLoadingOverlay');
      if (overlay) {
        overlay.classList.remove('hidden');
        void overlay.offsetWidth;
        overlay.classList.remove('opacity-0', 'pointer-events-none');
        overlay.classList.add('opacity-100', 'pointer-events-auto');
      }
      document.body.style.overflow = 'hidden';
    }
    function hideLoadingOverlay() {
      const overlay = document.getElementById('stripeLoadingOverlay');
      if (overlay) {
        overlay.classList.add('opacity-0', 'pointer-events-none');
        overlay.classList.remove('opacity-100', 'pointer-events-auto');
        setTimeout(() => {
          if (overlay.classList.contains('opacity-0')) {
            overlay.classList.add('hidden');
          }
        }, 220);
      }
      document.body.style.overflow = '';
    }
    async function handleApplySubmit(e) {
      if (e) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
      }
      if (isSubmitting) return;
      isSubmitting = true;
      let safetyTimer = null;
      const form = document.getElementById('applicationForm');
      if (!form) {
        isSubmitting = false;
        return;
      }
      const submitBtn = document.getElementById('submitApplyBtn');
      if (submitBtn && !_originalSubmitBtnHtml) {
        _originalSubmitBtnHtml = submitBtn.innerHTML;
      }
      function resetSubmitBtn() {
        isSubmitting = false;
        if (safetyTimer) {
          clearTimeout(safetyTimer);
          safetyTimer = null;
        }
        hideLoadingOverlay();
        if (submitBtn) {
          submitBtn.classList.remove('opacity-75', 'pointer-events-none');
          submitBtn.innerHTML = _originalSubmitBtnHtml || `
            <span>入力内容を確認し、お支払いへ進む</span>
            <span class="material-symbols-outlined text-xl">arrow_forward</span>
          `;
          updateSubmitButtonState();
        }
      }
      function setSubmittingState() {
        isSubmitting = true;
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.classList.add('opacity-75', 'cursor-not-allowed', 'pointer-events-none');
          submitBtn.innerHTML = `
            <svg class="animate-spin -ml-1 mr-2.5 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>決済画面へ接続中...</span>
          `;
        }
        showLoadingOverlay();
      }
      if (!currentSelectedGrade) {
        resetSubmitBtn();
        const gradeGroup = document.getElementById('gradeButtonGroup');
        showFormError('学年をお選びください。', gradeGroup, gradeGroup);
        return;
      }
      const selectedExams = Object.values(selectedExamsState);
      if (selectedExams.length === 0) {
        resetSubmitBtn();
        const examGroup = document.getElementById('examOptionGroup');
        showFormError('受験を希望する模試を1つ以上選択してください。', examGroup, examGroup);
        return;
      }
      for (const exam of selectedExams) {
        if (!exam.venue || exam.venue === '') {
          resetSubmitBtn();
          const venueElem = document.getElementById(`venue-${exam.id}`);
          if (venueElem) updateVenueSelectStyle(venueElem);
          showFormError(`「${exam.issueName} ${exam.title}」の受験方法・希望会場を選択してください。`, venueElem, venueElem);
          return;
        }
      }
      // 2. 送信前自動前処理：全角半角正規化 & 旧字体・異体字の常用漢字置換
      const postalCodeElem = document.getElementById('postalCode');
      if (postalCodeElem) {
        postalCodeElem.value = normalizeZipCode(postalCodeElem.value);
      }
      const parentTelElem = document.getElementById('parentTel');
      if (parentTelElem) {
        parentTelElem.value = normalizeToHalfWidth(parentTelElem.value).replace(/\s+/g, '');
      }
      const addr2Elem = document.getElementById('addressLine2');
      if (addr2Elem) {
        addr2Elem.value = normalizeToHalfWidth(addr2Elem.value);
        cleanAddressLine2Input(false);
      }
      const addr3Elem = document.getElementById('addressLine3');
      if (addr3Elem) {
        addr3Elem.value = normalizeToHalfWidth(addr3Elem.value);
      }
      const studentLastElem = document.getElementById('studentLastName');
      if (studentLastElem) {
        studentLastElem.value = replaceKanjiVariants(studentLastElem.value.trim());
      }
      const studentFirstElem = document.getElementById('studentFirstName');
      if (studentFirstElem) {
        studentFirstElem.value = replaceKanjiVariants(studentFirstElem.value.trim());
      }
      const parentLastElem = document.getElementById('parentLastName');
      if (parentLastElem) {
        parentLastElem.value = replaceKanjiVariants(parentLastElem.value.trim());
      }
      const parentFirstElem = document.getElementById('parentFirstName');
      if (parentFirstElem) {
        parentFirstElem.value = replaceKanjiVariants(parentFirstElem.value.trim());
      }
      const studentKanaLastElem = document.getElementById('studentKanaLastName');
      if (studentKanaLastElem) studentKanaLastElem.value = normalizeToFullWidthKana(studentKanaLastElem.value);
      const studentKanaFirstElem = document.getElementById('studentKanaFirstName');
      if (studentKanaFirstElem) studentKanaFirstElem.value = normalizeToFullWidthKana(studentKanaFirstElem.value);
      const parentKanaLastElem = document.getElementById('parentKanaLastName');
      if (parentKanaLastElem) parentKanaLastElem.value = normalizeToFullWidthKana(parentKanaLastElem.value);
      const parentKanaFirstElem = document.getElementById('parentKanaFirstName');
      if (parentKanaFirstElem) parentKanaFirstElem.value = normalizeToFullWidthKana(parentKanaFirstElem.value);
      const studentLastName = document.getElementById('studentLastName')?.value.trim();
      const studentFirstName = document.getElementById('studentFirstName')?.value.trim();
      const studentKanaLastName = document.getElementById('studentKanaLastName')?.value.trim();
      const studentKanaFirstName = document.getElementById('studentKanaFirstName')?.value.trim();
      const gender = form.querySelector('input[name="gender"]:checked')?.value || null;
      const currentSchool = document.getElementById('currentSchool')?.value.trim();
      const parentLastName = document.getElementById('parentLastName')?.value.trim();
      const parentFirstName = document.getElementById('parentFirstName')?.value.trim();
      const parentKanaLastName = document.getElementById('parentKanaLastName')?.value.trim();
      const parentKanaFirstName = document.getElementById('parentKanaFirstName')?.value.trim();
      const parentEmail = document.getElementById('parentEmail')?.value.trim();
      const parentEmailConfirm = document.getElementById('parentEmailConfirm')?.value.trim();
      const parentTel = document.getElementById('parentTel')?.value.trim();
      const postalCode = document.getElementById('postalCode')?.value.trim();
      const prefecture = document.getElementById('prefecture')?.value;
      const addressLine1 = document.getElementById('addressLine1')?.value.trim();
      const addressLine2 = document.getElementById('addressLine2')?.value.trim();
      const addressLine3 = document.getElementById('addressLine3')?.value.trim() || '';
      const paymentMethod = form.querySelector('input[name="payment_method"]:checked')?.value || null;
      const agreeTerms = document.getElementById('agreeTerms')?.checked;
      const remarks = (document.getElementById('remarks')?.value || '').trim().slice(0, 300);
      // 4. バリデーションチェック
      if (!studentLastName || !studentFirstName) {
        resetSubmitBtn();
        const target = !studentLastName ? document.getElementById('studentLastName') : document.getElementById('studentFirstName');
        showFormError('生徒氏名（漢字）を入力してください。', target);
        return;
      }
      if (!studentKanaLastName || !studentKanaFirstName) {
        resetSubmitBtn();
        const target = !studentKanaLastName ? document.getElementById('studentKanaLastName') : document.getElementById('studentKanaFirstName');
        showFormError('生徒氏名（フリガナ）を入力してください。', target);
        return;
      }
      if (!gender) {
        resetSubmitBtn();
        const genderElem = form.querySelector('input[name="gender"]');
        const genderGroup = genderElem?.closest('.flex.flex-col') || genderElem;
        showFormError('性別を選択してください。', genderElem, genderGroup);
        return;
      }
      if (!currentSchool) {
        resetSubmitBtn();
        const target = document.getElementById('currentSchool');
        setSchoolInlineMessage('在籍小中学校名を入力してください。', true);
        showFormError('在籍小中学校名を入力してください。', target);
        return;
      }
      const schoolValidation = validateSchoolNameValue(currentSchool);
      if (!schoolValidation.valid) {
        resetSubmitBtn();
        const target = document.getElementById('currentSchool');
        setSchoolInlineMessage(schoolValidation.message, true);
        showFormError(schoolValidation.message, target);
        return;
      }
      lastValidSchoolName = currentSchool;
      clearSchoolInlineMessage();
      if (!parentLastName || !parentFirstName) {
        resetSubmitBtn();
        const target = !parentLastName ? document.getElementById('parentLastName') : document.getElementById('parentFirstName');
        showFormError('保護者氏名を入力してください。', target);
        return;
      }
if (!parentKanaLastName || !parentKanaFirstName) {
        resetSubmitBtn();
        const target = !parentKanaLastName ? document.getElementById('parentKanaLastName') : document.getElementById('parentKanaFirstName');
        showFormError('保護者氏名（フリガナ）を入力してください。', target);
        return;
      }
      const isKanaRegex = /^[゠-ヿー\s]+$/;
      if (!isKanaRegex.test(parentKanaLastName) || !isKanaRegex.test(parentKanaFirstName)) {
        resetSubmitBtn();
        const target = !isKanaRegex.test(parentKanaLastName) ? document.getElementById('parentKanaLastName') : document.getElementById('parentKanaFirstName');
        showFormError('保護者氏名（フリガナ）は全角カタカナで入力してください。', target);
        return;
      }
      if (!parentEmail || !parentEmail.includes('@')) {
        resetSubmitBtn();
        const target = document.getElementById('parentEmail');
        showFormError('有効なメールアドレスを入力してください。', target);
        return;
      }
      if (parentEmail !== parentEmailConfirm) {
        resetSubmitBtn();
        const target = document.getElementById('parentEmailConfirm');
        showFormError('確認用メールアドレスが一致しません。もう一度お確かめください。', target);
        return;
      }
      if (!parentTel || parentTel.replace(/\D/g, '').length < 10) {
        resetSubmitBtn();
        const target = document.getElementById('parentTel');
        showFormError('日中連絡可能な電話番号を正しく入力してください。', target);
        return;
      }
      if (!postalCode || postalCode.length !== 7) {
        resetSubmitBtn();
        const target = document.getElementById('postalCode');
        showPostalMessage(`郵便番号は7桁で入力してください（現在${(postalCode || '').length}桁です）`, true);
        showFormError('郵便番号が正しくないか、ご住所と一致していません', target);
        return;
      }
      if (!addressLine1) {
        resetSubmitBtn();
        const target = document.getElementById('addressLine1');
        showFormError('「都道府県・市区町村・町名」を入力してください。', target);
        return;
      }
      let verifiedZipData = addressCache.get(postalCode);
      if (verifiedZipData === undefined) {
        try {
          const checkCtrl = new AbortController();
          const checkTimer = setTimeout(() => checkCtrl.abort(), ADDRESS_API_TIMEOUT_MS);
          verifiedZipData = await fetchAddress(postalCode, checkCtrl.signal);
          clearTimeout(checkTimer);
        } catch (err) {
          console.warn('Postal code verification fetch failed:', err);
        }
      }
      if (!verifiedZipData || (!verifiedZipData.prefecture && !verifiedZipData.city)) {
        resetSubmitBtn();
        const target = document.getElementById('postalCode');
        showPostalMessage('該当する住所が見つかりません。郵便番号にお間違いがないかご確認ください', true);
        showFormError('郵便番号が正しくないか、ご住所と一致していません', target);
        return;
      } else {
        const normAddr1 = addressLine1.replace(/[\s　]+/g, '');
        const expectedPref = (verifiedZipData.prefecture || '').replace(/[\s　]+/g, '');
        const expectedCity = (verifiedZipData.city || '').replace(/[\s　]+/g, '');
        const isPrefMatched = !expectedPref || normAddr1.startsWith(expectedPref);
        const addrAfterPref = expectedPref && normAddr1.startsWith(expectedPref)
          ? normAddr1.slice(expectedPref.length)
          : normAddr1;
        const isCityMatched = !expectedCity || addrAfterPref.startsWith(expectedCity);
        if (!isPrefMatched || !isCityMatched) {
          resetSubmitBtn();
          const target = document.getElementById('postalCode');
          showPostalMessage('郵便番号が正しくないか、ご住所と一致していません', true);
          showFormError('郵便番号が正しくないか、ご住所と一致していません', target);
          return;
        }
      }
      if (!addressLine2) {
        resetSubmitBtn();
        const target = document.getElementById('addressLine2');
        showFormError('「丁目・番地・号」を入力してください。', target);
        if (target) target.focus();
        return;
      }
      const hasNumberInAddress = /[0-9０-９〇零一二三四五六七八九十百千万壱弐参肆伍陸漆捌玖拾]/.test(addressLine2);
      if (!hasNumberInAddress) {
        const confirmMsg = '【ご確認】番地・号（数字）が入力されていません。無番地等の住所でない場合は、正確な番地をご入力ください。このまま送信してよろしいですか？';
        const isConfirmed = window.confirm(confirmMsg);
        if (!isConfirmed) {
          resetSubmitBtn();
          const target = document.getElementById('addressLine2');
          if (target) target.focus();
          return;
        }
      }
      if (!paymentMethod) {
        resetSubmitBtn();
        const paymentElem = form.querySelector('input[name="payment_method"]');
        const paymentGroup = paymentElem?.closest('.flex.flex-col') || paymentElem;
        showFormError('お支払い方法（クレジットカード決済またはコンビニ決済）を選択してください。', paymentElem, paymentGroup);
        return;
      }
      if (!agreeTerms) {
        resetSubmitBtn();
        const target = document.getElementById('agreeTerms');
        const container = target ? target.closest('label') : null;
        showFormError('「個人情報の取扱い」および「特定商取引法に基づく表記」への同意が必要です。', target, container);
        return;
      }
      if (paymentMethod === 'convenience_store') {
        const dl = getConvenienceDeadline();
        if (dl.isClosed) {
          resetSubmitBtn();
          const cardRadio = document.querySelector('input[name="payment_method"][value="credit_card"]');
          if (cardRadio) cardRadio.checked = true;
          updatePaymentMethodSummary('credit_card');
          showFormError('コンビニ決済の受付期間は終了いたしました。クレジットカード決済をご利用ください。', cardRadio);
          return;
        }
        const agreeConvenience = document.getElementById('agreeConvenienceTerms')?.checked;
        if (!agreeConvenience) {
          resetSubmitBtn();
          const convInput = document.getElementById('agreeConvenienceTerms');
          const container = convInput ? convInput.closest('label') : null;
          showFormError('コンビニ決済期限および自動キャンセルについての確認・同意が必要です。', convInput, container);
          return;
        }
      }
      setSubmittingState();
      saveProfileToStorage();
      safetyTimer = setTimeout(() => {
        console.warn('[Stripe Connect] Timeout waiting for checkout redirect.');
        hideLoadingOverlay();
        resetSubmitBtn();
        showFormError('決済画面の接続に時間がかかっています。通信環境をご確認の上、再度お試しください。', submitBtn);
      }, 14000);
      const wElem = form.querySelector('.cf-turnstile');
      const readTurnstileToken = () => {
        const inputVal = (form.querySelector('input[name="cf-turnstile-response"]')?.value || '').trim();
        if (inputVal) return inputVal;
        if (typeof turnstile !== 'undefined' && typeof turnstile.getResponse === 'function') {
          try {
            return ((wElem ? turnstile.getResponse(wElem) : '') || turnstile.getResponse() || '').trim();
          } catch (_) {
            return '';
          }
        }
        return '';
      };
      let turnstileToken = readTurnstileToken();
      if (!turnstileToken && typeof turnstile !== 'undefined') {
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 100));
          turnstileToken = readTurnstileToken();
          if (turnstileToken) break;
        }
      }
      try {
        const totalAmount = selectedExams.reduce((sum, item) => sum + item.price, 0);
        const gradeLabels = { 'sho6': '小学6年生', 'chu1': '中学1年生', 'chu2': '中学2年生', 'chu3': '中学3年生' };
        const gradeText = gradeLabels[currentSelectedGrade] || currentSelectedGrade;
        const examNameStr = selectedExams.map(exam => exam.issueName ? `${exam.issueName} ${exam.title}` : exam.title).join(' / ');
        const hasTekisei = selectedExams.some(exam => String(exam.title || '').includes('適性') || String(exam.id || '').includes('tekisei') || String(exam.grade || currentSelectedGrade) === 'sho6');
        const hasTouitsu = selectedExams.some(exam => (String(exam.title || '').includes('統一') || String(exam.title || '').includes('おかもし')) && !String(exam.title || '').includes('適性'));
        const examType = (hasTekisei && hasTouitsu) ? 'both' : (hasTekisei ? 'tekisei' : 'touitsu');
        const { pref, city, addr1, addr2, town } = parseJapaneseAddress(prefecture, addressLine1, addressLine2, addressLine3);
        const fullAddressString = [pref, city, addr1, addr2].filter(Boolean).join(' ');
        const firstVenueName = selectedExams[0]?.venueLabel || selectedExams[0]?.venue || '会場未指定';
        const firstVenueType = selectedExams[0]?.venueType || extractVenueTypeShort(firstVenueName, selectedExams[0]?.venue) || '';
        const issueNameStr = selectedExams.map(exam => exam.issueName || '').filter(Boolean).join(' / ');
        const isKonbini = (paymentMethod === 'convenience_store');
        const selectedPaymentMethod = isKonbini ? 'konbini' : 'card';
        const paymentMethodTypes = [selectedPaymentMethod];
        const konbiniDeadline = getConvenienceDeadline();
        const KONBINI_EXPIRES_AFTER_DAYS = konbiniDeadline.expiresAfterDays;
        const paymentMethodOptions = isKonbini ? {
          konbini: {
            expires_after_days: KONBINI_EXPIRES_AFTER_DAYS
          }
        } : undefined;
        const stripeMetadata = {
          student_name: `${studentLastName} ${studentFirstName}`,
          student_kana: `${studentKanaLastName} ${studentKanaFirstName}`,
          grade: gradeText,
          school_name: currentSchool || '',
          parent_name: `${parentLastName} ${parentFirstName}`,
          venue_name: firstVenueName,
          venue_type: firstVenueType,
          issue_name: issueNameStr,
          amount: String(totalAmount),
          exam_name: examNameStr,
          exam_type: examType,
          payment_method: selectedPaymentMethod,
          phone: parentTel,
          email: parentEmail,
          postal_code: postalCode,
          pref: pref,
          city: city,
          addr1: addr1,
          addr2: addr2,
          remarks: remarks,
          prefecture: pref,
          address1: addr1,
          address2: addr2,
          venue: firstVenueName,
          school: currentSchool || '',
          student_school: currentSchool || '',
          student_grade: gradeText,
          student_grade_label: gradeText,
          student_kana_name: `${studentKanaLastName} ${studentKanaFirstName}`,
          kana: `${studentKanaLastName} ${studentKanaFirstName}`,
          parent_kana: `${parentKanaLastName} ${parentKanaFirstName}`,
          student_gender: gender || '',
          address: fullAddressString,
          total_amount: String(totalAmount),
          selected_payment_method: selectedPaymentMethod
        };
        const checkoutPayload = {
          received_at: '', // 決済完了時にJST日時を付与
          session_id: '',  // 決済完了時にStripeセッションIDを付与
          exam_name: examNameStr,
          issue_name: issueNameStr,
          exam_type: examType,
          venue_name: firstVenueName,
          venue_type: firstVenueType,
          amount: totalAmount,
          payment_status: isKonbini ? 'unpaid' : 'paid',
          payment_method: selectedPaymentMethod,
          student_name: `${studentLastName} ${studentFirstName}`,
          student_last_name: studentLastName,
          student_first_name: studentFirstName,
          student_kana: `${studentKanaLastName} ${studentKanaFirstName}`,
          student_kana_last_name: studentKanaLastName,
          student_kana_first_name: studentKanaFirstName,
          grade: gradeText,
          school_name: currentSchool || '',
          parent_name: `${parentLastName} ${parentFirstName}`,
          parent_last_name: parentLastName,
          parent_first_name: parentFirstName,
          parent_kana_last_name: parentKanaLastName,
          parent_kana_first_name: parentKanaFirstName,
          email: parentEmail,
          phone: parentTel,
          postal_code: postalCode,
          pref: pref,
          city: city,
          town: town || '',
          addr1: addr1,
          addr2: addr2,
          remarks: remarks,
          prefecture: pref,
          address_line1: addr1,
          address_line2: addr2,
          address_line3: addr2,
          address1: addr1,
          address2: addr2,
          venue: firstVenueName,
          school: currentSchool || '',
          student_school: currentSchool || '',
          student_grade: gradeText,
          student_grade_label: gradeText,
          student_kana_name: `${studentKanaLastName} ${studentKanaFirstName}`,
          kana: `${studentKanaLastName} ${studentKanaFirstName}`,
          parent_kana: `${parentKanaLastName} ${parentKanaFirstName}`,
          total_amount: totalAmount,
          selected_payment_method: selectedPaymentMethod,
          payment_method_types: paymentMethodTypes,
          customer_email: parentEmail,
          client_reference_id: `${studentLastName} ${studentFirstName}`,
          metadata: stripeMetadata,
          success_url: `${window.location.origin}/apply/success?session_id={CHECKOUT_SESSION_ID}&exam_type=${encodeURIComponent(examType)}`,
          cancel_url: `${window.location.origin}/apply`,
          ...(paymentMethodOptions ? { payment_method_options: paymentMethodOptions } : {}),
          ...(isKonbini ? { konbini_expires_after_days: KONBINI_EXPIRES_AFTER_DAYS } : {}),
          raw_payment_method: paymentMethod,
          remarks: remarks,
          student_gender: gender,
          student_grade: currentSelectedGrade,
          student_grade_label: gradeText,
          student_school: currentSchool,
          pref: pref,
          city: city,
          addr1: addr1,
          addr2: addr2,
          address_line1: addr1,
          address_line2: addr2,
          address_line3: addr2,
          address: fullAddressString,
          'cf-turnstile-response': turnstileToken,
          exams: selectedExams.map(exam => ({
            id: exam.id,
            title: exam.title,
            issue_name: exam.issueName || '',
            grade_label: exam.gradeLabel || '',
            price: exam.price,
            venue: exam.venue,
            venue_name: exam.venueLabel,
            venue_type: exam.venueType || extractVenueTypeShort(exam.venueLabel, exam.venue),
            exam_date: exam.examDate
          }))
        };
        try {
          const payloadStr = JSON.stringify(checkoutPayload);
          sessionStorage.setItem('okamoshi_pending_apply', payloadStr);
          localStorage.setItem('okamoshi_pending_apply', payloadStr);
          localStorage.setItem('okamoshi_latest_application', payloadStr);
          document.cookie = `okamoshi_pending_apply=${encodeURIComponent(payloadStr)}; path=/; max-age=7200; SameSite=Lax`;
        } catch (storageErr) {
          console.warn('Storage save failed:', storageErr);
        }
        let checkoutUrl = null;
        let createdSessionId = null;
        const controller = new AbortController();
        const apiTimer = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(CREATE_CHECKOUT_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(checkoutPayload),
          signal: controller.signal
        });
        clearTimeout(apiTimer);
        const raw = await response.text();
        let result = null;
        try { result = JSON.parse(raw); } catch (e) {}
        if (!response.ok || !result || !result.success) {
          const errMsg = (result && result.message) ? result.message : `決済セッションの作成に失敗しました (HTTP ${response.status})`;
          throw new Error(errMsg);
        }
        checkoutUrl = result.url || result.checkout_url || null;
        createdSessionId = result.session_id || result.sessionId || result.id || (checkoutUrl ? checkoutUrl.match(/(cs_[a-zA-Z0-9_]+)/)?.[1] : null);
        if (!checkoutUrl || typeof checkoutUrl !== 'string' || !checkoutUrl.startsWith('http')) {
          throw new Error('決済画面のURLが取得できませんでした。');
        }
        if (createdSessionId) {
          try {
            checkoutPayload.session_id = createdSessionId;
            const updatedPayloadStr = JSON.stringify(checkoutPayload);
            sessionStorage.setItem('okamoshi_apply_' + createdSessionId, updatedPayloadStr);
            localStorage.setItem('okamoshi_apply_' + createdSessionId, updatedPayloadStr);
            localStorage.setItem('okamoshi_latest_application', updatedPayloadStr);
            document.cookie = `okamoshi_apply_${createdSessionId}=${encodeURIComponent(updatedPayloadStr)}; path=/; max-age=7200; SameSite=Lax`;
          } catch (e) {
            console.warn('Session ID keyed storage failed:', e);
          }
        }
        clearTimeout(safetyTimer);
        window.location.href = checkoutUrl;
      } catch (err) {
        clearTimeout(safetyTimer);
        console.error('[決済セッション作成エラー]:', err);
        hideLoadingOverlay();
        resetSubmitBtn();
        if (typeof turnstile !== 'undefined' && typeof turnstile.reset === 'function') {
          try { turnstile.reset(); } catch (tErr) {}
        }
        const errorMessage = (err && err.message && err.message.includes('HTTP'))
          ? '決済サーバーとの通信に一時的な問題が発生しました。恐れ入りますが、少し時間をおいて再度お試しください。'
          : (err && err.message) || '決済画面の初期化に失敗しました。通信環境をお確かめの上、再度お試しいただくか、実行委員会までお問い合わせください。';
        showFormError(errorMessage, submitBtn, document.getElementById('formErrorMessage'));
      }
    }
    async function loadExamsFromD1() {
      try {
        const res = await fetch('/api/exam-guides', {
          cache: 'no-store'
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && data.grades) {
            _examGuidesCache = data.grades;
            if (currentSelectedGrade && typeof renderExamCards === 'function') {
              renderExamCards(currentSelectedGrade);
            }
            return;
          }
        }
        console.warn('[D1] HTTPレスポンスエラーまたは無効なデータ形式:', res.status);
      } catch (err) {
        console.warn('[D1] exam-guides データの取得に失敗しました。フォールバックデータを使用します:', err);
      }
      _examGuidesCache = null;
    }
    const loadExamsFromMicroCMS = loadExamsFromD1; // 後方互換用エイリアス
    function toggleNextExamDropdown(event) {
      if (event) event.stopPropagation();
      const dropdown = document.getElementById('nav-next-exam-dropdown');
      const chevron = document.getElementById('nav-next-exam-chevron');
      if (!dropdown) return;
      const isHidden = dropdown.classList.contains('hidden');
      if (isHidden) {
        dropdown.classList.remove('hidden');
        if (chevron) chevron.classList.add('rotate-180');
      } else {
        dropdown.classList.add('hidden');
        if (chevron) chevron.classList.remove('rotate-180');
      }
    }
    function closeNextExamDropdown() {
      const dropdown = document.getElementById('nav-next-exam-dropdown');
      const chevron = document.getElementById('nav-next-exam-chevron');
      if (dropdown) dropdown.classList.add('hidden');
      if (chevron) chevron.classList.remove('rotate-180');
    }
    function toggleContactDropdown(event) {
      if (event) event.stopPropagation();
      closeNextExamDropdown();
      const container = document.getElementById('nav-contact-container');
      if (!container) return;
      container.classList.toggle('is-open');
    }
    function closeContactDropdown() {
      const container = document.getElementById('nav-contact-container');
      if (container) container.classList.remove('is-open');
    }
    function toggleMobileMenu() {
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
    }
    function selectNavExamTab(gradeKey) {
      window.location.href = `/index.html#exam-tab-${gradeKey}`;
    }
    document.addEventListener('click', function(e) {
      const nextDropdown = document.getElementById('nav-next-exam-dropdown');
      const nextBtn = document.getElementById('nav-next-exam-btn');
      const chevron = document.getElementById('nav-next-exam-chevron');
      if (nextDropdown && !nextDropdown.contains(e.target) && !nextBtn?.contains(e.target)) {
        nextDropdown.classList.add('hidden');
        if (chevron) chevron.classList.remove('rotate-180');
      }
      const contactContainer = document.getElementById('nav-contact-container');
      if (contactContainer && !contactContainer.contains(e.target)) {
        contactContainer.classList.remove('is-open');
      }
    });
    async function initApplyFormPage() {
      const urlParams = new URLSearchParams(window.location.search);
      const rawGradeParam = urlParams.get('grade');
      const normalizedGrade = normalizeGradeParam(rawGradeParam);
      initialTargetGrade = normalizedGrade || null; // パラメータ未指定時は null（未選択）
      initialTargetMonth = parseMonthParam(urlParams.get('month'));
      await loadExamsFromD1();
      selectFormGrade(initialTargetGrade, initialTargetMonth);
      const checkedMethod = document.querySelector('input[name="payment_method"]:checked')?.value || null;
      updatePaymentMethodSummary(checkedMethod);
      initPostalCodeAutoSearch();
      initAddressLine2Guard();
      initSchoolAutoSuggest();
      initSchoolValidationAndAutofillGuard();
      initAgreementListeners();
      initGenderStorageListeners();
      restoreSavedProfile();
      if (document.activeElement && typeof document.activeElement.blur === 'function' && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
      window.scrollTo(0, 0);
      setTimeout(() => {
        if (document.activeElement && typeof document.activeElement.blur === 'function' && document.activeElement !== document.body) {
          document.activeElement.blur();
        }
        window.scrollTo(0, 0);
      }, 60);
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 250);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initApplyFormPage);
    } else {
      initApplyFormPage();
    }
