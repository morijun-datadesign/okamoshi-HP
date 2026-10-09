/**
 * 岡山県統一模擬試験 申込受付台帳 Web アプリ（doPost）
 *
 * 呼び出し元: Cloudflare Pages Functions `functions/api/stripe-webhook.ts`
 *
 * ■ action: "create"（Stripe checkout.session.completed）
 *   - records（模試ごとの配列）をループし、1模試＝1行で追記する
 *   - 同じセッションIDの行が既にある場合は追記しない（Stripe の再送対策）
 *
 * ■ action: "update"（checkout.session.async_payment_succeeded / async_payment_failed）
 *   - セッションIDが一致するすべての行の「決済ステータス」(F列) を更新する
 *   - 「paid」の行を「期限切れ」で上書きすることはしない
 *   - 該当行が無い場合は、送られてきた全項目で新規作成する（フォールバック）
 *
 * ■ スクリプトプロパティ（[プロジェクトの設定] → [スクリプト プロパティ]）
 *   SHARED_SECRET  : Cloudflare の環境変数 GAS_SHARED_SECRET と同じ値。設定時はトークンを照合する（推奨）
 *   SHEET_NAME     : 台帳のシート名。未設定時は先頭のシート
 *   SPREADSHEET_ID : 任意。未設定時はこのスクリプトが紐づくスプレッドシート
 *
 * ■ 反映手順
 *   このコードを Apps Script に貼り付け → [デプロイ] → [デプロイを管理] → 既存デプロイを編集し
 *   「新バージョン」で再デプロイ（URL を変えないため、新規デプロイではなく既存デプロイを更新する）
 */

var COL = {
  RECEIVED_AT: 1,   // A: 受付日時
  SESSION_ID: 2,    // B: セッションID
  EXAM: 3,          // C: 対象模試
  VENUE: 4,         // D: 受験会場
  PRICE: 5,         // E: 単価（金額）
  STATUS: 6,        // F: 決済ステータス
  METHOD: 7,        // G: 決済手段
  CUSTOMER_NO: 8,   // H: お客様番号
  CONFIRM_NO: 9,    // I: 確認番号
  VOUCHER_URL: 10,  // J: 払込票URL
  STUDENT_NAME: 11, // K: 生徒氏名
  STUDENT_KANA: 12, // L: 生徒フリガナ
  GRADE: 13,        // M: 学年
  SCHOOL: 14,       // N: 中学校名
  PARENT_NAME: 15,  // O: 保護者氏名
  PARENT_KANA: 16,  // P: 保護者フリガナ
  EMAIL: 17,        // Q: メールアドレス
  PHONE: 18,        // R: 電話番号
  POSTAL: 19,       // S: 郵便番号
  ADDRESS: 20,      // T: お届け先住所
  EXPIRES_AT: 21    // U: 支払期限
};
var NUM_COLS = 21;

var HEADERS = [
  '受付日時', 'セッションID', '対象模試', '受験会場', '単価（金額）', '決済ステータス', '決済手段',
  'お客様番号', '確認番号', '払込票URL', '生徒氏名', '生徒フリガナ', '学年', '中学校名',
  '保護者氏名', '保護者フリガナ', 'メールアドレス', '電話番号', '郵便番号', 'お届け先住所', '支払期限'
];

var STATUS_PAID = 'paid';
var STATUS_UNPAID = '未入金';
var STATUS_EXPIRED = '期限切れ';

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var props = PropertiesService.getScriptProperties();

    var secret = props.getProperty('SHARED_SECRET');
    if (secret && data.token !== secret) {
      return json_({ status: 'error', message: 'unauthorized' });
    }

    // 同時実行（複数 Webhook の同時到着）による重複追記・行ずれを防ぐ
    lock.waitLock(30000);
    locked = true;

    var sheet = getSheet_(props);
    var action = String(data.action || 'create');
    var result = action === 'update' ? updateStatus_(sheet, data) : createRows_(sheet, data);
    return json_(result);
  } catch (err) {
    return json_({ status: 'error', message: String((err && err.message) || err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

/** 動作確認用（ブラウザで URL を開くと応答を返す） */
function doGet() {
  return json_({ status: 'success', message: 'okamoshi apply ledger is running' });
}

function getSheet_(props) {
  var spreadsheetId = props.getProperty('SPREADSHEET_ID');
  var ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('spreadsheet not found');
  var sheetName = props.getProperty('SHEET_NAME');
  var sheet = sheetName ? ss.getSheetByName(sheetName) : ss.getSheets()[0];
  if (!sheet) throw new Error('sheet not found: ' + sheetName);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  return sheet;
}

/** セッションIDが一致する行番号（1始まり）の一覧 */
function findRowsBySession_(sheet, sessionId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || !sessionId) return [];
  var values = sheet.getRange(2, COL.SESSION_ID, lastRow - 1, 1).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === sessionId) rows.push(i + 2);
  }
  return rows;
}

/** 先頭ゼロ・長い数字が数値化されないよう文字列として書き込む */
function text_(value) {
  var s = value === undefined || value === null ? '' : String(value).trim();
  return s ? "'" + s : '';
}

function str_(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function buildRow_(data, record) {
  var row = new Array(NUM_COLS);
  for (var i = 0; i < NUM_COLS; i++) row[i] = '';
  var price = Number(record.price);

  row[COL.RECEIVED_AT - 1] = str_(data.received_at);
  row[COL.SESSION_ID - 1] = str_(data.session_id);
  row[COL.EXAM - 1] = str_(record.exam_name);
  row[COL.VENUE - 1] = str_(record.venue_name);
  row[COL.PRICE - 1] = isFinite(price) && price > 0 ? price : '';
  row[COL.STATUS - 1] = str_(data.payment_status);
  row[COL.METHOD - 1] = str_(data.payment_method_label || data.payment_method);
  row[COL.CUSTOMER_NO - 1] = text_(data.konbini_customer_number);
  row[COL.CONFIRM_NO - 1] = text_(data.konbini_confirmation_number);
  row[COL.VOUCHER_URL - 1] = str_(data.konbini_voucher_url);
  row[COL.STUDENT_NAME - 1] = str_(data.student_name);
  row[COL.STUDENT_KANA - 1] = str_(data.student_kana);
  row[COL.GRADE - 1] = str_(data.grade);
  row[COL.SCHOOL - 1] = str_(data.school_name);
  row[COL.PARENT_NAME - 1] = str_(data.parent_name);
  row[COL.PARENT_KANA - 1] = str_(data.parent_kana);
  row[COL.EMAIL - 1] = str_(data.email);
  row[COL.PHONE - 1] = text_(data.phone);
  row[COL.POSTAL - 1] = text_(data.postal_code);
  row[COL.ADDRESS - 1] = str_(data.address);
  row[COL.EXPIRES_AT - 1] = str_(data.konbini_expires_at);
  return row;
}

function createRows_(sheet, data) {
  var sessionId = str_(data.session_id);
  if (!sessionId) return { status: 'error', message: 'session_id is required' };

  var existing = findRowsBySession_(sheet, sessionId);
  if (existing.length > 0) {
    return { status: 'success', action: 'create', skipped: true, created: 0, rows: existing.length };
  }

  var records = Array.isArray(data.records) && data.records.length > 0
    ? data.records
    : [{ exam_name: data.exam_name, venue_name: data.venue_name, price: data.amount }];

  var rows = records.map(function (record) { return buildRow_(data, record || {}); });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, NUM_COLS).setValues(rows);
  return { status: 'success', action: 'create', created: rows.length };
}

function updateStatus_(sheet, data) {
  var sessionId = str_(data.session_id);
  var newStatus = str_(data.payment_status);
  if (!sessionId || !newStatus) return { status: 'error', message: 'session_id and payment_status are required' };

  var rows = findRowsBySession_(sheet, sessionId);
  if (rows.length === 0) {
    // 申込時の create が届いていない場合のフォールバック：受け取った内容で新規作成
    if (Array.isArray(data.records) && data.records.length > 0) {
      var created = createRows_(sheet, data);
      created.action = 'update';
      created.fallback_created = true;
      return created;
    }
    return { status: 'error', message: 'no rows found for session_id', session_id: sessionId };
  }

  var updated = 0;
  var skipped = 0;
  for (var i = 0; i < rows.length; i++) {
    var cell = sheet.getRange(rows[i], COL.STATUS);
    var current = str_(cell.getValue());
    if (current === newStatus) continue;
    // 入金済みの行は「期限切れ」等で上書きしない（イベントの到着順が前後した場合の保護）
    if (current === STATUS_PAID && newStatus !== STATUS_PAID) {
      skipped++;
      continue;
    }
    cell.setValue(newStatus);
    updated++;
  }
  return { status: 'success', action: 'update', matched: rows.length, updated: updated, skipped: skipped };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
