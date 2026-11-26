/**
 * gas/MarketingReport.gs 単体テスト
 * 実行: node tests/unit/marketing-report.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const GAS_PATH = path.join(ROOT, 'gas/MarketingReport.gs');

function formatDateTz(date, format) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  if (format === 'yyyy-MM-dd') return `${y}-${m}-${d}`;
  return `${y}-${m}-${d}`;
}

function loadMarketingReportGas(overrides = {}) {
  const source = fs.readFileSync(GAS_PATH, 'utf8');
  const logs = [];
  const defaultProps = {
    SHEET_NAME: 'main',
    PAST_SHEET_NAME: '過去受験者',
    GA4_PROPERTY_ID: '123456789',
    SEARCH_CONSOLE_SITE_URL: 'https://okayama-moshi.com/',
    GEMINI_API_KEY: 'dummy-key',
    GOOGLE_CHAT_WEBHOOK_URL: 'https://chat.example.invalid/webhook',
  };
  const propsStore = { ...defaultProps, ...(overrides.props || {}) };

  const context = {
    console: {
      log: (...a) => logs.push(['log', ...a]),
      warn: (...a) => logs.push(['warn', ...a]),
      error: (...a) => logs.push(['error', ...a]),
    },
    Utilities: {
      formatDate: (date, _tz, fmt) => formatDateTz(date, fmt),
      sleep: () => {},
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperties: () => ({ ...propsStore }),
        getProperty: (k) => (k in propsStore ? propsStore[k] : null),
        setProperty: (k, v) => { propsStore[k] = String(v); },
        deleteProperty: (k) => { delete propsStore[k]; },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: () => null,
        put: () => {},
        remove: () => {},
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {},
      }),
    },
    ScriptApp: {
      getOAuthToken: () => 'mock-oauth-token',
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: () => ({
        timeBased: () => ({
          after: () => ({ create: () => {} }),
          everyDays: () => ({ atHour: () => ({ nearMinute: () => ({ inTimezone: () => ({ create: () => {} }) }) }) }),
        }),
      }),
    },
    SpreadsheetApp: overrides.SpreadsheetApp || {
      getActiveSpreadsheet: () => ({ getSheetByName: () => null }),
    },
    UrlFetchApp: overrides.UrlFetchApp || {
      fetch: () => ({
        getResponseCode: () => 500,
        getContentText: () => '',
      }),
    },
    AnalyticsData: overrides.AnalyticsData || {
      Properties: {
        runReport: () => ({ rows: [] }),
      },
    },
    ...overrides.extraGlobals,
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: GAS_PATH });
  return { ctx: context, logs, propsStore };
}

function makeSheet(values) {
  return {
    getDataRange: () => ({
      getValues: () => values,
    }),
  };
}

function makeMutableSheet(initialRows = []) {
  const rows = initialRows.map((r) => [...r]);
  let frozenRows = 0;
  return {
    rows,
    getFrozenRows: () => frozenRows,
    setFrozenRows: (n) => { frozenRows = n; },
    getLastRow: () => rows.length,
    getDataRange: () => ({
      getValues: () => rows.map((r) => [...r]),
    }),
    appendRow: (row) => {
      rows.push([...row]);
    },
    getRange: (startRow, startCol, numRows, numCols) => ({
      setValues: (vals) => {
        for (let r = 0; r < numRows; r++) {
          const idx = startRow - 1 + r;
          while (rows.length <= idx) rows.push([]);
          for (let c = 0; c < numCols; c++) {
            rows[idx][startCol - 1 + c] = vals[r][c];
          }
        }
      },
    }),
  };
}

function makeSpreadsheet(sheetMap) {
  return {
    getSheetByName: (name) => sheetMap[name] || null,
    insertSheet: (name) => {
      const sh = makeMutableSheet([]);
      sheetMap[name] = sh;
      return sh;
    },
  };
}

test('GAS MarketingReport.gs: 構文エラーなし & 全主要関数定義チェック', () => {
  const { ctx } = loadMarketingReportGas();
  const requiredFns = [
    'testRunDailyMarketingReportNow',
    'runDailyMarketingReport',
    'runDailyMarketingReportRetry',
    'setupDailyMorningTrigger',
    'clearClarityCache',
    'executeMarketingReport_',
    'getScheduleGradePriority_',
    'resolveTargetExamInfo_',
    'getNextExamAndOrderSummary',
    'aggregateCurrentLedgerRows_',
    'aggregateLastYearSameTiming_',
    'getGA4Summary',
    'getSearchConsoleSummary',
    'getClaritySummary',
    'buildGeminiPrompt_',
    'generateGeminiAnalysis',
    'buildFallbackReport_',
    'extractInsightSummariesFromReport_',
    'appendDailyMarketingHistory_',
  ];
  for (const fn of requiredFns) {
    assert.equal(typeof ctx[fn], 'function', `${fn} が関数として定義されていること`);
  }
});

test('締切日数計算: 11/24時点で API・シート・フォールバックの3経路すべてで残り20日(クレカ)/17日(コンビニ)を算出すること', () => {
  const mainHeaders = ['受付日時', 'セッションID', '対象模試', '受験会場', '単価', '決済ステータス', '決済手段', 'H', 'I', 'J', '生徒氏名', 'フリガナ', '学年'];
  const mainSheet = makeSheet([mainHeaders]);

  // 1) API 経由 (/api/exam-guides?flat=1)
  const apiPayload = {
    success: true,
    flat: {
      schedules: [
        { id: 'c3_10', grade_code: 'c3', issue_name: '10月号', apply_deadline: '2026-10-16' },
        { id: 'c3_12', grade_code: 'c3', issue_name: '12月号', apply_deadline: '2026-12-14 23:59' },
      ],
      venues: [
        { schedule_id: 'c3_12', venue_type: '倉敷会場', exam_date_start: '2026-12-25T15:00:00.000Z' },
        { schedule_id: 'c3_12', venue_type: '岡山会場', exam_date_start: '2026-12-26T15:00:00.000Z' },
        { schedule_id: 'c3_12', venue_type: '津山会場', exam_date_start: '2027-01-08T15:00:00.000Z' },
        { schedule_id: 'c3_12', venue_type: '自宅受験', exam_date_start: '2026-12-25T15:00:00.000Z' },
      ],
    },
  };
  const { ctx: apiCtx } = loadMarketingReportGas({
    SpreadsheetApp: { getActiveSpreadsheet: () => makeSpreadsheet({ main: mainSheet }) },
    UrlFetchApp: {
      fetch: () => ({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify(apiPayload),
      }),
    },
  });
  const resApi = apiCtx.getNextExamAndOrderSummary('main', '2026-11-24', {});
  assert.equal(resApi.deadlineSource, 'api');
  assert.equal(resApi.targetExamMonth, '12月号');
  assert.equal(resApi.cardDeadline, '2026-12-14');
  assert.equal(resApi.konbiniDeadline, '2026-12-11');
  assert.equal(resApi.daysLeftCard, 20);
  assert.equal(resApi.daysLeftKonbini, 17);
  assert.notEqual(resApi.daysLeftCard, 35);
  assert.equal(resApi.examDates.length, 3);
  assert.equal(resApi.earliestExamDate, '2026-12-26'); // 2026-12-25T15:00:00Z -> JST 2026-12-26

  // 2) シート経由（列順が異なる模試基本情報シートをヘッダー名から動的解決）
  const masterSheet = makeSheet([
    ['表示順', '申込締切日時', '月号', '学年'],
    [1, '2026-10-16', '10月号', '中3'],
    [2, '2026-12-14 23:59', '12月号', '中3'],
  ]);
  const venueSheet = makeSheet([
    ['学年', '月号', '会場区分', '実施日'],
    ['中3', '12月号', '岡山会場', '2026-12-27'],
    ['中3', '12月号', '自宅受験', '2026-12-26'],
  ]);
  const { ctx: sheetCtx } = loadMarketingReportGas({
    SpreadsheetApp: {
      getActiveSpreadsheet: () =>
        makeSpreadsheet({ main: mainSheet, 模試基本情報: masterSheet, '会場・日程': venueSheet }),
    },
    UrlFetchApp: {
      fetch: () => { throw new Error('network disabled'); },
    },
  });
  const resSheet = sheetCtx.getNextExamAndOrderSummary('main', '2026-11-24', {});
  assert.equal(resSheet.deadlineSource, 'sheet');
  assert.equal(resSheet.cardDeadline, '2026-12-14');
  assert.equal(resSheet.konbiniDeadline, '2026-12-11');
  assert.equal(resSheet.daysLeftCard, 20);
  assert.equal(resSheet.daysLeftKonbini, 17);
  assert.equal(resSheet.examDates.length, 1);
  assert.equal(resSheet.examDates[0].date, '2026-12-27');

  // 3) API失敗 & 模試基本情報シート不在時のフォールバックでも動的計算（35にならない）
  const { ctx: fbCtx } = loadMarketingReportGas({
    SpreadsheetApp: { getActiveSpreadsheet: () => makeSpreadsheet({ main: mainSheet }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 503, getContentText: () => '' }) },
  });
  const resFb = fbCtx.getNextExamAndOrderSummary('main', '2026-11-24', {});
  assert.equal(resFb.deadlineSource, 'fallback');
  assert.equal(resFb.cardDeadline, '2026-12-14');
  assert.equal(resFb.konbiniDeadline, '2026-12-11');
  assert.equal(resFb.daysLeftCard, 20);
  assert.equal(resFb.daysLeftKonbini, 17);
});

test('台帳集計 & 過去受験者シートからの昨年同時期比較（4学年・会場別・未入金・直近7日ペース・必要ペース）', () => {
  const mainHeaders = ['受付日時', 'セッションID', '対象模試', '受験会場', '単価', '決済ステータス', '決済手段', 'H', 'I', 'J', '生徒氏名', 'フリガナ', '学年'];
  const rowMain = (date, exam, venue, status, grade) => [date, 'cs_1', exam, venue, 5500, status, 'card', '', '', '', 'テスト', 'テスト', grade];

  const mainRows = [
    mainHeaders,
    rowMain('2026-11-10 10:00', '12月号', '岡山会場', 'paid', '中学3年生'),
    rowMain('2026-11-15 12:00', '12月号', '倉敷会場', 'paid', '中3'),
    rowMain('2026-11-19 09:00', '12月号', '津山会場', 'paid', '中学2年生'),
    rowMain('2026-11-20 14:00', '12月号', '自宅受験', 'paid', '小学6年生'),
    rowMain('2026-11-21 15:00', '12月号', '岡山会場', 'paid', '中3'),
    rowMain('2026-11-23 18:00', '12月号', '倉敷会場', '未入金', '中学1年生'),
    rowMain('2026-11-24 08:00', '12月号', '岡山会場', 'paid', '中3'),
    rowMain('2026-11-24 19:00', '12月号', '自宅受験', '未入金', '中2'),
    rowMain('2026-11-24 20:00', '12月号', '岡山会場', '期限切れ', '中3'),
    // 別号（10月号）は昨日単日には計上されるが、12月号累積には含まれない
    rowMain('2026-10-10 10:00', '10月号', '岡山会場', 'paid', '中3'),
  ];

  const pastRows = [
    mainHeaders,
    // 昨年12月号（11/24カットオフ以前: 中3=3, 中2=1, 中1=1, 小6=0）
    rowMain('2025-11-05 10:00', '12月号', '岡山会場', 'paid', '中3'),
    rowMain('2025-11-12 10:00', '12月号', '倉敷会場', 'paid', '中3'),
    rowMain('2025-11-24 21:00', '12月号', '自宅受験', 'paid', '中3'),
    rowMain('2025-11-20 11:00', '12月号', '岡山会場', 'paid', '中2'),
    rowMain('2025-11-22 11:00', '12月号', '津山会場', 'paid', '中1'),
    // 昨年12月号（11/24カットオフ以降: 最終実績には含まれるが同時期には含まれない）
    rowMain('2025-12-05 10:00', '12月号', '岡山会場', 'paid', '中3'),
    rowMain('2025-12-10 10:00', '12月号', '自宅受験', 'paid', '小6'),
    // キャンセル（除外）
    rowMain('2025-11-18 10:00', '12月号', '岡山会場', 'キャンセル', '中3'),
    // 一昨年度（ウィンドウ外: 除外）
    rowMain('2024-11-20 10:00', '12月号', '岡山会場', 'paid', '中3'),
  ];

  const { ctx } = loadMarketingReportGas({
    SpreadsheetApp: {
      getActiveSpreadsheet: () =>
        makeSpreadsheet({ main: makeSheet(mainRows), 過去受験者: makeSheet(pastRows) }),
    },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 500, getContentText: () => '' }) },
  });

  const summary = ctx.getNextExamAndOrderSummary('main', '2026-11-24', {});

  // 当日・累積
  assert.equal(summary.yesterdayCount, 3);
  assert.equal(summary.yesterdayPaid, 1);
  assert.equal(summary.yesterdayUnpaid, 1);
  assert.equal(summary.currentExamPaid, 6);
  assert.equal(summary.currentExamUnpaid, 2);
  assert.equal(summary.currentExamCanceled, 1);

  // 学年別
  assert.equal(summary.gradeCounts['中3'], 4);
  assert.equal(summary.gradeCounts['中2'], 1);
  assert.equal(summary.gradeCounts['中1'], 0);
  assert.equal(summary.gradeCounts['小6'], 1);
  assert.equal(summary.gradeUnpaidCounts['中1'], 1);
  assert.equal(summary.gradeUnpaidCounts['中2'], 1);

  // 会場別
  assert.equal(summary.venueCounts['岡山'], 3);
  assert.equal(summary.venueCounts['倉敷'], 1);
  assert.equal(summary.venueCounts['津山'], 1);
  assert.equal(summary.venueCounts['自宅'], 1);
  assert.equal(summary.venueUnpaidCounts['倉敷'], 1);
  assert.equal(summary.venueUnpaidCounts['自宅'], 1);

  // 直近7日（2026-11-18〜2026-11-24）: paid は 11/19, 11/20, 11/21, 11/24 の4件
  assert.equal(summary.recent7dPaid, 4);
  assert.equal(summary.recent7dAll, 6); // 期限切れ除く
  assert.equal(summary.dailyPace7d, 0.6); // 4/7 = 0.57 -> 0.6

  // 昨年同時期比較
  assert.equal(summary.lastYearComparison.available, true);
  assert.equal(summary.lastYearComparison.cutoffDate, '2025-11-24');
  assert.equal(summary.lastYearComparison.sameTimingPaidTotal, 5);
  assert.equal(summary.lastYearComparison.finalPaidTotal, 7);
  assert.equal(summary.lastYearComparison.diffFromLastYear, 1);
  assert.equal(summary.lastYearComparison.yoyPct, 120);
  assert.equal(summary.lastYearComparison.byGrade['中3'].lastYearSameTiming, 3);
  assert.equal(summary.lastYearComparison.byGrade['中3'].diff, 1);
  assert.equal(summary.lastYearComparison.byGrade['小6'].lastYearSameTiming, 0);
  assert.equal(summary.lastYearComparison.byGrade['小6'].diff, 1);
  assert.equal(summary.gapToTarget, 1); // 7 - 6 = 1
  assert.equal(summary.requiredDailyPace, 0.1); // 1 / 20 = 0.05 -> 0.1

  // 過去受験者シート不在時の安全フォールバック
  const { ctx: noPastCtx } = loadMarketingReportGas({
    SpreadsheetApp: { getActiveSpreadsheet: () => makeSpreadsheet({ main: makeSheet(mainRows) }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 500, getContentText: () => '' }) },
  });
  const noPastSummary = noPastCtx.getNextExamAndOrderSummary('main', '2026-11-24', {});
  assert.equal(noPastSummary.lastYearComparison.available, false);
  assert.equal(noPastSummary.lastYearComparison.sameTimingPaidTotal, null);
  assert.equal(noPastSummary.targetTotal, 344); // 250 + 55 + 39
});

test('GA4 マルチ期間・ページ別TOP5(トップ除外)・/apply/ CVR・チャネル分析 & 部分失敗耐性', () => {
  let callIndex = 0;
  const mockRunReport = (req) => {
    callIndex++;
    // 1A: 4期間
    if (req.dateRanges && req.dateRanges.length === 4) {
      return {
        rows: [
          { dimensionValues: [{ value: 'yesterday' }], metricValues: [{ value: '44' }, { value: '52' }, { value: '110' }] },
          { dimensionValues: [{ value: 'last7d' }], metricValues: [{ value: '350' }, { value: '420' }, { value: '980' }] },
          { dimensionValues: [{ value: 'prev7d' }], metricValues: [{ value: '280' }, { value: '350' }, { value: '700' }] },
          { dimensionValues: [{ value: 'last28d' }], metricValues: [{ value: '1200' }, { value: '1500' }, { value: '3600' }] },
        ],
      };
    }
    // 1B: prev28d & yoy28d
    if (req.dateRanges && req.dateRanges.length === 2 && !req.dimensions) {
      return {
        rows: [
          { dimensionValues: [{ value: 'prev28d' }], metricValues: [{ value: '1000' }, { value: '1250' }, { value: '3000' }] },
          { dimensionValues: [{ value: 'yoy28d' }], metricValues: [{ value: '800' }, { value: '1000' }, { value: '2400' }] },
        ],
      };
    }
    // 2: pagePath
    if (req.dimensions && req.dimensions[0].name === 'pagePath') {
      return {
        rows: [
          { dimensionValues: [{ value: '/' }], metricValues: [{ value: '450' }, { value: '250' }, { value: '15000' }] },
          { dimensionValues: [{ value: '/index.html' }], metricValues: [{ value: '20' }, { value: '15' }, { value: '600' }] },
          { dimensionValues: [{ value: '/apply' }], metricValues: [{ value: '90' }, { value: '60' }, { value: '5400' }] },
          { dimensionValues: [{ value: '/apply/?grade=c3' }], metricValues: [{ value: '30' }, { value: '20' }, { value: '1800' }] },
          { dimensionValues: [{ value: '/schools.html' }], metricValues: [{ value: '110' }, { value: '75' }, { value: '4500' }] },
          { dimensionValues: [{ value: '/news/column/' }], metricValues: [{ value: '85' }, { value: '60' }, { value: '7200' }] },
          { dimensionValues: [{ value: '/contact/individual/' }], metricValues: [{ value: '40' }, { value: '30' }, { value: '1200' }] },
          { dimensionValues: [{ value: '/news/' }], metricValues: [{ value: '35' }, { value: '25' }, { value: '1000' }] },
          { dimensionValues: [{ value: '/lp/' }], metricValues: [{ value: '25' }, { value: '20' }, { value: '800' }] },
        ],
      };
    }
    // 3: チャネル
    if (req.dimensions && req.dimensions[0].name === 'sessionDefaultChannelGroup') {
      return {
        rows: [
          { dimensionValues: [{ value: 'Organic Search' }, { value: 'last7d' }], metricValues: [{ value: '240' }, { value: '200' }] },
          { dimensionValues: [{ value: 'Organic Search' }, { value: 'prev7d' }], metricValues: [{ value: '200' }, { value: '170' }] },
          { dimensionValues: [{ value: 'Direct' }, { value: 'last7d' }], metricValues: [{ value: '120' }, { value: '100' }] },
          { dimensionValues: [{ value: 'Direct' }, { value: 'prev7d' }], metricValues: [{ value: '100' }, { value: '90' }] },
          { dimensionValues: [{ value: 'Referral' }, { value: 'last7d' }], metricValues: [{ value: '60' }, { value: '50' }] },
          { dimensionValues: [{ value: 'Referral' }, { value: 'prev7d' }], metricValues: [{ value: '50' }, { value: '40' }] },
        ],
      };
    }
    return { rows: [] };
  };

  const { ctx } = loadMarketingReportGas({
    AnalyticsData: { Properties: { runReport: mockRunReport } },
  });

  const ga4 = ctx.getGA4Summary('123456789', '2026-11-24', { recent7dAll: 20, recent7dPaid: 16 });
  assert.equal(callIndex, 4);
  assert.equal(ga4.periods.yesterday.users, 44);
  assert.equal(ga4.periods.last7d.avgDailyUsers, 50); // 350/7
  assert.equal(ga4.periods.last7d.usersWowPct, 25); // (350-280)/280 = +25%
  assert.equal(ga4.periods.last7d.pvWowPct, 40); // (980-700)/700 = +40%
  assert.equal(ga4.periods.last28d.usersMomPct, 20); // +20%
  assert.equal(ga4.periods.last28d.yoyAvailable, true);
  assert.equal(ga4.periods.last28d.usersYoyPct, 50); // (1200-800)/800 = +50%

  // topPages はトップページ(/, /index.html)を除外したTOP5、かつ /apply と /apply/?grade=c3 が統合
  assert.equal(ga4.topPages.length, 5);
  assert.equal(ga4.topPages.some(p => p.path === '/' || p.path === '/index.html'), false);
  const applyPage = ga4.topPages.find(p => p.path === '/apply/');
  assert.ok(applyPage);
  assert.equal(applyPage.pageViews, 120);
  assert.equal(applyPage.users, 80);
  assert.equal(applyPage.avgEngagementSec, 90); // 7200 / 80

  // ファネル通過率
  assert.equal(ga4.applyFunnel.applyPageUsers7d, 80);
  assert.equal(ga4.applyFunnel.cvrAllPct, 25); // 20/80 = 25%
  assert.equal(ga4.applyFunnel.cvrPaidPct, 20); // 16/80 = 20%

  // チャネル構成比 & 前週比
  assert.equal(ga4.channels[0].channel, 'Organic Search');
  assert.equal(ga4.channels[0].sharePct, 57.1); // 240/420
  assert.equal(ga4.channels[0].wowPct, 20); // (240-200)/200

  // 部分失敗耐性（チャネル取得だけ失敗しても他は維持）
  const { ctx: partialCtx } = loadMarketingReportGas({
    AnalyticsData: {
      Properties: {
        runReport: (req) => {
          if (req.dimensions && req.dimensions[0].name === 'sessionDefaultChannelGroup') {
            throw new Error('Quota exceeded');
          }
          return mockRunReport(req);
        },
      },
    },
  });
  const partialGa4 = partialCtx.getGA4Summary('123456789', '2026-11-24', { recent7dAll: 20, recent7dPaid: 16 });
  assert.equal(partialGa4.periods.yesterday.users, 44);
  assert.equal(partialGa4.topPages.length, 5);
  assert.equal(partialGa4.channels.length, 0);
  assert.ok(partialGa4.errors.some(e => e.includes('channels')));
});

test('Search Console 直近7日上位TOP5 & 前週比伸長クエリ抽出・エラー耐性', () => {
  const { ctx } = loadMarketingReportGas({
    UrlFetchApp: {
      fetch: (_url, opts) => {
        const body = JSON.parse(opts.payload);
        // 今週 (2026-11-16〜2026-11-22)
        if (body.startDate === '2026-11-16') {
          return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({
              rows: [
                { keys: ['おかもし'], clicks: 55, impressions: 320, ctr: 0.1718, position: 1.2 },
                { keys: ['岡山県統一模擬試験'], clicks: 38, impressions: 410, ctr: 0.0926, position: 1.5 },
                { keys: ['岡山 模試 中3'], clicks: 24, impressions: 500, ctr: 0.048, position: 3.1 },
                { keys: ['おかもし 日程'], clicks: 15, impressions: 140, ctr: 0.107, position: 2.0 },
                { keys: ['岡山県 適性検査 模試'], clicks: 11, impressions: 220, ctr: 0.05, position: 4.4 },
                { keys: ['倉敷 模試 会場'], clicks: 6, impressions: 90, ctr: 0.066, position: 5.2 },
              ],
            }),
          };
        }
        // 前週 (2026-11-09〜2026-11-15)
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            rows: [
              { keys: ['おかもし'], clicks: 45, impressions: 290, ctr: 0.155, position: 1.3 },
              { keys: ['岡山県統一模擬試験'], clicks: 40, impressions: 400, ctr: 0.10, position: 1.5 },
              { keys: ['岡山 模試 中3'], clicks: 10, impressions: 260, ctr: 0.038, position: 4.5 },
            ],
          }),
        };
      },
    },
  });

  const sc = ctx.getSearchConsoleSummary('https://okayama-moshi.com/', '2026-11-24');
  assert.equal(sc.available, true);
  assert.equal(sc.period.startDate, '2026-11-16');
  assert.equal(sc.period.endDate, '2026-11-22');
  assert.equal(sc.topQueries.length, 5);
  assert.equal(sc.topQueries[0].query, 'おかもし');
  assert.equal(sc.topQueries[0].clicksDiff, 10);
  assert.equal(sc.risingQueries[0].query, 'おかもし 日程'); // 0 -> 15 (+15 clicks)
  assert.equal(sc.risingQueries[0].clicksDiff, 15);
  assert.equal(sc.risingQueries[1].query, '岡山 模試 中3'); // 10 -> 24 (+14 clicks)
  assert.equal(sc.risingQueries[1].clicksDiff, 14);

  // HTTP 500 時の安全フォールバック
  const { ctx: errCtx } = loadMarketingReportGas({
    UrlFetchApp: {
      fetch: () => ({ getResponseCode: () => 500, getContentText: () => 'Internal Error' }),
    },
  });
  const errSc = errCtx.getSearchConsoleSummary('https://okayama-moshi.com/', '2026-11-24');
  assert.equal(errSc.available, false);
  assert.equal(errSc.topQueries.length, 0);
  assert.ok(errSc.error.includes('500'));
});

test('Geminiプロンプト禁止表現＆buildFallbackReport_コンパクト出力検証', () => {
  const { ctx } = loadMarketingReportGas();
  const sampleRaw = {
    targetDate: '2026-11-24',
    exam: {
      targetExamMonth: '12月号',
      cardDeadline: '2026-12-14',
      konbiniDeadline: '2026-12-11',
      daysLeftCard: 20,
      daysLeftKonbini: 17,
      examDates: [
        { venue: '倉敷', date: '2026-12-26' },
        { venue: '岡山', date: '2026-12-27' },
        { venue: '津山', date: '2027-01-09' },
      ],
      deadlineSource: 'api',
      yesterdayCount: 8,
      yesterdayPaid: 6,
      yesterdayUnpaid: 2,
      currentExamPaid: 142,
      currentExamUnpaid: 9,
      currentExamCanceled: 3,
      recent7dPaid: 42,
      recent7dAll: 48,
      dailyPace7d: 6.0,
      targetTotal: 344,
      targetTotalSource: '昨年同号最終実績',
      gapToTarget: 202,
      requiredDailyPace: 10.1,
      gradeCounts: { '中3': 102, '中2': 22, '中1': 11, '小6': 7, 'その他': 0 },
      gradeUnpaidCounts: { '中3': 6, '中2': 2, '中1': 1, '小6': 0, 'その他': 0 },
      venueCounts: { '岡山': 64, '倉敷': 38, '津山': 12, '自宅': 28, 'その他': 0 },
      venueUnpaidCounts: { '岡山': 4, '倉敷': 3, '津山': 0, '自宅': 2, 'その他': 0 },
      lastYearComparison: {
        available: true,
        cutoffDate: '2025-11-24',
        sameTimingPaidTotal: 128,
        finalPaidTotal: 344,
        diffFromLastYear: 14,
        yoyPct: 110.9,
        byGrade: {
          '中3': { current: 102, unpaid: 6, lastYearSameTiming: 95, diff: 7, yoyPct: 107.4 },
          '中2': { current: 22, unpaid: 2, lastYearSameTiming: 18, diff: 4, yoyPct: 122.2 },
          '中1': { current: 11, unpaid: 1, lastYearSameTiming: 10, diff: 1, yoyPct: 110.0 },
          '小6': { current: 7, unpaid: 0, lastYearSameTiming: 5, diff: 2, yoyPct: 140.0 },
        },
      },
    },
    ga4: {
      users: 44,
      sessions: 52,
      pageViews: 110,
      periods: {
        yesterday: { users: 44, sessions: 52, pageViews: 110 },
        last7d: { users: 350, sessions: 420, pageViews: 980, avgDailyUsers: 50.0, usersWowPct: 25.0, pvWowPct: 40.0 },
        last28d: { users: 1200, sessions: 1500, pageViews: 3600, usersMomPct: 20.0, yoyAvailable: true, usersYoyPct: 50.0, pvMomPct: 18.5 },
      },
      topPages: [
        { path: '/apply/', pageViews: 145, users: 96, avgEngagementSec: 112 },
        { path: '/schools.html', pageViews: 118, users: 82, avgEngagementSec: 64 },
        { path: '/news/column/', pageViews: 94, users: 71, avgEngagementSec: 138 },
        { path: '/news/', pageViews: 68, users: 54, avgEngagementSec: 45 },
        { path: '/lp/', pageViews: 52, users: 41, avgEngagementSec: 58 },
      ],
      applyFunnel: {
        applyPageUsers7d: 96,
        applyPageViews7d: 145,
        recent7dAllOrders: 48,
        recent7dPaidOrders: 42,
        cvrAllPct: 50.0,
        cvrPaidPct: 43.8,
      },
      channels: [
        { channel: 'Organic Search', sessions: 240, sharePct: 57.1, wowPct: 20.0 },
        { channel: 'Direct', sessions: 120, sharePct: 28.6, wowPct: 15.0 },
        { channel: 'Referral', sessions: 60, sharePct: 14.3, wowPct: 9.1 },
      ],
    },
    searchConsole: {
      available: true,
      period: { startDate: '2026-11-16', endDate: '2026-11-22' },
      topQueries: [
        { query: 'おかもし', clicks: 55, impressions: 320, ctr: '17.2%', position: '1.2', clicksDiff: 10 },
        { query: '岡山県統一模擬試験', clicks: 38, impressions: 410, ctr: '9.3%', position: '1.5', clicksDiff: -2 },
        { query: '岡山 模試 中3', clicks: 24, impressions: 500, ctr: '4.8%', position: '3.1', clicksDiff: 14 },
        { query: 'おかもし 日程', clicks: 15, impressions: 140, ctr: '10.7%', position: '2.0', clicksDiff: 4 },
        { query: '岡山県 適性検査 模試', clicks: 11, impressions: 220, ctr: '5.0%', position: '4.4', clicksDiff: 3 },
      ],
      risingQueries: [
        { query: '岡山 模試 中3', clicksDiff: 14, impressionsDiff: 240 },
        { query: 'おかもし', clicksDiff: 10, impressionsDiff: 30 },
      ],
      missedOpportunityQueries: [
        { query: '岡山 高校入試 模試 偏差値', clicks: 4, impressions: 320, ctr: '1.3%', position: '9.4', reason: '高表示・低CTR＆順位8〜20位' },
        { query: 'おかもし 過去問', clicks: 3, impressions: 180, ctr: '1.7%', position: '6.2', reason: '高表示・低CTR(スルー)' },
      ],
    },
    clarity: {
      enabled: true,
      byDevice: {
        Mobile: { avgScrollDepth: '64.5%', avgActiveSeconds: '58秒', deadClicks: 2, rageClicks: 0, quickbacks: 1, scriptErrors: 0 },
        PC: { avgScrollDepth: '71.2%', avgActiveSeconds: '74秒', deadClicks: 1, rageClicks: 0, quickbacks: 0, scriptErrors: 0 },
      },
      keyPagesAndFriction: [],
    },
  };

  const prompt = ctx.buildGeminiPrompt_(sampleRaw);
  assert.ok(prompt.includes('抽象的な感想文・ポエム・一般論は全面禁止'));
  assert.ok(prompt.includes('マーケティング憲法'));
  assert.ok(prompt.includes('残り *20日*'));
  assert.ok(prompt.includes('残り *17日*'));
  assert.ok(prompt.includes('CVR 50%'));
  assert.ok(prompt.includes('離脱率 50%'));
  assert.ok(prompt.includes('岡山 模試 中3'));
  assert.ok(prompt.includes('岡山 高校入試 模試 偏差値'));
  assert.ok(prompt.includes('■ 顧客インサイト診断'));
  assert.ok(prompt.includes('[買う理由]'));
  assert.ok(prompt.includes('[買わない壁]'));
  assert.ok(prompt.includes('[転換の打ち手]'));

  const fallback = ctx.buildFallbackReport_(sampleRaw);
  const lineCount = fallback.split('\n').length;
  assert.ok(lineCount >= 20 && lineCount <= 35, `フォールバック出力は35行以内であること (実際: ${lineCount}行)`);
  assert.ok(fallback.includes('残20日') && fallback.includes('残17日'));
  assert.ok(fallback.includes('前年比110.9%'));
  assert.ok(fallback.includes('CVR 50%'));
  assert.ok(fallback.includes('/apply/'));
  assert.ok(fallback.includes('岡山 模試 中3'));
  assert.ok(fallback.includes('岡山 高校入試 模試 偏差値'));
  assert.ok(fallback.includes('[買う理由]:'));
  assert.ok(fallback.includes('[買わない壁]:'));
  assert.ok(fallback.includes('[転換の打ち手]:'));
});

test('同日締切(12/14)で小6適性検査と中3が混在する場合でも中3実施日(倉敷12/26・岡山12/27・津山1/9)を最優先選択すること', () => {
  const mainHeaders = ['受付日時', 'セッションID', '対象模試', '受験会場', '単価', '決済ステータス', '決済手段', 'H', 'I', 'J', '生徒氏名', 'フリガナ', '学年'];
  const mainSheet = makeSheet([mainHeaders]);

  // 小6適性検査が先に並んでいるペイロード（締切は同じ 2026-12-14）
  const apiPayload = {
    success: true,
    flat: {
      schedules: [
        { id: 'p6_12', grade_code: 'p6', grade_name: '小6', issue_name: '12月号適性検査', apply_deadline: '2026-12-14 23:59' },
        { id: 'c2_12', grade_code: 'c2', grade_name: '中2', issue_name: '12月号', apply_deadline: '2026-12-14 23:59' },
        { id: 'c3_12', grade_code: '', grade_name: '中学3年', issue_name: '12月号', apply_deadline: '2026-12-14 23:59' },
      ],
      venues: [
        { schedule_id: 'p6_12', venue_type: '岡山会場', exam_date_start: '2027-01-10' },
        { schedule_id: 'c3_12', venue_type: '津山会場', exam_date_start: '2027-01-09' },
        { schedule_id: 'c3_12', venue_type: '倉敷会場', exam_date_start: '2026-12-26' },
        { schedule_id: 'c3_12', venue_type: '岡山会場', exam_date_start: '2026-12-27' },
        { schedule_id: 'c3_12', venue_type: '自宅受験', exam_date_start: '2026-12-26' },
      ],
    },
  };

  const { ctx } = loadMarketingReportGas({
    SpreadsheetApp: { getActiveSpreadsheet: () => makeSpreadsheet({ main: mainSheet }) },
    UrlFetchApp: {
      fetch: () => ({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify(apiPayload),
      }),
    },
  });

  const summary = ctx.getNextExamAndOrderSummary('main', '2026-11-25', {});
  assert.equal(summary.targetExamMonth, '12月号');
  assert.deepEqual(JSON.parse(JSON.stringify(summary.examDates)), [
    { venue: '倉敷', date: '2026-12-26' },
    { venue: '岡山', date: '2026-12-27' },
    { venue: '津山', date: '2027-01-09' },
  ]);
});

test('過去受験者シートの受付日時(A列)欠損行フォールバック: 昨年最終実績件数と現在達成率を算出すること', () => {
  const headers = ['受付日時', 'セッションID', '対象模試', '受験会場', '単価', '決済ステータス', '決済手段', 'H', 'I', 'J', '生徒氏名', 'フリガナ', '学年'];
  const row = (date, exam, venue, status, grade) => [date, 'cs_1', exam, venue, 5500, status, 'card', '', '', '', 'テスト', 'テスト', grade];

  const mainRows = [
    headers,
    row('2026-11-20 10:00', '12月号', '岡山会場', 'paid', '中3'),
    row('2026-11-21 10:00', '12月号', '倉敷会場', 'paid', '中3'),
    row('2026-11-22 10:00', '12月号', '津山会場', 'paid', '中2'),
  ];
  // A列の受付日時が空欄のみの過去受験者シート（計6件: 中3=4, 中2=2）
  const pastRowsUndated = [
    headers,
    row('', '12月号', '岡山会場', 'paid', '中3'),
    row('', '12月号', '岡山会場', 'paid', '中3'),
    row('', '12月号', '倉敷会場', 'paid', '中3'),
    row('', '12月号', '津山会場', 'paid', '中3'),
    row('', '12月号', '岡山会場', 'paid', '中2'),
    row('', '12月号', '自宅受験', 'paid', '中2'),
    row('', '12月号', '岡山会場', 'キャンセル', '中3'),
    row('', '10月号', '岡山会場', 'paid', '中3'),
  ];

  const { ctx } = loadMarketingReportGas({
    SpreadsheetApp: {
      getActiveSpreadsheet: () =>
        makeSpreadsheet({ main: makeSheet(mainRows), 過去受験者: makeSheet(pastRowsUndated) }),
    },
  });

  const summary = ctx.getNextExamAndOrderSummary('main', '2026-11-25', {});
  assert.equal(summary.lastYearComparison.available, true);
  assert.equal(summary.lastYearComparison.sameTimingAvailable, false);
  assert.equal(summary.lastYearComparison.sameTimingPaidTotal, null);
  assert.equal(summary.lastYearComparison.undatedMatchedRows, 6);
  assert.equal(summary.lastYearComparison.finalPaidTotal, 6);
  assert.equal(summary.lastYearComparison.finalAchievementPct, 50.0); // 3 / 6
  assert.equal(summary.lastYearComparison.byGrade['中3'].lastYearFinal, 4);
  assert.equal(summary.lastYearComparison.byGrade['中3'].finalAchievementPct, 50.0); // 2 / 4
  assert.equal(summary.lastYearComparison.byGrade['中2'].lastYearFinal, 2);
  assert.equal(summary.lastYearComparison.byGrade['中2'].finalAchievementPct, 50.0); // 1 / 2

  const rawData = { targetDate: '2026-11-25', exam: summary, ga4: { periods: {}, topPages: [], channels: [], applyFunnel: {} }, searchConsole: {}, clarity: {} };
  const prompt = ctx.buildGeminiPrompt_(rawData);
  assert.ok(prompt.includes('昨年最終実績 6件（現在達成率50%）'));
  const fallback = ctx.buildFallbackReport_(rawData);
  assert.ok(fallback.includes('昨年最終実績 6件（達成率 *50%*）'));
});

test('Search Console 第1層(見送り・機会損失クエリ TOP3)を正しく抽出すること', () => {
  const { ctx } = loadMarketingReportGas({
    UrlFetchApp: {
      fetch: (_url, opts) => {
        const body = JSON.parse(opts.payload);
        if (body.startDate === '2026-11-16') {
          return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({
              rows: [
                { keys: ['おかもし'], clicks: 60, impressions: 200, ctr: 0.30, position: 1.1 },
                { keys: ['岡山 高校入試 模試'], clicks: 8, impressions: 600, ctr: 0.0133, position: 9.2 },
                { keys: ['岡山 模試 中3 日程'], clicks: 12, impressions: 350, ctr: 0.0342, position: 4.5 },
                { keys: ['岡山 統一模試 過去問'], clicks: 3, impressions: 250, ctr: 0.012, position: 11.4 },
                { keys: ['おかもし 申し込み'], clicks: 40, impressions: 150, ctr: 0.266, position: 1.4 },
              ],
            }),
          };
        }
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ rows: [] }) };
      },
    },
  });

  const sc = ctx.getSearchConsoleSummary('https://okayama-moshi.com/', '2026-11-24');
  assert.equal(sc.missedOpportunityQueries.length, 3);
  assert.equal(sc.missedOpportunityQueries[0].query, '岡山 高校入試 模試');
  assert.equal(sc.missedOpportunityQueries[0].reason, '高表示・低CTR＆順位8〜20位');
  assert.equal(sc.missedOpportunityQueries[1].query, '岡山 模試 中3 日程');
  assert.equal(sc.missedOpportunityQueries[2].query, '岡山 統一模試 過去問');
});

test('マーケティング履歴シートへの日次自動蓄積（シート自動作成・ヘッダー・追記・同一日upsert）', () => {
  const sheetMap = {};
  const { ctx } = loadMarketingReportGas({
    SpreadsheetApp: { getActiveSpreadsheet: () => makeSpreadsheet(sheetMap) },
  });

  const reportText = [
    '📊 *おかもし日次マーケティング速報（2026-11-25）*',
    '■ 顧客インサイト診断（買う理由・買わない壁・売り込み不要化の打ち手）',
    '・[買う理由]: /schools.html(平均滞在82秒)熟読後に中3が前週比+14件',
    '・[買わない壁]: 第1層 "岡山 模試"(480imp/CTR1.8%/9.5位)で検索スルー',
    '・[転換の打ち手]: 検索title先頭へ「12/26・27開催＆合格判定データ」を明記',
  ].join('\n');

  const insights = ctx.extractInsightSummariesFromReport_(reportText);
  assert.equal(insights.buyReason, '/schools.html(平均滞在82秒)熟読後に中3が前週比+14件');
  assert.equal(insights.barrier, '第1層 "岡山 模試"(480imp/CTR1.8%/9.5位)で検索スルー');
  assert.equal(insights.action, '検索title先頭へ「12/26・27開催＆合格判定データ」を明記');

  const baseRaw = {
    targetDate: '2026-11-25',
    exam: {
      targetExamMonth: '12月号',
      daysLeftCard: 19,
      daysLeftKonbini: 16,
      currentExamPaid: 145,
      currentExamUnpaid: 8,
      dailyPace7d: 6.4,
      requiredDailyPace: 9.8,
      lastYearComparison: { yoyPct: 112.5, finalAchievementPct: 42.1 },
    },
    ga4: {
      periods: { last7d: { users: 360, pageViews: 1020 } },
      applyFunnel: { applyPageUsers7d: 100, cvrAllPct: 48.0 },
    },
    searchConsole: {
      topQueries: [{ query: 'おかもし', clicks: 55 }],
      missedOpportunityQueries: [{ query: '岡山 模試', impressions: 480, ctr: '1.8%' }],
    },
  };

  // 1回目: シート新規作成 ＋ ヘッダー19列 ＋ 1行追記
  const res1 = ctx.appendDailyMarketingHistory_(baseRaw, reportText, {});
  assert.equal(res1.action, 'appended');
  const histSheet = sheetMap['マーケティング履歴'];
  assert.ok(histSheet, 'マーケティング履歴シートが自動作成されること');
  assert.equal(histSheet.getFrozenRows(), 1);
  assert.equal(histSheet.rows.length, 2);
  assert.equal(histSheet.rows[0][0], '基準日');
  assert.equal(histSheet.rows[0].length, 19);
  assert.equal(histSheet.rows[1][0], '2026-11-25');
  assert.equal(histSheet.rows[1][4], 145);
  assert.equal(histSheet.rows[1][6], '112.5%');
  assert.equal(histSheet.rows[1][15], insights.buyReason);
  assert.equal(histSheet.rows[1][16], insights.barrier);
  assert.equal(histSheet.rows[1][17], insights.action);

  // 2回目: 同じ targetDate で再実行すると重複追記せず同じ行を上書き更新（upsert）
  const updatedRaw = JSON.parse(JSON.stringify(baseRaw));
  updatedRaw.exam.currentExamPaid = 152;
  const res2 = ctx.appendDailyMarketingHistory_(updatedRaw, reportText, {});
  assert.equal(res2.action, 'updated');
  assert.equal(histSheet.rows.length, 2, '同一基準日は重複追記されず2行(ヘッダー+1データ行)のままであること');
  assert.equal(histSheet.rows[1][4], 152);

  // 3回目: 別日なら新規追記
  const nextDayRaw = JSON.parse(JSON.stringify(updatedRaw));
  nextDayRaw.targetDate = '2026-11-26';
  const res3 = ctx.appendDailyMarketingHistory_(nextDayRaw, reportText, {});
  assert.equal(res3.action, 'appended');
  assert.equal(histSheet.rows.length, 3);
  assert.equal(histSheet.rows[2][0], '2026-11-26');
});
