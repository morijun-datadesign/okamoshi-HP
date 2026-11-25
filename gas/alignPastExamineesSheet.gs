/**
 * 「過去受験者」タブの列並び・データ表記を「main」タブ（全31列）と完全に揃える関数
 * ※実行前に自動で「過去受験者_旧バックアップ」シートを作成します
 */
function alignPastExamineesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = ss.getSheetByName('main');
  const pastSheet = ss.getSheetByName('過去受験者');
  const ui = SpreadsheetApp.getUi();

  if (!mainSheet || !pastSheet) {
    ui.alert('エラー', '「main」または「過去受験者」シートが見つかりません。', ui.ButtonSet.OK);
    return;
  }

  const pastData = pastSheet.getDataRange().getValues();
  if (pastData.length < 2) {
    ui.alert('データがありません。');
    return;
  }

  const headers = pastData[0];
  // 既に変換済み（A列が「受付日時」で全31列）かどうかチェック
  if (headers[0] === '受付日時' && headers[16] === 'メールアドレス') {
    ui.alert('確認', '「過去受験者」シートは既にmainと同じ項目並びに変換されています。', ui.ButtonSet.OK);
    return;
  }

  // 1. バックアップシートの自動作成（まだ存在しない場合）
  const backupName = '過去受験者_旧バックアップ';
  if (!ss.getSheetByName(backupName)) {
    const backupSheet = pastSheet.copyTo(ss);
    backupSheet.setName(backupName);
    backupSheet.hideSheet(); // 邪魔にならないよう非表示にして保護
  }

  // 2. mainシートのヘッダー（31列）を取得
  const mainHeaders = mainSheet.getRange(1, 1, 1, 31).getValues()[0];
  const newRows = [mainHeaders];

  // 会場名の表記統一マップ（旧表記 ➔ main表記）
  const venueMap = {
    '岡山市': '岡山会場',
    '倉敷市': '倉敷会場',
    '津山市': '津山会場',
    '自宅': '自宅受験'
  };

  // 3. 各行をmainの31列フォーマットに変換
  for (let i = 1; i < pastData.length; i++) {
    const row = pastData[i];
    // 空行スキップ
    if (!row[1] && !row[5] && !row[19]) continue;

    const id = String(row[1] || '').trim();
    const regDate = row[2];               // 登録日時
    const customerNo = row[3];            // 顧客番号
    const grade = String(row[4] || '').trim(); // 学年（中3, 中2, 中1, 小6）
    const studentName = row[5];           // 生徒氏名
    const studentKana = row[6];           // 生徒ふりがな
    const gender = row[7];                // 性別
    const school = row[8];                // 在籍学校
    const examRound = row[9];             // 受験回
    const rawVenue = String(row[10] || '').trim(); // 受験会場
    const parentName = row[11];           // 保護者氏名
    const zip = row[12] ? String(row[12]).replace(/[^0-9]/g, '').padStart(7, '0') : ''; // 郵便番号
    const pref = row[13];                 // 都道府県
    const city = row[14];                 // 市区郡
    const town = row[15];                 // 町名番地
    const bldg = row[16];                 // 建物名
    const tel = row[17] || row[18] || ''; // 電話番号（空なら携帯番号）
    const email = String(row[19] || '').trim(); // メールアドレス
    const note = row[21];                 // 備考
    const paymentRaw = row[23];           // 入金（日付 または キャンセル）
    const adminNote = row[24];            // 管理備考

    // 会場名の変換
    const venue = venueMap[rawVenue] || rawVenue;

    // 決済ステータスと決済手段の変換（今年度_旧シートと同じルール）
    let paymentStatus = 'paid';
    let paymentMethod = '旧シート入金';

    if (String(paymentRaw).includes('キャンセル')) {
      paymentStatus = 'キャンセル';
      paymentMethod = '旧シート入金(キャンセル)';
    } else if (paymentRaw instanceof Date) {
      const mm = String(paymentRaw.getMonth() + 1).padStart(2, '0');
      const dd = String(paymentRaw.getDate()).padStart(2, '0');
      paymentMethod = `旧シート入金(${mm}/${dd})`;
    } else if (paymentRaw) {
      const match = String(paymentRaw).match(/(\d{1,2})[-/](\d{1,2})$/);
      if (match) {
        const mm = match[1].padStart(2, '0');
        const dd = match[2].padStart(2, '0');
        paymentMethod = `旧シート入金(${mm}/${dd})`;
      } else {
        paymentMethod = `旧シート入金(${paymentRaw})`;
      }
    }

    // mainの31列順に配列を組み立て
    const alignedRow = [
      regDate,                         // 0: 受付日時
      id ? `legacy_${id}` : '',        // 1: セッションID
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

  // 4. シートをクリアして31列データを書き込み
  pastSheet.clearContents();
  // 電話番号(R列=18列目)と郵便番号(S列=19列目)の先頭ゼロ消え防止のため書式をテキスト('@')に設定
  pastSheet.getRange(2, 18, newRows.length - 1, 2).setNumberFormat('@');
  pastSheet.getRange(1, 1, newRows.length, 31).setValues(newRows);

  ui.alert(
    '変換完了',
    `「過去受験者」タブ（全${newRows.length - 1}件）を「main」と同じ31列構成に揃えました。\n（※元データは非表示シート「${backupName}」に自動保存されています）`,
    ui.ButtonSet.OK
  );
}