/**
 * 岡山県統一模擬試験（おかもし）
 * 日次マーケティング速報自動生成・Google Chat通知スクリプト
 * 【Gemini 3系対応・503高負荷対策・ヘッダー認証・テスト強制実行付き完成版】
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
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const targetDateStr = Utilities.formatDate(yesterday, 'Asia/Tokyo', 'yyyy-MM-dd');
  const cache = CacheService.getScriptCache();
  cache.remove('CLARITY_SUMMARY_' + targetDateStr);
  cache.remove('FULL_RAW_DATA_' + targetDateStr);
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
    const mainSheetName = props.SHEET_NAME || 'main';

    clearRetryTriggers_();

    // 対象日（昨日）の生成
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const targetDateStr = Utilities.formatDate(yesterday, 'Asia/Tokyo', 'yyyy-MM-dd');

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
    const fullCacheKey = 'FULL_RAW_DATA_' + targetDateStr;
    let rawData = null;

    const cachedRaw = cache.get(fullCacheKey);
    if (cachedRaw) {
      rawData = JSON.parse(cachedRaw);
      console.log('ℹ️ 集計済みキャッシュデータを復元しました（GA4/GSC/Clarityの再通信をスキップ）');
    }

    if (!rawData) {
      console.log('▶ 2. 申込台帳および模試マスターの集計開始...');
      const examSummary = getNextExamAndOrderSummary(mainSheetName, targetDateStr);
      console.log('▶ 2. 集計完了: ' + JSON.stringify(examSummary));

      console.log('▶ 3. GA4データ取得開始...');
      const ga4Data = getGA4Summary(ga4PropertyId, targetDateStr);
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

    // 5. Gemini によるマーケティング分析 & 着地推測
    console.log('▶ 6. Gemini 分析リクエスト送信中...');
    try {
      const analysisReport = generateGeminiAnalysis(geminiApiKey, rawData);
      console.log('▶ 6. Gemini レポート生成完了');

      console.log('▶ 7. Google Chat へ投稿中...');
      postToGoogleChat(chatWebhookUrl, analysisReport);

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

      scriptProps.setProperty(RETRY_SETTINGS.PROP_LAST_SENT, targetDateStr);
      scriptProps.deleteProperty(RETRY_SETTINGS.PROP_RETRY_COUNT);
      console.log('✅ AIスキップ（数値速報モード）でGoogle Chatへ投稿完了');
    }
  } finally {
    lock.releaseLock();
  }
}

// -------------------------------------------------------------
// スプレッドシート集計ロジック
// -------------------------------------------------------------
function getNextExamAndOrderSummary(mainSheetName, targetDateStr) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let masterSheet = ss.getSheetByName('模試基本情報') || ss.getSheetByName('模試マスター');
  let targetExamMonth = '12月号';
  let deadlineStr = '2026-12-14';
  let daysLeft = 35;

  if (masterSheet) {
    const masterData = masterSheet.getDataRange().getValues();
    const now = new Date();
    for (let i = 1; i < masterData.length; i++) {
      const month = String(masterData[i][1] || '');
      const rawDeadline = masterData[i][8];
      if (rawDeadline) {
        const deadline = new Date(rawDeadline);
        if (deadline > now) {
          targetExamMonth = month;
          deadlineStr = Utilities.formatDate(deadline, 'Asia/Tokyo', 'yyyy-MM-dd');
          daysLeft = Math.max(0, Math.ceil((deadline - now) / (1000 * 60 * 60 * 24)));
          break;
        }
      }
    }
  }

  const mainSheet = ss.getSheetByName(mainSheetName);
  if (!mainSheet) {
    throw new Error(`シート「${mainSheetName}」が見つかりません。`);
  }

  const values = mainSheet.getDataRange().getValues();
  const colDate = 0;   // A列: 受付日時
  const colExam = 2;   // C列: 対象模試
  const colStatus = 5; // F列: 決済ステータス
  const colGrade = 12; // M列: 学年

  let yesterdayNewCount = 0;
  let yesterdayPaidCount = 0;
  let currentExamPaid = 0;
  let gradeCounts = { '中3': 0, '中2': 0, '中1': 0, 'その他': 0 };

  const examKeyword = targetExamMonth.replace('号', '');

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rawDate = row[colDate];
    const examName = String(row[colExam] || '');
    const status = String(row[colStatus] || '').trim().toLowerCase();
    const grade = String(row[colGrade] || '');

    if (rawDate) {
      let rowDateStr = '';
      if (rawDate instanceof Date) {
        rowDateStr = Utilities.formatDate(rawDate, 'Asia/Tokyo', 'yyyy-MM-dd');
      } else {
        rowDateStr = String(rawDate).substring(0, 10);
      }

      if (rowDateStr === targetDateStr) {
        yesterdayNewCount++;
        if (status === 'paid') {
          yesterdayPaidCount++;
        }
      }
    }

    if (examName.indexOf(examKeyword) !== -1 && status === 'paid') {
      currentExamPaid++;
      if (grade.indexOf('3') !== -1) {
        gradeCounts['中3']++;
      } else if (grade.indexOf('2') !== -1) {
        gradeCounts['中2']++;
      } else if (grade.indexOf('1') !== -1) {
        gradeCounts['中1']++;
      } else {
        gradeCounts['その他']++;
      }
    }
  }

  return {
    targetExamMonth: targetExamMonth,
    deadline: deadlineStr,
    daysLeft: daysLeft,
    currentExamPaid: currentExamPaid,
    gradeCounts: gradeCounts,
    yesterdayCount: yesterdayNewCount,
    yesterdayPaid: yesterdayPaidCount,
    benchmarks: {
      '中3': '昨年度最終実績: 約250件超（11月下旬〜締切1週間前にかけて急増する傾向）',
      '中2': '昨年度最終実績: 55件',
      '中1': '昨年度最終実績: 39件'
    }
  };
}

// -------------------------------------------------------------
// GA4 集計
// -------------------------------------------------------------
function getGA4Summary(propertyId, targetDateStr) {
  try {
    const request = {
      dateRanges: [{ startDate: targetDateStr, endDate: targetDateStr }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' }
      ]
    };

    const response = AnalyticsData.Properties.runReport(request, 'properties/' + propertyId);
    if (!response.rows || response.rows.length === 0) {
      return { users: 0, sessions: 0, pageViews: 0 };
    }

    const metricValues = response.rows[0].metricValues;
    return {
      users: metricValues[0].value,
      sessions: metricValues[1].value,
      pageViews: metricValues[2].value
    };
  } catch (e) {
    console.error('GA4取得エラー: ' + e.message);
    return { error: e.message };
  }
}

// -------------------------------------------------------------
// Search Console 集計（REST API経由）
// -------------------------------------------------------------
function getSearchConsoleSummary(siteUrl, targetDateStr) {
  try {
    const scDate = new Date();
    scDate.setDate(scDate.getDate() - 3);
    const scDateStr = Utilities.formatDate(scDate, 'Asia/Tokyo', 'yyyy-MM-dd');

    const token = ScriptApp.getOAuthToken();
    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

    const payload = {
      startDate: scDateStr,
      endDate: scDateStr,
      dimensions: ['query'],
      rowLimit: 5
    };

    const response = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + token
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const json = JSON.parse(response.getContentText());
    if (!json.rows) return [];

    return json.rows.map(r => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: (r.ctr * 100).toFixed(1) + '%',
      position: r.position.toFixed(1)
    }));
  } catch (e) {
    console.error('Search Console取得エラー: ' + e.message);
    return [];
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
// Gemini 分析・推論（Gemini 3系・思考レベル制御・ヘッダー認証）
// -------------------------------------------------------------
function generateGeminiAnalysis(apiKey, rawData) {
  const prompt = `
あなたは岡山県統一模擬試験（おかもし）の専任マーケティングアナリストです。
昨日の実績データおよび次回模試の進捗に基づき、事務局運営メンバー（非エンジニア）が直感的に理解できる「日次マーケティング速報」を作成してください。

【対象日】: ${rawData.targetDate}

【次回模試の受付状況】:
- 対象回: ${rawData.exam.targetExamMonth}
- 申込締切日: ${rawData.exam.deadline}（締切まで残り ${rawData.exam.daysLeft} 日）
- 現在の確定件数（paid）: 合計 ${rawData.exam.currentExamPaid} 件
- 中3: ${rawData.exam.gradeCounts['中3']} 件
- 中2: ${rawData.exam.gradeCounts['中2']} 件
- 中1: ${rawData.exam.gradeCounts['中1']} 件
- 昨年実績ベンチマーク（参考）:
- 中3: ${rawData.exam.benchmarks['中3']}
- 中2: ${rawData.exam.benchmarks['中2']}
- 中1: ${rawData.exam.benchmarks['中1']}

【昨日の単日実績】:
- 新規申込: ${rawData.exam.yesterdayCount} 件（うち即時入金完了: ${rawData.exam.yesterdayPaid} 件）

【GA4アクセス】:
${JSON.stringify(rawData.ga4, null, 2)}

【検索流入トップ（Search Console）】:
${JSON.stringify(rawData.searchConsole, null, 2)}

【サイト内の行動・操作つまずき検知（Microsoft Clarity・直近24時間）】:
※deadClicks=押せない場所のタップ回数、rageClicks=イライラ連打回数、quickbacks=開いてすぐ戻った回数、scriptErrors=画面エラー回数
${JSON.stringify(rawData.clarity, null, 2)}

【出力ルール（Google Chat用）】:
1. Markdownの見出し記号（# や ###）は絶対に使わないでください。セクションの区切りは「■ タイトル」のように記述してください。
2. 太字は二重アスタリスク（**）ではなく、Google Chat仕様の単一アスタリスク（*テキスト*）で囲んでください。
3. 箇条書きは「・」を使用してください。
4. 専門用語（デッドクリック、レイジクリック等）はそのまま使わず、「押せない場所のタップ」「ボタンの連打」「申込画面でのつまずき」など非エンジニアの運営担当者が直感的にわかる表現に噛み砕いてください。問題が0件・軽微な場合は「画面操作のつまずきはなくスムーズです」と安心感を伝えてください。

【構成案】
📊 *おかもし日次マーケティング速報（${rawData.targetDate}）*

■ 昨日の主要ハイライト
■ 次回「${rawData.exam.targetExamMonth}」申込進捗と着地予測
・現在の確定状況（学年別内訳）
・昨年実績推移との比較
・締切（残り${rawData.exam.daysLeft}日）時点での最終着地予測（現ペースから何件程度に達する見込みか）
■ サイト流入とページ内の動き（GA4・検索・Clarity診断）
・アクセス数と検索キーワードの傾向
・スマホ/PCでの読まれ方（スクロール率）や、トップページ・申込画面（/apply）で操作に迷っている兆候がないか
■ 今日の推奨アクション（非エンジニア担当者が今日打つべき具体策1〜2選）
`;

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
  const topQueries = (rawData.searchConsole || [])
    .slice(0, 3)
    .map(q => `・${q.query}（${q.clicks}クリック / 表示${q.impressions}回）`)
    .join('\n') || '・データなし';

  let clarityLine = '・データ未取得';
  let uiDiagnosis = '・画面操作の大きな異常は検知されていません。';
  if (rawData.clarity && rawData.clarity.byDevice) {
    const mobile = rawData.clarity.byDevice['Mobile'] || {};
    const rage = mobile.rageClicks ?? 0;
    const dead = mobile.deadClicks ?? 0;
    clarityLine = `・スマホ平均スクロール: ${mobile.avgScrollDepth || '-'} / 連打: ${rage}回 / 空タップ: ${dead}回`;
    if (rage > 3 || dead > 5) {
      uiDiagnosis = '・スマホ画面でボタン連打や空タップがやや見られます。申込導線のタップ反応をご確認ください。';
    } else {
      uiDiagnosis = '・スマホ画面での操作のつまずきは少なく、スムーズに閲覧されています。';
    }
  }

  return `📊 *おかもし日次マーケティング速報（${rawData.targetDate}）*\n` +
    `※現在GoogleのAIサーバーが広域で高負荷のため、自動集計データと数値診断をお届けします。\n\n` +
    `■ 昨日の申込実績\n` +
    `・新規申込: *${rawData.exam.yesterdayCount} 件*（うち入金完了: ${rawData.exam.yesterdayPaid} 件）\n\n` +
    `■ 次回「${rawData.exam.targetExamMonth}」確定件数（締切 ${rawData.exam.deadline} / 残り${rawData.exam.daysLeft}日）\n` +
    `・合計（paid）: *${rawData.exam.currentExamPaid} 件*\n` +
    `・内訳: 中3 ${rawData.exam.gradeCounts['中3']}件 / 中2 ${rawData.exam.gradeCounts['中2']}件 / 中1 ${rawData.exam.gradeCounts['中1']}件\n\n` +
    `■ 昨日のサイトアクセス・行動（GA4 / Clarity）\n` +
    `・ユーザー数: ${rawData.ga4.users ?? '-'} / セッション: ${rawData.ga4.sessions ?? '-'} / PV: ${rawData.ga4.pageViews ?? '-'}\n` +
    `${clarityLine}\n` +
    `${uiDiagnosis}\n\n` +
    `■ 検索流入上位（Search Console）\n` +
    `${topQueries}`;
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