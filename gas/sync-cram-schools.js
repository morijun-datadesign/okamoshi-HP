/**
 * 岡山県統一模擬試験 - 実施塾一覧データ D1 同期スクリプト (GAS)
 *
 * スプレッドシートのメニュー「★サイト連携 > 実施塾データをWebサイトへ同期」から
 * ワンクリックで Cloudflare D1 (cram_schools) へ全件同期します。
 */

// ============================================================
// 設定
// ============================================================
const CRAM_SYNC_CONFIG = {
  // 本番環境とプレビュー環境へ同時同期するエンドポイント配列（絶対に片方を削らないこと）
  // ※11月2日のネームサーバー切り替え前に同期テストを行う場合は一時的に本番URLを "https://okamoshi-hp.pages.dev/api/admin/sync-cram-schools" に指定してください。
  API_URLS: [
    "https://okayama-moshi.com/api/admin/sync-cram-schools",
    "https://feature-idea-b.okamoshi-hp.pages.dev/api/admin/sync-cram-schools",
  ],

  // 認証シークレットキー (Cloudflare Pages 環境変数 CRAM_SCHOOLS_SYNC_SECRET と一致)
  // ※シークレットはコードに直書きしない。GASエディタ「プロジェクトの設定 > スクリプト プロパティ」に
  //   SYNC_SECRET を登録して読み込む（値は Cloudflare Pages の同名環境変数と一致させる）
  get SYNC_SECRET() {
    return PropertiesService.getScriptProperties().getProperty("SYNC_SECRET") || "";
  },

  // 対象シート名（空文字 '' の場合は現在開いているアクティブシート）
  SHEET_NAME: "実施塾一覧",

  // ヘッダー行数 (1行目が「学区ID...」なら 1)
  HEADER_ROWS: 1,
};

/**
 * スプレッドシートを開いた時にカスタムメニューを追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("★サイト連携")
    .addItem("実施塾データをWebサイト(D1)へ同期", "syncCramSchoolsToD1")
    .addToUi();
}

/**
 * 実施塾データを Cloudflare D1 へ同期するメイン関数
 */
function syncCramSchoolsToD1() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = CRAM_SYNC_CONFIG.SHEET_NAME
    ? ss.getSheetByName(CRAM_SYNC_CONFIG.SHEET_NAME) || ss.getActiveSheet()
    : ss.getActiveSheet();

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow <= CRAM_SYNC_CONFIG.HEADER_ROWS) {
    ui.alert("警告", "同期対象のデータ行が存在しません。", ui.ButtonSet.OK);
    return;
  }

  // 確認ダイアログ
  const targetCount = lastRow - CRAM_SYNC_CONFIG.HEADER_ROWS;
  const confirm = ui.alert(
    "同期の確認",
    `シート「${sheet.getName()}」のデータ（${targetCount} 件）を Webサイト（Cloudflare D1）へ全件反映します。\nよろしいですか？`,
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm !== ui.Button.OK) {
    return;
  }

  try {
    // データを2次元配列で全取得 (A列〜F列)
    const range = sheet.getRange(
      CRAM_SYNC_CONFIG.HEADER_ROWS + 1,
      1,
      targetCount,
      Math.max(lastCol, 6)
    );
    const values = range.getValues();

    const schools = [];
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const areaId = String(row[0] || "").trim();
      const areaName = String(row[1] || "").trim();
      const name = String(row[2] || "").trim();
      const url = String(row[3] || "").trim();
      const tel = String(row[4] || "").trim();
      const order = Number(row[5]) || i + 1;

      // 塾名が空の行はスキップ
      if (!name) continue;

      schools.push({
        display_order: order,
        area_id: areaId || "okayama-east",
        area_name: areaName || "岡山・東備学区",
        name: name,
        website_url: url || null,
        phone_number: tel || null,
      });
    }

    if (schools.length === 0) {
      ui.alert("エラー", "有効な塾データが見つかりませんでした。", ui.ButtonSet.OK);
      return;
    }

    // API へ POST 送信（本番・プレビューの全エンドポイントへ順次送信）
    const payload = JSON.stringify({ schools: schools });
    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "x-sync-secret": CRAM_SYNC_CONFIG.SYNC_SECRET,
      },
      payload: payload,
      muteHttpExceptions: true,
    };

    const results = [];
    let allSucceeded = true;

    for (let i = 0; i < CRAM_SYNC_CONFIG.API_URLS.length; i++) {
      const apiUrl = CRAM_SYNC_CONFIG.API_URLS[i];
      try {
        const response = UrlFetchApp.fetch(apiUrl, options);
        const statusCode = response.getResponseCode();
        const responseText = response.getContentText();

        let result = {};
        try {
          result = JSON.parse(responseText);
        } catch (e) {
          result = { error: responseText };
        }

        if (statusCode === 200 && result.success) {
          results.push(`✅ [成功] ${apiUrl} (反映: ${result.synced_count || schools.length}件)`);
        } else {
          allSucceeded = false;
          results.push(`❌ [失敗] ${apiUrl} (HTTP ${statusCode})\n   理由: ${result.error || responseText}`);
        }
      } catch (fetchErr) {
        allSucceeded = false;
        results.push(`❌ [通信エラー] ${apiUrl}\n   理由: ${fetchErr.message}`);
      }
    }

    const summaryHeader = allSucceeded
      ? "すべての環境（本番・プレビュー）への同期が正常に完了しました！"
      : "一部の環境への同期でエラーが発生しました。";

    ui.alert(
      allSucceeded ? "同期完了" : "同期結果（一部エラー）",
      `${summaryHeader}\n\n【送信結果】\n${results.join("\n\n")}\n\n実行日時: ${new Date().toLocaleString("ja-JP")}`,
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert("実行時エラー", "例外が発生しました:\n" + err.toString(), ui.ButtonSet.OK);
  }
}
