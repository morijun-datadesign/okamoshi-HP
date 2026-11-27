/**
 * gas/MailSender.gs 単体テスト
 * 実行: node tests/unit/mail-sender.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const GAS_PATH = path.join(ROOT, 'gas/MailSender.gs');

function createMockSheet(name, initialData = [], options = {}) {
  const data = initialData.map((row) => [...row]);
  let maxColumns = options.maxColumns || Math.max(1, data.reduce((m, r) => Math.max(m, r.length), 0));
  const styles = {}; // "r,c" => { bg, fg, fw }
  if (options.headerStyle && data.length >= 1) {
    for (let c = 1; c <= (data[0]?.length || 0); c++) {
      styles[`1,${c}`] = { ...options.headerStyle };
    }
  }
  const widths = {};
  const setValuesCalls = [];

  const ensureRowWidth = (rowIdx, colCount) => {
    while (data.length <= rowIdx) data.push([]);
    while (data[rowIdx].length < colCount) data[rowIdx].push('');
  };

  const makeRange = (startRow, startCol, numRows = 1, numCols = 1) => {
    const api = {
      getValues: () => {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const rowIdx = startRow - 1 + r;
          const row = [];
          for (let c = 0; c < numCols; c++) {
            const colIdx = startCol - 1 + c;
            row.push(data[rowIdx] && colIdx < data[rowIdx].length ? data[rowIdx][colIdx] : '');
          }
          out.push(row);
        }
        return out;
      },
      getValue: () => api.getValues()[0][0],
      setValues: (vals) => {
        setValuesCalls.push({ startRow, startCol, numRows, numCols, rowCount: vals.length });
        maxColumns = Math.max(maxColumns, startCol + numCols - 1);
        for (let r = 0; r < vals.length; r++) {
          const rowIdx = startRow - 1 + r;
          ensureRowWidth(rowIdx, startCol + vals[r].length - 1);
          for (let c = 0; c < vals[r].length; c++) {
            data[rowIdx][startCol - 1 + c] = vals[r][c];
          }
        }
        return api;
      },
      setValue: (val) => api.setValues([[val]]),
      setFontWeight: (fw) => {
        for (let r = 0; r < numRows; r++) {
          for (let c = 0; c < numCols; c++) {
            const key = `${startRow + r},${startCol + c}`;
            styles[key] = { ...(styles[key] || {}), fw };
          }
        }
        return api;
      },
      setBackground: (bg) => {
        for (let r = 0; r < numRows; r++) {
          for (let c = 0; c < numCols; c++) {
            const key = `${startRow + r},${startCol + c}`;
            styles[key] = { ...(styles[key] || {}), bg };
          }
        }
        return api;
      },
      setFontColor: (fg) => {
        for (let r = 0; r < numRows; r++) {
          for (let c = 0; c < numCols; c++) {
            const key = `${startRow + r},${startCol + c}`;
            styles[key] = { ...(styles[key] || {}), fg };
          }
        }
        return api;
      },
      getBackground: () => (styles[`${startRow},${startCol}`] || {}).bg || '#ffffff',
      getFontColor: () => (styles[`${startRow},${startCol}`] || {}).fg || '#000000',
      getFontWeight: () => (styles[`${startRow},${startCol}`] || {}).fw || 'normal',
      setWrap: () => api,
      setDataValidation: () => api,
      setNumberFormat: () => api,
    };
    return api;
  };

  return {
    name,
    getData: () => data,
    getStyles: () => styles,
    getWidths: () => widths,
    getSetValuesCalls: () => setValuesCalls,
    getLastRow: () => data.length,
    getMaxColumns: () => maxColumns,
    insertColumnsAfter: (_afterCol, count) => {
      maxColumns += count;
    },
    getDataRange: () => makeRange(1, 1, Math.max(1, data.length), Math.max(1, maxColumns)),
    getRange: (a, b, c, d) => {
      if (typeof a === 'string') {
        const m = a.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
        if (!m) throw new Error(`Unsupported A1 notation: ${a}`);
        const colToNum = (col) => col.toUpperCase().split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
        const c1 = colToNum(m[1]);
        const r1 = Number(m[2]);
        const c2 = m[3] ? colToNum(m[3]) : c1;
        const r2 = m[4] ? Number(m[4]) : r1;
        return makeRange(r1, c1, r2 - r1 + 1, c2 - c1 + 1);
      }
      return makeRange(a, b, c || 1, d || 1);
    },
    appendRow: (row) => {
      data.push([...row]);
      maxColumns = Math.max(maxColumns, row.length);
    },
    setColumnWidth: (col, w) => {
      widths[col] = w;
    },
    clearContents: () => {
      data.length = 0;
    },
  };
}

function createSpreadsheet(initialSheets = {}) {
  const sheets = new Map();
  for (const [k, s] of Object.entries(initialSheets)) {
    sheets.set(k, s);
  }
  return {
    getSheetByName: (name) => sheets.get(name) || null,
    insertSheet: (name) => {
      const s = createMockSheet(name, []);
      sheets.set(name, s);
      return s;
    },
    getSheets: () => Array.from(sheets.values()),
  };
}

function loadMailSenderGas(overrides = {}) {
  const source = fs.readFileSync(GAS_PATH, 'utf8');
  const propsStore = {
    SHEET_NAME: 'main',
    RESEND_API_KEY: 're_test_dummy_key',
    SHARED_SECRET: 'test_shared_secret_2026',
    WEBAPP_URL: 'https://script.google.com/macros/s/dummy/exec',
    ...(overrides.props || {}),
  };
  const alerts = [];
  const menuItems = [];
  const ss = overrides.spreadsheet || createSpreadsheet();

  const context = {
    console,
    Date,
    Math,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    parseInt,
    isFinite,
    isNaN,
    encodeURIComponent,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in propsStore ? propsStore[k] : null),
        setProperty: (k, v) => { propsStore[k] = String(v); },
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: () => ss,
      getUi: () => ({
        ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' },
        Button: { YES: 'YES', NO: 'NO' },
        alert: (a, b) => {
          alerts.push(b !== undefined ? `${a}: ${b}` : a);
          return overrides.confirmResult || 'YES';
        },
        createMenu: (title) => {
          const builder = {
            title,
            addItem: (label, fn) => {
              menuItems.push({ label, fn });
              return builder;
            },
            addSeparator: () => builder,
            addToUi: () => builder,
          };
          return builder;
        },
      }),
      newDataValidation: () => {
        const b = {
          requireValueInRange: () => b,
          requireValueInList: () => b,
          setAllowInvalid: () => b,
          build: () => ({}),
        };
        return b;
      },
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {},
      }),
    },
    Utilities: {
      formatDate: (date, _tz, fmt) => {
        const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
        const y = jst.getUTCFullYear();
        const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
        const d = String(jst.getUTCDate()).padStart(2, '0');
        const hh = String(jst.getUTCHours()).padStart(2, '0');
        const mm = String(jst.getUTCMinutes()).padStart(2, '0');
        const ssStr = String(jst.getUTCSeconds()).padStart(2, '0');
        if (fmt === 'yyyyMMdd') return `${y}${m}${d}`;
        return `${y}-${m}-${d} ${hh}:${mm}:${ssStr}`;
      },
      sleep: () => {},
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_alg, raw) => Array.from(crypto.createHash('sha256').update(raw, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
    },
    UrlFetchApp: overrides.UrlFetchApp || {
      fetch: () => ({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ id: 'single_ok' }),
      }),
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createHtmlOutput: (html) => ({
        html,
        getContent: () => html,
        setXFrameOptionsMode: function () { return this; },
      }),
    },
    ScriptApp: {
      getService: () => ({ getUrl: () => propsStore.WEBAPP_URL }),
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: () => ({
        timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create: () => {} }) }) }),
      }),
    },
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'gas/MailSender.gs' });
  return { context, ss, alerts, menuItems, propsStore };
}

function makeMainRow(overrides = {}) {
  const row = new Array(31).fill('');
  row[0] = overrides.receivedAt || new Date('2026-11-20T01:00:00Z');
  row[1] = overrides.sessionId || 'cs_live_1';
  row[2] = overrides.exam || '12月号';
  row[3] = overrides.venue || '岡山会場';
  row[5] = overrides.status || 'paid';
  row[9] = overrides.voucherUrl || '';
  row[10] = overrides.studentName || '岡山 太郎';
  row[12] = overrides.grade || '中学3年生';
  row[14] = overrides.parentName || '岡山 花子';
  row[16] = overrides.email || 'taro@example.com';
  row[23] = overrides.expiresAt || '';
  row[25] = overrides.memberNo || 'M001';
  return row;
}

test('1. 構文検証 & onOpen() メニューに過去ログ件名補完項目が登録されること', () => {
  const { context, menuItems } = loadMailSenderGas();
  context.onOpen();
  assert.equal(context.LOG_HEADERS.length, 9);
  assert.equal(context.LOG_HEADERS[7], '送信件名');
  assert.equal(context.LOG_HEADERS[8], '本文抜粋');
  const found = menuItems.find((m) => m.fn === 'backfillDeliveryLogSubjects');
  assert.ok(found, 'backfillDeliveryLogSubjects メニュー項目が存在すること');
  assert.equal(found.label, '📝 過去ログの件名を一括補完（H・I列）');
});

test('2. ensureLogSheet_() が既存7列シートのH1/I1ヘッダーとスタイルを自動拡張すること', () => {
  const oldLogSheet = createMockSheet(
    '配信ログ',
    [
      ['送信日時', '配信ID', 'メールアドレス', '保護者氏名', '生徒氏名', '対象模試', '送信結果'],
      ['2026-11-01 09:00:00', 'PROMO_UNAPPLIED_12 202612', 'a@example.com', '保護者A', '生徒A', '12月号', 'OK (id_1)'],
    ],
    {
      maxColumns: 7,
      headerStyle: { bg: '#0f4c3a', fg: '#ffffff', fw: 'bold' },
    }
  );
  const ss = createSpreadsheet({ 配信ログ: oldLogSheet });
  const { context } = loadMailSenderGas({ spreadsheet: ss });

  const sheet = context.ensureLogSheet_(ss);
  assert.equal(sheet.getMaxColumns(), 9);
  const row1 = sheet.getRange(1, 1, 1, 9).getValues()[0];
  assert.deepEqual(row1, ['送信日時', '配信ID', 'メールアドレス', '保護者氏名', '生徒氏名', '対象模試', '送信結果', '送信件名', '本文抜粋']);
  assert.equal(sheet.getStyles()['1,8'].bg, '#0f4c3a');
  assert.equal(sheet.getStyles()['1,9'].fg, '#ffffff');
  assert.equal(sheet.getStyles()['1,8'].fw, 'bold');
  assert.equal(sheet.getWidths()[8], 340);
  assert.equal(sheet.getWidths()[9], 420);
});

test('3. buildBodyExcerpt_() が改行・連続空白を置換し先頭80文字で切り出すこと', () => {
  const { context } = loadMailSenderGas();
  const sample = '岡山 花子 様\n\nいつも\t岡山県統一模擬試験をご利用いただき、誠にありがとうございます。\r\n' + 'あ'.repeat(100);
  const excerpt = context.buildBodyExcerpt_(sample);
  assert.equal(excerpt.includes('\n'), false);
  assert.equal(excerpt.includes('\r'), false);
  assert.equal(excerpt.includes('\t'), false);
  assert.equal(excerpt.length, 80);
  assert.equal(excerpt.startsWith('岡山 花子 様 いつも 岡山県統一模擬試験をご利用いただき、誠にありがとうございます。 あ'), true);
});

test('4. sendBulkEmails() がH列(送信件名)・I列(本文抜粋80文字)を自動記録し重複防止を保つこと', () => {
  const mainSheet = createMockSheet('main', [
    new Array(31).fill('H'),
    makeMainRow({ studentName: '岡山 一郎', parentName: '岡山 母1', email: 'one@example.com' }),
    makeMainRow({ studentName: '岡山 二郎', parentName: '岡山 母2', email: 'two@example.com' }),
  ]);
  const composeRows = [
    ['項目', '設定値'],
    ['① テンプレ', '① 自宅受験：問題発送のお知らせ'],
    ['② 学年', 'すべて'],
    ['③ 対象模試', '12月号'],
    ['④ 会場', ''],
    ['⑤ ステータス', 'paid'],
    ['⑥ 配信ID', 'HOME_SHIP_202612'],
    ['⑦ テスト先', ''],
    ['⑧ 件名', '【テスト模試】{{対象模試}} 発送完了（{{生徒氏名}}様）'],
    ['⑨ 本文', '{{保護者氏名}} 様\n\nいつもありがとうございます。\n問題一式を発送いたしました。\n' + '★'.repeat(90)],
  ];
  const compSheet = createMockSheet('メール配信作成', composeRows);
  const logSheet = createMockSheet(
    '配信ログ',
    [['送信日時', '配信ID', 'メールアドレス', '保護者氏名', '生徒氏名', '対象模試', '送信結果']],
    { maxColumns: 7, headerStyle: { bg: '#0f4c3a', fg: '#ffffff', fw: 'bold' } }
  );
  const ss = createSpreadsheet({ main: mainSheet, メール配信作成: compSheet, 配信ログ: logSheet });

  let fetchCall = 0;
  const UrlFetchApp = {
    fetch: (url) => {
      fetchCall++;
      if (url.endsWith('/emails/batch') && fetchCall === 1) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ data: [{ id: 'batch_1' }, { id: 'batch_2' }] }),
        };
      }
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ id: 'single_1' }) };
    },
  };

  const { context } = loadMailSenderGas({ spreadsheet: ss, UrlFetchApp });
  context.sendBulkEmails();

  const rows = logSheet.getData();
  assert.equal(rows.length, 3);
  assert.equal(rows[1][1], 'HOME_SHIP_202612');
  assert.equal(rows[1][6], 'OK (batch_1)');
  assert.equal(rows[1][7], '【テスト模試】12月号 発送完了（岡山 一郎様）');
  assert.equal(rows[1][8].length, 80);
  assert.equal(rows[1][8].includes('\n'), false);
  assert.equal(rows[2][7], '【テスト模試】12月号 発送完了（岡山 二郎様）');

  // 既存重複防止チェックが引き続き効いていること
  const secondTargets = context.getTargetTargets_();
  assert.equal(secondTargets.targets.length, 0);
  assert.equal(secondTargets.skippedDuplicate, 2);
});

test('5. processScheduledEmailsCron() が通常送信・フォールバック・SKIP_AFTER_DEADLINEすべて9列記録すること', () => {
  const jstNow = new Date();
  const ymdJst = new Date(jstNow.getTime() + 9 * 60 * 60 * 1000);
  const todayStr = `${ymdJst.getUTCFullYear()}-${String(ymdJst.getUTCMonth() + 1).padStart(2, '0')}-${String(ymdJst.getUTCDate()).padStart(2, '0')}`;

  const mainSheet = createMockSheet('main', [
    new Array(31).fill('H'),
    makeMainRow({ studentName: '倉敷 花', parentName: '倉敷 親', email: 'hana@example.com', status: 'paid' }),
    makeMainRow({ studentName: '津山 健', parentName: '津山 親', email: 'ken@example.com', status: '未入金' }),
  ]);
  const tplSheet = createMockSheet('メールテンプレート保管庫', [
    ['テンプレート名', '件名', '本文', '推奨配信IDプレフィックス'],
    ['② 会場受験：前日リマインド・持ち物案内', '【重要】{{対象模試}} ご案内（{{生徒氏名}}様）', '{{保護者氏名}} 様\n前日のお知らせです。\nご準備ください。', 'VENUE_REMIND_'],
  ]);
  const schSheet = createMockSheet('配信スケジュール', [
    ['有効', 'ルールID', 'ルール名', '種別', '日数/曜日', '開始日', '終了日', '学年', '模試', '会場', 'ステータス', '使用テンプレ', '更新'],
    ['ON', 'SCH_ONE_SHOT', '一斉案内', '指定日に一斉配信', '', todayStr, '', 'すべて', '12月号', '', 'paid', '② 会場受験：前日リマインド・持ち物案内', '変更しない'],
    ['ON', 'SCH_EXPIRE_ONLY', '期限切れ更新', '指定日に一斉配信', '', todayStr, '', 'すべて', '12月号', '', '未入金', '② 会場受験：前日リマインド・持ち物案内', 'メール送らず期限切れに更新のみ'],
  ]);
  const logSheet = createMockSheet('配信ログ', [['送信日時', '配信ID', 'メールアドレス', '保護者氏名', '生徒氏名', '対象模試', '送信結果']], { maxColumns: 7 });
  const ss = createSpreadsheet({ main: mainSheet, メールテンプレート保管庫: tplSheet, 配信スケジュール: schSheet, 配信ログ: logSheet });

  const UrlFetchApp = {
    fetch: (url) => {
      if (url.endsWith('/emails/batch')) {
        // バッチエラー -> 単発フォールバックをテスト
        return { getResponseCode: () => 500, getContentText: () => 'batch down' };
      }
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ id: 'fallback_single_99' }) };
    },
  };

  const { context } = loadMailSenderGas({ spreadsheet: ss, UrlFetchApp });
  context.processScheduledEmailsCron();

  const rows = logSheet.getData();
  assert.equal(rows.length, 3);
  // 単発フォールバック送信行
  assert.equal(rows[1][1], 'SCH_ONE_SHOT');
  assert.equal(rows[1][6], 'OK (fallback_single_99)');
  assert.equal(rows[1][7], '【重要】12月号 ご案内（倉敷 花様）');
  assert.equal(rows[1][8], '倉敷 親 様 前日のお知らせです。 ご準備ください。');
  // SKIP_AFTER_DEADLINE 行も9列
  assert.equal(rows[2].length, 9);
  assert.equal(rows[2][1], 'SCH_EXPIRE_ONLY');
  assert.match(rows[2][6], /^SKIP_AFTER_DEADLINE/);
  assert.equal(rows[2][7], '（未送信：期限切れステータス更新のみ）');
  assert.equal(rows[2][8], '');
});

test('6. backfillDeliveryLogSubjects() が1,550行超の過去ログを一括補完し既入力行とA〜G列を保護すること', () => {
  const tplSheet = createMockSheet('メールテンプレート保管庫', [
    ['テンプレート名', '件名', '本文', '推奨配信IDプレフィックス'],
    ['① 自宅受験：問題発送のお知らせ', '【岡山県統一模擬試験】{{対象模試}} 問題発送（{{生徒氏名}}様）', '{{保護者氏名}} 様\n問題一式を発送しました。\nご確認をお願いします。', 'HOME_SHIP_'],
    ['⑥ 次回模試のご案内（未申込者向け・配信停止URL付）', '【岡山県統一模擬試験】{{対象模試}} お申し込み受付中（{{生徒氏名}}様）', '{{保護者氏名}} 様\n次回「{{対象模試}}」の受付中です。\n詳細: {{配信停止URL}}', 'PROMO_UNAPPLIED_'],
  ]);
  const schSheet = createMockSheet('配信スケジュール', [
    ['有効', 'ルールID', 'ルール名', '種別', '日数/曜日', '開始日', '終了日', '学年', '模試', '会場', 'ステータス', '使用テンプレ', '更新'],
    ['OFF', 'PROMO_UNAPPLIED_12 202612', '12月号未申込案内（停止済み）', '毎週指定曜日に配信', '金', '2026-11-01', '2026-11-30', 'すべて', '未申込:12月号', '', 'すべて', '⑥ 次回模試のご案内（未申込者向け・配信停止URL付）', '変更しない'],
  ]);
  const compSheet = createMockSheet('メール配信作成', [
    ['項目', '設定値'],
    ['① テンプレ', '① 自宅受験：問題発送のお知らせ'],
    ['② 学年', 'すべて'],
    ['③ 対象模試', '10月号'],
    ['④ 会場', ''],
    ['⑤ ステータス', 'paid'],
    ['⑥ 配信ID', 'MANUAL_SPECIAL_10'],
    ['⑦ テスト先', ''],
    ['⑧ 件名', '【特別連絡】{{対象模試}} のご案内（{{生徒氏名}}様）'],
    ['⑨ 本文', '{{保護者氏名}} 様\n特別案内本文テストです。'],
  ]);

  const initialLogRows = [
    ['送信日時', '配信ID', 'メールアドレス', '保護者氏名', '生徒氏名', '対象模試', '送信結果'],
    // 既存入力済み行（上書き禁止テスト）
    ['2026-11-26 09:00:00', 'PROMO_UNAPPLIED_12 202612_20261121', 'keep@example.com', '保護 親', '保護 子', '12月号', 'OK (keep_1)', '既存カスタム件名', '既存抜粋'],
    // スケジュール OFF ルール + 日付サフィックス照合
    ['2026-11-21 09:00:00', 'PROMO_UNAPPLIED_12 202612_20261121', 'p1@example.com', '親1', '生徒1', '12月号', 'OK (id_p1)'],
    // メール配信作成シート照合
    ['2026-10-15 12:00:00', 'MANUAL_SPECIAL_10', 'm1@example.com', '親M', '生徒M', '10月号', 'OK (id_m1)'],
    // SKIP_AFTER_DEADLINE 行
    ['2026-11-10 09:00:00', 'KONBINI_EXP', 's1@example.com', '親S', '生徒S', '11月号', 'SKIP_AFTER_DEADLINE (期限切れ更新のみ)'],
    // 照合不可ID
    ['2026-09-01 09:00:00', 'UNKNOWN_LEGACY_CAMPAIGN', 'u1@example.com', '親U', '生徒U', '9月号', 'OK (id_u1)'],
  ];

  // 大量過去ログ（合計 1,550 行以上）を追加（プレフィックス最長一致 HOME_SHIP_202610）
  for (let i = 0; i < 1550; i++) {
    initialLogRows.push([
      '2026-10-01 10:00:00',
      'HOME_SHIP_202610',
      `user${i}@example.com`,
      `保護者${i}`,
      `生徒${i}`,
      '10月号',
      `OK (bulk_${i})`,
    ]);
  }

  const logSheet = createMockSheet('配信ログ', initialLogRows, {
    maxColumns: 7,
    headerStyle: { bg: '#0f4c3a', fg: '#ffffff', fw: 'bold' },
  });
  const ss = createSpreadsheet({
    メールテンプレート保管庫: tplSheet,
    配信スケジュール: schSheet,
    メール配信作成: compSheet,
    配信ログ: logSheet,
  });

  const { context } = loadMailSenderGas({ spreadsheet: ss });
  const summary = context.backfillDeliveryLogSubjects();

  assert.equal(summary.totalRows, 1555);
  assert.equal(summary.skippedExistingCount, 1);
  assert.equal(summary.unmatchedCount, 1);
  assert.equal(summary.updatedCount, 1553);
  assert.deepEqual(Array.from(summary.unmatchedSampleIds), ['UNKNOWN_LEGACY_CAMPAIGN']);

  const rows = logSheet.getData();
  // 既存行保持
  assert.equal(rows[1][7], '既存カスタム件名');
  assert.equal(rows[1][8], '既存抜粋');
  // OFF スケジュール（PROMO_UNAPPLIED_12 202612_20261121）照合
  assert.equal(rows[2][7], '【岡山県統一模擬試験】12月号 お申し込み受付中（生徒1様）');
  assert.equal(rows[2][8], '親1 様 次回「12月号」の受付中です。 詳細: （配信停止URL）');
  // メール配信作成照合
  assert.equal(rows[3][7], '【特別連絡】10月号 のご案内（生徒M様）');
  assert.equal(rows[3][8], '親M 様 特別案内本文テストです。');
  // SKIP_AFTER_DEADLINE
  assert.equal(rows[4][7], '（未送信：期限切れステータス更新のみ）');
  assert.equal(rows[4][8], '');
  // 照合不可
  assert.equal(rows[5][7], '');
  // 1550行目のプレフィックス一致
  assert.equal(rows[6][7], '【岡山県統一模擬試験】10月号 問題発送（生徒0様）');
  assert.equal(rows[1555][7], '【岡山県統一模擬試験】10月号 問題発送（生徒1549様）');

  // H・I列のみへのバッチ書き込み（startCol=8, numCols=2, rowCount=1555）が行われ、A〜G列は上書きされないこと
  const calls = logSheet.getSetValuesCalls().filter((c) => c.startRow === 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].startCol, 8);
  assert.equal(calls[0].numCols, 2);
  assert.equal(calls[0].rowCount, 1555);
});

test('7. handleUnsubscribeGet_() ワンクリック配信停止が従来通り動作すること', () => {
  const unsubSheet = createMockSheet('配信停止リスト', [['停止受付日時', 'メールアドレス', '受付経路・備考']]);
  const ss = createSpreadsheet({ 配信停止リスト: unsubSheet });
  const { context } = loadMailSenderGas({ spreadsheet: ss });

  const sig = context.generateUnsubscribeSig_('User@Example.com');
  const okOut = context.handleUnsubscribeGet_({ parameter: { e: 'User@Example.com', s: sig } });
  assert.match(okOut.getContent(), /メールの配信停止を受け付けました/);
  assert.equal(unsubSheet.getData().length, 2);
  assert.equal(unsubSheet.getData()[1][1], 'user@example.com');

  const badOut = context.handleUnsubscribeGet_({ parameter: { e: 'User@Example.com', s: 'deadbeef' } });
  assert.match(badOut.getContent(), /無効なリンクです/);
  assert.equal(unsubSheet.getData().length, 2);
});
