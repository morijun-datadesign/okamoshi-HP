/**
 * 岡山県統一模擬試験（おかもし）
 * 条件指定メール一斉配信 ＆「配信スケジュール」＆「未申込者抽出・ワンクリック配信停止」
 * 【超高速化 ＆ 配信停止スマートリンク ＆ 学年複数指定 ＆ 毎週曜日指定配信 ＆ 過去受験者タブ横断 ＆ 別アドレス重複防止・完全版】
 */

var MAIL_CONFIG = {
  FROM_NAME: '岡山県統一模試実行委員会',
  FROM_EMAIL: 'info@okayama-moshi.com',
  REPLY_TO: 'info@okayama-moshi.com',
  SHEET_COMPOSE: 'メール配信作成',
  SHEET_TEMPLATES: 'メールテンプレート保管庫',
  SHEET_SCHEDULE: '配信スケジュール',
  SHEET_LOG: '配信ログ',
  SHEET_UNSUBSCRIBE: '配信停止リスト',
  SHEET_PAST: '過去受験者',
  BATCH_SIZE: 80
};

// 別ファイル（Code.gs等）に COL 定数がある場合はそれを使用し、万一無い場合でも動くようフォールバックを定義
var COL_IDX = (typeof COL !== 'undefined') ? COL : {
  RECEIVED_AT: 1,
  SESSION_ID: 2,
  EXAM: 3,
  VENUE: 4,
  AMOUNT: 5,
  STATUS: 6,
  METHOD: 7,
  CUSTOMER_NO: 8,
  CONFIRM_NO: 9,
  VOUCHER_URL: 10,
  STUDENT_NAME: 11,
  STUDENT_KANA: 12,
  GRADE: 13,
  SCHOOL: 14,
  PARENT_NAME: 15,
  PARENT_KANA: 16,
  EMAIL: 17,
  TEL: 18,
  ZIP: 19,
  PREF: 20,
  CITY: 21,
  TOWN: 22,
  BLDG: 23,
  EXPIRES_AT: 24,
  NOTE: 25,
  MEMBER_NO: 26
};

var LOG_HEADERS = ['送信日時', '配信ID', 'メールアドレス', '保護者氏名', '生徒氏名', '対象模試', '送信結果'];

var SCHEDULE_HEADERS = [
  '有効(ON/OFF)',
  'ルールID(重複防止キー)',
  'ルール名(管理メモ)',
  'トリガー種別',
  '経過日数 / 曜日(例: 1, -1, 金)',
  '配信スタート日(一斉配信はこの日のみ記入)',
  '配信終了日(※一斉配信は空欄でOK)',
  '対象：学年',
  '対象：模試(部分一致 / 未申込:〇〇)',
  '対象：会場(部分一致)',
  '対象：決済ステータス',
  '使用テンプレート名(保管庫から選択)',
  '送信時のステータス自動更新'
];

/** スプレッドシートを開いた時に専用メニューを追加 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📧 おかもしメール配信')
    .addItem('1. 対象者をプレビュー（手動配信シート）', 'previewRecipients')
    .addItem('2. テストメールを送信（管理者宛に1通）', 'sendTestEmail')
    .addItem('3. 本番メールを一斉送信（重複防止ロック付）', 'sendBulkEmails')
    .addSeparator()
    .addItem('🔄 選択中のテンプレートを文面に読み込む', 'loadSelectedTemplate')
    .addSeparator()
    .addItem('📅 スケジュール配信の対象者をプレビュー（確認のみ）', 'previewScheduledEmails')
    .addItem('▶️ スケジュール配信を今すぐ手動実行', 'runScheduledEmailsManual')
    .addItem('⏰ 毎朝9時の自動配信タイマーをONにする', 'enableDailyScheduleTrigger')
    .addItem('⏹️ 自動配信タイマーをOFFにする', 'disableDailyScheduleTrigger')
    .addSeparator()
    .addItem('0. 配信用シート（作成・テンプレ・スケジュール・ログ・停止リスト）を初期作成・更新', 'setupMailSheets')
    .addItem('🔧 【初回のみ】「過去受験者」タブをmainと同じ31列に揃える', 'alignPastExamineesSheet')
    .addToUi();

  if (typeof onOpenTriggerForMember === 'function') onOpenTriggerForMember();
}

/**
 * 🔧 「過去受験者」タブの列並び・データ表記を「main」タブ（全31列）と完全に揃える関数
 * ※実行前に自動で非表示の「過去受験者_旧バックアップ」シートを作成します
 */
function alignPastExamineesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var mainSheet = getLedgerSheetFast_(ss, props);
  var pastSheet = ss.getSheetByName(MAIL_CONFIG.SHEET_PAST);
  var ui = SpreadsheetApp.getUi();

  if (!mainSheet || !pastSheet) {
    ui.alert('エラー', '「main」または「過去受験者」シートが見つかりません。', ui.ButtonSet.OK);
    return;
  }

  var pastData = pastSheet.getDataRange().getValues();
  if (pastData.length < 2) {
    ui.alert('「過去受験者」シートにデータがありません。');
    return;
  }

  var headers = pastData[0];
  if (headers[0] === '受付日時' && headers[16] === 'メールアドレス') {
    ui.alert('確認', '「過去受験者」シートは既にmainと同じ31列構成に変換されています。', ui.ButtonSet.OK);
    return;
  }

  // 1. バックアップシートの自動作成（まだ存在しない場合）
  var backupName = '過去受験者_旧バックアップ';
  if (!ss.getSheetByName(backupName)) {
    var backupSheet = pastSheet.copyTo(ss);
    backupSheet.setName(backupName);
    backupSheet.hideSheet();
  }

  // 2. mainシートのヘッダー（31列）を取得
  var mainHeaders = mainSheet.getRange(1, 1, 1, 31).getValues()[0];
  var newRows = [mainHeaders];

  var venueMap = {
    '岡山市': '岡山会場',
    '倉敷市': '倉敷会場',
    '津山市': '津山会場',
    '自宅': '自宅受験'
  };

  // 3. 各行をmainの31列フォーマットに変換
  for (var i = 1; i < pastData.length; i++) {
    var row = pastData[i];
    if (!row[1] && !row[5] && !row[19]) continue;

    var id = String(row[1] || '').trim();
    var regDate = row[2];               // 登録日時
    var customerNo = row[3];            // 顧客番号
    var grade = String(row[4] || '').trim(); // 学年
    var studentName = row[5];           // 生徒氏名
    var studentKana = row[6];           // 生徒ふりがな
    var gender = row[7];                // 性別
    var school = row[8];                // 在籍学校
    var examRound = row[9];             // 受験回
    var rawVenue = String(row[10] || '').trim(); // 受験会場
    var parentName = row[11];           // 保護者氏名
    var zip = row[12] ? String(row[12]).replace(/[^0-9]/g, '').padStart(7, '0') : '';
    var pref = row[13];                 // 都道府県
    var city = row[14];                 // 市区郡
    var town = row[15];                 // 町名番地
    var bldg = row[16];                 // 建物名
    var tel = row[17] || row[18] || ''; // 電話番号（空なら携帯番号）
    var email = String(row[19] || '').trim(); // メールアドレス
    var note = row[21];                 // 備考
    var paymentRaw = row[23];           // 入金（日付 または キャンセル）
    var adminNote = row[24];            // 管理備考

    var venue = venueMap[rawVenue] || rawVenue;

    var paymentStatus = 'paid';
    var paymentMethod = '旧シート入金';

    if (String(paymentRaw).indexOf('キャンセル') !== -1) {
      paymentStatus = 'キャンセル';
      paymentMethod = '旧シート入金(キャンセル)';
    } else if (Object.prototype.toString.call(paymentRaw) === '[object Date]' && !isNaN(paymentRaw.getTime())) {
      var mm = ('0' + (paymentRaw.getMonth() + 1)).slice(-2);
      var dd = ('0' + paymentRaw.getDate()).slice(-2);
      paymentMethod = '旧シート入金(' + mm + '/' + dd + ')';
    } else if (paymentRaw) {
      var match = String(paymentRaw).match(/(\d{1,2})[-/](\d{1,2})$/);
      if (match) {
        var m2 = ('0' + match[1]).slice(-2);
        var d2 = ('0' + match[2]).slice(-2);
        paymentMethod = '旧シート入金(' + m2 + '/' + d2 + ')';
      } else {
        paymentMethod = '旧シート入金(' + paymentRaw + ')';
      }
    }

    var alignedRow = [
      regDate,                         // 0: 受付日時
      id ? 'legacy_' + id : '',        // 1: セッションID
      examRound,                       // 2: 対象模試
      venue,                           // 3: 受験会場
      '',                              // 4: 単価（金額）
      paymentStatus,                   // 5: 決済ステータス
      paymentMethod,                   // 6: 決済手段
      '',                              // 7: お客様番号
      '',                              // 8: 確認番号
      '',                              // 9: 払込票URL
      studentName,                     // 10: 生徒氏名
      studentKana,                     // 11: 生徒フリガナ
      grade,                           // 12: 学年
      school,                          // 13: 中学校名
      parentName,                      // 14: 保護者氏名
      '',                              // 15: 保護者フリガナ
      email,                           // 16: メールアドレス
      tel,                             // 17: 電話番号
      zip,                             // 18: 郵便番号
      pref,                            // 19: 都道府県
      city,                            // 20: 市区（郡町村）
      town,                            // 21: 町名・丁目・番地
      bldg,                            // 22: 建物名・部屋番号
      '',                              // 23: 支払期限
      note,                            // 24: 連絡事項・ご要望
      customerNo,                      // 25: 会員No（受験番号）
      '過去受験移行',                  // 26: 採番ステータス
      '',                              // 27: AI判定メモ
      gender,                          // 28: 性別
      adminNote,                       // 29: 管理備考
      ''                               // 30: 進研リスト掲載
    ];

    newRows.push(alignedRow);
  }

  pastSheet.clearContents();
  if (newRows.length > 1) {
    pastSheet.getRange(2, 18, newRows.length - 1, 2).setNumberFormat('@');
  }
  pastSheet.getRange(1, 1, newRows.length, 31).setValues(newRows);

  ui.alert(
    '✅ 変換完了',
    '「過去受験者」タブ（全 ' + (newRows.length - 1) + ' 件）を「main」と同じ31列構成に揃えました！\n（※元データは非表示シート「' + backupName + '」に自動保存されています）',
    ui.ButtonSet.OK
  );
}

/** メイン台帳シートを高速取得 */
function getLedgerSheetFast_(ss, props) {
  var sheetName = (props && props.getProperty('SHEET_NAME')) || 'main';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;
  if (typeof getSheet_ === 'function') return getSheet_(props || PropertiesService.getScriptProperties());
  return ss.getSheets()[0];
}

/**
 * ★未申込モード用：「過去受験者」シートの行データ（31列整形済み）を取得
 * 未整形のまま呼ばれた場合はエラーメッセージを出して安全に停止する
 */
function getPastExamineeRows_(ss) {
  var pastSheet = ss.getSheetByName(MAIL_CONFIG.SHEET_PAST);
  if (!pastSheet) return [];
  var vals = pastSheet.getDataRange().getValues();
  if (vals.length < 2) return [];
  if (vals[0][0] !== '受付日時' || vals[0][16] !== 'メールアドレス') {
    throw new Error('「過去受験者」タブの項目並びがまだmainと揃っていません。\n先にメニュー「📧 おかもしメール配信」➔「🔧【初回のみ】過去受験者タブをmainと同じ31列に揃える」を実行してください。');
  }
  return vals.slice(1);
}

/** 配信停止URL生成用のコンテキストをループ前に1回だけ一括取得 */
function getUnsubscribeContext_(props) {
  var p = props || PropertiesService.getScriptProperties();
  var secret = p.getProperty('SHARED_SECRET') || 'okamoshi_default_salt';
  var baseUrl = p.getProperty('WEBAPP_URL') || '';
  if (!baseUrl) {
    try {
      baseUrl = ScriptApp.getService().getUrl() || '';
    } catch (e) {
      baseUrl = '';
    }
    if (baseUrl) {
      try { p.setProperty('WEBAPP_URL', baseUrl); } catch (e2) {}
    }
  }
  return {
    secret: secret,
    baseUrl: baseUrl || 'https://okayama-moshi.com/'
  };
}

/** 学年表記の正規化 */
function normalizeGrade_(str) {
  return String(str || '').trim()
    .replace(/[０-９]/g, function(s) { return String.fromCharCode(s.charCodeAt(0) - 0xFEE0); })
    .replace(/中学生すべて.*|中学生全員|中学生|中学校|中学/g, '中')
    .replace(/小学生すべて.*|小学生全員|小学生|小学校|小学/g, '小')
    .replace(/年生|年/g, '')
    .replace(/\s+/g, '');
}

/** 学年フィルタ判定（単一指定・「中学生すべて」・カンマ区切り「中1,中2」などすべて対応） */
function matchesGradeFilter_(rowGradeRaw, filterGradeRaw) {
  var f = String(filterGradeRaw || '').trim();
  if (!f || f === 'すべて') return true;

  var rowNorm = normalizeGrade_(rowGradeRaw);
  if (!rowNorm) return false;

  var parts = f.split(/[,，、・\/／\s ]+/);
  for (var i = 0; i < parts.length; i++) {
    var token = normalizeGrade_(parts[i]);
    if (!token) continue;
    if (token === 'すべて') return true;
    if (token === '中' && rowNorm.indexOf('中') === 0) return true;
    if (token === '小' && rowNorm.indexOf('小') === 0) return true;
    if (rowNorm === token || String(rowGradeRaw).indexOf(parts[i]) !== -1) return true;
  }
  return false;
}

/**
 * 曜日フィルタ判定（例: E列に「金」「金曜日」「火,金」「Fri」などが書かれているか判定）
 * todayDate.getDay() ➔ 0:日, 1:月, 2:火, 3:水, 4:木, 5:金, 6:土
 */
function matchesDayOfWeek_(todayDate, daysValRaw) {
  var s = String(daysValRaw || '').trim();
  if (!s) return false;
  var dayIndex = todayDate.getDay();
  var jpDays = ['日', '月', '火', '水', '木', '金', '土'];
  var enDays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var todayJp = jpDays[dayIndex];
  var todayEn = enDays[dayIndex];

  var parts = s.split(/[,，、・\/／\s ]+/);
  for (var i = 0; i < parts.length; i++) {
    var token = parts[i].replace(/曜日|曜/g, '').trim().toLowerCase();
    if (!token) continue;
    if (token === todayJp || token.indexOf(todayJp) !== -1 || token === todayEn) {
      return true;
    }
  }
  return false;
}

/** 日付セルまたは文字列を「日の00:00:00（JST）」のDateオブジェクトに変換 */
function parseDateOnlyJst_(val) {
  if (!val) return null;
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
    return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  }
  var s = String(val).replace(/^'+/, '').trim();
  if (!s) return null;
  var m = s.match(/^(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  var mShort = s.match(/^(\d{1,2})\/(\d{1,2})(?:\s|$)/);
  if (mShort) {
    var currentYear = new Date().getFullYear();
    return new Date(currentYear, Number(mShort[1]) - 1, Number(mShort[2]));
  }
  return null;
}

/** 2つの日付（Date）の差分日数（targetDate - baseDate）を計算 */
function diffDays_(targetDate, baseDate) {
  var msPerDay = 86400000;
  return Math.round((targetDate.getTime() - baseDate.getTime()) / msPerDay);
}

/** 配信ログシートの取得＆見出し行の自動保証 */
function ensureLogSheet_(ss) {
  var logSheet = ss.getSheetByName(MAIL_CONFIG.SHEET_LOG);
  if (!logSheet) {
    logSheet = ss.insertSheet(MAIL_CONFIG.SHEET_LOG);
    logSheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold').setBackground('#0f4c3a').setFontColor('#ffffff');
    return logSheet;
  }
  if (logSheet.getLastRow() === 0) {
    logSheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold').setBackground('#0f4c3a').setFontColor('#ffffff');
  }
  return logSheet;
}

/** 配信停止リストシートの取得＆見出し行の自動保証 */
function ensureUnsubscribeSheet_(ss) {
  var unsubSheet = ss.getSheetByName(MAIL_CONFIG.SHEET_UNSUBSCRIBE);
  if (!unsubSheet) {
    unsubSheet = ss.insertSheet(MAIL_CONFIG.SHEET_UNSUBSCRIBE);
  }
  if (unsubSheet.getLastRow() === 0) {
    unsubSheet.getRange(1, 1, 1, 3).setValues([['停止受付日時', 'メールアドレス', '受付経路・備考']]).setFontWeight('bold').setBackground('#0f4c3a').setFontColor('#ffffff');
    unsubSheet.setColumnWidth(1, 160);
    unsubSheet.setColumnWidth(2, 260);
    unsubSheet.setColumnWidth(3, 220);
  }
  return unsubSheet;
}

/** 0. 配信用の5シート（作成・テンプレ・スケジュール・ログ・停止リスト）を自動構築・更新 */
function setupMailSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1) メールテンプレート保管庫
  var tplSheet = ss.getSheetByName(MAIL_CONFIG.SHEET_TEMPLATES);
  if (!tplSheet) {
    tplSheet = ss.insertSheet(MAIL_CONFIG.SHEET_TEMPLATES);
  }
  if (tplSheet.getLastRow() === 0) {
    tplSheet.getRange('A1:D1').setValues([['テンプレート名', '件名', '本文（{{保護者氏名}} {{生徒氏名}} {{対象模試}} {{受験会場}} {{支払期限}} {{払込票URL}} {{配信停止URL}} が自動変換されます）', '推奨配信IDプレフィックス']]).setFontWeight('bold').setBackground('#0f4c3a').setFontColor('#ffffff');
    tplSheet.setColumnWidth(1, 260);
    tplSheet.setColumnWidth(2, 340);
    tplSheet.setColumnWidth(3, 550);
    tplSheet.setColumnWidth(4, 180);
  }

  var existingTpls = {};
  if (tplSheet.getLastRow() >= 2) {
    var tVals = tplSheet.getRange(2, 1, tplSheet.getLastRow() - 1, 1).getValues();
    for (var t = 0; t < tVals.length; t++) existingTpls[String(tVals[t][0]).trim()] = t + 2;
  }

  var defaultTemplates = [
    [
      '① 自宅受験：問題発送のお知らせ',
      '【岡山県統一模擬試験】{{対象模試}} 問題一式を発送いたしました（{{生徒氏名}}様）',
      '{{保護者氏名}} 様\n\nいつも岡山県統一模擬試験（おかもし）をご利用いただき、誠にありがとうございます。\n\nお申し込みいただいておりました「{{対象模試}}（{{受験会場}}）」の問題一式を本日発送いたしました。\nお手元に届きましたら、同封の「自宅受験の手引き」をご確認のうえご受験ください。\n\n■ 受験生氏名：{{生徒氏名}} 様（{{学年}}）\n■ 対象模試：{{対象模試}}\n■ ご返送期限：同封の案内用紙に記載の期日までにご投函ください。\n\nご不明な点がございましたら、本メールへの返信にてお気軽にお問い合わせください。\n\n--------------------------------------------------\n岡山県統一模試実行委員会\nhttps://okayama-moshi.com/\n--------------------------------------------------',
      'HOME_SHIP_'
    ],
    [
      '② 会場受験：前日リマインド・持ち物案内',
      '【重要・開催のご案内】{{対象模試}} ご受験のご案内（{{生徒氏名}}様）',
      '{{保護者氏名}} 様\n\n岡山県統一模試実行委員会です。\nお申し込みいただいております「{{対象模試}}」につきまして、当日のご案内をお送りいたします。\n\n■ 受験生氏名：{{生徒氏名}} 様（{{学年}}）\n■ 受験会場：{{受験会場}}\n■ 持ち物：受験票（または受付完了メール画面）、筆記用具、コンパス、定規、上履き（必要な会場のみ）、昼食（午後まで受験される方）\n\n当日はどうぞお気をつけて会場までお越しください。\n\n--------------------------------------------------\n岡山県統一模試実行委員会\nhttps://okayama-moshi.com/\n--------------------------------------------------',
      'VENUE_REMIND_'
    ],
    [
      '③ 成績表・結果発送のお知らせ',
      '【岡山県統一模擬試験】{{対象模試}} 個人成績表を発送いたしました（{{生徒氏名}}様）',
      '{{保護者氏名}} 様\n\nいつも岡山県統一模擬試験をご利用いただき、誠にありがとうございます。\nご受験いただきました「{{対象模試}}」の採点・集計が完了し、本日、個人成績表を発送いたしました。\n\n■ 受験生氏名：{{生徒氏名}} 様（{{学年}}）\n■ 対象模試：{{対象模試}}\n\n到着まで今しばらくお待ちくださいますようお願い申し上げます。\n今後の学習計画や志望校選びにぜひお役立てください。\n\n--------------------------------------------------\n岡山県統一模試実行委員会\nhttps://okayama-moshi.com/\n--------------------------------------------------',
      'RESULT_SHIP_'
    ],
    [
      '④ コンビニ決済：お支払い期限のリマインド',
      '【岡山県統一模擬試験】コンビニ決済のお支払い期限に関するご案内（{{生徒氏名}}様）',
      '{{保護者氏名}} 様\n\n岡山県統一模試実行委員会です。\n先日お申し込みいただきました「{{対象模試}}（{{受験会場}}）」につきまして、現在コンビニ決済のお手続き完了をお待ちしている状態です。\n\n■ 受験生氏名：{{生徒氏名}} 様（{{学年}}）\n■ 対象模試：{{対象模試}}（{{受験会場}}）\n■ お支払い期限：{{支払期限}}\n■ 払込票・お支払い案内URL：{{払込票URL}}\n\nお支払い期限を過ぎますと自動キャンセルとなりますので、お早めにお手続きくださいますようお願いいたします。\n※すでにお支払い済みの場合、反映までにお時間がかかる場合がございます。行き違いの際はご容赦ください。\n\n--------------------------------------------------\n岡山県統一模試実行委員会\nhttps://okayama-moshi.com/\n--------------------------------------------------',
      'KONBINI_REMIND_'
    ],
    [
      '⑤ コンビニ決済：期限切れ自動キャンセル＆再申込案内（受付期間内のみ）',
      '【岡山県統一模擬試験】お支払い期限経過による自動キャンセルのお知らせ（{{生徒氏名}}様）',
      '{{保護者氏名}} 様\n\n岡山県統一模試実行委員会です。\n先日お申し込みいただきました下記模試につきまして、コンビニ決済のお支払い期限（{{支払期限}}）までに決済確認ができなかったため、誠に恐れ入りますがお申し込みは自動キャンセル扱いとなりました。\n\n■ 受験生氏名：{{生徒氏名}} 様（{{学年}}）\n■ 対象模試：{{対象模試}}（{{受験会場}}）\n\nお申し込み受付期間内に引き続きご受験を希望される場合は、大変お手数ですが下記ページより再度お申し込み手続きをお願いいたします。\n（※受付締切前の最終3日間はクレジットカード決済のみのお取り扱いとなります）\nhttps://okayama-moshi.com/\n\n※すでにお支払い済み、または別決済にてお申し込み済みの場合は、行き違いですので本メールはご容赦ください。\n\n--------------------------------------------------\n岡山県統一模試実行委員会\nhttps://okayama-moshi.com/\n--------------------------------------------------',
      'KONBINI_EXPIRED_'
    ],
    [
      '⑥ 次回模試のご案内（未申込者向け・配信停止URL付）',
      '【岡山県統一模擬試験】{{対象模試}} お申し込み受付中のご案内（{{生徒氏名}}様）',
      '{{保護者氏名}} 様\n\nいつも岡山県統一模擬試験（おかもし）をご利用いただき、誠にありがとうございます。\n\n現在、次回模試「{{対象模試}}」のお申し込みを受付中です。\n志望校判定や現在の実力確認、本番に向けた実践練習としてぜひご活用ください。\n\n■ 対象受験生：{{生徒氏名}} 様（{{学年}}）\n■ 詳細・お申し込みはこちら：\nhttps://okayama-moshi.com/\n\n※すでにお申し込み済みの場合や、塾経由でお申し込みの場合は行き違いですのでご容赦ください。\n\n--------------------------------------------------\n岡山県統一模試実行委員会\nhttps://okayama-moshi.com/\n\n※今後の募集案内メールの配信停止をご希望の場合は、下記よりお手続きください。\n{{配信停止URL}}\n--------------------------------------------------',
      'PROMO_UNAPPLIED_'
    ]
  ];

  for (var d = 0; d < defaultTemplates.length; d++) {
    var tplName = defaultTemplates[d][0];
    if (!existingTpls[tplName]) {
      tplSheet.appendRow(defaultTemplates[d]);
    }
  }
  tplSheet.getRange('C2:C30').setWrap(true);

  // 2) メール配信作成シート（手動用）
  var compSheet = ss.getSheetByName(MAIL_CONFIG.SHEET_COMPOSE);
  if (!compSheet) {
    compSheet = ss.insertSheet(MAIL_CONFIG.SHEET_COMPOSE);
  }
  if (compSheet.getLastRow() === 0) {
    compSheet.setColumnWidth(1, 240);
    compSheet.setColumnWidth(2, 620);

    var rows = [
      ['項目', '設定値（青枠を入力・選択してください）'],
      ['① テンプレート選択', '① 自宅受験：問題発送のお知らせ'],
      ['② 絞り込み：学年（カンマ区切り複数可）', 'すべて'],
      ['③ 絞り込み：対象模試（未申込は「未申込:12月号」）', ''],
      ['④ 絞り込み：受験会場（部分一致可）', ''],
      ['⑤ 絞り込み：決済ステータス', 'paid'],
      ['⑥ 配信ID（重複送信防止キー）', 'HOME_SHIP_202611'],
      ['⑦ テスト送信先メールアドレス', ''],
      ['⑧ メール件名', tplSheet.getRange('B2').getValue()],
      ['⑨ メール本文', tplSheet.getRange('C2').getValue()]
    ];
    compSheet.getRange(1, 1, rows.length, 2).setValues(rows);
    compSheet.getRange('A1:B1').setFontWeight('bold').setBackground('#0f4c3a').setFontColor('#ffffff');
    compSheet.getRange('A2:A10').setFontWeight('bold').setBackground('#f3f4f6');
    compSheet.getRange('B2:B10').setBackground('#f0fdf4');
    compSheet.getRange('B10').setWrap(true);
    compSheet.setRowHeight(10, 260);
  } else {
    compSheet.getRange('A3').setValue('② 絞り込み：学年（カンマ区切り複数可）');
    compSheet.getRange('A4').setValue('③ 絞り込み：対象模試（未申込は「未申込:12月号」）');
  }

  var tplRule = SpreadsheetApp.newDataValidation().requireValueInRange(tplSheet.getRange('A2:A30'), true).build();
  compSheet.getRange('B2').setDataValidation(tplRule);

  var gradeRule = SpreadsheetApp.newDataValidation().requireValueInList([
    'すべて',
    '中学生すべて（中1〜中3）',
    '中学3年生',
    '中学2年生',
    '中学1年生',
    '小学6年生'
  ], true).setAllowInvalid(true).build();
  compSheet.getRange('B3').setDataValidation(gradeRule);

  var statusRule = SpreadsheetApp.newDataValidation().requireValueInList(['paid', '未入金', '期限切れ', 'すべて'], true).setAllowInvalid(true).build();
  compSheet.getRange('B6').setDataValidation(statusRule);

  // 3) 配信スケジュールシート
  var schSheet = ss.getSheetByName(MAIL_CONFIG.SHEET_SCHEDULE);
  if (!schSheet) {
    schSheet = ss.insertSheet(MAIL_CONFIG.SHEET_SCHEDULE);
  }
  schSheet.getRange(1, 1, 1, SCHEDULE_HEADERS.length).setValues([SCHEDULE_HEADERS]).setFontWeight('bold').setBackground('#0f4c3a').setFontColor('#ffffff');
  var widths = [90, 150, 220, 165, 165, 185, 175, 120, 160, 130, 145, 270, 155];
  for (var w = 0; w < widths.length; w++) schSheet.setColumnWidth(w + 1, widths[w]);

  var onOffRule = SpreadsheetApp.newDataValidation().requireValueInList(['ON', 'OFF'], true).build();
  var triggerRule = SpreadsheetApp.newDataValidation().requireValueInList([
    '申込日からN日後',
    '支払期限からN日後',
    '指定日に一斉配信',
    '毎週指定曜日に配信'
  ], true).build();
  var schStatusRule = SpreadsheetApp.newDataValidation().requireValueInList(['paid', '未入金', '期限切れ', '未入金または期限切れ', 'すべて'], true).build();
  var updateActionRule = SpreadsheetApp.newDataValidation().requireValueInList(['変更しない', '期限切れに更新', 'メール送らず期限切れに更新のみ'], true).build();

  schSheet.getRange('A2:A50').setDataValidation(onOffRule);
  schSheet.getRange('D2:D50').setDataValidation(triggerRule);
  schSheet.getRange('H2:H50').setDataValidation(gradeRule);
  schSheet.getRange('K2:K50').setDataValidation(schStatusRule);
  schSheet.getRange('L2:L50').setDataValidation(tplRule);
  schSheet.getRange('M2:M50').setDataValidation(updateActionRule);

  ensureLogSheet_(ss);
  ensureUnsubscribeSheet_(ss);

  getUnsubscribeContext_(PropertiesService.getScriptProperties());

  SpreadsheetApp.getUi().alert('✅ 配信用シートの更新が完了しました！');
}

/** テンプレート名から件名・本文を取得するマップを作成 */
function getTemplateMap_(ss) {
  var tplSheet = ss.getSheetByName(MAIL_CONFIG.SHEET_TEMPLATES);
  var map = {};
  if (!tplSheet) return map;
  var vals = tplSheet.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    var name = String(vals[i][0] || '').trim();
    if (name) {
      map[name] = {
        subject: String(vals[i][1] || '').trim(),
        body: String(vals[i][2] || '').trim(),
        prefix: String(vals[i][3] || '').trim()
      };
    }
  }
  return map;
}

/** 送信済みログマップを作成（一括配列読込・生徒氏名単位での別アドレス重複も防止） */
function getSentLogMap_(logSheet) {
  var sentMap = {};
  var vals = logSheet.getDataRange().getValues();
  for (var l = 1; l < vals.length; l++) {
    var resStr = String(vals[l][6] || '');
    if (resStr.indexOf('OK') === 0 || resStr.indexOf('SKIP_AFTER_DEADLINE') === 0) {
      var campId = String(vals[l][1]).trim();
      var email = String(vals[l][2]).trim();
      var studentRaw = String(vals[l][4]).trim();
      var studentClean = studentRaw.replace(/[\s ]+/g, '');
      var exam = String(vals[l][5]).trim();

      var key = [campId, email, studentRaw, exam].join('|');
      sentMap[key] = true;

      // ★同じ配信ID・同じ生徒氏名・同じ対象模試なら、父母別などの別アドレスでも送信済みとみなす
      if (studentClean) {
        var studentKey = [campId, 'STUDENT_' + studentClean, exam].join('|');
        sentMap[studentKey] = true;
      }
    }
  }
  return sentMap;
}

/** 差し込み変数の置換 */
function renderTemplate_(tpl, item, unsubCtx) {
  var text = String(tpl || '');
  var unsubUrl = item.unsubscribeUrl || '';
  if (!unsubUrl && text.indexOf('{{配信停止URL}}') !== -1) {
    unsubUrl = buildUnsubscribeUrlFast_(item.email, unsubCtx);
  }
  return text
    .replace(/\{\{保護者氏名\}\}/g, item.parentName || '')
    .replace(/\{\{生徒氏名\}\}/g, item.studentName || '')
    .replace(/\{\{学年\}\}/g, item.grade || '')
    .replace(/\{\{対象模試\}\}/g, item.exam || '')
    .replace(/\{\{受験会場\}\}/g, item.venue || '')
    .replace(/\{\{支払期限\}\}/g, item.expiresAt || '期限日')
    .replace(/\{\{払込票URL\}\}/g, item.voucherUrl || '')
    .replace(/\{\{配信停止URL\}\}/g, unsubUrl);
}

/**
 * 「配信スケジュール」シートの全ルールを評価（オンメモリ高速版 ＆ 毎週曜日指定 ＆ 過去受験者タブ横断対応）
 */
function evaluateScheduledQueue_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var ledgerSheet = getLedgerSheetFast_(ss, props);
  var schSheet = ss.getSheetByName(MAIL_CONFIG.SHEET_SCHEDULE);
  var logSheet = ensureLogSheet_(ss);

  if (!schSheet) {
    return { queue: [], statusOnlyRows: [], skippedDuplicate: 0, skippedUnsubscribed: 0, activeRules: 0 };
  }

  var schAll = schSheet.getDataRange().getValues();
  if (schAll.length < 2) {
    return { queue: [], statusOnlyRows: [], skippedDuplicate: 0, skippedUnsubscribed: 0, activeRules: 0 };
  }

  var tplMap = getTemplateMap_(ss);
  var sentMap = getSentLogMap_(logSheet);
  var unsubMap = getUnsubscribedEmailMap_(ss);
  var now = new Date();
  var todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var todayYmd = Utilities.formatDate(todayDate, 'Asia/Tokyo', 'yyyyMMdd');

  var ledgerAll = ledgerSheet.getDataRange().getValues();
  var ledgerRows = ledgerAll.length >= 2 ? ledgerAll.slice(1) : [];
  var pastRowsCache = null;

  var queue = [];
  var statusOnlyRows = [];
  var skippedDuplicate = 0;
  var skippedUnsubscribed = 0;
  var activeRules = 0;
  var uniqueInRun = {};

  for (var s = 1; s < schAll.length; s++) {
    var sr = schAll[s];
    var enabled = String(sr[0] || '').trim().toUpperCase();
    var baseRuleId = String(sr[1] || '').trim();
    var ruleName = String(sr[2] || '').trim();
    var triggerType = String(sr[3] || '').trim();
    var daysVal = String(sr[4] || '').trim();
    var startDateRaw = sr[5];
    var endDateRaw = sr[6];
    var filterGrade = String(sr[7] || '').trim();
    var filterExam = String(sr[8] || '').trim();
    var filterVenue = String(sr[9] || '').trim();
    var filterStatus = String(sr[10] || '').trim();
    var tplName = String(sr[11] || '').trim();
    var updateAction = String(sr[12] || '').trim();

    if (enabled !== 'ON' || !baseRuleId || !triggerType) continue;
    var tpl = tplMap[tplName] || { subject: '', body: '' };
    activeRules++;

    var parsedStartDate = parseDateOnlyJst_(startDateRaw);
    var parsedEndDate = parseDateOnlyJst_(endDateRaw);

    var isBeforeStartDate = parsedStartDate ? (diffDays_(todayDate, parsedStartDate) < 0) : false;
    var isPastEndDate = parsedEndDate ? (diffDays_(todayDate, parsedEndDate) > 0) : false;

    var effectiveRuleId = baseRuleId;

    if (triggerType === '指定日に一斉配信') {
      var targetOneShotDate = parsedStartDate || parseDateOnlyJst_(daysVal);
      if (!targetOneShotDate || diffDays_(todayDate, targetOneShotDate) !== 0) {
        continue;
      }
      isPastEndDate = false;
    } else if (triggerType === '毎週指定曜日に配信') {
      if (isBeforeStartDate || isPastEndDate) continue;
      if (!matchesDayOfWeek_(todayDate, daysVal)) continue;
      effectiveRuleId = baseRuleId + '_' + todayYmd;
    } else {
      if (isBeforeStartDate) continue;
    }

    var targetOffsetDays = parseInt(daysVal, 10);

    var examCond = parseExamFilterCondition_(filterExam);
    var appliedPersonMap = examCond.isUnappliedMode
      ? buildAppliedPersonMap_(ledgerRows, examCond.keyword)
      : null;

    var candidateItems = [];
    for (var m = 0; m < ledgerRows.length; m++) {
      candidateItems.push({ row: ledgerRows[m], rowNumber: m + 2, sourceSheet: 'main' });
    }
    if (examCond.isUnappliedMode && triggerType !== '申込日からN日後' && triggerType !== '支払期限からN日後') {
      if (pastRowsCache === null) {
        pastRowsCache = getPastExamineeRows_(ss);
      }
      for (var p = 0; p < pastRowsCache.length; p++) {
        candidateItems.push({ row: pastRowsCache[p], rowNumber: p + 2, sourceSheet: MAIL_CONFIG.SHEET_PAST });
      }
    }

    var isPromoMail = examCond.isUnappliedMode ||
      String(tpl.body || '').indexOf('{{配信停止URL}}') !== -1 ||
      String(tplName || '').indexOf('ご案内') !== -1;

    for (var i = 0; i < candidateItems.length; i++) {
      var itemObj = candidateItems[i];
      var r = itemObj.row;
      var email = String(r[COL_IDX.EMAIL - 1] || '').trim();
      if (!email || email.indexOf('@') === -1) continue;

      var rowNumber = itemObj.rowNumber;
      var sessionId = String(r[COL_IDX.SESSION_ID - 1] || '').trim();
      var receivedAtRaw = r[COL_IDX.RECEIVED_AT - 1];
      var exam = String(r[COL_IDX.EXAM - 1] || '').trim();
      var venue = String(r[COL_IDX.VENUE - 1] || '').trim();
      var status = String(r[COL_IDX.STATUS - 1] || '').trim();
      var voucherUrl = String(r[COL_IDX.VOUCHER_URL - 1] || '').trim();
      var studentName = String(r[COL_IDX.STUDENT_NAME - 1] || '').trim();
      var grade = String(r[COL_IDX.GRADE - 1] || '').trim();
      var parentName = String(r[COL_IDX.PARENT_NAME - 1] || '').trim();
      var expiresAtRaw = r[COL_IDX.EXPIRES_AT - 1];

      if (triggerType === '申込日からN日後') {
        if (isPastEndDate) continue;
        if (!isFinite(targetOffsetDays)) continue;
        if (sessionId.indexOf('legacy_') === 0) continue;
        var recDate = parseDateOnlyJst_(receivedAtRaw);
        if (!recDate) continue;
        if (parsedStartDate && diffDays_(recDate, parsedStartDate) < 0) continue;
        if (diffDays_(todayDate, recDate) !== targetOffsetDays) continue;
      } else if (triggerType === '支払期限からN日後') {
        if (!isFinite(targetOffsetDays)) continue;
        var expDate = parseDateOnlyJst_(expiresAtRaw);
        if (!expDate) continue;
        var diffExp = diffDays_(todayDate, expDate);
        if (targetOffsetDays > 0) {
          if (diffExp < targetOffsetDays || diffExp > targetOffsetDays + 2) continue;
        } else {
          if (diffExp !== targetOffsetDays) continue;
        }
      }

      if (!matchesGradeFilter_(grade, filterGrade)) continue;

      var targetExamLabel = exam;
      if (examCond.isUnappliedMode) {
        if (isPersonAlreadyApplied_(r, appliedPersonMap)) continue;
        targetExamLabel = examCond.keyword;
      } else {
        if (filterExam && filterExam !== 'すべて' && exam.indexOf(filterExam) === -1) continue;
      }

      if (filterVenue && filterVenue !== 'すべて' && venue.indexOf(filterVenue) === -1) continue;

      if (filterStatus && filterStatus !== 'すべて') {
        if (filterStatus === '未入金または期限切れ') {
          if (status !== '未入金' && status !== '期限切れ') continue;
        } else if (status !== filterStatus) {
          continue;
        }
      }

      if (isPromoMail && unsubMap[email.toLowerCase()]) {
        skippedUnsubscribed++;
        continue;
      }

      var dedupeKey = getPersonDedupeKey_(r, effectiveRuleId, targetExamLabel, examCond.isUnappliedMode);
      var sendKey = [effectiveRuleId, email, studentName, targetExamLabel].join('|');
      var studentSentKey = [effectiveRuleId, 'STUDENT_' + studentName.replace(/[\s ]+/g, ''), targetExamLabel].join('|');
      if (sentMap[sendKey] || sentMap[studentSentKey] || uniqueInRun[sendKey] || uniqueInRun[dedupeKey] || uniqueInRun[studentSentKey]) {
        skippedDuplicate++;
        continue;
      }
      uniqueInRun[sendKey] = true;
      uniqueInRun[dedupeKey] = true;
      uniqueInRun[studentSentKey] = true;

      if (isPastEndDate || updateAction === 'メール送らず期限切れに更新のみ') {
        if (itemObj.sourceSheet === 'main' && (updateAction === '期限切れに更新' || updateAction === 'メール送らず期限切れに更新のみ') && status === '未入金') {
          statusOnlyRows.push({
            ruleId: effectiveRuleId,
            rowNumber: rowNumber,
            email: email,
            parentName: parentName || studentName,
            studentName: studentName,
            exam: targetExamLabel
          });
        }
        continue;
      }

      if (!tpl.subject || !tpl.body) continue;

      var expStr = '';
      var parsedExp = parseDateOnlyJst_(expiresAtRaw);
      if (parsedExp) {
        expStr = parsedExp.getFullYear() + '年' + ('0' + (parsedExp.getMonth() + 1)).slice(-2) + '月' + ('0' + parsedExp.getDate()).slice(-2) + '日';
      } else {
        expStr = String(expiresAtRaw || '').trim();
      }

      queue.push({
        ruleId: effectiveRuleId,
        ruleName: ruleName,
        tplName: tplName,
        subjectTpl: tpl.subject,
        bodyTpl: tpl.body,
        updateAction: updateAction,
        sourceSheet: itemObj.sourceSheet,
        rowNumber: rowNumber,
        currentStatus: status,
        email: email,
        parentName: parentName || studentName,
        studentName: studentName,
        grade: grade,
        exam: targetExamLabel,
        venue: venue,
        expiresAt: expStr,
        voucherUrl: voucherUrl
      });
    }
  }

  return {
    queue: queue,
    statusOnlyRows: statusOnlyRows,
    skippedDuplicate: skippedDuplicate,
    skippedUnsubscribed: skippedUnsubscribed,
    activeRules: activeRules
  };
}

/** 📅 スケジュール配信の対象者をプレビュー（確認のみ） */
function previewScheduledEmails() {
  var info = evaluateScheduledQueue_();
  var msg = '【📅 本日のスケジュール配信プレビュー】\n'
    + '・有効（ON）なルール数：' + info.activeRules + ' 件\n'
    + '・本日メール送信対象になる件数：' + info.queue.length + ' 通\n'
    + '・配信終了日後のためメールを送らず「期限切れ」更新のみ行う行数：' + info.statusOnlyRows.length + ' 行\n'
    + '・処理済み／同一生徒重複スキップ：' + info.skippedDuplicate + ' 件\n'
    + '・配信停止（オプトアウト）による除外：' + (info.skippedUnsubscribed || 0) + ' 件\n\n';

  if (info.queue.length > 0) {
    msg += '▼ メール送信予定の先頭5件：\n';
    var max = Math.min(5, info.queue.length);
    for (var i = 0; i < max; i++) {
      var q = info.queue[i];
      msg += (i + 1) + '. [' + q.ruleId + ' / ' + q.sourceSheet + '] ' + q.parentName + ' 様（生徒: ' + q.studentName + ' / ' + q.grade + '）\n'
           + '   テンプレ: ' + q.tplName + ' / 対象: ' + q.exam + '\n';
    }
  } else {
    msg += '※現在の日付・曜日条件に一致する未送信の対象者は0件です。\n（毎週金曜配信ルールなどは、金曜日の当日にプレビューすると対象者が表示されます）';
  }
  SpreadsheetApp.getUi().alert(msg);
}

/** ▶️ スケジュール配信を手動実行 */
function runScheduledEmailsManual() {
  var ui = SpreadsheetApp.getUi();
  var info = evaluateScheduledQueue_();
  if (info.queue.length === 0 && info.statusOnlyRows.length === 0) {
    ui.alert('現在、スケジュール条件（日付・曜日）に一致する未処理の対象者は 0 件です。');
    return;
  }
  var confirm = ui.alert(
    'スケジュール処理の実行確認',
    '・スケジュール配信メール送信：' + info.queue.length + ' 通\n'
    + '・メールを送らず「期限切れ」へステータス更新のみ：' + info.statusOnlyRows.length + ' 行\n\n実行してよろしいですか？',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var res = executeScheduledQueue_(info.queue, info.statusOnlyRows);
  ui.alert('✅ スケジュール処理が完了しました！\n\n・メール送信成功：' + res.successCount + ' 通\n・ステータス自動更新（期限切れ）：' + res.statusUpdatedCount + ' 行\n・エラー：' + res.errorCount + ' 通');
}

/** ⏰ 自動タイマーから毎朝呼び出される関数 */
function processScheduledEmailsCron() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    var info = evaluateScheduledQueue_();
    if (info.queue.length > 0 || info.statusOnlyRows.length > 0) {
      executeScheduledQueue_(info.queue, info.statusOnlyRows);
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * キュー内のメール送信およびステータス自動更新を実行
 * （★Resend Batch API対応：毎週金曜の未申込者数百件配信でも数秒で完了）
 */
function executeScheduledQueue_(queue, statusOnlyRows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('RESEND_API_KEY');
  var ledgerSheet = getLedgerSheetFast_(ss, props);
  var logSheet = ensureLogSheet_(ss);
  var unsubCtx = getUnsubscribeContext_(props);

  var successCount = 0;
  var errorCount = 0;
  var statusUpdatedCount = 0;
  var logRowsToAppend = [];
  var batchSize = MAIL_CONFIG.BATCH_SIZE || 80;
  var fromHeader = MAIL_CONFIG.FROM_NAME + ' <' + MAIL_CONFIG.FROM_EMAIL + '>';

  for (var start = 0; start < queue.length; start += batchSize) {
    var chunk = queue.slice(start, start + batchSize);
    var batchPayloads = [];

    for (var j = 0; j < chunk.length; j++) {
      var q = chunk[j];
      var unsubUrl = buildUnsubscribeUrlFast_(q.email, unsubCtx);
      q.unsubscribeUrl = unsubUrl;
      var subject = renderTemplate_(q.subjectTpl, q, unsubCtx);
      var body = renderTemplate_(q.bodyTpl, q, unsubCtx);

      var mailObj = {
        from: fromHeader,
        to: [q.email],
        reply_to: MAIL_CONFIG.REPLY_TO,
        subject: subject,
        text: body,
        html: buildCleanHtmlFromText_(body, unsubUrl)
      };
      if (unsubUrl && body.indexOf(unsubUrl) !== -1) {
        mailObj.headers = { 'List-Unsubscribe': '<' + unsubUrl + '>' };
      }
      batchPayloads.push(mailObj);
    }

    var nowStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    try {
      var batchIds = sendBatchViaResend_(batchPayloads, apiKey);
      for (var k = 0; k < chunk.length; k++) {
        var item = chunk[k];
        var msgId = (batchIds && batchIds[k]) ? batchIds[k] : 'batch_sent';
        logRowsToAppend.push([nowStr, item.ruleId, item.email, item.parentName, item.studentName, item.exam, 'OK (' + msgId + ')']);
        successCount++;

        if (item.sourceSheet === 'main' && item.updateAction === '期限切れに更新' && item.currentStatus === '未入金') {
          var currentCellVal = String(ledgerSheet.getRange(item.rowNumber, COL_IDX.STATUS).getValue()).trim();
          if (currentCellVal !== 'paid') {
            ledgerSheet.getRange(item.rowNumber, COL_IDX.STATUS).setValue('期限切れ');
            statusUpdatedCount++;
          }
        }
      }
      if (start + batchSize < queue.length) Utilities.sleep(400);
    } catch (batchErr) {
      for (var f = 0; f < chunk.length; f++) {
        var fq = chunk[f];
        var fPayload = batchPayloads[f];
        try {
          var singleId = sendViaResend_(fq.email, fPayload.subject, fPayload.text, fq.unsubscribeUrl, props);
          logRowsToAppend.push([nowStr, fq.ruleId, fq.email, fq.parentName, fq.studentName, fq.exam, 'OK (' + singleId + ')']);
          successCount++;
          if (fq.sourceSheet === 'main' && fq.updateAction === '期限切れに更新' && fq.currentStatus === '未入金') {
            var cVal = String(ledgerSheet.getRange(fq.rowNumber, COL_IDX.STATUS).getValue()).trim();
            if (cVal !== 'paid') {
              ledgerSheet.getRange(fq.rowNumber, COL_IDX.STATUS).setValue('期限切れ');
              statusUpdatedCount++;
            }
          }
          Utilities.sleep(150);
        } catch (singleErr) {
          logRowsToAppend.push([nowStr, fq.ruleId, fq.email, fq.parentName, fq.studentName, fq.exam, 'ERROR: ' + singleErr.message]);
          errorCount++;
        }
      }
    }
  }

  if (statusOnlyRows && statusOnlyRows.length > 0) {
    for (var s = 0; s < statusOnlyRows.length; s++) {
      var sr = statusOnlyRows[s];
      var nowLog = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
      var cellVal = String(ledgerSheet.getRange(sr.rowNumber, COL_IDX.STATUS).getValue()).trim();
      if (cellVal === '未入金') {
        ledgerSheet.getRange(sr.rowNumber, COL_IDX.STATUS).setValue('期限切れ');
        statusUpdatedCount++;
        logRowsToAppend.push([nowLog, sr.ruleId, sr.email, sr.parentName, sr.studentName, sr.exam, 'SKIP_AFTER_DEADLINE (配信終了日後のためメール送らず期限切れ更新のみ)']);
      }
    }
  }

  if (logRowsToAppend.length > 0) {
    logSheet.getRange(logSheet.getLastRow() + 1, 1, logRowsToAppend.length, LOG_HEADERS.length).setValues(logRowsToAppend);
  }

  return {
    successCount: successCount,
    errorCount: errorCount,
    statusUpdatedCount: statusUpdatedCount
  };
}

/** ⏰ 毎朝9時〜10時の自動配信タイマーを登録 */
function enableDailyScheduleTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processScheduledEmailsCron') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('processScheduledEmailsCron')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();

  SpreadsheetApp.getUi().alert('⏰ 自動配信タイマーを【ON】にしました！（毎日午前9時〜10時に自動チェック）');
}

/** ⏹️ 自動配信タイマーを解除 */
function disableDailyScheduleTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processScheduledEmailsCron') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  SpreadsheetApp.getUi().alert('⏹️ 自動配信タイマーを【OFF】にしました（解除数：' + removed + ' 件）。');
}

/** 選択中のテンプレートを手動作成シートの件名・本文に反映 */
function loadSelectedTemplate() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var compSheet = ss.getSheetByName(MAIL_CONFIG.SHEET_COMPOSE);
  var tplSheet = ss.getSheetByName(MAIL_CONFIG.SHEET_TEMPLATES);
  if (!compSheet || !tplSheet) {
    SpreadsheetApp.getUi().alert('先に「0. 配信用シートを初期作成・更新」を実行してください。');
    return;
  }
  var selectedName = String(compSheet.getRange('B2').getValue()).trim();
  var data = tplSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === selectedName) {
      var prefix = String(data[i][3] || 'MAIL_').trim();
      var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
      compSheet.getRange('B7').setValue(prefix + today);
      compSheet.getRange('B9:B10').setValues([[data[i][1]], [data[i][2]]]);
      SpreadsheetApp.getUi().alert('テンプレート「' + selectedName + '」を読み込みました！');
      return;
    }
  }
  SpreadsheetApp.getUi().alert('該当するテンプレートが見つかりませんでした。');
}

/**
 * 手動配信シートの設定値と対象レコードを抽出
 * - 申込済み除外リスト（appliedPersonMap）は「main」シートのみから作成
 * - 未申込モード（「未申込:〇〇」）時は「main」＋「過去受験者」の両シートから対象者を抽出
 */
function getTargetTargets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var ledgerSheet = getLedgerSheetFast_(ss, props);
  var compSheet = ss.getSheetByName(MAIL_CONFIG.SHEET_COMPOSE);
  var logSheet = ensureLogSheet_(ss);

  if (!compSheet) {
    throw new Error('先にメニュー「0. 配信用シートを初期作成・更新」を実行してください。');
  }

  var cfg = compSheet.getRange('B2:B10').getValues();
  var selectedTplName = String(cfg[0][0] || '').trim();
  var filterGrade     = String(cfg[1][0] || '').trim();
  var filterExam      = String(cfg[2][0] || '').trim();
  var filterVenue     = String(cfg[3][0] || '').trim();
  var filterStatus    = String(cfg[4][0] || '').trim();
  var campaignId      = String(cfg[5][0] || '').trim();
  var testEmail       = String(cfg[6][0] || '').trim();
  var subjectTpl      = String(cfg[7][0] || '').trim();
  var bodyTpl         = String(cfg[8][0] || '').trim();

  var sentMap = getSentLogMap_(logSheet);
  var unsubMap = getUnsubscribedEmailMap_(ss);
  var targets = [];
  var mainTargetCount = 0;
  var pastTargetCount = 0;
  var skippedDuplicate = 0;
  var skippedUnsubscribed = 0;

  var examCond = parseExamFilterCondition_(filterExam);
  var isPromoMail = examCond.isUnappliedMode ||
    bodyTpl.indexOf('{{配信停止URL}}') !== -1 ||
    selectedTplName.indexOf('ご案内') !== -1;

  var allLedgerValues = ledgerSheet.getDataRange().getValues();
  var mainRows = allLedgerValues.length >= 2 ? allLedgerValues.slice(1) : [];

  var appliedPersonMap = examCond.isUnappliedMode
    ? buildAppliedPersonMap_(mainRows, examCond.keyword)
    : null;

  var candidateItems = [];
  for (var m = 0; m < mainRows.length; m++) {
    candidateItems.push({ row: mainRows[m], rowNumber: m + 2, sourceSheet: 'main' });
  }
  if (examCond.isUnappliedMode) {
    var pastRows = getPastExamineeRows_(ss);
    for (var p = 0; p < pastRows.length; p++) {
      candidateItems.push({ row: pastRows[p], rowNumber: p + 2, sourceSheet: MAIL_CONFIG.SHEET_PAST });
    }
  }

  var uniqueCheck = {};

  for (var i = 0; i < candidateItems.length; i++) {
    var itemObj = candidateItems[i];
    var r = itemObj.row;
    var email = String(r[COL_IDX.EMAIL - 1] || '').trim();
    if (!email || email.indexOf('@') === -1) continue;

    var exam = String(r[COL_IDX.EXAM - 1] || '').trim();
    var venue = String(r[COL_IDX.VENUE - 1] || '').trim();
    var status = String(r[COL_IDX.STATUS - 1] || '').trim();
    var voucherUrl = String(r[COL_IDX.VOUCHER_URL - 1] || '').trim();
    var studentName = String(r[COL_IDX.STUDENT_NAME - 1] || '').trim();
    var grade = String(r[COL_IDX.GRADE - 1] || '').trim();
    var parentName = String(r[COL_IDX.PARENT_NAME - 1] || '').trim();
    var expiresAtRaw = r[COL_IDX.EXPIRES_AT - 1];

    if (!matchesGradeFilter_(grade, filterGrade)) continue;

    var targetExamLabel = exam;
    if (examCond.isUnappliedMode) {
      if (isPersonAlreadyApplied_(r, appliedPersonMap)) continue;
      targetExamLabel = examCond.keyword;
    } else {
      if (filterExam && filterExam !== 'すべて' && exam.indexOf(filterExam) === -1) continue;
    }

    if (filterVenue && filterVenue !== 'すべて' && venue.indexOf(filterVenue) === -1) continue;
    if (filterStatus && filterStatus !== 'すべて' && status !== filterStatus) continue;

    if (isPromoMail && unsubMap[email.toLowerCase()]) {
      skippedUnsubscribed++;
      continue;
    }

    var dedupeKey = getPersonDedupeKey_(r, campaignId, targetExamLabel, examCond.isUnappliedMode);
    var sendKey = [campaignId, email, studentName, targetExamLabel].join('|');
    var studentSentKey = [campaignId, 'STUDENT_' + studentName.replace(/[\s ]+/g, ''), targetExamLabel].join('|');
    if (sentMap[sendKey] || sentMap[studentSentKey] || uniqueCheck[sendKey] || uniqueCheck[dedupeKey] || uniqueCheck[studentSentKey]) {
      skippedDuplicate++;
      continue;
    }
    uniqueCheck[sendKey] = true;
    uniqueCheck[dedupeKey] = true;
    uniqueCheck[studentSentKey] = true;

    var expStr = '';
    var parsedExp = parseDateOnlyJst_(expiresAtRaw);
    if (parsedExp) {
      expStr = parsedExp.getFullYear() + '年' + ('0' + (parsedExp.getMonth() + 1)).slice(-2) + '月' + ('0' + parsedExp.getDate()).slice(-2) + '日';
    } else {
      expStr = String(expiresAtRaw || '').trim();
    }

    if (itemObj.sourceSheet === 'main') {
      mainTargetCount++;
    } else {
      pastTargetCount++;
    }

    targets.push({
      sourceSheet: itemObj.sourceSheet,
      rowNumber: itemObj.rowNumber,
      email: email,
      parentName: parentName || studentName,
      studentName: studentName,
      grade: grade,
      exam: targetExamLabel,
      venue: venue,
      status: status,
      expiresAt: expStr,
      voucherUrl: voucherUrl
    });
  }

  return {
    campaignId: campaignId,
    testEmail: testEmail,
    subjectTpl: subjectTpl,
    bodyTpl: bodyTpl,
    targets: targets,
    mainTargetCount: mainTargetCount,
    pastTargetCount: pastTargetCount,
    skippedDuplicate: skippedDuplicate,
    skippedUnsubscribed: skippedUnsubscribed,
    isUnappliedMode: examCond.isUnappliedMode,
    unappliedKeyword: examCond.keyword
  };
}

/** 1. 対象者をプレビュー */
function previewRecipients() {
  var info = getTargetTargets_();
  var modeText = info.isUnappliedMode
    ? '【未申込者抽出モード：「' + info.unappliedKeyword + '」がまだの方（main＋過去受験者）】\n'
    : '';
  var breakdownText = info.isUnappliedMode
    ? '  ├─ main タブから抽出：' + info.mainTargetCount + ' 件\n'
      + '  └─ 過去受験者 タブから抽出：' + info.pastTargetCount + ' 件\n'
    : '';

  var msg = '【配信対象プレビュー】\n'
    + modeText
    + '・配信ID：' + info.campaignId + '\n'
    + '・送信対象：合計 ' + info.targets.length + ' 件（1生徒につき1通）\n'
    + breakdownText
    + '・送信済み／同一生徒重複スキップ：' + info.skippedDuplicate + ' 件\n'
    + '・配信停止（オプトアウト）除外：' + (info.skippedUnsubscribed || 0) + ' 件\n\n';

  if (info.targets.length > 0) {
    msg += '▼ 先頭5件の宛先プレビュー：\n';
    var max = Math.min(5, info.targets.length);
    for (var i = 0; i < max; i++) {
      var t = info.targets[i];
      msg += (i + 1) + '. [' + t.sourceSheet + '] ' + t.parentName + ' 様（生徒: ' + t.studentName + ' / ' + t.grade + '）\n'
           + '   [対象: ' + t.exam + '] <' + t.email + '>\n';
    }
  } else {
    msg += '※条件に一致する未送信の対象者が0件です。絞り込み条件を確認してください。';
  }
  SpreadsheetApp.getUi().alert(msg);
}

/** 2. テストメール送信（1通） */
function sendTestEmail() {
  var info = getTargetTargets_();
  if (!info.testEmail || info.testEmail.indexOf('@') === -1) {
    SpreadsheetApp.getUi().alert('「メール配信作成」シートの B8 セルに「⑦ テスト送信先メールアドレス」を入力してください。');
    return;
  }
  var props = PropertiesService.getScriptProperties();
  var unsubCtx = getUnsubscribeContext_(props);
  var testUnsubUrl = buildUnsubscribeUrlFast_(info.testEmail, unsubCtx);

  var sample = info.targets.length > 0 ? {
    email: info.testEmail,
    parentName: info.targets[0].parentName,
    studentName: info.targets[0].studentName,
    grade: info.targets[0].grade,
    exam: info.targets[0].exam,
    venue: info.targets[0].venue,
    expiresAt: info.targets[0].expiresAt,
    voucherUrl: info.targets[0].voucherUrl,
    unsubscribeUrl: testUnsubUrl
  } : {
    email: info.testEmail,
    parentName: '岡山 花子（サンプル）',
    studentName: '岡山 太郎（サンプル）',
    grade: '中学3年生',
    exam: info.unappliedKeyword || '12月号（岡山県統一模擬試験）',
    venue: '自宅受験',
    expiresAt: '2026年11月10日',
    voucherUrl: 'https://payments.stripe.com/konbini/sample',
    unsubscribeUrl: testUnsubUrl
  };

  var subject = '【テスト送信】' + renderTemplate_(info.subjectTpl, sample, unsubCtx);
  var body = renderTemplate_(info.bodyTpl, sample, unsubCtx);

  sendViaResend_(info.testEmail, subject, body, testUnsubUrl, props);
  SpreadsheetApp.getUi().alert('✅ テストメールを送信しました！\n宛先：' + info.testEmail + '\n\n受信トレイを確認してください。');
}

/** 3. 本番メール一斉送信 */
function sendBulkEmails() {
  var ui = SpreadsheetApp.getUi();
  var info = getTargetTargets_();

  if (!info.campaignId) {
    ui.alert('「⑥ 配信ID」を入力してください（重複送信防止に使われます）。');
    return;
  }
  if (info.targets.length === 0) {
    ui.alert('送信対象が 0 件です（すべて送信済みか、条件に一致する行がありません）。');
    return;
  }

  var confirm = ui.alert(
    '⚠️ 本番メール一斉送信の確認',
    '以下の内容で本番配信を実行します。よろしいですか？\n\n'
    + '・配信ID：' + info.campaignId + '\n'
    + '・送信件数：合計 ' + info.targets.length + ' 通（main: ' + info.mainTargetCount + '件 ／ 過去受験者: ' + info.pastTargetCount + '件）\n'
    + '・配信停止除外：' + (info.skippedUnsubscribed || 0) + ' 件\n'
    + '・件名：' + info.subjectTpl,
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('RESEND_API_KEY');
  if (!apiKey) {
    ui.alert('スクリプトプロパティに RESEND_API_KEY が設定されていません。');
    return;
  }

  var unsubCtx = getUnsubscribeContext_(props);
  var logSheet = ensureLogSheet_(ss);
  var successCount = 0;
  var errorCount = 0;
  var logRowsToAppend = [];
  var batchSize = MAIL_CONFIG.BATCH_SIZE || 80;
  var fromHeader = MAIL_CONFIG.FROM_NAME + ' <' + MAIL_CONFIG.FROM_EMAIL + '>';

  for (var start = 0; start < info.targets.length; start += batchSize) {
    var chunk = info.targets.slice(start, start + batchSize);
    var batchPayloads = [];

    for (var j = 0; j < chunk.length; j++) {
      var t = chunk[j];
      var unsubUrl = buildUnsubscribeUrlFast_(t.email, unsubCtx);
      t.unsubscribeUrl = unsubUrl;
      var subject = renderTemplate_(info.subjectTpl, t, unsubCtx);
      var body = renderTemplate_(info.bodyTpl, t, unsubCtx);

      var mailObj = {
        from: fromHeader,
        to: [t.email],
        reply_to: MAIL_CONFIG.REPLY_TO,
        subject: subject,
        text: body,
        html: buildCleanHtmlFromText_(body, unsubUrl)
      };
      if (unsubUrl && body.indexOf(unsubUrl) !== -1) {
        mailObj.headers = { 'List-Unsubscribe': '<' + unsubUrl + '>' };
      }
      batchPayloads.push(mailObj);
    }

    var nowStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    try {
      var batchIds = sendBatchViaResend_(batchPayloads, apiKey);
      for (var k = 0; k < chunk.length; k++) {
        var item = chunk[k];
        var msgId = (batchIds && batchIds[k]) ? batchIds[k] : 'batch_sent';
        logRowsToAppend.push([nowStr, info.campaignId, item.email, item.parentName, item.studentName, item.exam, 'OK (' + msgId + ')']);
        successCount++;
      }
      if (start + batchSize < info.targets.length) Utilities.sleep(400);
    } catch (batchErr) {
      for (var f = 0; f < chunk.length; f++) {
        var ft = chunk[f];
        var fPayload = batchPayloads[f];
        try {
          var singleId = sendViaResend_(ft.email, fPayload.subject, fPayload.text, ft.unsubscribeUrl, props);
          logRowsToAppend.push([nowStr, info.campaignId, ft.email, ft.parentName, ft.studentName, ft.exam, 'OK (' + singleId + ')']);
          successCount++;
          Utilities.sleep(150);
        } catch (singleErr) {
          logRowsToAppend.push([nowStr, info.campaignId, ft.email, ft.parentName, ft.studentName, ft.exam, 'ERROR: ' + singleErr.message]);
          errorCount++;
        }
      }
    }
  }

  if (logRowsToAppend.length > 0) {
    logSheet.getRange(logSheet.getLastRow() + 1, 1, logRowsToAppend.length, LOG_HEADERS.length).setValues(logRowsToAppend);
  }

  ui.alert('✅ 一斉送信が完了しました！\n\n・成功：' + successCount + ' 件\n・エラー：' + errorCount + ' 件\n\n詳細は「配信ログ」シートをご確認ください。');
}

/** テキスト文面の見た目はそのまま維持し、長い「配信停止URL」だけをテキストリンクに変換 */
function buildCleanHtmlFromText_(textBody, unsubscribeUrl) {
  var escaped = String(textBody || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  var unsubToken = '__UNSUB_LINK_TOKEN__';
  var hasUnsub = false;
  if (unsubscribeUrl) {
    var escapedUnsub = String(unsubscribeUrl)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    if (escaped.indexOf(escapedUnsub) !== -1) {
      escaped = escaped.split(escapedUnsub).join(unsubToken);
      hasUnsub = true;
    }
  }

  escaped = escaped.replace(/(https?:\/\/[^\s "'<>]+)/g, function(url) {
    return '<a href="' + url + '" style="color:#1a73e8;text-decoration:underline;">' + url + '</a>';
  });

  if (hasUnsub) {
    var cleanUnsubHtml = '<a href="' + unsubscribeUrl + '" style="color:#666666;text-decoration:underline;">配信停止はこちら（ワンクリックで完了します）</a>';
    escaped = escaped.split(unsubToken).join(cleanUnsubHtml);
  }

  return '<div style="font-family:sans-serif;font-size:14px;line-height:1.7;color:#222222;white-space:pre-wrap;">'
    + escaped
    + '</div>';
}

/** Resend 単発送信 API */
function sendViaResend_(toEmail, subject, textBody, unsubscribeUrl, optProps) {
  var props = optProps || PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('RESEND_API_KEY');
  if (!apiKey) {
    throw new Error('スクリプトプロパティに RESEND_API_KEY が設定されていません。');
  }

  var payload = {
    from: MAIL_CONFIG.FROM_NAME + ' <' + MAIL_CONFIG.FROM_EMAIL + '>',
    to: [toEmail],
    reply_to: MAIL_CONFIG.REPLY_TO,
    subject: subject,
    text: textBody,
    html: buildCleanHtmlFromText_(textBody, unsubscribeUrl)
  };

  if (unsubscribeUrl && textBody.indexOf(unsubscribeUrl) !== -1) {
    payload.headers = {
      'List-Unsubscribe': '<' + unsubscribeUrl + '>'
    };
  }

  var res = UrlFetchApp.fetch('https://api.resend.com/emails', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Resend API Error (' + code + '): ' + text);
  }
  var json = JSON.parse(text);
  return json.id || 'sent';
}

/** Resend バッチ送信 API */
function sendBatchViaResend_(batchPayloads, apiKey) {
  var res = UrlFetchApp.fetch('https://api.resend.com/emails/batch', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + apiKey
    },
    payload: JSON.stringify(batchPayloads),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Resend Batch Error (' + code + '): ' + text);
  }
  var json = JSON.parse(text);
  var dataArr = (json && json.data) ? json.data : [];
  var ids = [];
  for (var i = 0; i < dataArr.length; i++) {
    ids.push(dataArr[i].id || 'batch_ok');
  }
  return ids;
}

// ============================================================================
// ▼ ワンクリック配信停止（オプトアウト）＆ 未申込者名寄せ抽出ヘルパー関数群
// ============================================================================

function handleUnsubscribeGet_(e) {
  try {
    var email = String((e && e.parameter && e.parameter.e) || '').trim().toLowerCase();
    var sig = String((e && e.parameter && e.parameter.s) || '').trim();
    var secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET') || 'okamoshi_default_salt';

    if (!email || !sig || sig !== generateUnsubscribeSigFast_(email, secret)) {
      return buildUnsubscribeHtml_('無効なリンクです', 'URLが正しくないか、リンクが途中で切れている可能性があります。');
    }

    recordUnsubscribeEmail_(email);
    return buildUnsubscribeHtml_(
      'メールの配信停止を受け付けました',
      '今後、岡山県統一模試実行委員会からの募集・ご案内メール（メルマガ等）の配信を停止いたします。<br><br>' +
      '<span style="font-size:13px;color:#555;">※すでにお申し込みいただいている模試に関する重要なご連絡（受験票・会場案内・問題および成績表の発送通知など）につきましては、ご受験に支障が出ないよう引き続きお送りいたしますのでご了承ください。</span>'
    );
  } catch (err) {
    return buildUnsubscribeHtml_('エラーが発生しました', 'しばらく経ってから再度お試しいただくか、事務局までお問い合わせください。');
  }
}

function generateUnsubscribeSigFast_(cleanEmail, secret) {
  var raw = cleanEmail + '|' + (secret || 'okamoshi_default_salt');
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < 8; i++) {
    hex += ('0' + (digest[i] & 0xFF).toString(16)).slice(-2);
  }
  return hex;
}

function generateUnsubscribeSig_(email) {
  var secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET') || 'okamoshi_default_salt';
  return generateUnsubscribeSigFast_(String(email || '').trim().toLowerCase(), secret);
}

function buildUnsubscribeUrlFast_(email, unsubCtx) {
  var cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return '';
  var ctx = unsubCtx || getUnsubscribeContext_();
  var sig = generateUnsubscribeSigFast_(cleanEmail, ctx.secret);
  return ctx.baseUrl + '?action=unsubscribe&e=' + encodeURIComponent(cleanEmail) + '&s=' + sig;
}

function recordUnsubscribeEmail_(email) {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty('SPREADSHEET_ID');
  var ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ensureUnsubscribeSheet_(ss);
  var vals = sheet.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][1]).trim().toLowerCase() === email) return;
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([nowStr, email, 'Webワンクリック配信停止']);
}

function getUnsubscribedEmailMap_(ss) {
  var map = {};
  var sheet = ss.getSheetByName(MAIL_CONFIG.SHEET_UNSUBSCRIBE);
  if (!sheet) return map;
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var em = String(values[i][1] || '').trim().toLowerCase();
    if (em) map[em] = true;
  }
  return map;
}

function buildUnsubscribeHtml_(title, bodyHtml) {
  var html = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + title + ' | 岡山県統一模試</title>' +
    '<style>body{font-family:sans-serif;background:#f7f9fc;margin:0;padding:40px 16px;color:#333;}' +
    '.card{max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px 24px;box-shadow:0 4px 12px rgba(0,0,0,0.08);text-align:center;}' +
    'h1{font-size:18px;margin:0 0 16px;color:#0f4c3a;}p{font-size:14px;line-height:1.7;margin:0;text-align:left;}</style></head>' +
    '<body><div class="card"><h1>' + title + '</h1><p>' + bodyHtml + '</p></div></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function parseExamFilterCondition_(rawExamCond) {
  var s = String(rawExamCond || '').trim();
  var match = s.match(/^(?:未申込[:：]|[!！\-－])(.+)$/);
  if (match) {
    return { isUnappliedMode: true, keyword: match[1].trim() };
  }
  return { isUnappliedMode: false, keyword: s };
}

function buildAppliedPersonMap_(allRowsData, targetExamKeyword) {
  var appliedMap = {};
  if (!targetExamKeyword) return appliedMap;

  for (var i = 0; i < allRowsData.length; i++) {
    var row = allRowsData[i];
    var examName = String(row[COL_IDX.EXAM - 1] || '').trim();
    var status = String(row[COL_IDX.STATUS - 1] || '').trim();
    if (status === '期限切れ') continue;

    if (examName.indexOf(targetExamKeyword) !== -1) {
      var memberId = String(row[25] || '').trim();
      var studentName = String(row[COL_IDX.STUDENT_NAME - 1] || '').replace(/[\s ]+/g, '');
      var email = String(row[COL_IDX.EMAIL - 1] || '').trim().toLowerCase();

      if (memberId) appliedMap['ID:' + memberId] = true;
      if (email && studentName) appliedMap['PERSON:' + email + '_' + studentName] = true;
    }
  }
  return appliedMap;
}

function isPersonAlreadyApplied_(row, appliedMap) {
  if (!appliedMap) return false;
  var memberId = String(row[25] || '').trim();
  var studentName = String(row[COL_IDX.STUDENT_NAME - 1] || '').replace(/[\s ]+/g, '');
  var email = String(row[COL_IDX.EMAIL - 1] || '').trim().toLowerCase();

  if (memberId && appliedMap['ID:' + memberId]) return true;
  if (email && studentName && appliedMap['PERSON:' + email + '_' + studentName]) return true;
  return false;
}

function getPersonDedupeKey_(row, campaignId, targetExamLabel, isUnappliedMode) {
  var memberId = String(row[25] || '').trim();
  var studentName = String(row[COL_IDX.STUDENT_NAME - 1] || '').replace(/[\s ]+/g, '');
  var email = String(row[COL_IDX.EMAIL - 1] || '').trim().toLowerCase();
  if (isUnappliedMode && memberId) {
    return [campaignId, 'MEMBER_ID_' + memberId, targetExamLabel].join('|');
  }
  return [campaignId, email, studentName, targetExamLabel].join('|');
}