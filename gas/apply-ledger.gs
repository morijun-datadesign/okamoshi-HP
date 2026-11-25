/**
 * 岡山県統一模擬試験 申込受付台帳 Web アプリ（doPost）
 *
 * 呼び出し元: Cloudflare Pages Functions `functions/api/stripe-webhook.ts`
 *
 * ■ action: "create"（Stripe checkout.session.completed）
 *   - records（模試ごとの配列）をループし、1模試＝1行で追記する
 *   - 同じセッションIDの行が既にある場合は追記しない（Stripe の再送対策）
 *
 * ■ action: "update"（checkout.session.async_payment_succeeded / async_payment_failed / expired）
 *   - B列〜F列を1回の getValues() で一括取得し、セッションID一致行の「決済ステータス」(F列) を抽出
 *   - 「paid」の行を「期限切れ」等で上書きしない保護（paid 上書き禁止）を維持した上で、
 *     対象セルのみを getRangeList(...).setValue(...) 1回でバッチ更新する（1セル単位の getValue/setValue ループ排除）
 *   - 該当行が無い場合は、送られてきた全項目で新規作成する（フォールバック）
 *
 * ■ スクリプトプロパティ（[プロジェクトの設定] → [スクリプト プロパティ]）
 *   SHARED_SECRET  : Cloudflare の環境変数 GAS_SHARED_SECRET と同じ値。設定時はトークンを照合する（推奨）
 *   SHEET_NAME     : 台帳のシート名。未設定時は先頭のシート
 *   SPREADSHEET_ID : 任意。未設定時はこのスクリプトが紐づくスプレッドシート
 *
 * ■ Apps Script への反映手順（最新・必須）
 *   1. スプレッドシートの [拡張機能] → [Apps Script] を開き、本ファイル全文を貼り付けて保存（Ctrl/Cmd + S）
 *   2. 右上の [デプロイ] → [デプロイを管理] を開く
 *   3. 現在本番稼働中の「ウェブアプリ」デプロイ右上の鉛筆アイコン（編集）をクリック
 *   4. 「バージョン」プルダウンから「新バージョン」を選択（※説明欄に「updateStatus_ バッチ最適化」等を記入）
 *   5. [デプロイ] をクリックして反映完了
 *   ※ Web アプリ URL を変更しないため、絶対に [新しいデプロイ] ではなく既存デプロイの編集で更新すること。
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
  PREFECTURE: 20,   // T: 都道府県
  CITY: 21,         // U: 市区（郡町村）
  ADDRESS1: 22,     // V: 町名・丁目・番地
  ADDRESS2: 23,     // W: 建物名・部屋番号
  EXPIRES_AT: 24,   // X: 支払期限
  REMARKS: 25       // Y: 連絡事項・ご要望
};
var NUM_COLS = 25;

var HEADERS = [
  '受付日時', 'セッションID', '対象模試', '受験会場', '単価（金額）', '決済ステータス', '決済手段',
  'お客様番号', '確認番号', '払込票URL', '生徒氏名', '生徒フリガナ', '学年', '中学校名',
  '保護者氏名', '保護者フリガナ', 'メールアドレス', '電話番号', '郵便番号',
  '都道府県', '市区（郡町村）', '町名・丁目・番地', '建物名・部屋番号', '支払期限', '連絡事項・ご要望'
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
    if (!secret || data.token !== secret) {
      return json_({ status: 'error', message: 'unauthorized: SHARED_SECRET is not configured or token mismatch' });
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

  var pref = str_(data.prefecture || data.pref);
  var city = str_(data.city);
  var addr1 = str_(data.address_line1 || data.addr1);
  var addr2 = str_(data.address_line2 || data.addr2 || data.address_line3);

  // フォールバック：万一合体した address のみ届いた場合
  if (!city && data.address) {
    var rawAddr = str_(data.address);
    var pMatch = rawAddr.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)(.*)$/);
    if (pMatch) {
      if (!pref) pref = pMatch[1];
      var rest = pMatch[2].trim();
      var cMatch = rest.match(/^([^0-9]+?郡[^0-9]+?[町村]|[^0-9]+?市[^0-9]+?区|[^0-9]+?[市区町村])(.*)$/);
      if (cMatch) {
        city = cMatch[1].trim();
        if (!addr1) addr1 = cMatch[2].trim();
      } else {
        city = rest;
      }
    } else {
      city = rawAddr;
    }
  }

  row[COL.PREFECTURE - 1] = pref;
  row[COL.CITY - 1] = city;
  row[COL.ADDRESS1 - 1] = text_(addr1);
  row[COL.ADDRESS2 - 1] = text_(addr2);
  row[COL.EXPIRES_AT - 1] = str_(data.konbini_expires_at);
  row[COL.REMARKS - 1] = str_(data.remarks);
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

/** 1始まりの列番号を A1 記法の列記号（例: 6 -> 'F'）に変換 */
function colToLetter_(colIndex) {
  var col = Number(colIndex);
  var letter = '';
  while (col > 0) {
    var rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

function updateStatus_(sheet, data) {
  var sessionId = str_(data.session_id);
  var newStatus = str_(data.payment_status);
  if (!sessionId || !newStatus) return { status: 'error', message: 'session_id and payment_status are required' };

  var lastRow = sheet.getLastRow();
  var matched = 0;
  var updated = 0;
  var skipped = 0;
  var updateA1List = [];

  if (lastRow >= 2) {
    // B列（セッションID）〜F列（決済ステータス）を1回の API 呼び出しで一括取得
    var spanCols = COL.STATUS - COL.SESSION_ID + 1;
    var statusOffset = COL.STATUS - COL.SESSION_ID;
    var statusColLetter = colToLetter_(COL.STATUS);
    var values = sheet.getRange(2, COL.SESSION_ID, lastRow - 1, spanCols).getValues();

    for (var i = 0; i < values.length; i++) {
      if (str_(values[i][0]) !== sessionId) continue;
      matched++;
      var current = str_(values[i][statusOffset]);
      if (current === newStatus) continue;
      // 入金済みの行は「期限切れ」等で上書きしない（イベントの到着順が前後した場合の保護）
      if (current === STATUS_PAID && newStatus !== STATUS_PAID) {
        skipped++;
        continue;
      }
      updateA1List.push(statusColLetter + (i + 2));
      updated++;
    }
  }

  if (matched === 0) {
    // 申込時の create が届いていない場合のフォールバック：受け取った内容で新規作成
    if (Array.isArray(data.records) && data.records.length > 0) {
      var created = createRows_(sheet, data);
      created.action = 'update';
      created.fallback_created = true;
      return created;
    }
    return { status: 'error', message: 'no rows found for session_id', session_id: sessionId };
  }

  // 更新が必要なセルのみを1回のバッチ書き込みで更新（他行の数式やセル書式には触れない）
  if (updateA1List.length > 0) {
    sheet.getRangeList(updateA1List).setValue(newStatus);
  }

  return { status: 'success', action: 'update', matched: matched, updated: updated, skipped: skipped };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
