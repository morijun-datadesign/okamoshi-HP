/**
 * 岡山県統一模擬試験（おかもし）
 * 日次マーケティング速報自動生成・Google Chat通知スクリプト
 * 【締切日数動的解決・昨年同時期実数比較・GA4マルチ期間＆人気ページ/CVR・GSC急伸クエリ対応版】
 */

// 現行のGemini 3系モデル＋公式最新エイリアス（思考レベルをlowに固定して6分タイムアウトと503を防止）
const GEMINI_MODEL_CASCADE = [
  { name: 'gemini-3.5-flash-lite', thinkingBudget: undefined }, // 1. 最速・超軽量（思考パラメータ不要・4秒で完了）
  { name: 'gemini-3.8-flash',      thinkingBudget: undefined }, // 2. 標準Flash
  { name: 'gemini-flash-latest',   thinkingBudget: undefined }  // 3. バックアップ
];

const RETRY_SETTINGS = {
  MAX_RETRIES: 3,           // 最大自動リトライ回数（12分おき×3回＝最大36分粘る）
  INTERVAL_MINUTES: 12,     // リトライ間隔（分）
  PROP_RETRY_COUNT: 'DAILY_REPORT_RETRY_COUNT',
  PROP_LAST_SENT: 'DAILY_REPORT_LAST_SENT_DATE'
};

const REPORT_DEFAULTS = {
  EXAM_GUIDES_API_URL: 'https://okayama-moshi.com/api/exam-guides?flat=1',
  MAIN_SHEET_NAME: 'main',
  PAST_SHEET_NAME: '過去受験者',
  HISTORY_SHEET_NAME: 'マーケティング履歴',
  KONBINI_OFFSET_DAYS: 3,
  // API・模試マスターの双方が取得不能な場合の最終フォールバック日程表
  FALLBACK_SCHEDULES: [
    {
      monthNum: 12,
      targetExamMonth: '12月号',
      cardDeadline: '2026-12-14',
      examDates: [
        { venue: '倉敷', date: '2026-12-26' },
        { venue: '岡山', date: '2026-12-27' },
        { venue: '津山', date: '2027-01-09' }
      ]
    },
    {
      monthNum: 10,
      targetExamMonth: '10月号',
      cardDeadline: '2026-10-16',
      examDates: [
        { venue: '津山', date: '2026-10-25' },
        { venue: '岡山', date: '2026-11-01' }
      ]
    }
  ],
  BENCHMARK_TARGETS: {
    '中3': 250,
    '中2': 55,
    '中1': 39,
    '小6': 0
  }
};

const GRADE_KEYS = ['中3', '中2', '中1', '小6', 'その他'];
const VENUE_KEYS = ['岡山', '倉敷', '津山', '自宅', 'その他'];

/**
 * ★【手動テスト用】プルダウンからこれを選んで「実行」すると、
 * 「すでに配信済み」のガードを自動解除して今すぐテスト送信します。
 */
function testRunDailyMarketingReportNow() {
  PropertiesService.getScriptProperties().deleteProperty(RETRY_SETTINGS.PROP_LAST_SENT);
  console.log('🔓 本日配信済みフラグを解除してテスト実行を開始します...');
  executeMarketingReport_(false);
}

/**
 * 毎朝の定時トリガーにはこの関数を指定してください（二重送信ガードあり）
 */
function runDailyMarketingReport() {
  executeMarketingReport_(false);
}

/**
 * 混雑時の時間差自動再実行用（スクリプトが自動でトリガー作成・削除します）
 */
function runDailyMarketingReportRetry() {
  executeMarketingReport_(true);
}

/**
 * 【初回のみ手動で1回実行すると便利】
 * 毎朝 6:00 / 6:30 ジャストの世界的なAPI渋滞を避け、「毎朝 6:37」に定時トリガーを設定します
 */
function setupDailyMorningTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    const fn = t.getHandlerFunction();
    if (fn === 'runDailyMarketingReport' || fn === 'runDailyMarketingReportRetry') {
      ScriptApp.deleteTrigger(t);
    }
  }
  ScriptApp.newTrigger('runDailyMarketingReport')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(37)
    .inTimezone('Asia/Tokyo')
    .create();
  console.log('✅ 定時トリガーを「毎朝 6:37 頃」に再設定しました（00分/30分のAPI混雑を回避します）');
}

/**
 * キャッシュと送信済みフラグをすべて手動リセットしたい場合のみ実行
 */
function clearClarityCache() {
  const targetDateStr = getYesterdayYmdJst_();
  const cache = CacheService.getScriptCache();
  cache.remove('CLARITY_SUMMARY_' + targetDateStr);
  cache.remove('FULL_RAW_DATA_' + targetDateStr);
  cache.remove('FULL_RAW_DATA_V2_' + targetDateStr);
  cache.remove('FULL_RAW_DATA_V3_' + targetDateStr);
  PropertiesService.getScriptProperties().deleteProperty(RETRY_SETTINGS.PROP_LAST_SENT);
  console.log('キャッシュと本日送信済みフラグをクリアしました。');
}

/**
 * メイン実行処理
 * @param {boolean} isScheduledRetry - 自動再実行かどうか
 */
function executeMarketingReport_(isScheduledRetry) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.log('別プロセスが実行中のためスキップしました。');
    return;
  }

  try {
    const scriptProps = PropertiesService.getScriptProperties();
    const props = scriptProps.getProperties();

    const ga4PropertyId = props.GA4_PROPERTY_ID;
    const scSiteUrl = props.SEARCH_CONSOLE_SITE_URL;
    const clarityApiToken = props.CLARITY_API_TOKEN;
    const geminiApiKey = props.GEMINI_API_KEY;
    const chatWebhookUrl = props.GOOGLE_CHAT_WEBHOOK_URL;
    const mainSheetName = props.SHEET_NAME || REPORT_DEFAULTS.MAIN_SHEET_NAME;

    clearRetryTriggers_();

    // 対象日（昨日）の生成
    const targetDateStr = getYesterdayYmdJst_();

    // すでに本日分の配信が完了していればスキップ（二重送信ガード）
    if (scriptProps.getProperty(RETRY_SETTINGS.PROP_LAST_SENT) === targetDateStr) {
      console.log(`対象日(${targetDateStr})のレポートはすでに配信済みのため終了します。（手動再テスト時は testRunDailyMarketingReportNow を実行してください）`);
      return;
    }

    if (!isScheduledRetry) {
      scriptProps.deleteProperty(RETRY_SETTINGS.PROP_RETRY_COUNT);
      Utilities.sleep(Math.floor(Math.random() * 2000) + 500);
    }

    console.log('▶ 1. 対象日: ' + targetDateStr);

    // キャッシュ済み集計データがあれば復元（リトライ時や連続テスト時の高速化＆API枠保護）
    const cache = CacheService.getScriptCache();
    const fullCacheKey = 'FULL_RAW_DATA_V3_' + targetDateStr;
    let rawData = null;

    const cachedRaw = cache.get(fullCacheKey);
    if (cachedRaw) {
      rawData = JSON.parse(cachedRaw);
      console.log('ℹ️ 集計済みキャッシュデータを復元しました（GA4/GSC/Clarityの再通信をスキップ）');
    }

    if (!rawData) {
      console.log('▶ 2. 申込台帳・過去データ・模試マスターの集計開始...');
      const examSummary = getNextExamAndOrderSummary(mainSheetName, targetDateStr, props);
      console.log('▶ 2. 集計完了: ' + JSON.stringify(examSummary));

      console.log('▶ 3. GA4データ取得開始...');
      const ga4Data = getGA4Summary(ga4PropertyId, targetDateStr, examSummary);
      console.log('▶ 3. GA4データ取得完了: ' + JSON.stringify(ga4Data));

      console.log('▶ 4. Search Consoleデータ取得開始...');
      const scData = getSearchConsoleSummary(scSiteUrl, targetDateStr);
      console.log('▶ 4. Search Consoleデータ取得完了: ' + JSON.stringify(scData));

      console.log('▶ 5. Clarityデータ取得開始...');
      const clarityData = getClaritySummary(clarityApiToken, targetDateStr);
      console.log('▶ 5. Clarityデータ取得完了: ' + JSON.stringify(clarityData));

      rawData = {
        targetDate: targetDateStr,
        exam: examSummary,
        ga4: ga4Data,
        searchConsole: scData,
        clarity: clarityData
      };

      try {
        cache.put(fullCacheKey, JSON.stringify(rawData), 21600);
      } catch (cacheErr) {
        console.warn('キャッシュ保存スキップ: ' + cacheErr.message);
      }
    }

    // 6. Gemini による高密度マーケティング分析
    console.log('▶ 6. Gemini 分析リクエスト送信中...');
    try {
      const analysisReport = generateGeminiAnalysis(geminiApiKey, rawData);
      console.log('▶ 6. Gemini レポート生成完了');

      console.log('▶ 7. Google Chat へ投稿中...');
      postToGoogleChat(chatWebhookUrl, analysisReport);

      try {
        appendDailyMarketingHistory_(rawData, analysisReport, props);
      } catch (histErr) {
        console.warn('マーケティング履歴シート追記スキップ: ' + histErr.message);
      }

      scriptProps.setProperty(RETRY_SETTINGS.PROP_LAST_SENT, targetDateStr);
      scriptProps.deleteProperty(RETRY_SETTINGS.PROP_RETRY_COUNT);
      console.log('✅ 日次マーケティング速報の全処理が完了しました！');

    } catch (err) {
      console.error('⚠️ Gemini全モデル失敗: ' + err.message);

      const retryCount = Number(scriptProps.getProperty(RETRY_SETTINGS.PROP_RETRY_COUNT) || '0');
      if (retryCount < RETRY_SETTINGS.MAX_RETRIES) {
        const nextCount = retryCount + 1;
        scriptProps.setProperty(RETRY_SETTINGS.PROP_RETRY_COUNT, String(nextCount));
        scheduleRetryTrigger_(RETRY_SETTINGS.INTERVAL_MINUTES);
        console.warn(`⏳ Geminiサーバー混雑のため、${RETRY_SETTINGS.INTERVAL_MINUTES}分後に自動再実行します（${nextCount}/${RETRY_SETTINGS.MAX_RETRIES}回目）`);
        return;
      }

      const fallbackMessage = buildFallbackReport_(rawData);
      postToGoogleChat(chatWebhookUrl, fallbackMessage);

      try {
        appendDailyMarketingHistory_(rawData, fallbackMessage, props);
      } catch (histErr) {
        console.warn('マーケティング履歴シート追記スキップ: ' + histErr.message);
      }

      scriptProps.setProperty(RETRY_SETTINGS.PROP_LAST_SENT, targetDateStr);
      scriptProps.deleteProperty(RETRY_SETTINGS.PROP_RETRY_COUNT);
      console.log('✅ AIスキップ（数値速報モード）でGoogle Chatへ投稿完了');
    }
  } finally {
    lock.releaseLock();
  }
}

// -------------------------------------------------------------
// 日付・数値ユーティリティ（JST厳密計算）
// -------------------------------------------------------------
function getYesterdayYmdJst_() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDateJst_(d);
}

function formatDateJst_(dateObj) {
  if (typeof Utilities !== 'undefined' && Utilities && typeof Utilities.formatDate === 'function') {
    return Utilities.formatDate(dateObj, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  const jst = new Date(dateObj.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateToYmdJst_(raw, fallbackYear) {
  if (raw === null || raw === undefined || raw === '') return '';
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return '';
    return formatDateJst_(raw);
  }
  const str = String(raw).trim();
  if (!str) return '';

  // タイムゾーン付き ISO8601（例: 2026-12-26T15:00:00.000Z）は JST (+09:00) に変換
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(str)) {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return formatDateJst_(parsed);
    }
  }

  // ローカル表記 YYYY-MM-DD / YYYY/MM/DD（時刻付き含む）
  const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymdMatch) {
    return (
      ymdMatch[1] +
      '-' +
      String(Number(ymdMatch[2])).padStart(2, '0') +
      '-' +
      String(Number(ymdMatch[3])).padStart(2, '0')
    );
  }

  // 和暦・日本語表記 YYYY年M月D日
  const jpMatch = str.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (jpMatch) {
    return (
      jpMatch[1] +
      '-' +
      String(Number(jpMatch[2])).padStart(2, '0') +
      '-' +
      String(Number(jpMatch[3])).padStart(2, '0')
    );
  }

  // 年省略 M月D日
  const mdMatch = str.match(/(\d{1,2})月\s*(\d{1,2})日/);
  if (mdMatch && fallbackYear) {
    return (
      String(fallbackYear) +
      '-' +
      String(Number(mdMatch[1])).padStart(2, '0') +
      '-' +
      String(Number(mdMatch[2])).padStart(2, '0')
    );
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return formatDateJst_(parsed);
  }
  return '';
}

function parseYmdParts_(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function addDaysYmd_(ymd, deltaDays) {
  const p = parseYmdParts_(ymd);
  if (!p) return '';
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d, 12, 0, 0) + Number(deltaDays) * 86400000);
  return (
    dt.getUTCFullYear() +
    '-' +
    String(dt.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(dt.getUTCDate()).padStart(2, '0')
  );
}

function shiftYearYmd_(ymd, deltaYears) {
  const p = parseYmdParts_(ymd);
  if (!p) return '';
  const targetYear = p.y + Number(deltaYears);
  const dt = new Date(Date.UTC(targetYear, p.m - 1, p.d, 12, 0, 0));
  // うるう年 2/29 → 平年 3/1 ズレを 2/28 へ丸める
  if (dt.getUTCMonth() !== p.m - 1) {
    dt.setUTCDate(0);
  }
  return (
    dt.getUTCFullYear() +
    '-' +
    String(dt.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(dt.getUTCDate()).padStart(2, '0')
  );
}

function diffDaysYmd_(fromYmd, toYmd) {
  const a = parseYmdParts_(fromYmd);
  const b = parseYmdParts_(toYmd);
  if (!a || !b) return 0;
  const aMs = Date.UTC(a.y, a.m - 1, a.d, 12, 0, 0);
  const bMs = Date.UTC(b.y, b.m - 1, b.d, 12, 0, 0);
  return Math.round((bMs - aMs) / 86400000);
}

function round1_(num) {
  return Math.round(Number(num || 0) * 10) / 10;
}

function calcPctChange_(current, previous) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (prev <= 0) return null;
  return round1_(((cur - prev) / prev) * 100);
}

function calcYoyPct_(current, previous) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (prev <= 0) return null;
  return round1_((cur / prev) * 100);
}

function formatSignedInt_(n) {
  const val = Number(n || 0);
  return (val > 0 ? '+' : '') + val;
}

function formatSignedPct_(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return '—';
  const v = Number(pct);
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}

function formatShortMd_(ymd) {
  const p = parseYmdParts_(ymd);
  if (!p) return String(ymd || '');
  return `${p.m}/${p.d}`;
}

// -------------------------------------------------------------
// 正規化・分類ヘルパー
// -------------------------------------------------------------
function normalizeGradeKey_(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'その他';
  if (/中\s*3|中学\s*3|c3|3年/i.test(s)) return '中3';
  if (/中\s*2|中学\s*2|c2|2年/i.test(s)) return '中2';
  if (/中\s*1|中学\s*1|c1|1年/i.test(s)) return '中1';
  if (/小\s*6|小学\s*6|p6|e6|6年|適性/i.test(s)) return '小6';
  return 'その他';
}

function normalizeVenueKey_(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'その他';
  if (s.indexOf('岡山') !== -1) return '岡山';
  if (s.indexOf('倉敷') !== -1) return '倉敷';
  if (s.indexOf('津山') !== -1) return '津山';
  if (s.indexOf('自宅') !== -1) return '自宅';
  return 'その他';
}

function normalizeExamMonthNum_(raw) {
  const str = String(raw || '')
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .trim();
  const m = str.match(/(\d{1,2})/);
  return m ? Number(m[1]) : null;
}

function classifyPaymentStatus_(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'other';
  if (s === 'paid' || s === '入金済' || s === '入金済み' || s === '支払済') return 'paid';
  if (s.indexOf('キャンセル') !== -1 || s.indexOf('cancel') !== -1 || s === '期限切れ' || s === 'expired' || s === '失敗') {
    return 'canceled';
  }
  if (s.indexOf('未入金') !== -1 || s.indexOf('unpaid') !== -1 || s.indexOf('pending') !== -1 || s.indexOf('待ち') !== -1) {
    return 'unpaid';
  }
  // 過去シート等で入金日（例: 2025/12/01）が入っている場合は paid 扱い
  if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(s) || /^\d{1,2}[\/\-]\d{1,2}$/.test(s)) {
    return 'paid';
  }
  return 'other';
}

function createCounterMap_(keys) {
  const obj = {};
  keys.forEach(k => {
    obj[k] = 0;
  });
  return obj;
}

function buildHeaderIndexMap_(headers) {
  const map = {};
  (headers || []).forEach((h, idx) => {
    const raw = String(h || '').trim();
    if (!raw) return;
    map[raw] = idx;
    const compact = raw.replace(/[\s\u3000\r\n\t]+/g, '');
    if (compact) map[compact] = idx;
  });
  return map;
}

function findColIndex_(headerMap, candidates, fallbackIdx) {
  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i];
    if (headerMap[key] !== undefined) return headerMap[key];
  }
  return fallbackIdx;
}

// -------------------------------------------------------------
// 次回模試の正確な締切・実施日・残り日数の3段解決
// -------------------------------------------------------------
function resolveTargetExamInfo_(ss, targetDateStr, props) {
  const refDateStr = parseDateToYmdJst_(targetDateStr) || formatDateJst_(new Date());
  const refParts = parseYmdParts_(refDateStr);
  const fallbackYear = refParts ? refParts.y : new Date().getFullYear();

  let picked = null;

  // 優先①: 本番 API (/api/exam-guides?flat=1) から D1 正本データを取得
  try {
    const apiUrl = (props && props.EXAM_GUIDES_API_URL) || REPORT_DEFAULTS.EXAM_GUIDES_API_URL;
    if (apiUrl && typeof UrlFetchApp !== 'undefined' && UrlFetchApp) {
      const res = UrlFetchApp.fetch(apiUrl, {
        method: 'get',
        headers: { Accept: 'application/json' },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        const json = JSON.parse(res.getContentText() || '{}');
        picked = extractExamFromApiPayload_(json, refDateStr, fallbackYear);
      }
    }
  } catch (apiErr) {
    console.warn('模試マスタAPI取得スキップ（シート/フォールバックへ移行）: ' + apiErr.message);
  }

  // 優先②: 同一スプレッドシート内の模試基本情報 / schedules / 模試マスターをヘッダー名で動的解決
  if (!picked && ss) {
    try {
      picked = extractExamFromSpreadsheet_(ss, refDateStr, fallbackYear);
    } catch (sheetErr) {
      console.warn('模試マスターシート読込スキップ: ' + sheetErr.message);
    }
  }

  // 優先③: フォールバック日程表（ここでも残り日数は必ず refDateStr との差分で動的算出）
  if (!picked) {
    const candidates = REPORT_DEFAULTS.FALLBACK_SCHEDULES
      .filter(s => s.cardDeadline >= refDateStr)
      .sort((a, b) => a.cardDeadline.localeCompare(b.cardDeadline));
    const chosen = candidates[0] || REPORT_DEFAULTS.FALLBACK_SCHEDULES[0];
    picked = {
      targetExamMonth: chosen.targetExamMonth,
      monthNum: chosen.monthNum,
      cardDeadline: chosen.cardDeadline,
      examDates: chosen.examDates.slice(),
      source: 'fallback'
    };
  }

  const cardDeadline = picked.cardDeadline;
  const konbiniDeadline = addDaysYmd_(cardDeadline, -REPORT_DEFAULTS.KONBINI_OFFSET_DAYS);
  const daysLeftCard = Math.max(0, diffDaysYmd_(refDateStr, cardDeadline));
  const daysLeftKonbini = Math.max(0, diffDaysYmd_(refDateStr, konbiniDeadline));

  const sortedExamDates = (picked.examDates || [])
    .filter(item => item && item.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const earliestExamDate = sortedExamDates.length > 0 ? sortedExamDates[0].date : null;
  const daysLeftExam = earliestExamDate ? Math.max(0, diffDaysYmd_(refDateStr, earliestExamDate)) : null;

  return {
    targetExamMonth: picked.targetExamMonth,
    monthNum: picked.monthNum,
    cardDeadline: cardDeadline,
    konbiniDeadline: konbiniDeadline,
    daysLeftCard: daysLeftCard,
    daysLeftKonbini: daysLeftKonbini,
    examDates: sortedExamDates,
    earliestExamDate: earliestExamDate,
    daysLeftExam: daysLeftExam,
    deadlineSource: picked.source,
    // 後方互換フィールド
    deadline: cardDeadline,
    daysLeft: daysLeftCard
  };
}

function getScheduleGradePriority_(schedule) {
  if (!schedule) return 3;
  const code = String(schedule.grade_code || '').replace(/[\s\u3000]+/g, '').toLowerCase();
  const idStr = String(schedule.id || '').replace(/[\s\u3000]+/g, '').toLowerCase();
  const nameText = [schedule.grade_name, schedule.issue_name, schedule.title]
    .filter(Boolean)
    .join(' ')
    .replace(/[\s\u3000]+/g, '')
    .toLowerCase();

  if (code === 'c3' || code === 'chu3' || /^c3_/i.test(idStr) || /中3|中学3/.test(nameText)) {
    return 0;
  }
  if (code === 'c2' || code === 'chu2' || /^c2_/i.test(idStr) || /中2|中学2/.test(nameText)) {
    return 1;
  }
  if (code === 'c1' || code === 'chu1' || /^c1_/i.test(idStr) || /中1|中学1/.test(nameText)) {
    return 2;
  }
  if (
    code === 'p6' ||
    code === 'e6' ||
    code === 'sho6' ||
    code === 's6' ||
    /^(p6|e6)_/i.test(idStr) ||
    /小6|小学6|適性/.test(nameText)
  ) {
    return 4;
  }
  return 3;
}

function extractExamFromApiPayload_(json, refDateStr, fallbackYear) {
  if (!json || !json.success) return null;

  // flat=1 レスポンス優先
  if (json.flat && Array.isArray(json.flat.schedules) && json.flat.schedules.length > 0) {
    const venues = Array.isArray(json.flat.venues) ? json.flat.venues : [];
    const nonHomeVenueCountMap = {};
    venues.forEach(v => {
      if (v && v.schedule_id && String(v.venue_type || '').indexOf('自宅') === -1) {
        nonHomeVenueCountMap[v.schedule_id] = (nonHomeVenueCountMap[v.schedule_id] || 0) + 1;
      }
    });

    const valid = json.flat.schedules
      .map(s => {
        const ymd = parseDateToYmdJst_(s.apply_deadline, fallbackYear);
        const monthNum = normalizeExamMonthNum_(s.issue_name || s.id);
        return {
          raw: s,
          cardDeadline: ymd,
          monthNum: monthNum,
          priority: getScheduleGradePriority_(s),
          nonHomeVenueCount: nonHomeVenueCountMap[s.id] || 0
        };
      })
      .filter(item => item.cardDeadline && item.cardDeadline >= refDateStr)
      .sort((a, b) => {
        const cmp = a.cardDeadline.localeCompare(b.cardDeadline);
        if (cmp !== 0) return cmp;
        // 同日締切なら中3(priority=0)を最優先、小6適性検査(priority=4)を後回し
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.nonHomeVenueCount - a.nonHomeVenueCount;
      });

    if (valid.length > 0) {
      const top = valid[0];
      const seenVenues = {};
      const examDates = [];
      venues
        .filter(v => v.schedule_id === top.raw.id && String(v.venue_type || '').indexOf('自宅') === -1)
        .map(v => ({
          venue: normalizeVenueKey_(v.venue_type),
          date: parseDateToYmdJst_(v.exam_date_start, fallbackYear)
        }))
        .filter(v => v.date)
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach(v => {
          if (!seenVenues[v.venue]) {
            seenVenues[v.venue] = true;
            examDates.push(v);
          }
        });

      // flat.venues から取得できなかった場合のみ grades.c3.rounds から補完
      if (examDates.length === 0 && json.grades && json.grades.c3 && Array.isArray(json.grades.c3.rounds)) {
        const matchingRound = json.grades.c3.rounds.find(
          r => (r.monthNum || normalizeExamMonthNum_(r.monthName)) === top.monthNum
        );
        if (matchingRound) {
          const fallbackList = Array.isArray(matchingRound.venuesList) ? matchingRound.venuesList : [];
          fallbackList.forEach(item => {
            const vName = normalizeVenueKey_(item.badge || item.name);
            const vDate = parseDateToYmdJst_(item.date, fallbackYear);
            if (vName !== '自宅' && vDate && !seenVenues[vName]) {
              seenVenues[vName] = true;
              examDates.push({ venue: vName, date: vDate });
            }
          });
          examDates.sort((a, b) => a.date.localeCompare(b.date));
        }
      }

      return {
        targetExamMonth: top.raw.issue_name || `${top.monthNum}月号`,
        monthNum: top.monthNum || 12,
        cardDeadline: top.cardDeadline,
        examDates: examDates,
        source: 'api'
      };
    }
  }

  // grades 階層レスポンスフォールバック
  if (json.grades && json.grades.c3 && Array.isArray(json.grades.c3.rounds)) {
    const validRounds = json.grades.c3.rounds
      .map(r => ({
        raw: r,
        cardDeadline: parseDateToYmdJst_(r.applyDeadlineRaw || r.deadline, fallbackYear),
        monthNum: r.monthNum || normalizeExamMonthNum_(r.monthName)
      }))
      .filter(item => item.cardDeadline && item.cardDeadline >= refDateStr)
      .sort((a, b) => a.cardDeadline.localeCompare(b.cardDeadline));

    if (validRounds.length > 0) {
      const top = validRounds[0];
      const examDates = [];
      const seenVenues = {};
      const list = Array.isArray(top.raw.venuesList) ? top.raw.venuesList : [];
      list.forEach(item => {
        const vName = normalizeVenueKey_(item.badge || item.name);
        const vDate = parseDateToYmdJst_(item.date, fallbackYear);
        if (vName !== '自宅' && vDate && !seenVenues[vName]) {
          seenVenues[vName] = true;
          examDates.push({ venue: vName, date: vDate });
        }
      });
      examDates.sort((a, b) => a.date.localeCompare(b.date));
      return {
        targetExamMonth: top.raw.monthName || `${top.monthNum}月号`,
        monthNum: top.monthNum || 12,
        cardDeadline: top.cardDeadline,
        examDates: examDates,
        source: 'api'
      };
    }
  }

  return null;
}

function extractExamFromSpreadsheet_(ss, refDateStr, fallbackYear) {
  const sheet =
    ss.getSheetByName('模試基本情報') ||
    ss.getSheetByName('schedules') ||
    ss.getSheetByName('模試日程・基本情報') ||
    ss.getSheetByName('模試マスター');
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return null;

  const hMap = buildHeaderIndexMap_(data[0]);
  const colGrade = findColIndex_(hMap, ['学年', 'grade', 'grade_code'], 0);
  const colMonth = findColIndex_(hMap, ['月号', '対象回', '対象模試', '回', 'issue_name'], 1);
  const colDeadline = findColIndex_(hMap, ['申込締切日時', '申込締切日', '申込締切', '締切日時', '締切日', '締切', 'apply_deadline'], -1);
  if (colDeadline === -1) return null;

  const candidates = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const deadlineYmd = parseDateToYmdJst_(row[colDeadline], fallbackYear);
    if (!deadlineYmd || deadlineYmd < refDateStr) continue;
    const monthRaw = String(row[colMonth] || '').trim();
    const monthNum = normalizeExamMonthNum_(monthRaw);
    if (!monthNum) continue;
    const gradeRaw = row[colGrade];
    const priority = getScheduleGradePriority_({ grade_name: gradeRaw, issue_name: monthRaw });
    candidates.push({
      monthNum: monthNum,
      targetExamMonth: monthRaw.indexOf('号') !== -1 ? monthRaw : `${monthNum}月号`,
      cardDeadline: deadlineYmd,
      priority: priority,
      isC3: priority === 0
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const cmp = a.cardDeadline.localeCompare(b.cardDeadline);
    if (cmp !== 0) return cmp;
    return a.priority - b.priority;
  });

  const chosen = candidates[0];
  const examDates = [];
  const venueSheet = ss.getSheetByName('会場・日程') || ss.getSheetByName('venues') || ss.getSheetByName('会場日程');
  if (venueSheet) {
    const vData = venueSheet.getDataRange().getValues();
    if (vData && vData.length > 1) {
      const vMap = buildHeaderIndexMap_(vData[0]);
      const vColGrade = findColIndex_(vMap, ['学年', 'grade_code'], 0);
      const vColMonth = findColIndex_(vMap, ['月号', '対象回'], 1);
      const vColType = findColIndex_(vMap, ['会場区分', 'venue_type', '会場'], 2);
      const vColStart = findColIndex_(vMap, ['実施日', '試験日', '開始日', 'exam_date_start', '日程'], -1);
      if (vColStart !== -1) {
        const seenVenues = {};
        for (let i = 1; i < vData.length; i++) {
          const vRow = vData[i];
          if (normalizeExamMonthNum_(vRow[vColMonth]) !== chosen.monthNum) continue;
          const vGrade = normalizeGradeKey_(vRow[vColGrade]);
          if (chosen.isC3 && vGrade !== '中3') continue;
          const vType = normalizeVenueKey_(vRow[vColType]);
          if (vType === '自宅') continue;
          const dateYmd = parseDateToYmdJst_(vRow[vColStart], fallbackYear);
          if (dateYmd && !seenVenues[vType]) {
            seenVenues[vType] = true;
            examDates.push({ venue: vType, date: dateYmd });
          }
        }
      }
    }
  }

  return {
    targetExamMonth: chosen.targetExamMonth,
    monthNum: chosen.monthNum,
    cardDeadline: chosen.cardDeadline,
    examDates: examDates,
    source: 'sheet'
  };
}

// -------------------------------------------------------------
// 台帳（main + 過去受験者）の高密度集計
// -------------------------------------------------------------
function getNextExamAndOrderSummary(mainSheetName, targetDateStr, props) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const examInfo = resolveTargetExamInfo_(ss, targetDateStr, props);

  const resolvedMainName = mainSheetName || (props && props.SHEET_NAME) || REPORT_DEFAULTS.MAIN_SHEET_NAME;
  const mainSheet = ss.getSheetByName(resolvedMainName);
  if (!mainSheet) {
    throw new Error(`シート「${resolvedMainName}」が見つかりません。`);
  }

  const mainValues = mainSheet.getDataRange().getValues();
  const currentAgg = aggregateCurrentLedgerRows_(mainValues, targetDateStr, examInfo.monthNum);

  // 過去受験者シートから昨年同号・同時期比較を集計
  const pastSheetName = (props && props.PAST_SHEET_NAME) || REPORT_DEFAULTS.PAST_SHEET_NAME;
  const pastSheet = ss.getSheetByName(pastSheetName);
  const pastValues = pastSheet ? pastSheet.getDataRange().getValues() : null;
  const lastYearAgg = aggregateLastYearSameTiming_(
    pastValues,
    targetDateStr,
    examInfo.cardDeadline,
    examInfo.monthNum
  );

  // 学年別の今年 vs 昨年同時期／昨年最終実績比較
  const yoyByGrade = {};
  ['中3', '中2', '中1', '小6'].forEach(g => {
    const cur = currentAgg.gradeCounts[g] || 0;
    const lySame = lastYearAgg.sameTimingAvailable ? (lastYearAgg.sameTimingByGrade[g] || 0) : null;
    const lyFinal = lastYearAgg.available ? (lastYearAgg.finalByGrade[g] || 0) : null;
    yoyByGrade[g] = {
      current: cur,
      unpaid: currentAgg.gradeUnpaidCounts[g] || 0,
      lastYearSameTiming: lySame,
      diff: lySame !== null ? cur - lySame : null,
      yoyPct: lySame !== null ? calcYoyPct_(cur, lySame) : null,
      lastYearFinal: lyFinal,
      finalAchievementPct: lyFinal && lyFinal > 0 ? calcYoyPct_(cur, lyFinal) : null,
      benchmark: REPORT_DEFAULTS.BENCHMARK_TARGETS[g]
    };
  });

  const lastYearSameTimingTotal = lastYearAgg.sameTimingAvailable ? lastYearAgg.sameTimingTotal : null;
  const lastYearFinalTotal = lastYearAgg.available && lastYearAgg.finalTotal > 0 ? lastYearAgg.finalTotal : null;
  const finalAchievementPct = lastYearFinalTotal ? calcYoyPct_(currentAgg.currentExamPaid, lastYearFinalTotal) : null;
  const fallbackBenchmarkTotal =
    REPORT_DEFAULTS.BENCHMARK_TARGETS['中3'] +
    REPORT_DEFAULTS.BENCHMARK_TARGETS['中2'] +
    REPORT_DEFAULTS.BENCHMARK_TARGETS['中1'];
  const targetTotal = lastYearFinalTotal || fallbackBenchmarkTotal;
  const gapToTarget = Math.max(0, targetTotal - currentAgg.currentExamPaid);
  const requiredDailyPace =
    examInfo.daysLeftCard > 0 ? round1_(gapToTarget / examInfo.daysLeftCard) : gapToTarget;

  return {
    targetExamMonth: examInfo.targetExamMonth,
    monthNum: examInfo.monthNum,
    deadline: examInfo.cardDeadline,
    cardDeadline: examInfo.cardDeadline,
    konbiniDeadline: examInfo.konbiniDeadline,
    daysLeft: examInfo.daysLeftCard,
    daysLeftCard: examInfo.daysLeftCard,
    daysLeftKonbini: examInfo.daysLeftKonbini,
    examDates: examInfo.examDates,
    earliestExamDate: examInfo.earliestExamDate,
    daysLeftExam: examInfo.daysLeftExam,
    deadlineSource: examInfo.deadlineSource,

    // 当日・累積実績
    yesterdayCount: currentAgg.yesterdayCount,
    yesterdayPaid: currentAgg.yesterdayPaid,
    yesterdayUnpaid: currentAgg.yesterdayUnpaid,
    currentExamPaid: currentAgg.currentExamPaid,
    currentExamUnpaid: currentAgg.currentExamUnpaid,
    currentExamCanceled: currentAgg.currentExamCanceled,

    // 学年別・会場別内訳
    gradeCounts: currentAgg.gradeCounts,
    gradeUnpaidCounts: currentAgg.gradeUnpaidCounts,
    venueCounts: currentAgg.venueCounts,
    venueUnpaidCounts: currentAgg.venueUnpaidCounts,

    // 直近7日ペース・目標比較
    recent7dWindow: {
      startDate: currentAgg.recent7dStart,
      endDate: targetDateStr
    },
    recent7dAll: currentAgg.recent7dAll,
    recent7dPaid: currentAgg.recent7dPaid,
    recent7dByGrade: currentAgg.recent7dByGrade,
    dailyPace7d: currentAgg.dailyPace7d,
    targetTotal: targetTotal,
    targetTotalSource: lastYearFinalTotal ? '昨年同号最終実績' : '昨年度参考ベンチマーク',
    gapToTarget: gapToTarget,
    requiredDailyPace: requiredDailyPace,

    // 昨年同時期／最終実績比較
    lastYearComparison: {
      available: lastYearAgg.available,
      sameTimingAvailable: lastYearAgg.sameTimingAvailable,
      cutoffDate: lastYearAgg.cutoffDate,
      matchedRows: lastYearAgg.matchedRows,
      datedMatchedRows: lastYearAgg.datedMatchedRows,
      undatedMatchedRows: lastYearAgg.undatedMatchedRows,
      sameTimingPaidTotal: lastYearSameTimingTotal,
      finalPaidTotal: lastYearFinalTotal,
      finalAchievementPct: finalAchievementPct,
      diffFromLastYear: lastYearSameTimingTotal !== null ? currentAgg.currentExamPaid - lastYearSameTimingTotal : null,
      yoyPct: lastYearSameTimingTotal !== null ? calcYoyPct_(currentAgg.currentExamPaid, lastYearSameTimingTotal) : null,
      byGrade: yoyByGrade
    },

    benchmarks: {
      '中3': '昨年度最終実績: 約250件超（11月下旬〜締切1週間前にかけて急増する傾向）',
      '中2': '昨年度最終実績: 55件',
      '中1': '昨年度最終実績: 39件'
    }
  };
}

function aggregateCurrentLedgerRows_(values, targetDateStr, targetMonthNum) {
  const recent7dStart = addDaysYmd_(targetDateStr, -6);
  const gradeCounts = createCounterMap_(GRADE_KEYS);
  const gradeUnpaidCounts = createCounterMap_(GRADE_KEYS);
  const venueCounts = createCounterMap_(VENUE_KEYS);
  const venueUnpaidCounts = createCounterMap_(VENUE_KEYS);
  const recent7dByGrade = createCounterMap_(GRADE_KEYS);

  let yesterdayCount = 0;
  let yesterdayPaid = 0;
  let yesterdayUnpaid = 0;
  let currentExamPaid = 0;
  let currentExamUnpaid = 0;
  let currentExamCanceled = 0;
  let recent7dAll = 0;
  let recent7dPaid = 0;

  if (!values || values.length < 2) {
    return {
      recent7dStart,
      yesterdayCount,
      yesterdayPaid,
      yesterdayUnpaid,
      currentExamPaid,
      currentExamUnpaid,
      currentExamCanceled,
      gradeCounts,
      gradeUnpaidCounts,
      venueCounts,
      venueUnpaidCounts,
      recent7dAll,
      recent7dPaid,
      recent7dByGrade,
      dailyPace7d: 0
    };
  }

  const hMap = buildHeaderIndexMap_(values[0]);
  const colDate = findColIndex_(hMap, ['受付日時', '登録日時'], 0);
  const colExam = findColIndex_(hMap, ['対象模試', '受験回', '模試'], 2);
  const colVenue = findColIndex_(hMap, ['受験会場', '会場'], 3);
  const colStatus = findColIndex_(hMap, ['決済ステータス', 'ステータス', '入金'], 5);
  const colGrade = findColIndex_(hMap, ['学年'], 12);

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowDateYmd = parseDateToYmdJst_(row[colDate]);
    const rowMonthNum = normalizeExamMonthNum_(row[colExam]);
    const statusKind = classifyPaymentStatus_(row[colStatus]);
    const gradeKey = normalizeGradeKey_(row[colGrade]);
    const venueKey = normalizeVenueKey_(row[colVenue]);

    const isTargetExam = targetMonthNum ? rowMonthNum === targetMonthNum : true;

    // 昨日単日のカウント
    if (rowDateYmd === targetDateStr) {
      yesterdayCount++;
      if (statusKind === 'paid') yesterdayPaid++;
      else if (statusKind === 'unpaid') yesterdayUnpaid++;
    }

    if (!isTargetExam) continue;

    // 直近7日間（対象模試）
    if (rowDateYmd && rowDateYmd >= recent7dStart && rowDateYmd <= targetDateStr) {
      if (statusKind !== 'canceled') {
        recent7dAll++;
      }
      if (statusKind === 'paid') {
        recent7dPaid++;
        recent7dByGrade[gradeKey]++;
      }
    }

    if (statusKind === 'paid') {
      currentExamPaid++;
      gradeCounts[gradeKey]++;
      venueCounts[venueKey]++;
    } else if (statusKind === 'unpaid') {
      currentExamUnpaid++;
      gradeUnpaidCounts[gradeKey]++;
      venueUnpaidCounts[venueKey]++;
    } else if (statusKind === 'canceled') {
      currentExamCanceled++;
    }
  }

  return {
    recent7dStart,
    yesterdayCount,
    yesterdayPaid,
    yesterdayUnpaid,
    currentExamPaid,
    currentExamUnpaid,
    currentExamCanceled,
    gradeCounts,
    gradeUnpaidCounts,
    venueCounts,
    venueUnpaidCounts,
    recent7dAll,
    recent7dPaid,
    recent7dByGrade,
    dailyPace7d: round1_(recent7dPaid / 7)
  };
}

function aggregateLastYearSameTiming_(pastValues, targetDateStr, cardDeadlineStr, targetMonthNum) {
  const cutoffDate = shiftYearYmd_(targetDateStr, -1);
  const lastYearDeadline = shiftYearYmd_(cardDeadlineStr, -1);
  const windowStart = addDaysYmd_(lastYearDeadline, -180);
  const windowEnd = addDaysYmd_(lastYearDeadline, 40);

  const emptyResult = {
    available: false,
    sameTimingAvailable: false,
    cutoffDate: cutoffDate,
    matchedRows: 0,
    datedMatchedRows: 0,
    undatedMatchedRows: 0,
    sameTimingTotal: null,
    finalTotal: 0,
    sameTimingByGrade: createCounterMap_(GRADE_KEYS),
    finalByGrade: createCounterMap_(GRADE_KEYS)
  };

  if (!pastValues || pastValues.length < 2) {
    return emptyResult;
  }

  const hMap = buildHeaderIndexMap_(pastValues[0]);
  // alignPastExamineesSheet 変換後（31列）および旧フォーマット（25列）の両方に動的対応
  const colDate = findColIndex_(hMap, ['受付日時', '登録日時'], 0);
  const colExam = findColIndex_(hMap, ['対象模試', '受験回', '模試'], 2);
  const colStatus = findColIndex_(hMap, ['決済ステータス', '入金', 'ステータス'], 5);
  const colGrade = findColIndex_(hMap, ['学年'], 12);

  const sameTimingByGrade = createCounterMap_(GRADE_KEYS);
  const finalByGrade = createCounterMap_(GRADE_KEYS);
  let sameTimingTotal = 0;
  let finalTotal = 0;
  let datedMatchedRows = 0;
  let undatedMatchedRows = 0;

  for (let i = 1; i < pastValues.length; i++) {
    const row = pastValues[i];
    const rowMonthNum = normalizeExamMonthNum_(row[colExam]);
    if (targetMonthNum && rowMonthNum !== targetMonthNum) continue;

    const statusKind = classifyPaymentStatus_(row[colStatus]);
    if (statusKind !== 'paid') continue;

    const gradeKey = normalizeGradeKey_(row[colGrade]);
    const rowDateYmd = parseDateToYmdJst_(row[colDate]);

    if (!rowDateYmd) {
      // 受付日時（A列）欠損行も昨年同号最終実績（finalTotal / finalByGrade）として集計
      undatedMatchedRows++;
      finalTotal++;
      finalByGrade[gradeKey]++;
      continue;
    }

    // 昨年度シーズン（前年締切 -180日〜+40日）のみを対象にして他年度混在を防止
    if (windowStart && windowEnd && (rowDateYmd < windowStart || rowDateYmd > windowEnd)) {
      continue;
    }

    datedMatchedRows++;
    finalTotal++;
    finalByGrade[gradeKey]++;

    if (rowDateYmd <= cutoffDate) {
      sameTimingTotal++;
      sameTimingByGrade[gradeKey]++;
    }
  }

  const matchedRows = datedMatchedRows + undatedMatchedRows;
  const sameTimingAvailable = datedMatchedRows > 0;

  return {
    available: matchedRows > 0,
    sameTimingAvailable: sameTimingAvailable,
    cutoffDate: cutoffDate,
    matchedRows: matchedRows,
    datedMatchedRows: datedMatchedRows,
    undatedMatchedRows: undatedMatchedRows,
    sameTimingTotal: sameTimingAvailable ? sameTimingTotal : null,
    finalTotal: finalTotal,
    sameTimingByGrade: sameTimingByGrade,
    finalByGrade: finalByGrade
  };
}

// -------------------------------------------------------------
// GA4 マルチ期間・ページ別・ファネル・チャネル集計
// -------------------------------------------------------------
function getGA4Summary(propertyId, targetDateStr, examSummary) {
  if (!propertyId) {
    return { available: false, error: 'GA4_PROPERTY_ID 未設定' };
  }

  const propPath = 'properties/' + propertyId;
  const last7Start = addDaysYmd_(targetDateStr, -6);
  const prev7End = addDaysYmd_(last7Start, -1);
  const prev7Start = addDaysYmd_(prev7End, -6);

  const last28Start = addDaysYmd_(targetDateStr, -27);
  const prev28End = addDaysYmd_(last28Start, -1);
  const prev28Start = addDaysYmd_(prev28End, -27);

  const yoy28Start = shiftYearYmd_(last28Start, -1);
  const yoy28End = shiftYearYmd_(targetDateStr, -1);

  const errors = [];
  const result = {
    available: true,
    users: 0,
    sessions: 0,
    pageViews: 0,
    periods: {
      yesterday: { startDate: targetDateStr, endDate: targetDateStr, users: 0, sessions: 0, pageViews: 0 },
      last7d: { startDate: last7Start, endDate: targetDateStr, users: 0, sessions: 0, pageViews: 0, avgDailyUsers: 0, avgDailyPageViews: 0, usersWowPct: null, sessionsWowPct: null, pvWowPct: null },
      prev7d: { startDate: prev7Start, endDate: prev7End, users: 0, sessions: 0, pageViews: 0 },
      last28d: { startDate: last28Start, endDate: targetDateStr, users: 0, sessions: 0, pageViews: 0, usersMomPct: null, sessionsMomPct: null, pvMomPct: null, yoyAvailable: false, usersYoyPct: null, sessionsYoyPct: null, pvYoyPct: null },
      prev28d: { startDate: prev28Start, endDate: prev28End, users: 0, sessions: 0, pageViews: 0 },
      yoy28d: { startDate: yoy28Start, endDate: yoy28End, users: 0, sessions: 0, pageViews: 0 }
    },
    topPages: [],
    applyFunnel: {
      applyPageUsers7d: 0,
      applyPageViews7d: 0,
      recent7dAllOrders: examSummary ? Number(examSummary.recent7dAll || 0) : 0,
      recent7dPaidOrders: examSummary ? Number(examSummary.recent7dPaid || 0) : 0,
      cvrAllPct: null,
      cvrPaidPct: null
    },
    channels: [],
    errors: errors
  };

  const extractMetrics = (row) => {
    const vals = (row && row.metricValues) || [];
    return {
      users: Number(vals[0] && vals[0].value ? vals[0].value : 0),
      sessions: Number(vals[1] && vals[1].value ? vals[1].value : 0),
      pageViews: Number(vals[2] && vals[2].value ? vals[2].value : 0)
    };
  };

  // 1A. マルチ期間（昨日 / 直近7日 / 前週7日 / 直近28日）
  try {
    const res1a = AnalyticsData.Properties.runReport(
      {
        dateRanges: [
          { name: 'yesterday', startDate: targetDateStr, endDate: targetDateStr },
          { name: 'last7d', startDate: last7Start, endDate: targetDateStr },
          { name: 'prev7d', startDate: prev7Start, endDate: prev7End },
          { name: 'last28d', startDate: last28Start, endDate: targetDateStr }
        ],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' }
        ]
      },
      propPath
    );

    const byRange = {};
    (res1a.rows || []).forEach(r => {
      const rangeName = (r.dimensionValues && r.dimensionValues[0] && r.dimensionValues[0].value) || '';
      if (rangeName) byRange[rangeName] = extractMetrics(r);
    });
    // 単一rangeフォールバック（dimensionValuesが無いケース）
    if (Object.keys(byRange).length === 0 && res1a.rows && res1a.rows[0]) {
      byRange.yesterday = extractMetrics(res1a.rows[0]);
    }

    if (byRange.yesterday) {
      Object.assign(result.periods.yesterday, byRange.yesterday);
      result.users = byRange.yesterday.users;
      result.sessions = byRange.yesterday.sessions;
      result.pageViews = byRange.yesterday.pageViews;
    }
    if (byRange.prev7d) Object.assign(result.periods.prev7d, byRange.prev7d);
    if (byRange.last7d) {
      Object.assign(result.periods.last7d, byRange.last7d);
      result.periods.last7d.avgDailyUsers = round1_(byRange.last7d.users / 7);
      result.periods.last7d.avgDailyPageViews = round1_(byRange.last7d.pageViews / 7);
      result.periods.last7d.usersWowPct = calcPctChange_(byRange.last7d.users, result.periods.prev7d.users);
      result.periods.last7d.sessionsWowPct = calcPctChange_(byRange.last7d.sessions, result.periods.prev7d.sessions);
      result.periods.last7d.pvWowPct = calcPctChange_(byRange.last7d.pageViews, result.periods.prev7d.pageViews);
    }
    if (byRange.last28d) Object.assign(result.periods.last28d, byRange.last28d);
  } catch (e) {
    errors.push('periods_main: ' + e.message);
    console.warn('GA4 マルチ期間(1A)取得エラー: ' + e.message);
  }

  // 1B. 前28日 ＆ 昨年同期28日
  try {
    const res1b = AnalyticsData.Properties.runReport(
      {
        dateRanges: [
          { name: 'prev28d', startDate: prev28Start, endDate: prev28End },
          { name: 'yoy28d', startDate: yoy28Start, endDate: yoy28End }
        ],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' }
        ]
      },
      propPath
    );

    const byRangeB = {};
    (res1b.rows || []).forEach(r => {
      const rangeName = (r.dimensionValues && r.dimensionValues[0] && r.dimensionValues[0].value) || '';
      if (rangeName) byRangeB[rangeName] = extractMetrics(r);
    });

    if (byRangeB.prev28d) {
      Object.assign(result.periods.prev28d, byRangeB.prev28d);
      result.periods.last28d.usersMomPct = calcPctChange_(result.periods.last28d.users, byRangeB.prev28d.users);
      result.periods.last28d.sessionsMomPct = calcPctChange_(result.periods.last28d.sessions, byRangeB.prev28d.sessions);
      result.periods.last28d.pvMomPct = calcPctChange_(result.periods.last28d.pageViews, byRangeB.prev28d.pageViews);
    }

    if (byRangeB.yoy28d && byRangeB.yoy28d.sessions > 0) {
      Object.assign(result.periods.yoy28d, byRangeB.yoy28d);
      result.periods.last28d.yoyAvailable = true;
      result.periods.last28d.usersYoyPct = calcPctChange_(result.periods.last28d.users, byRangeB.yoy28d.users);
      result.periods.last28d.sessionsYoyPct = calcPctChange_(result.periods.last28d.sessions, byRangeB.yoy28d.sessions);
      result.periods.last28d.pvYoyPct = calcPctChange_(result.periods.last28d.pageViews, byRangeB.yoy28d.pageViews);
    }
  } catch (e) {
    errors.push('periods_compare: ' + e.message);
    console.warn('GA4 28日比較(1B)取得エラー: ' + e.message);
  }

  // 2. ページ別閲覧状況（直近7日・トップページ除外TOP5 ＋ /apply/ 通過率）
  try {
    const resPages = AnalyticsData.Properties.runReport(
      {
        dateRanges: [{ startDate: last7Start, endDate: targetDateStr }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'activeUsers' },
          { name: 'userEngagementDuration' }
        ],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 30
      },
      propPath
    );

    const mergedPages = {};
    (resPages.rows || []).forEach(r => {
      const rawPath = (r.dimensionValues && r.dimensionValues[0] && r.dimensionValues[0].value) || '/';
      const normPath = normalizeGa4PagePath_(rawPath);
      const pv = Number(r.metricValues?.[0]?.value || 0);
      const users = Number(r.metricValues?.[1]?.value || 0);
      const engSec = Number(r.metricValues?.[2]?.value || 0);
      if (!mergedPages[normPath]) {
        mergedPages[normPath] = { path: normPath, pageViews: 0, users: 0, engagementSec: 0 };
      }
      mergedPages[normPath].pageViews += pv;
      mergedPages[normPath].users += users;
      mergedPages[normPath].engagementSec += engSec;
    });

    const pageList = Object.values(mergedPages);
    const applyRow = pageList.find(p => p.path === '/apply/');
    if (applyRow) {
      result.applyFunnel.applyPageUsers7d = applyRow.users;
      result.applyFunnel.applyPageViews7d = applyRow.pageViews;
      if (applyRow.users > 0) {
        result.applyFunnel.cvrAllPct = round1_((result.applyFunnel.recent7dAllOrders / applyRow.users) * 100);
        result.applyFunnel.cvrPaidPct = round1_((result.applyFunnel.recent7dPaidOrders / applyRow.users) * 100);
      }
    }

    result.topPages = pageList
      .filter(p => p.path !== '/' && p.path !== '/index.html')
      .sort((a, b) => b.pageViews - a.pageViews)
      .slice(0, 5)
      .map(p => ({
        path: p.path,
        pageViews: p.pageViews,
        users: p.users,
        avgEngagementSec: p.users > 0 ? Math.round(p.engagementSec / p.users) : 0
      }));
  } catch (e) {
    errors.push('pages: ' + e.message);
    console.warn('GA4 ページ別集計エラー: ' + e.message);
  }

  // 3. 流入チャネル別内訳（直近7日 vs 前週7日）
  try {
    const resCh = AnalyticsData.Properties.runReport(
      {
        dateRanges: [
          { name: 'last7d', startDate: last7Start, endDate: targetDateStr },
          { name: 'prev7d', startDate: prev7Start, endDate: prev7End }
        ],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' }
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 20
      },
      propPath
    );

    const chMap = {};
    (resCh.rows || []).forEach(r => {
      const ch = (r.dimensionValues && r.dimensionValues[0] && r.dimensionValues[0].value) || '(other)';
      const rangeName = (r.dimensionValues && r.dimensionValues[1] && r.dimensionValues[1].value) || 'last7d';
      const sessions = Number(r.metricValues?.[0]?.value || 0);
      const users = Number(r.metricValues?.[1]?.value || 0);
      if (!chMap[ch]) {
        chMap[ch] = { channel: ch, sessions: 0, users: 0, prevSessions: 0, prevUsers: 0 };
      }
      if (rangeName === 'prev7d') {
        chMap[ch].prevSessions += sessions;
        chMap[ch].prevUsers += users;
      } else {
        chMap[ch].sessions += sessions;
        chMap[ch].users += users;
      }
    });

    const totalSessions7d = Object.values(chMap).reduce((sum, item) => sum + item.sessions, 0);
    result.channels = Object.values(chMap)
      .filter(c => c.sessions > 0)
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 5)
      .map(c => ({
        channel: c.channel,
        sessions: c.sessions,
        users: c.users,
        sharePct: totalSessions7d > 0 ? round1_((c.sessions / totalSessions7d) * 100) : 0,
        prevSessions: c.prevSessions,
        wowPct: calcPctChange_(c.sessions, c.prevSessions)
      }));
  } catch (e) {
    errors.push('channels: ' + e.message);
    console.warn('GA4 チャネル集計エラー: ' + e.message);
  }

  return result;
}

function normalizeGa4PagePath_(rawPath) {
  let clean = String(rawPath || '/').split('?')[0].split('#')[0].trim();
  if (!clean) return '/';
  if (clean === '/index.html') return '/';
  if (clean.length > 1 && clean.endsWith('/index.html')) {
    clean = clean.slice(0, -'index.html'.length);
  }
  if (clean === '/apply' || clean === '/apply.html') return '/apply/';
  if (clean === '/contact' || clean === '/contact.html') return '/contact/';
  if (clean === '/schools' || clean === '/schools.html') return '/schools.html';
  if (clean !== '/' && !/\.[a-z0-9]+$/i.test(clean) && !clean.endsWith('/')) {
    clean += '/';
  }
  return clean;
}

// -------------------------------------------------------------
// Search Console 集計（直近7日 TOP5 ＆ 前週比伸長クエリ ＆ 機会損失TOP3）
// -------------------------------------------------------------
function getSearchConsoleSummary(siteUrl, targetDateStr) {
  const refYmd = parseDateToYmdJst_(targetDateStr) || getYesterdayYmdJst_();
  // GSC は確定反映まで約2日遅延するため (targetDateStr - 2日) を期末とする7日間を取得
  const endDate = addDaysYmd_(refYmd, -2);
  const startDate = addDaysYmd_(endDate, -6);
  const prevEndDate = addDaysYmd_(startDate, -1);
  const prevStartDate = addDaysYmd_(prevEndDate, -6);

  const fallback = {
    available: false,
    period: { startDate: startDate, endDate: endDate },
    prevPeriod: { startDate: prevStartDate, endDate: prevEndDate },
    topQueries: [],
    risingQueries: [],
    missedOpportunityQueries: [],
    error: null
  };

  if (!siteUrl) {
    fallback.error = 'SEARCH_CONSOLE_SITE_URL 未設定';
    return fallback;
  }

  try {
    const token = ScriptApp.getOAuthToken();
    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

    const fetchRange = (sDate, eDate, limit) => {
      const response = UrlFetchApp.fetch(endpoint, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify({
          startDate: sDate,
          endDate: eDate,
          dimensions: ['query'],
          rowLimit: limit
        }),
        muteHttpExceptions: true
      });
      const code = response.getResponseCode();
      if (code !== 200) {
        throw new Error(`HTTP ${code}: ${response.getContentText().slice(0, 150)}`);
      }
      const parsed = JSON.parse(response.getContentText() || '{}');
      return Array.isArray(parsed.rows) ? parsed.rows : [];
    };

    const currentRows = fetchRange(startDate, endDate, 50);
    let prevRows = [];
    try {
      prevRows = fetchRange(prevStartDate, prevEndDate, 50);
    } catch (prevErr) {
      console.warn('GSC 前週比較データ取得スキップ: ' + prevErr.message);
    }

    const prevMap = {};
    prevRows.forEach(r => {
      const q = r.keys && r.keys[0];
      if (q) {
        prevMap[q] = {
          clicks: Number(r.clicks || 0),
          impressions: Number(r.impressions || 0)
        };
      }
    });

    const merged = currentRows.map(r => {
      const q = (r.keys && r.keys[0]) || '';
      const clicks = Number(r.clicks || 0);
      const impressions = Number(r.impressions || 0);
      const ctrPct = round1_(Number(r.ctr || 0) * 100);
      const posNum = round1_(Number(r.position || 0));
      const prev = prevMap[q] || { clicks: 0, impressions: 0 };
      const clicksDiff = clicks - prev.clicks;
      const impDiff = impressions - prev.impressions;
      return {
        query: q,
        clicks: clicks,
        impressions: impressions,
        ctr: ctrPct.toFixed(1) + '%',
        ctrNum: ctrPct,
        position: posNum.toFixed(1),
        positionNum: posNum,
        prevClicks: prev.clicks,
        prevImpressions: prev.impressions,
        clicksDiff: clicksDiff,
        impressionsDiff: impDiff,
        clicksWowPct: calcPctChange_(clicks, prev.clicks)
      };
    });

    const topQueries = merged
      .slice()
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 5);

    const risingQueries = merged
      .filter(q => q.clicksDiff > 0 || (q.prevClicks === 0 && q.impressionsDiff >= 10))
      .sort((a, b) => b.clicksDiff - a.clicksDiff || b.impressionsDiff - a.impressionsDiff)
      .slice(0, 3);

    // 第1層（来なかった人）: 表示回数が多いのにCTRが低い、または順位3〜20位で伸びしろが大きいクエリ
    let oppCandidates = merged.filter(
      q => q.impressions >= 20 && (q.ctrNum < 5.0 || (q.positionNum >= 3.0 && q.positionNum <= 20.0))
    );
    if (oppCandidates.length === 0) {
      oppCandidates = merged.filter(
        q => q.impressions >= 5 && (q.ctrNum < 8.0 || (q.positionNum >= 3.0 && q.positionNum <= 20.0))
      );
    }

    const missedOpportunityQueries = oppCandidates
      .map(q => {
        const opportunityScore = Math.round(q.impressions * (1 - Math.min(1, q.ctrNum / 100)));
        let reason = '順位伸びしろ(3〜20位)';
        if (q.ctrNum < 5.0 && q.positionNum >= 8.0) {
          reason = '高表示・低CTR＆順位8〜20位';
        } else if (q.ctrNum < 5.0) {
          reason = '高表示・低CTR(スルー)';
        }
        return {
          query: q.query,
          clicks: q.clicks,
          impressions: q.impressions,
          ctr: q.ctr,
          ctrNum: q.ctrNum,
          position: q.position,
          positionNum: q.positionNum,
          opportunityScore: opportunityScore,
          reason: reason
        };
      })
      .sort((a, b) => b.opportunityScore - a.opportunityScore || b.impressions - a.impressions)
      .slice(0, 3);

    return {
      available: true,
      period: { startDate: startDate, endDate: endDate },
      prevPeriod: { startDate: prevStartDate, endDate: prevEndDate },
      topQueries: topQueries,
      risingQueries: risingQueries,
      missedOpportunityQueries: missedOpportunityQueries,
      error: null
    };
  } catch (e) {
    console.error('Search Console取得エラー: ' + e.message);
    fallback.error = e.message;
    return fallback;
  }
}

// -------------------------------------------------------------
// Microsoft Clarity 集計（Data Export API v1・6時間キャッシュ付き）
// -------------------------------------------------------------
function getClaritySummary(apiToken, targetDateStr) {
  if (!apiToken) {
    return { enabled: false, note: 'CLARITY_API_TOKEN 未設定のためスキップ' };
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = 'CLARITY_SUMMARY_' + targetDateStr;
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log('ℹ️ Clarityデータはキャッシュから取得しました');
    return JSON.parse(cached);
  }

  try {
    const baseUrl = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';
    const headers = {
      'Authorization': 'Bearer ' + apiToken,
      'Content-Type': 'application/json'
    };

    let res = UrlFetchApp.fetch(`${baseUrl}?numOfDays=1&dimension1=URL&dimension2=Device`, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true
    });

    if (res.getResponseCode() === 400) {
      res = UrlFetchApp.fetch(`${baseUrl}?numOfDays=1&dimension1=Device`, {
        method: 'get',
        headers: headers,
        muteHttpExceptions: true
      });
    }

    const code = res.getResponseCode();
    if (code !== 200) {
      console.warn(`Clarity API HTTP ${code}: ${res.getContentText()}`);
      return { enabled: true, error: `HTTP ${code}` };
    }

    const rawMetrics = JSON.parse(res.getContentText());
    const summary = parseClarityMetrics_(rawMetrics);

    cache.put(cacheKey, JSON.stringify(summary), 21600);
    return summary;

  } catch (e) {
    console.error('Clarity取得エラー: ' + e.message);
    return { enabled: true, error: e.message };
  }
}

function parseClarityMetrics_(rawMetrics) {
  const devices = {};
  const pages = {};

  const ensureBucket = (map, key) => {
    if (!map[key]) {
      map[key] = {
        deadClicks: 0,
        rageClicks: 0,
        quickbacks: 0,
        scriptErrors: 0,
        scrollWeightedSum: 0,
        scrollSessions: 0,
        activeTimeWeightedSum: 0,
        timeSessions: 0
      };
    }
    return map[key];
  };

  const normalizePath = (rawUrl) => {
    if (!rawUrl) return '(全体)';
    const clean = String(rawUrl).split('?')[0].split('#')[0];
    return clean.replace(/^https?:\/\/[^\/]+/, '') || '/';
  };

  (rawMetrics || []).forEach(metricObj => {
    const name = String(metricObj.metricName || '');
    const infoList = metricObj.information || [];

    infoList.forEach(item => {
      const dev = item.Device || item.device || 'Unknown';
      const path = normalizePath(item.Url || item.URL || item.url);
      const dBucket = ensureBucket(devices, dev);
      const pBucket = ensureBucket(pages, path);

      const count = Number(item.subTotal || 0);
      const sess = Number(item.sessionsCount || item.totalSessionCount || 0);

      if (name.indexOf('DeadClick') !== -1) {
        dBucket.deadClicks += count;
        pBucket.deadClicks += count;
      } else if (name.indexOf('RageClick') !== -1) {
        dBucket.rageClicks += count;
        pBucket.rageClicks += count;
      } else if (name.indexOf('Quickback') !== -1) {
        dBucket.quickbacks += count;
        pBucket.quickbacks += count;
      } else if (name.indexOf('ScriptError') !== -1 || name.indexOf('ErrorClick') !== -1) {
        dBucket.scriptErrors += count;
        pBucket.scriptErrors += count;
      } else if (name.indexOf('ScrollDepth') !== -1) {
        const depth = Number(item.averageScrollDepth ?? item.avgScrollDepth ?? 0);
        if (depth > 0 && sess > 0) {
          dBucket.scrollWeightedSum += depth * sess;
          dBucket.scrollSessions += sess;
          pBucket.scrollWeightedSum += depth * sess;
          pBucket.scrollSessions += sess;
        }
      } else if (name.indexOf('EngagementTime') !== -1) {
        const activeSec = Number(item.activeTime || 0);
        if (activeSec > 0 && sess > 0) {
          dBucket.activeTimeWeightedSum += activeSec * sess;
          dBucket.timeSessions += sess;
          pBucket.activeTimeWeightedSum += activeSec * sess;
          pBucket.timeSessions += sess;
        }
      }
    });
  });

  const formatBucket = (b) => ({
    avgScrollDepth: b.scrollSessions > 0 ? (b.scrollWeightedSum / b.scrollSessions).toFixed(1) + '%' : '-',
    avgActiveSeconds: b.timeSessions > 0 ? Math.round(b.activeTimeWeightedSum / b.timeSessions) + '秒' : '-',
    deadClicks: b.deadClicks,
    rageClicks: b.rageClicks,
    quickbacks: b.quickbacks,
    scriptErrors: b.scriptErrors
  });

  const byDevice = {};
  Object.keys(devices).forEach(k => {
    byDevice[k] = formatBucket(devices[k]);
  });

  const notablePages = Object.keys(pages)
    .filter(p => p !== '(全体)')
    .map(p => {
      const b = pages[p];
      const frictionTotal = b.deadClicks + b.rageClicks + b.quickbacks + b.scriptErrors;
      return Object.assign({ path: p, frictionTotal: frictionTotal }, formatBucket(b));
    })
    .filter(p => p.path === '/' || p.path.indexOf('/apply') === 0 || p.frictionTotal > 0)
    .sort((a, b) => b.frictionTotal - a.frictionTotal)
    .slice(0, 6);

  return {
    enabled: true,
    byDevice: byDevice,
    keyPagesAndFriction: notablePages
  };
}

// -------------------------------------------------------------
// Gemini 分析・推論（マーケティング憲法準拠・実数高密度・30〜35行コンパクト版）
// -------------------------------------------------------------
function buildGeminiPrompt_(rawData) {
  const ex = rawData.exam || {};
  const ly = ex.lastYearComparison || {};
  const lyGrade = ly.byGrade || {};
  const ga = rawData.ga4 || {};
  const periods = ga.periods || {};
  const yDay = periods.yesterday || {};
  const l7 = periods.last7d || {};
  const l28 = periods.last28d || {};
  const funnel = ga.applyFunnel || {};
  const sc = rawData.searchConsole || {};

  const examDatesText = (ex.examDates || []).length > 0
    ? ex.examDates.map(d => `${d.venue}:${formatShortMd_(d.date)}`).join(' / ')
    : '未取得';

  const gradeComparisonLines = ['中3', '中2', '中1', '小6'].map(g => {
    const item = lyGrade[g] || {};
    const cur = item.current ?? (ex.gradeCounts ? ex.gradeCounts[g] : 0) ?? 0;
    const unpaid = item.unpaid ?? (ex.gradeUnpaidCounts ? ex.gradeUnpaidCounts[g] : 0) ?? 0;
    let lyText;
    if (item.lastYearSameTiming !== null && item.lastYearSameTiming !== undefined) {
      lyText = `昨年同時期 ${item.lastYearSameTiming}件（差${formatSignedInt_(item.diff)} / 前年比${item.yoyPct !== null ? item.yoyPct + '%' : '—'}）`;
    } else if (item.lastYearFinal !== null && item.lastYearFinal !== undefined && item.lastYearFinal > 0) {
      lyText = `昨年最終実績 ${item.lastYearFinal}件（現在達成率${item.finalAchievementPct !== null && item.finalAchievementPct !== undefined ? item.finalAchievementPct + '%' : '—'}）`;
    } else {
      lyText = `昨年同時期データなし（昨年度最終目安:${item.benchmark ?? '-'}件）`;
    }
    return `  - ${g}: 今年paid ${cur}件（未入金${unpaid}件） vs ${lyText}`;
  }).join('\n');

  const lyTotalText = ly.sameTimingPaidTotal !== null && ly.sameTimingPaidTotal !== undefined
    ? `${ly.sameTimingPaidTotal}件（差${formatSignedInt_(ly.diffFromLastYear)}件 / 前年比${ly.yoyPct !== null ? ly.yoyPct + '%' : '—'}）`
    : ly.finalPaidTotal
      ? `昨年同時期日付なし → 昨年最終実績 ${ly.finalPaidTotal}件（現在達成率${ly.finalAchievementPct !== null && ly.finalAchievementPct !== undefined ? ly.finalAchievementPct + '%' : '—'}）`
      : '過去シート一致データなし';

  const venueLines = VENUE_KEYS.map(v => {
    const p = ex.venueCounts ? (ex.venueCounts[v] || 0) : 0;
    const u = ex.venueUnpaidCounts ? (ex.venueUnpaidCounts[v] || 0) : 0;
    return `${v}:${p}件(未入${u})`;
  }).join(' / ');

  const topPagesText = (ga.topPages || []).length > 0
    ? ga.topPages.map((p, idx) => `  ${idx + 1}. ${p.path}: ${p.pageViews}PV / ${p.users}人 / 平均滞在${p.avgEngagementSec}秒`).join('\n')
    : '  - データなし';

  const channelsText = (ga.channels || []).length > 0
    ? ga.channels.map(c => `  - ${c.channel}: ${c.sessions}回(${c.sharePct}% / 前週比${formatSignedPct_(c.wowPct)})`).join('\n')
    : '  - データなし';

  const scTopText = (sc.topQueries || []).length > 0
    ? sc.topQueries.map((q, idx) => `  ${idx + 1}. "${q.query}": ${q.clicks}clk / ${q.impressions}imp / CTR ${q.ctr} / 順位${q.position}（前週差${formatSignedInt_(q.clicksDiff)}）`).join('\n')
    : '  - データなし';

  const scRisingText = (sc.risingQueries || []).length > 0
    ? sc.risingQueries.map(q => `  - "${q.query}": クリック${formatSignedInt_(q.clicksDiff)} / 表示${formatSignedInt_(q.impressionsDiff)}`).join('\n')
    : '  - 顕著な急伸クエリなし';

  const scMissedText = (sc.missedOpportunityQueries || []).length > 0
    ? sc.missedOpportunityQueries.map((q, idx) => `  ${idx + 1}. "${q.query}": ${q.impressions}imp / ${q.clicks}clk / CTR ${q.ctr} / 順位${q.position}（${q.reason}）`).join('\n')
    : '  - 顕著な機会損失クエリなし';

  const dropOffPct = funnel.cvrAllPct !== null && funnel.cvrAllPct !== undefined
    ? round1_(Math.max(0, 100 - Number(funnel.cvrAllPct)))
    : null;

  return `あなたは岡山県統一模擬試験（おかもし）の専任マーケティングアナリストです。
以下の実測数値のみを根拠に、運営担当者がGoogle Chatで30秒で把握できる「高密度・数値ベースの日次速報」を作成してください。

【マーケティング憲法（最上位原則）】
- 最上位目的（ドラッカー原則）: 顧客が本当に買いたいものは紙の模試ではなく『志望校合格への現在地の確信と具体的な処方箋・安心』である。顧客の不安と求める答えを先回りして提示し、売り込みを不要にすること。
- 買った人の痕跡: 熟読ページ（滞在秒数）・伸長クエリ・好調学年/会場から「何が決め手になっているか」を特定する。
- 買わなかった4層の炙り出し:
  ①第1層(来なかった人): GSCの機会損失クエリ（表示多・低CTR / 順位3〜20位）＝検索看板(title/description)と不安のミスマッチ
  ②第2層(すぐ帰った人): Clarityの即戻り(Quickback)・押せない場所タップ・連打・GA4短時間滞在＝ファーストビュー/日程確認時の期待外れ
  ③第3層(/apply/で諦めた人): フォーム離脱率(${dropOffPct !== null ? dropOffPct + '%' : '—'})・コンビニ未入金＝入力負担や決済・日程の躊躇
  ④第4層(前回受けて今回未申込): 昨年同号比で遅れている学年・会場＝自宅受験振替・フォロー対象

【厳禁事項（絶対に守ること）】
- 「徐々に動き出しています」「偏りなく安定して情報収集されています」「今後の推移に注目です」などの*抽象的な感想文・ポエム・一般論は全面禁止*。
- すべての記述に具体的な実数（件数、±差分、前年比%、前週比%、PV、クリック数、順位、通過率%）を必ず引用すること。
- 全体で *30〜35行以内* に引き締めること（冗長な前置き・挨拶不要）。
- Google Chat 書式厳守: 見出しは「■ タイトル」（# 禁止）、太字は単一アスタリスク *テキスト*（** 禁止）、箇条書きは「・」。
- Clarityの専門用語（deadClicks等）は使わず、「押せない場所のタップ」「ボタンの連打」「画面エラー」「即戻り」と平易に書く。

【1. 対象回・締切・実施日（基準日: ${rawData.targetDate}）】
- 対象回: ${ex.targetExamMonth}（解決元: ${ex.deadlineSource}）
- クレカ締切: ${ex.cardDeadline}（残り *${ex.daysLeftCard}日*）
- コンビニ締切: ${ex.konbiniDeadline}（残り *${ex.daysLeftKonbini}日*）
- 会場実施日: ${examDatesText}${ex.earliestExamDate ? `（最短実施まで残り${ex.daysLeftExam}日）` : ''}

【2. 申込台帳実績 ＆ 昨年比較（基準カットオフ: ${ly.cutoffDate || '前年同日'}）】
- 昨日単日: 新規 ${ex.yesterdayCount}件（paid ${ex.yesterdayPaid}件 / 未入金 ${ex.yesterdayUnpaid}件）
- 当月累積: paid *${ex.currentExamPaid}件* / 未入金 *${ex.currentExamUnpaid}件* / キャンセル・期限切れ ${ex.currentExamCanceled}件
- 昨年比較合計: ${lyTotalText}
- 直近7日ペース: paid ${ex.recent7dPaid}件（日平均 *${ex.dailyPace7d}件/日*） vs 目標(${ex.targetTotal}件 / ${ex.targetTotalSource})までの残${ex.gapToTarget}件・必要ペース *${ex.requiredDailyPace}件/日*
- 学年別比較:
${gradeComparisonLines}
- 会場別内訳: ${venueLines}

【3. GA4 トラフィック＆ファネル】
- 昨日単日: ${yDay.users ?? ga.users ?? 0}人 / ${yDay.sessions ?? ga.sessions ?? 0}セッション / ${yDay.pageViews ?? ga.pageViews ?? 0}PV
- 直近7日: ${l7.users ?? 0}人（日平均${l7.avgDailyUsers ?? 0}人・前週比${formatSignedPct_(l7.usersWowPct)}） / ${l7.pageViews ?? 0}PV（前週比${formatSignedPct_(l7.pvWowPct)}）
- 直近28日: ${l28.users ?? 0}人（前28日比${formatSignedPct_(l28.usersMomPct)}${l28.yoyAvailable ? `・前年比${formatSignedPct_(l28.usersYoyPct)}` : '・前年同期データなし'}） / ${l28.pageViews ?? 0}PV（前28日比${formatSignedPct_(l28.pvMomPct)}）
- 申込フォーム(/apply/)通過率(7日): 到達 ${funnel.applyPageUsers7d ?? 0}人 → 申込送信 ${funnel.recent7dAllOrders ?? 0}件（CVR ${funnel.cvrAllPct !== null && funnel.cvrAllPct !== undefined ? funnel.cvrAllPct + '%' : '—'} / 離脱率 ${dropOffPct !== null ? dropOffPct + '%' : '—'} / paid ${funnel.recent7dPaidOrders ?? 0}件・CVR ${funnel.cvrPaidPct !== null && funnel.cvrPaidPct !== undefined ? funnel.cvrPaidPct + '%' : '—'}）
- 人気ページTOP5（トップ除外・7日）:
${topPagesText}
- 流入チャネルTOP5（7日）:
${channelsText}

【4. Search Console（${sc.period ? `${sc.period.startDate}〜${sc.period.endDate}` : '直近7日'}）】
- 上位検索クエリTOP5:
${scTopText}
- 前週比伸長クエリ:
${scRisingText}
- 見送り・機会損失クエリTOP3（第1層：表示多・低CTR / 順位3〜20位）:
${scMissedText}

【5. Clarity 操作診断（直近24時間）】
${JSON.stringify(rawData.clarity)}

【出力テンプレート（このままの骨格で30〜35行以内に収めること）】
📊 *おかもし日次マーケティング速報（${rawData.targetDate}）*
■ 締切＆申込進捗（${ex.targetExamMonth}）
・クレカ締切 ${formatShortMd_(ex.cardDeadline)}(残${ex.daysLeftCard}日) / コンビニ ${formatShortMd_(ex.konbiniDeadline)}(残${ex.daysLeftKonbini}日) / 実施 ${examDatesText}
・昨日・累積・直近7日ペース vs 必要ペースの数値サマリー
・学年別（中3・中2・中1・小6）の今年 vs 昨年比較（±件・前年比%または最終達成率%）＋未入金件数
・会場別内訳（岡山・倉敷・津山・自宅）と最もギャップが大きい箇所
■ サイト流入・注目ページ・検索ワード（GA4 / GSC）
・昨日 / 7日平均(前週比) / 28日(前28日比・前年比) と主要チャネル構成
・よく見られているページTOP5（パス・PV・滞在秒数）と /apply/ 通過率(CVR)・離脱率
・検索上位クエリ＆前週比伸長ワード＆第1層機会損失ワード（クリック・表示・CTR・順位）
■ 操作のつまずき診断（Clarity）
・スマホ/PC別のスクロール率と、即戻り/押せない場所タップ/連打/エラーが出ているURL（問題ゼロならその旨を数値付きで1行）
■ 顧客インサイト診断（買う理由・買わない壁・売り込み不要化の打ち手）
・[買う理由]: 熟読ページ・伸長クエリ・好調学年/会場の実数から見える「今保護者が求めている価値」
・[買わない壁]: 4層（①検索スルーワード / ②トップ即戻り・空タップ / ③/apply/離脱率 / ④昨年比遅れ学年・会場）のうち今日最大のボトルネックと実数
・[転換の打ち手]: 売り込まずにその壁を消す具体的な1手（どのURL/タイトル/案内文/メルマガに何を提示するか）`;
}

function generateGeminiAnalysis(apiKey, rawData) {
  const prompt = buildGeminiPrompt_(rawData);
  return callGeminiRobust_(apiKey, prompt);
}

/**
 * Gemini 3系カスケード・思考暴走防止・x-goog-api-keyヘッダー認証
 */
function callGeminiRobust_(apiKey, prompt) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY がスクリプトプロパティに設定されていません。');
  }

  let lastError = '';

  for (let i = 0; i < GEMINI_MODEL_CASCADE.length; i++) {
    const spec = GEMINI_MODEL_CASCADE[i];
    const model = spec.name;

    const generationConfig = {
      temperature: 0.2,
      maxOutputTokens: 2048
    };

    if (spec.thinkingBudget !== undefined) {
      generationConfig.thinkingConfig = { thinkingBudget: spec.thinkingBudget };
    }

    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: generationConfig
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const response = UrlFetchApp.fetch(url, {
          method: 'post',
          contentType: 'application/json',
          headers: {
            'x-goog-api-key': apiKey
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        const code = response.getResponseCode();
        const body = response.getContentText();

        if (code === 200) {
          const json = JSON.parse(body);
          const parts = json.candidates?.[0]?.content?.parts || [];
          const text = parts
            .filter(p => !p.thought && p.text)
            .map(p => p.text)
            .join('')
            .trim();

          if (text) {
            console.log(`✅ Gemini成功 (モデル: ${model}, 試行: ${attempt}回目)`);
            return text;
          }
          lastError = `${model}: 空のレスポンス`;
          break;
        }

        if (code === 400 && payload.generationConfig.thinkingConfig) {
          console.warn(`ℹ️ ${model} でthinkingConfigを省略して再試行します`);
          delete payload.generationConfig.thinkingConfig;
          attempt--;
          continue;
        }

        if (code === 404 || code === 400) {
          console.warn(`🔄 ${model} スキップ (HTTP ${code}) -> 次のモデルへ切り替えます`);
          lastError = `${model} HTTP ${code}`;
          break;
        }

        if (code === 503 || code === 429 || code >= 500) {
          console.warn(`⚠️ ${model} 混雑中 (HTTP ${code}) - 試行${attempt}/2回目`);
          lastError = `${model} HTTP ${code}: ${body.slice(0, 120)}`;
          if (attempt === 1) {
            Utilities.sleep(3000 + Math.floor(Math.random() * 2000));
            continue;
          }
          break;
        }

        throw new Error(`認証/権限エラー HTTP ${code}: ${body.slice(0, 150)}`);

      } catch (fetchErr) {
        if (String(fetchErr.message).indexOf('認証/権限エラー') !== -1) {
          throw fetchErr;
        }
        lastError = `${model} 通信例外: ${fetchErr.message}`;
        console.warn(lastError);
        Utilities.sleep(2000);
      }
    }
  }

  throw new Error(lastError);
}

function buildFallbackReport_(rawData) {
  const ex = rawData.exam || {};
  const ly = ex.lastYearComparison || {};
  const lyByGrade = ly.byGrade || {};
  const ga = rawData.ga4 || {};
  const periods = ga.periods || {};
  const yDay = periods.yesterday || {};
  const l7 = periods.last7d || {};
  const l28 = periods.last28d || {};
  const funnel = ga.applyFunnel || {};
  const sc = rawData.searchConsole || {};

  const examDatesStr = (ex.examDates || []).length > 0
    ? ex.examDates.map(d => `${d.venue}${formatShortMd_(d.date)}`).join(' / ')
    : '日程未取得';

  const yoySummary = ly.sameTimingPaidTotal !== null && ly.sameTimingPaidTotal !== undefined
    ? `昨年同時期 ${ly.sameTimingPaidTotal}件（*${formatSignedInt_(ly.diffFromLastYear)}件* / 前年比${ly.yoyPct !== null ? ly.yoyPct + '%' : '—'}）`
    : ly.finalPaidTotal
      ? `昨年最終実績 ${ly.finalPaidTotal}件（達成率 *${ly.finalAchievementPct !== null && ly.finalAchievementPct !== undefined ? ly.finalAchievementPct + '%' : '—'}*）`
      : '昨年比較データなし';

  const gradeLines = ['中3', '中2', '中1', '小6'].map(g => {
    const item = lyByGrade[g] || {};
    const cur = item.current ?? (ex.gradeCounts ? ex.gradeCounts[g] : 0) ?? 0;
    const unpaid = item.unpaid ?? (ex.gradeUnpaidCounts ? ex.gradeUnpaidCounts[g] : 0) ?? 0;
    let vsText;
    if (item.lastYearSameTiming !== null && item.lastYearSameTiming !== undefined) {
      vsText = `昨年${item.lastYearSameTiming}件(差${formatSignedInt_(item.diff)} / ${item.yoyPct !== null ? item.yoyPct + '%' : '—'})`;
    } else if (item.lastYearFinal !== null && item.lastYearFinal !== undefined && item.lastYearFinal > 0) {
      vsText = `昨年最終${item.lastYearFinal}件(達成率${item.finalAchievementPct !== null && item.finalAchievementPct !== undefined ? item.finalAchievementPct + '%' : '—'})`;
    } else {
      vsText = `昨年目安${item.benchmark ?? '-'}件`;
    }
    return `${g}:${cur}件(未${unpaid})[${vsText}]`;
  });

  const venueStr = ['岡山', '倉敷', '津山', '自宅'].map(v => {
    const p = ex.venueCounts ? (ex.venueCounts[v] || 0) : 0;
    const u = ex.venueUnpaidCounts ? (ex.venueUnpaidCounts[v] || 0) : 0;
    return `${v}${p}(未${u})`;
  }).join(' / ');

  const topPagesStr = (ga.topPages || []).slice(0, 5)
    .map((p, i) => `・${i + 1}. ${p.path}：${p.pageViews}PV（${p.users}人 / ${p.avgEngagementSec}秒）`)
    .join('\n') || '・ページ別データなし';

  const channelStr = (ga.channels || []).slice(0, 3)
    .map(c => `${c.channel} ${c.sharePct}%(${formatSignedPct_(c.wowPct)})`)
    .join(' / ') || 'データなし';

  const scTopStr = (sc.topQueries || []).slice(0, 5)
    .map((q, i) => `・${i + 1}. ${q.query}：${q.clicks}clk / ${q.impressions}imp（CTR${q.ctr} / ${q.position}位 / 前週差${formatSignedInt_(q.clicksDiff)}）`)
    .join('\n') || '・検索クエリデータなし';

  const scRiseStr = (sc.risingQueries || []).slice(0, 2)
    .map(q => `${q.query}(${formatSignedInt_(q.clicksDiff)}clk/${formatSignedInt_(q.impressionsDiff)}imp)`)
    .join(' / ') || '該当なし';

  const scMissedStr = (sc.missedOpportunityQueries || []).slice(0, 2)
    .map(q => `"${q.query}"(${q.impressions}imp/CTR${q.ctr}/${q.position}位)`)
    .join(' / ') || '顕著な機会損失なし';

  let clarityLine = '・Clarity未取得';
  let clarityWarnLine = '・特記エラーなし';
  if (rawData.clarity && rawData.clarity.byDevice) {
    const mobile = rawData.clarity.byDevice['Mobile'] || {};
    const pc = rawData.clarity.byDevice['PC'] || {};
    clarityLine = `・スマホ: スクロール${mobile.avgScrollDepth || '-'} / 連打${mobile.rageClicks ?? 0} / 空タップ${mobile.deadClicks ?? 0} | PC: スクロール${pc.avgScrollDepth || '-'}`;
    const errPages = (rawData.clarity.keyPagesAndFriction || []).filter(p => p.scriptErrors > 0 || p.rageClicks > 2 || p.quickbacks > 0);
    if (errPages.length > 0) {
      clarityWarnLine = '・要注意URL: ' + errPages.slice(0, 2).map(p => `${p.path}(エラー${p.scriptErrors}/連打${p.rageClicks}/即戻り${p.quickbacks})`).join(', ');
    } else {
      clarityWarnLine = '・主要導線(/, /apply/)の操作エラー・連打は許容範囲内';
    }
  }

  // マーケティング憲法に基づくデータ自動要約（AIスキップ時の3行インサイト）
  const topEngaged = (ga.topPages || []).slice().sort((a, b) => (b.avgEngagementSec || 0) - (a.avgEngagementSec || 0))[0];
  const buyReasonLine = topEngaged
    ? `・[買う理由]: ${topEngaged.path}(平均滞在${topEngaged.avgEngagementSec}秒/${topEngaged.pageViews}PV)熟読＆検索伸長(${scRiseStr})から詳細確認後の成約が軸`
    : `・[買う理由]: 検索(${scRiseStr})と直近7日paid ${ex.recent7dPaid ?? 0}件の需要が牽引`;

  const dropOffPct = funnel.cvrAllPct !== null && funnel.cvrAllPct !== undefined
    ? round1_(Math.max(0, 100 - Number(funnel.cvrAllPct)))
    : null;
  const topMissed = (sc.missedOpportunityQueries || [])[0];
  let barrierLine = `・[買わない壁]: /apply/到達${funnel.applyPageUsers7d ?? 0}人に対し送信${funnel.recent7dAllOrders ?? 0}件(離脱率${dropOffPct !== null ? dropOffPct + '%' : '—'})・未入金${ex.currentExamUnpaid ?? 0}件`;
  if (topMissed && (dropOffPct === null || dropOffPct < 60)) {
    barrierLine = `・[買わない壁]: 第1層 "${topMissed.query}"(${topMissed.impressions}imp/CTR${topMissed.ctr}/${topMissed.position}位)の検索見送り＋未入金${ex.currentExamUnpaid ?? 0}件`;
  }

  let actionLine = `・[転換の打ち手]: /apply/導線と未入金${ex.currentExamUnpaid ?? 0}件フォローでコンビニ締切(${formatShortMd_(ex.konbiniDeadline)})前の離脱を解消`;
  if (topMissed) {
    actionLine = `・[転換の打ち手]: "${topMissed.query}"(${topMissed.position}位/CTR${topMissed.ctr})向けにタイトル・冒頭へ実施日と合格判定の答えを先回り提示`;
  }

  return [
    `📊 *おかもし日次マーケティング速報（${rawData.targetDate}）*`,
    `■ 次回「${ex.targetExamMonth}」締切＆申込進捗`,
    `・締切: クレカ ${formatShortMd_(ex.cardDeadline)}(*残${ex.daysLeftCard}日*) / コンビニ ${formatShortMd_(ex.konbiniDeadline)}(*残${ex.daysLeftKonbini}日*) | 実施 ${examDatesStr}`,
    `・昨日: 新規${ex.yesterdayCount}件(paid ${ex.yesterdayPaid} / 未入金${ex.yesterdayUnpaid}) | 累積: paid *${ex.currentExamPaid}件*(未入金${ex.currentExamUnpaid}) vs ${yoySummary}`,
    `・ペース: 直近7日 ${ex.recent7dPaid}件(*${ex.dailyPace7d}件/日*) vs 目標${ex.targetTotal}件まで残${ex.gapToTarget}件(必要 *${ex.requiredDailyPace}件/日*)`,
    `・学年別: ${gradeLines.slice(0, 2).join(' / ')}`,
    `・学年別: ${gradeLines.slice(2, 4).join(' / ')}`,
    `・会場別(paid/未入): ${venueStr}`,
    `■ サイト流入・人気ページ・検索トレンド（GA4 / GSC）`,
    `・昨日: ${yDay.users ?? ga.users ?? 0}人/${yDay.pageViews ?? ga.pageViews ?? 0}PV | 7日: ${l7.users ?? 0}人(日平均${l7.avgDailyUsers ?? 0}人・前週比${formatSignedPct_(l7.usersWowPct)}) / ${l7.pageViews ?? 0}PV(${formatSignedPct_(l7.pvWowPct)})`,
    `・28日: ${l28.users ?? 0}人(前28日比${formatSignedPct_(l28.usersMomPct)}${l28.yoyAvailable ? `・前年比${formatSignedPct_(l28.usersYoyPct)}` : ''}) | チャネル: ${channelStr}`,
    `・/apply/通過率(7日): 到達${funnel.applyPageUsers7d ?? 0}人 → 送信${funnel.recent7dAllOrders ?? 0}件(CVR ${funnel.cvrAllPct !== null && funnel.cvrAllPct !== undefined ? funnel.cvrAllPct + '%' : '—'}) / paid ${funnel.recent7dPaidOrders ?? 0}件`,
    `・人気ページTOP5（トップ除外・7日）:`,
    topPagesStr,
    `・検索TOP5（${sc.period ? `${formatShortMd_(sc.period.startDate)}〜${formatShortMd_(sc.period.endDate)}` : '7日'}）｜伸長: ${scRiseStr}`,
    scTopStr,
    `・機会損失(第1層): ${scMissedStr}`,
    `■ 操作つまずき診断（Clarity）`,
    clarityLine,
    clarityWarnLine,
    `■ 顧客インサイト診断（買う理由・買わない壁・売り込み不要化の打ち手）`,
    buyReasonLine,
    barrierLine,
    actionLine
  ].join('\n');
}

// -------------------------------------------------------------
// マーケティング履歴シートへの日次自動蓄積（upsert）
// -------------------------------------------------------------
const MARKETING_HISTORY_HEADERS = [
  '基準日',
  '対象回',
  'クレカ残日数',
  'コンビニ残日数',
  '累積paid',
  '累積未入金',
  '昨年比',
  '直近7日ペース',
  '必要ペース',
  'GA4_7日UU',
  'GA4_7日PV',
  'apply到達UU(7日)',
  'apply_CVR(%)',
  'GSC上位クエリ',
  'GSC機会損失クエリ',
  '買う理由',
  '買わない壁',
  '転換の打ち手',
  '記録日時'
];

function formatDateTimeJst_(dateObj) {
  if (typeof Utilities !== 'undefined' && Utilities && typeof Utilities.formatDate === 'function') {
    const formatted = Utilities.formatDate(dateObj, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(formatted)) {
      return formatted;
    }
  }
  const jst = new Date(dateObj.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const mm = String(jst.getUTCMinutes()).padStart(2, '0');
  const ss = String(jst.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function extractInsightSummariesFromReport_(reportText) {
  const result = {
    buyReason: '',
    barrier: '',
    action: ''
  };
  if (!reportText) return result;

  const lines = String(reportText).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cleanMatch = (regex) => {
      const m = line.match(regex);
      return m ? m[1].trim() : '';
    };
    if (!result.buyReason) {
      const v = cleanMatch(/^(?:[・\-\*]\s*)?\*?\[買う理由\]\*?\s*[:：]\s*(.+)$/);
      if (v) {
        result.buyReason = v;
        continue;
      }
    }
    if (!result.barrier) {
      const v = cleanMatch(/^(?:[・\-\*]\s*)?\*?\[買わない壁\]\*?\s*[:：]\s*(.+)$/);
      if (v) {
        result.barrier = v;
        continue;
      }
    }
    if (!result.action) {
      const v = cleanMatch(/^(?:[・\-\*]\s*)?\*?\[転換の打ち手\]\*?\s*[:：]\s*(.+)$/);
      if (v) {
        result.action = v;
        continue;
      }
    }
  }
  return result;
}

function appendDailyMarketingHistory_(rawData, reportText, props) {
  if (!rawData || !rawData.targetDate) return null;
  if (typeof SpreadsheetApp === 'undefined' || !SpreadsheetApp) return null;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return null;

  const historySheetName = (props && props.HISTORY_SHEET_NAME) || REPORT_DEFAULTS.HISTORY_SHEET_NAME;
  let sheet = ss.getSheetByName(historySheetName);
  if (!sheet && typeof ss.insertSheet === 'function') {
    sheet = ss.insertSheet(historySheetName);
  }
  if (!sheet) return null;

  const existingValues = sheet.getDataRange ? sheet.getDataRange().getValues() : [];
  if (!existingValues || existingValues.length === 0 || !existingValues[0] || !existingValues[0][0]) {
    if (typeof sheet.getRange === 'function') {
      sheet.getRange(1, 1, 1, MARKETING_HISTORY_HEADERS.length).setValues([MARKETING_HISTORY_HEADERS]);
    } else if (typeof sheet.appendRow === 'function') {
      sheet.appendRow(MARKETING_HISTORY_HEADERS);
    }
    if (typeof sheet.setFrozenRows === 'function') {
      sheet.setFrozenRows(1);
    }
  }

  const ex = rawData.exam || {};
  const ly = ex.lastYearComparison || {};
  const ga = rawData.ga4 || {};
  const l7 = (ga.periods && ga.periods.last7d) || {};
  const funnel = ga.applyFunnel || {};
  const sc = rawData.searchConsole || {};
  const insights = extractInsightSummariesFromReport_(reportText);

  let yoyLabel = '—';
  if (ly.yoyPct !== null && ly.yoyPct !== undefined) {
    yoyLabel = `${ly.yoyPct}%`;
  } else if (ly.finalAchievementPct !== null && ly.finalAchievementPct !== undefined) {
    yoyLabel = `最終比${ly.finalAchievementPct}%`;
  }

  const topQueriesStr = (sc.topQueries || [])
    .slice(0, 3)
    .map(q => `${q.query}(${q.clicks}clk)`)
    .join(' / ');
  const missedQueriesStr = (sc.missedOpportunityQueries || [])
    .slice(0, 3)
    .map(q => `${q.query}(${q.impressions}imp/${q.ctr})`)
    .join(' / ');

  const rowValues = [
    rawData.targetDate,
    ex.targetExamMonth || '',
    ex.daysLeftCard ?? '',
    ex.daysLeftKonbini ?? '',
    ex.currentExamPaid ?? 0,
    ex.currentExamUnpaid ?? 0,
    yoyLabel,
    ex.dailyPace7d ?? 0,
    ex.requiredDailyPace ?? 0,
    l7.users ?? 0,
    l7.pageViews ?? 0,
    funnel.applyPageUsers7d ?? 0,
    funnel.cvrAllPct !== null && funnel.cvrAllPct !== undefined ? funnel.cvrAllPct : '',
    topQueriesStr,
    missedQueriesStr,
    insights.buyReason,
    insights.barrier,
    insights.action,
    formatDateTimeJst_(new Date())
  ];

  const currentData = sheet.getDataRange ? sheet.getDataRange().getValues() : [];
  let targetRowNumber = -1;
  for (let i = 1; i < currentData.length; i++) {
    const rowDate = parseDateToYmdJst_(currentData[i][0]);
    if (rowDate === rawData.targetDate) {
      targetRowNumber = i + 1;
      break;
    }
  }

  if (targetRowNumber > 1 && typeof sheet.getRange === 'function') {
    sheet.getRange(targetRowNumber, 1, 1, rowValues.length).setValues([rowValues]);
    console.log(`📝 マーケティング履歴を更新しました (行: ${targetRowNumber}, 基準日: ${rawData.targetDate})`);
    return { action: 'updated', rowNumber: targetRowNumber, sheetName: historySheetName };
  }

  if (typeof sheet.appendRow === 'function') {
    sheet.appendRow(rowValues);
  } else if (typeof sheet.getRange === 'function') {
    const nextRow = Math.max(2, currentData.length + 1);
    sheet.getRange(nextRow, 1, 1, rowValues.length).setValues([rowValues]);
  }
  const appendedRowNumber = Math.max(2, (currentData.length || 1) + 1);
  console.log(`📝 マーケティング履歴を追記しました (行: ${appendedRowNumber}, 基準日: ${rawData.targetDate})`);
  return { action: 'appended', rowNumber: appendedRowNumber, sheetName: historySheetName };
}

function scheduleRetryTrigger_(minutes) {
  clearRetryTriggers_();
  ScriptApp.newTrigger('runDailyMarketingReportRetry')
    .timeBased()
    .after(minutes * 60 * 1000)
    .create();
}

function clearRetryTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'runDailyMarketingReportRetry') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
}

function postToGoogleChat(webhookUrl, messageText) {
  UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: messageText }),
    muteHttpExceptions: true
  });
}
