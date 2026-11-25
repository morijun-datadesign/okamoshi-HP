/**
 * 岡山県統一模擬試験（おかもし）
 * 1. 今年度旧シート（今年度_旧シート）の新シート形式への一括変換・統合
 * 2. Gemini API を用いた過去履歴（今年度＋過去受験者 31列対応）名寄せ＆自動採番（MAX+1）
 * 3. 電話番号の先頭0落ち自動補完＆ハイフン付き（090-xxxx-xxxx / 086-xxx-xxxx）一括整形
 */

var MEMBER_CFG = {
  SHEET_OLD_CURRENT: '今年度_旧シート',
  SHEET_PAST: '過去受験者',
  COL_MEMBER_NO: 26,   // Z: 会員No（受験番号）
  COL_AI_STATUS: 27,   // AA: 採番ステータス
  COL_AI_MEMO: 28,     // AB: AI判定メモ
  COL_GENDER: 29,      // AC: 性別
  COL_ADMIN_NOTE: 30,  // AD: 管理備考
  COL_SHINKEN: 31      // AE: 進研リスト掲載
};

var EXTRA_HEADERS = [
  '会員No（受験番号）', '採番ステータス', 'AI判定メモ', '性別', '管理備考', '進研リスト掲載'
];

/** スプレッドシートのメニューに「🔢 受験番号・データ統合」を追加 */
function onOpenTriggerForMember() {
  SpreadsheetApp.getUi()
    .createMenu('🔢 受験番号・データ統合')
    .addItem('1. 【初回のみ】「今年度_旧シート」をメインシートへ変換・統合', 'migrateCurrentYearOldSheet')
    .addSeparator()
    .addItem('2. 未採番の行（Z列が空欄の行）をAI名寄せ・自動採番する', 'assignMissingMemberIds')
    .addItem('3. 選択中の行をAI名寄せ・再判定する', 'rejudgeSelectedRow')
    .addSeparator()
    .addItem('4. 📞 全行の電話番号をハイフン付き（先頭0補完）に一括整形する', 'formatAllPhoneNumbersInSheet')
    .addToUi();
}

/**
 * 電話番号を「先頭0補完＋ハイフン付き（090-xxxx-xxxx 等）」に整形する
 */
function formatJapanesePhone_(val) {
  if (val === undefined || val === null) return '';
  var raw = String(val).replace(/^'+/, '').trim();
  if (!raw) return '';

  raw = raw
    .replace(/[０-９]/g, function(s) { return String.fromCharCode(s.charCodeAt(0) - 0xFEE0); })
    .replace(/[ー−―‐－]/g, '-');

  if (/^0\d{1,4}-\d{1,4}-\d{3,4}$/.test(raw)) {
    return raw;
  }

  if (/^[1-9]\d{1,3}-\d{1,4}-\d{3,4}$/.test(raw)) {
    return '0' + raw;
  }

  var digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return raw;

  if (digits.length === 10 && /^(90|80|70|50)/.test(digits)) {
    digits = '0' + digits;
  } else if (digits.length === 9 && digits.charAt(0) !== '0') {
    digits = '0' + digits;
  }

  if (digits.length === 11) {
    if (/^0800/.test(digits)) {
      return digits.slice(0, 4) + '-' + digits.slice(4, 7) + '-' + digits.slice(7);
    }
    return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);
  }

  if (digits.length === 10) {
    if (/^(0120|0570)/.test(digits)) {
      return digits.slice(0, 4) + '-' + digits.slice(4, 7) + '-' + digits.slice(7);
    }
    if (/^(03|06)/.test(digits)) {
      return digits.slice(0, 2) + '-' + digits.slice(2, 6) + '-' + digits.slice(6);
    }
    if (/^(0863|0865|0866|0867|0868|0869|0847|0848|0858|0859|0877|0879|0880|0883|0884|0885|0887|0889|0892|0893|0894|0895|0896|0897|0898)/.test(digits)) {
      return digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6);
    }
    return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
  }

  return raw;
}

/**
 * 4. メニュー用：メインシートの電話番号をすべて「先頭0補完＋ハイフン付き」に一括修復する
 *    あわせて郵便番号（S列）・番地（V列）・建物名（W列）もテキスト書式（@）に固定して日付化を防ぐ
 */
function formatAllPhoneNumbersInSheet() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var mainSheet = getSheet_(props);

  var lastRow = mainSheet.getLastRow();
  if (lastRow < 2) {
    ui.alert('データ行がありません。');
    return;
  }

  var numRows = lastRow - 1;
  var phoneRange = mainSheet.getRange(2, 18, numRows, 1);
  var phoneVals = phoneRange.getValues();
  var updatedCount = 0;

  var newPhoneVals = [];
  for (var i = 0; i < phoneVals.length; i++) {
    var original = String(phoneVals[i][0] || '').trim();
    var formatted = formatJapanesePhone_(original);
    if (formatted !== original && formatted !== '') {
      updatedCount++;
    }
    newPhoneVals.push([formatted]);
  }

  mainSheet.getRange(2, 18, numRows, 2).setNumberFormat('@');
  mainSheet.getRange(2, 22, numRows, 2).setNumberFormat('@');
  phoneRange.setValues(newPhoneVals);

  ui.alert(
    '✅ 電話番号の一括整形＆書式保護が完了しました！',
    '・メインシート全 ' + phoneVals.length + ' 行をチェック\n'
    + '・先頭0抜けやハイフン無しだった ' + updatedCount + ' 件を「090-xxxx-xxxx / 086-xxx-xxxx」形式に統一\n'
    + '・電話番号・郵便番号・番地・建物名の列をすべて「書式なしテキスト」に固定しました！',
    ui.ButtonSet.OK
  );
}

/** Z〜AE列の見出しを保証 */
function ensureExtraHeaders_(sheet) {
  var current = sheet.getRange(1, MEMBER_CFG.COL_MEMBER_NO, 1, EXTRA_HEADERS.length).getValues()[0];
  if (String(current[0]).trim() !== EXTRA_HEADERS[0]) {
    sheet.getRange(1, MEMBER_CFG.COL_MEMBER_NO, 1, EXTRA_HEADERS.length)
      .setValues([EXTRA_HEADERS])
      .setFontWeight('bold');
  }
}

/** 会場名の統一変換 */
function normalizeLegacyVenue_(v) {
  var s = String(v || '').trim();
  if (s === '岡山市') return '岡山会場';
  if (s === '倉敷市') return '倉敷会場';
  if (s === '津山市') return '津山会場';
  if (s === '自宅') return '自宅受験';
  return s;
}

/**
 * 「今年度_旧シート」を新シート形式に変換し、新規申込行の上に統合する
 */
function migrateCurrentYearOldSheet() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var mainSheet = getSheet_(props);
  var oldSheet = ss.getSheetByName(MEMBER_CFG.SHEET_OLD_CURRENT);

  if (!oldSheet) {
    ui.alert('エラー：「' + MEMBER_CFG.SHEET_OLD_CURRENT + '」タブが見つかりません。');
    return;
  }

  ensureExtraHeaders_(mainSheet);

  var mainLastRow = mainSheet.getLastRow();
  var existingMainRows = [];
  if (mainLastRow >= 2) {
    existingMainRows = mainSheet.getRange(2, 1, mainLastRow - 1, 31).getValues();
    for (var e = 0; e < existingMainRows.length; e++) {
      if (String(existingMainRows[e][1]).indexOf('legacy_') === 0) {
        ui.alert('すでに「今年度_旧シート」のデータ（legacy_...）が統合されています。二重統合を防ぐため処理を中止しました。');
        return;
      }
    }
  }

  var oldLastRow = oldSheet.getLastRow();
  if (oldLastRow < 2) {
    ui.alert('「' + MEMBER_CFG.SHEET_OLD_CURRENT + '」にデータ行がありません。');
    return;
  }

  var oldData = oldSheet.getRange(2, 1, oldLastRow - 1, 24).getValues();
  var convertedRows = [];

  for (var i = 0; i < oldData.length; i++) {
    var r = oldData[i];
    var studentName = String(r[5] || '').trim();
    var idVal = String(r[1] || '').trim();
    if (!studentName && !idVal) continue;

    var regDate = r[2];
    if (Object.prototype.toString.call(regDate) === '[object Date]' && !isNaN(regDate.getTime())) {
      regDate = Utilities.formatDate(regDate, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    } else {
      regDate = String(regDate || '').trim();
    }

    var paymentCell = r[21];
    if (Object.prototype.toString.call(paymentCell) === '[object Date]' && !isNaN(paymentCell.getTime())) {
      paymentCell = Utilities.formatDate(paymentCell, 'Asia/Tokyo', 'MM/dd');
    } else {
      paymentCell = String(paymentCell || '').trim();
    }

    var adminNote = String(r[22] || '').trim();
    var shinkenNote = r[23];
    if (Object.prototype.toString.call(shinkenNote) === '[object Date]' && !isNaN(shinkenNote.getTime())) {
      shinkenNote = Utilities.formatDate(shinkenNote, 'Asia/Tokyo', 'MM/dd');
    } else {
      shinkenNote = String(shinkenNote || '').trim();
    }

    var status = '未入金';
    if (adminNote.indexOf('キャンセル') !== -1 || adminNote.indexOf('返金') !== -1) {
      status = 'キャンセル';
    } else if (paymentCell !== '') {
      status = 'paid';
    }

    var methodLabel = paymentCell ? ('旧シート入金(' + paymentCell + ')') : '旧シート移行';
    var memberNo = String(r[3] || '').trim();

    var newRow = new Array(31);
    for (var c = 0; c < 31; c++) newRow[c] = '';

    newRow[0] = regDate;
    newRow[1] = idVal ? ('legacy_' + idVal) : '';
    newRow[2] = String(r[9] || '').trim();
    newRow[3] = normalizeLegacyVenue_(r[10]);
    newRow[4] = '';
    newRow[5] = status;
    newRow[6] = methodLabel;
    newRow[7] = '';
    newRow[8] = '';
    newRow[9] = '';
    newRow[10] = studentName;
    newRow[11] = String(r[6] || '').trim();
    newRow[12] = String(r[4] || '').trim();
    newRow[13] = String(r[8] || '').trim();
    newRow[14] = String(r[11] || '').trim();
    newRow[15] = '';
    newRow[16] = String(r[18] || '').trim();
    newRow[17] = formatJapanesePhone_(r[17]);
    newRow[18] = text_(r[12]);
    newRow[19] = String(r[13] || '').trim();
    newRow[20] = String(r[14] || '').trim();
    newRow[21] = text_(r[15]);
    newRow[22] = text_(r[16]);
    newRow[23] = '';
    newRow[24] = String(r[20] || '').trim();
    newRow[25] = memberNo ? Number(memberNo) || memberNo : '';
    newRow[26] = memberNo ? '既存移行' : '';
    newRow[27] = '';
    newRow[28] = String(r[7] || '').trim();
    newRow[29] = adminNote;
    newRow[30] = shinkenNote;

    convertedRows.push(newRow);
  }

  for (var ex = 0; ex < existingMainRows.length; ex++) {
    existingMainRows[ex][17] = formatJapanesePhone_(existingMainRows[ex][17]);
  }

  var confirm = ui.alert(
    '今年度データの変換・統合確認',
    '「' + MEMBER_CFG.SHEET_OLD_CURRENT + '」から ' + convertedRows.length + ' 件のデータを変換し、\n'
    + '現在メインシートにある新規申込（' + existingMainRows.length + ' 件）の上に時系列で統合します。\n\n実行してよろしいですか？',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var allRows = convertedRows.concat(existingMainRows);
  if (mainLastRow >= 2) {
    mainSheet.getRange(2, 1, mainLastRow - 1, 31).clearContent();
  }
  mainSheet.getRange(2, 18, allRows.length, 2).setNumberFormat('@');
  mainSheet.getRange(2, 22, allRows.length, 2).setNumberFormat('@');
  mainSheet.getRange(2, 1, allRows.length, 31).setValues(allRows);

  ui.alert(
    '✅ 統合完了！',
    '・今年度旧データの統合：' + convertedRows.length + ' 件\n'
    + '・新サイト申込データの保持：' + existingMainRows.length + ' 件（末尾に配置）',
    ui.ButtonSet.OK
  );
}

/** 正規化ヘルパー */
function normStr_(s) {
  return String(s || '').replace(/[\s ]+/g, '').trim();
}
function normPhone_(s) {
  var formatted = formatJapanesePhone_(s);
  return String(formatted || '').replace(/[^0-9]/g, '');
}

/**
 * 全シートから「現在の最大会員No」と「全履歴レコード」を取得（過去受験者タブの31列形式に完全対応）
 */
function loadAllHistoryAndMaxNo_(ss, mainSheet, excludeMainRowMap) {
  var maxNo = 6000000;
  var records = [];

  // 1. mainシートからの読み込み
  var mainLast = mainSheet.getLastRow();
  if (mainLast >= 2) {
    var mainVals = mainSheet.getRange(2, 1, mainLast - 1, 28).getValues();
    for (var i = 0; i < mainVals.length; i++) {
      var rowNum = i + 2;
      if (excludeMainRowMap && excludeMainRowMap[rowNum]) continue;
      var r = mainVals[i];
      var mNo = parseInt(String(r[25] || '').replace(/[^0-9]/g, ''), 10);
      if (isFinite(mNo) && mNo > maxNo) maxNo = mNo;
      if (isFinite(mNo) && mNo > 0) {
        records.push({
          source: '今年度(' + rowNum + '行目)',
          memberNo: String(mNo),
          studentName: String(r[10] || '').trim(),
          studentKana: String(r[11] || '').trim(),
          grade: String(r[12] || '').trim(),
          school: String(r[13] || '').trim(),
          parentName: String(r[14] || '').trim(),
          email: String(r[16] || '').trim(),
          phone: formatJapanesePhone_(r[17]),
          address: (String(r[20] || '') + String(r[21] || '').replace(/^'+/, '')).trim(),
          exam: String(r[2] || '').trim()
        });
      }
    }
  }

  // 2. 過去受験者シートからの読み込み（31列化済み・旧25列どちらでも自動判定）
  var pastSheet = ss.getSheetByName(MEMBER_CFG.SHEET_PAST);
  if (pastSheet && pastSheet.getLastRow() >= 2) {
    var pastLastCol = pastSheet.getLastColumn();
    var pastVals = pastSheet.getRange(2, 1, pastSheet.getLastRow() - 1, pastLastCol).getValues();
    var pastHeaders = pastSheet.getRange(1, 1, 1, pastLastCol).getValues()[0];
    var isPastAligned31 = (pastHeaders[0] === '受付日時' && pastHeaders[16] === 'メールアドレス');

    for (var p = 0; p < pastVals.length; p++) {
      var pr = pastVals[p];
      var pNo = 0;
      var pRecord = null;

      if (isPastAligned31) {
        // ★ 31列化済みの場合（mainと全く同じ列構造）
        pNo = parseInt(String(pr[25] || '').replace(/[^0-9]/g, ''), 10); // Z列: 会員No
        if (isFinite(pNo) && pNo > 0) {
          pRecord = {
            source: '過去受験者シート(' + (p + 2) + '行目)',
            memberNo: String(pNo),
            studentName: String(pr[10] || '').trim(),
            studentKana: String(pr[11] || '').trim(),
            grade: String(pr[12] || '').trim(),
            school: String(pr[13] || '').trim(),
            parentName: String(pr[14] || '').trim(),
            email: String(pr[16] || '').trim(),
            phone: formatJapanesePhone_(pr[17]),
            address: (String(pr[20] || '') + String(pr[21] || '').replace(/^'+/, '')).trim(),
            exam: String(pr[2] || '').trim()
          };
        }
      } else {
        // 旧25列形式のままの場合（フォールバック）
        pNo = parseInt(String(pr[3] || '').replace(/[^0-9]/g, ''), 10); // D列: 顧客番号
        if (isFinite(pNo) && pNo > 0) {
          var phoneCombined = [formatJapanesePhone_(pr[17]), formatJapanesePhone_(pr[18])].filter(Boolean).join('/');
          pRecord = {
            source: '過去受験者シート(' + (p + 2) + '行目)',
            memberNo: String(pNo),
            studentName: String(pr[5] || '').trim(),
            studentKana: String(pr[6] || '').trim(),
            grade: String(pr[4] || '').trim(),
            school: String(pr[8] || '').trim(),
            parentName: String(pr[11] || '').trim(),
            email: String(pr[19] || '').trim(),
            phone: phoneCombined,
            address: (String(pr[14] || '') + String(pr[15] || '')).trim(),
            exam: String(pr[9] || '').trim()
          };
        }
      }

      if (isFinite(pNo) && pNo > maxNo) maxNo = pNo;
      if (pRecord) records.push(pRecord);
    }
  }

  return { maxNo: maxNo, records: records };
}

/**
 * 申込者データに対して本人または家族の可能性がある候補を抽出する
 */
function findSimilarCandidates_(target, allRecords) {
  var tName = normStr_(target.studentName);
  var tKana = normStr_(target.studentKana);
  var tParent = normStr_(target.parentName);
  var tPhone = normPhone_(target.phone);
  var tEmail = String(target.email || '').trim().toLowerCase();
  var tSchool = normStr_(target.school);
  var tAddr = normStr_(target.address);

  var familyName = String(target.studentName || '').trim().split(/[\s ]+/)[0] || tName.slice(0, 2);
  var givenName = String(target.studentName || '').trim().split(/[\s ]+/)[1] || tName.slice(2);
  var familyKana = String(target.studentKana || '').trim().split(/[\s ]+/)[0] || tKana.slice(0, 3);
  var givenKana = String(target.studentKana || '').trim().split(/[\s ]+/)[1] || tKana.slice(3);

  var scoredMap = {};

  for (var i = 0; i < allRecords.length; i++) {
    var rec = allRecords[i];
    var score = 0;
    var hasIdentityClue = false;
    var reasons = [];

    var rName = normStr_(rec.studentName);
    var rKana = normStr_(rec.studentKana);
    var rParent = normStr_(rec.parentName);
    var rPhone = normPhone_(rec.phone);
    var rEmail = String(rec.email || '').trim().toLowerCase();
    var rSchool = normStr_(rec.school);
    var rAddr = normStr_(rec.address);

    if (tName && rName === tName) { score += 60; hasIdentityClue = true; reasons.push('生徒氏名完全一致'); }
    else {
      if (familyName && familyName.length >= 1 && rName.indexOf(familyName) === 0) { score += 20; hasIdentityClue = true; reasons.push('苗字一致'); }
      if (givenName && givenName.length >= 1 && rName.indexOf(givenName) !== -1) { score += 20; hasIdentityClue = true; reasons.push('下の名前一致'); }
    }

    if (tKana && rKana === tKana) { score += 50; hasIdentityClue = true; reasons.push('フリガナ完全一致'); }
    else {
      if (familyKana && familyKana.length >= 2 && rKana.indexOf(familyKana) === 0) { score += 15; hasIdentityClue = true; reasons.push('フリガナ苗字一致'); }
      if (givenKana && givenKana.length >= 2 && rKana.indexOf(givenKana) !== -1) { score += 15; hasIdentityClue = true; reasons.push('フリガナ名前一致'); }
    }

    if (tPhone && tPhone.length >= 9 && rPhone.indexOf(tPhone) !== -1) { score += 55; hasIdentityClue = true; reasons.push('電話番号一致'); }
    if (tEmail && rEmail && tEmail === rEmail) { score += 45; hasIdentityClue = true; reasons.push('メール一致'); }
    if (tParent && rParent && tParent === rParent) { score += 35; hasIdentityClue = true; reasons.push('保護者名一致'); }
    if (tAddr && rAddr && tAddr.length >= 6 && rAddr === tAddr) { score += 35; hasIdentityClue = true; reasons.push('番地まで住所一致'); }
    else if (tAddr && rAddr && tAddr.length >= 4 && rAddr.indexOf(tAddr.slice(0, 5)) !== -1) { score += 15; reasons.push('町名類似'); }
    if (tSchool && rSchool && tSchool === rSchool) { score += 10; reasons.push('学校一致'); }

    if (hasIdentityClue && score >= 25) {
      var existing = scoredMap[rec.memberNo];
      if (!existing || score > existing.score) {
        scoredMap[rec.memberNo] = {
          score: score,
          reasons: reasons.join('・'),
          record: rec
        };
      }
    }
  }

  var list = Object.keys(scoredMap).map(function(k) { return scoredMap[k]; });
  list.sort(function(a, b) { return b.score - a.score; });
  return list.slice(0, 12);
}

/**
 * 利用可能なGeminiモデル一覧を優先順で取得
 */
function getFallbackModelList_(apiKey) {
  var defaultOrder = [
    'gemini-flash-latest',
    'gemini-2.0-flash',
    'gemini-flash-lite-latest',
    'gemini-2.0-flash-lite',
    'gemini-pro-latest'
  ];
  try {
    var listUrl = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey);
    var res = UrlFetchApp.fetch(listUrl, { method: 'get', muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      var data = JSON.parse(res.getContentText());
      var models = data.models || [];
      var available = {};
      var discovered = [];
      for (var i = 0; i < models.length; i++) {
        var m = models[i];
        var name = String(m.name || '').replace(/^models\//, '');
        var methods = m.supportedGenerationMethods || [];
        if (methods.indexOf('generateContent') !== -1 && name.indexOf('gemini') !== -1 && name.indexOf('image') === -1 && name.indexOf('audio') === -1 && name.indexOf('tts') === -1 && name.indexOf('embedding') === -1 && name.indexOf('vision') === -1) {
          available[name] = true;
          if (name.indexOf('flash') !== -1) discovered.push(name);
        }
      }
      var result = [];
      for (var d = 0; d < defaultOrder.length; d++) {
        if (available[defaultOrder[d]]) result.push(defaultOrder[d]);
      }
      for (var k = 0; k < discovered.length; k++) {
        if (result.indexOf(discovered[k]) === -1) result.push(discovered[k]);
      }
      if (result.length > 0) return result;
    }
  } catch (e) {
    Logger.log('Model list fetch error: ' + e);
  }
  return defaultOrder;
}

/**
 * Gemini API を呼び出して本人判定を行う
 */
function judgeWithGemini_(target, candidates, nextNewNo) {
  if (!candidates || candidates.length === 0) {
    return {
      decision: 'NEW',
      memberNo: String(nextNewNo),
      status: '新規自動採番',
      memo: '過去履歴に類似データなし（MAX+1で新規発番）'
    };
  }

  var top = candidates[0];

  if (top.reasons.indexOf('生徒氏名完全一致') !== -1 && top.reasons.indexOf('フリガナ完全一致') !== -1 && top.score >= 120) {
    return {
      decision: 'MATCH',
      memberNo: top.record.memberNo,
      status: '過去引継',
      memo: '過去履歴と完全一致（' + top.reasons + ' / ' + top.record.source + '）'
    };
  }

  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return {
      decision: 'REVIEW',
      memberNo: '',
      status: '⚠️要確認',
      memo: 'GEMINI_API_KEY未設定。候補: ' + top.record.memberNo + '（' + top.record.studentName + ' / ' + top.reasons + '）新規なら ' + nextNewNo
    };
  }

  var prompt = [
    'あなたは「岡山県統一模擬試験（おかもし）」の受験番号（会員No）名寄せ判定AIです。',
    '今回の申込者が、過去の受験者履歴の誰かと「同一生徒本人」か、「新規受験生（兄弟姉妹の別生徒や同姓別人をふくむ）」か、「人間による要確認（この人っぽいけどどう？）」かを判定してください。',
    '',
    '【重要な業務ルール】',
    '1. 同一生徒は小5〜中3までずっと同じ会員Noを引き継ぎます（過去データが小6や中1・中2で、今回が中3など学年が進級しているケースが多々あります）。',
    '2. 引っ越しで住所や電話番号が変わるケース、小学校から中学校へ進学して在籍学校が変わるケース、漢字の微妙な打ち間違い・旧字体（例：齋藤⇔斎藤、高⇔髙、大翔⇔太翔など）があります。',
    '3. 【要注意】電話番号・住所・保護者氏名・メールアドレスが完全一致していても、「生徒の下の名前とフリガナが明確に別人」の場合は【兄弟姉妹の別生徒】なので、絶対に同じ番号を引き継がず「NEW（新規）」と判定してください。',
    '4. 苗字が同じだけで下の名前・電話番号・住所・保護者名がすべて異なる場合は、単なる同姓の他人なので「NEW（新規）」と判定してください。',
    '',
    '【今回の申込データ】',
    JSON.stringify(target, null, 2),
    '',
    '【過去の類似候補リスト】',
    JSON.stringify(candidates, null, 2),
    '',
    '【出力フォーマット（JSONのみ）】',
    '以下のキーを持つJSONオブジェクトのみを出力してください：',
    '- "decision": "MATCH"（同一生徒で確実） | "NEW"（新規生徒・兄弟姉妹の別人・同姓他人で確実） | "REVIEW"（判断に迷う・人間へ「この人っぽいけどどう？」と確認したい）',
    '- "matchedMemberNo": MATCHまたはREVIEWの場合の対象の会員No文字列（NEWの場合は空文字 ""）',
    '- "confidence": 0〜100の確信度（数値）',
    '- "reason": 事務局スタッフ向けの簡潔でわかりやすい判定理由。REVIEWの場合は「⚠️600xxxx（氏名/学校）と同一人物の可能性あり（理由：〜）。新規なら ' + nextNewNo + '」のように具体的に書くこと。'
  ].join('\n');

  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  var modelList = getFallbackModelList_(apiKey);
  var lastErrMsg = '';

  for (var mIdx = 0; mIdx < modelList.length; mIdx++) {
    var modelName = modelList[mIdx];
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent?key=' + encodeURIComponent(apiKey);
    try {
      var res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      var body = res.getContentText();

      if (code >= 200 && code < 300) {
        var parsed = JSON.parse(body);
        var textOut = parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts[0].text;
        var result = JSON.parse(textOut);

        if (result.decision === 'MATCH' && result.matchedMemberNo) {
          return {
            decision: 'MATCH',
            memberNo: String(result.matchedMemberNo).trim(),
            status: '過去引継',
            memo: 'AI判定(確度' + result.confidence + '%): ' + result.reason
          };
        } else if (result.decision === 'NEW') {
          return {
            decision: 'NEW',
            memberNo: String(nextNewNo),
            status: '新規自動採番',
            memo: 'AI判定(確度' + result.confidence + '%): ' + result.reason
          };
        } else {
          return {
            decision: 'REVIEW',
            memberNo: '',
            status: '⚠️要確認',
            memo: '🤔 ' + result.reason + '（※新規採番なら ' + nextNewNo + '）'
          };
        }
      } else {
        lastErrMsg = modelName + ' HTTP ' + code;
        Utilities.sleep(400);
      }
    } catch (err) {
      lastErrMsg = modelName + ' ' + err.message;
    }
  }

  return {
    decision: 'REVIEW',
    memberNo: '',
    status: '⚠️要確認(AI混雑)',
    memo: 'AI混雑(' + lastErrMsg + ') 候補:' + top.record.memberNo + '(' + top.record.studentName + ' / ' + top.reasons + ') / 新規なら ' + nextNewNo
  };
}

/**
 * 指定されたメインシートの行番号リストに対して名寄せ・自動採番を実行する
 */
function assignMemberIdsForRows_(mainSheet, rowNumbers) {
  if (!rowNumbers || rowNumbers.length === 0) return;
  var ss = mainSheet.getParent();
  ensureExtraHeaders_(mainSheet);

  var excludeMap = {};
  for (var i = 0; i < rowNumbers.length; i++) excludeMap[rowNumbers[i]] = true;

  var hist = loadAllHistoryAndMaxNo_(ss, mainSheet, excludeMap);
  var currentMax = hist.maxNo;
  var allRecords = hist.records;

  var sameBatchCache = {};

  for (var idx = 0; idx < rowNumbers.length; idx++) {
    var rowNum = rowNumbers[idx];
    var rowVals = mainSheet.getRange(rowNum, 1, 1, 28).getValues()[0];

    var rawPhone = String(rowVals[17] || '').trim();
    var formattedPhone = formatJapanesePhone_(rawPhone);
    if (formattedPhone && formattedPhone !== rawPhone) {
      mainSheet.getRange(rowNum, 18).setNumberFormat('@').setValue(formattedPhone);
    }

    var existingNo = String(rowVals[25] || '').trim();
    if (existingNo) continue;

    var target = {
      studentName: String(rowVals[10] || '').trim(),
      studentKana: String(rowVals[11] || '').trim(),
      grade: String(rowVals[12] || '').trim(),
      school: String(rowVals[13] || '').trim(),
      parentName: String(rowVals[14] || '').trim(),
      email: String(rowVals[16] || '').trim(),
      phone: formattedPhone,
      address: (String(rowVals[20] || '') + String(rowVals[21] || '').replace(/^'+/, '')).trim(),
      exam: String(rowVals[2] || '').trim()
    };

    if (!target.studentName) continue;

    var batchKey = normStr_(target.studentName) + '|' + normPhone_(target.phone);
    var outcome;

    if (sameBatchCache[batchKey]) {
      outcome = sameBatchCache[batchKey];
    } else {
      var nextNewNo = currentMax + 1;
      var candidates = findSimilarCandidates_(target, allRecords);
      outcome = judgeWithGemini_(target, candidates, nextNewNo);

      if (outcome.decision === 'NEW') {
        currentMax = nextNewNo;
      }
      sameBatchCache[batchKey] = outcome;

      if (outcome.memberNo) {
        allRecords.push({
          source: '今年度(' + rowNum + '行目)',
          memberNo: outcome.memberNo,
          studentName: target.studentName,
          studentKana: target.studentKana,
          grade: target.grade,
          school: target.school,
          parentName: target.parentName,
          email: target.email,
          phone: target.phone,
          address: target.address,
          exam: target.exam
        });
      }
    }

    var memberVal = outcome.memberNo ? (Number(outcome.memberNo) || outcome.memberNo) : '';
    mainSheet.getRange(rowNum, MEMBER_CFG.COL_MEMBER_NO, 1, 3).setValues([[
      memberVal,
      outcome.status,
      outcome.memo
    ]]);
  }
}

/** 2. メニュー用：Z列が空欄のすべての行をAI名寄せ・自動採番する */
function assignMissingMemberIds() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var mainSheet = getSheet_(props);
  ensureExtraHeaders_(mainSheet);

  var lastRow = mainSheet.getLastRow();
  if (lastRow < 2) {
    ui.alert('データ行がありません。');
    return;
  }

  var vals = mainSheet.getRange(2, 1, lastRow - 1, 26).getValues();
  var targetRows = [];
  for (var i = 0; i < vals.length; i++) {
    var studentName = String(vals[i][10] || '').trim();
    var memberNo = String(vals[i][25] || '').trim();
    if (studentName && !memberNo) {
      targetRows.push(i + 2);
    }
  }

  if (targetRows.length === 0) {
    ui.alert('未採番の行（Z列が空欄の行）はありませんでした。すべて採番済みです！');
    return;
  }

  assignMemberIdsForRows_(mainSheet, targetRows);
  ui.alert('✅ ' + targetRows.length + ' 件の未採番行に対して、AI名寄せ・自動採番を実行しました！\nZ列〜AB列をご確認ください。');
}

/** 3. メニュー用：選択中の行を強制的にAI再判定する */
function rejudgeSelectedRow() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var mainSheet = getSheet_(props);
  var rowNum = mainSheet.getActiveRange().getRow();
  if (rowNum < 2) {
    ui.alert('2行目以降のデータ行を選択してから実行してください。');
    return;
  }
  mainSheet.getRange(rowNum, MEMBER_CFG.COL_MEMBER_NO).setValue('');
  assignMemberIdsForRows_(mainSheet, [rowNum]);
  ui.alert('✅ ' + rowNum + ' 行目のAI名寄せ・再判定が完了しました！Z列〜AB列をご確認ください。');
}