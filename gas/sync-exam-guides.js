/**
 * ============================================================
 * 岡山県統一模擬試験 (おかもし)
 * 模試日程・会場・時間割・出題範囲 スプレッドシート -> Cloudflare D1 同期 GAS
 * ============================================================
 *
 * 【使い方】
 * 1. 本スプレッドシートの「拡張機能」>「Apps Script」に本スクリプトを貼り付けます。
 * 2. CONFIG の API_URL および SYNC_SECRET を確認・設定します。
 * 3. スプレッドシートをリロードすると、メニューバーに「模試データ管理」が追加されます。
 * 4. 「模試データ管理」>「D1へデータを同期する」をクリックすると同期が実行されます。
 */

const EXAM_SYNC_CONFIG = {
  // 本番用: "https://okayama-moshi.com/api/admin/sync-exam-guides"
  // プレビュー用: "https://feature-idea-b.okamoshi.pages.dev/api/admin/sync-exam-guides"
  API_URL: "https://okayama-moshi.com/api/admin/sync-exam-guides",

  // Cloudflare Pages 環境変数 EXAM_GUIDES_SYNC_SECRET と一致させる
  SYNC_SECRET: "okamoshi_exam_sync_2026_sec_8d3e1f",
};

/**
 * スプレッドシート起動時にメニューを追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("模試データ管理")
    .addItem("D1へデータを同期する", "syncExamGuidesToD1")
    .addSeparator()
    .addItem("接続先設定の確認", "showExamSyncConfig")
    .addToUi();
}

/**
 * 設定確認ダイアログ
 */
function showExamSyncConfig() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    "同期設定の確認",
    `同期先URL:\n${EXAM_SYNC_CONFIG.API_URL}\n\n認証シークレット:\n${EXAM_SYNC_CONFIG.SYNC_SECRET.substring(0, 10)}...`,
    ui.ButtonSet.OK
  );
}

// 学年名 -> 学年コード
function normalizeGrade(val) {
  if (!val) return { code: "c3", name: "中3" };
  const str = String(val).trim();
  if (str.includes("3") || str.includes("中3") || str.toLowerCase().includes("c3")) return { code: "c3", name: "中3" };
  if (str.includes("2") || str.includes("中2") || str.toLowerCase().includes("c2")) return { code: "c2", name: "中2" };
  if (str.includes("1") || str.includes("中1") || str.toLowerCase().includes("c1")) return { code: "c1", name: "中1" };
  if (str.includes("6") || str.includes("小6") || str.toLowerCase().includes("p6")) return { code: "p6", name: "小6" };
  return { code: "c3", name: "中3" };
}

// 月号 -> 月号数字
function normalizeMonth(val) {
  if (!val) return { num: 10, name: "10月号" };
  const str = String(val).trim();
  const m = str.match(/(\d+)/);
  const num = m ? parseInt(m[1], 10) : 10;
  return { num: num, name: `${num}月号` };
}

// 会場区分 -> 会場スラッグ
function normalizeVenueType(val) {
  if (!val) return "venue";
  const str = String(val).trim();
  if (str.includes("岡山")) return "okayama";
  if (str.includes("倉敷")) return "kurashiki";
  if (str.includes("津山")) return "tsuyama";
  if (str.includes("自宅")) return "home";
  return "venue_" + Utilities.base64EncodeWebSafe(str).substring(0, 6);
}

// 教科名 -> 教科スラッグ
function normalizeSubject(val) {
  if (!val) return "subject";
  const str = String(val).trim();
  if (str.includes("国語")) return "kokugo";
  if (str.includes("数学") || str.includes("算数")) return "sugaku";
  if (str.includes("英語")) return "eigo";
  if (str.includes("理科")) return "rika";
  if (str.includes("社会")) return "shakai";
  if (str.includes("適性")) return "tekisei";
  if (str.includes("作文")) return "sakubun";
  return "subject_" + Utilities.base64EncodeWebSafe(str).substring(0, 6);
}

// 日時オブジェクト/文字列を YYYY-MM-DD または YYYY-MM-DD HH:mm に変換
function formatDateTimeString(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    const h = String(val.getHours()).padStart(2, "0");
    const min = String(val.getMinutes()).padStart(2, "0");
    if (h === "00" && min === "00") {
      return `${y}-${m}-${d}`;
    }
    return `${y}-${m}-${d} ${h}:${min}`;
  }
  return String(val).trim();
}

/**
 * シート名を柔軟に検索（英語名または日本語名）
 */
function findSheet(ss, names) {
  for (let i = 0; i < names.length; i++) {
    const s = ss.getSheetByName(names[i]);
    if (s) return s;
  }
  return null;
}

/**
 * 1行目ヘッダーから列インデックスマップを生成
 */
function createHeaderMap(headers) {
  const map = {};
  headers.forEach((h, idx) => {
    if (h) {
      map[String(h).trim()] = idx;
    }
  });
  return map;
}

/**
 * メイン同期処理
 */
function syncExamGuidesToD1() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. 各シートの取得
  const sheetSchedules = findSheet(ss, ["schedules", "模試基本情報", "模試日程・基本情報"]);
  const sheetVenues = findSheet(ss, ["venues", "会場・日程", "会場日程"]);
  const sheetTimetables = findSheet(ss, ["timetables", "時間割"]);
  const sheetScopes = findSheet(ss, ["scopes", "出題範囲"]);

  if (!sheetSchedules) {
    ui.alert("エラー", "「schedules」（または「模試基本情報」）シートが見つかりません。", ui.ButtonSet.OK);
    return;
  }

  const confirm = ui.alert(
    "同期の確認",
    "スプレッドシートの模試データ（基本情報・会場・時間割・出題範囲）を Cloudflare D1 に反映しますか？\n（本番サイトの表示が最新データに更新されます）",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  try {
    // A. schedules のパース
    const schedData = sheetSchedules.getDataRange().getValues();
    const schedHeaders = schedData[0];
    const sMap = createHeaderMap(schedHeaders);

    const schedules = [];
    for (let i = 1; i < schedData.length; i++) {
      const row = schedData[i];
      const gradeRaw = row[sMap["学年"]];
      const monthRaw = row[sMap["月号"]];
      if (!gradeRaw || !monthRaw) continue;

      const g = normalizeGrade(gradeRaw);
      const m = normalizeMonth(monthRaw);
      const schedId = `${g.code}_${m.num}`;

      schedules.push({
        id: schedId,
        grade_code: g.code,
        grade_name: g.name,
        issue_name: m.name,
        title: String(row[sMap["模試タイトル"]] || "岡山県統一模擬試験").trim(),
        catch_copy: row[sMap["キャッチコピー"]] ? String(row[sMap["キャッチコピー"]]).trim() : null,
        announcement: row[sMap["アナウンス帯"]] ? String(row[sMap["アナウンス帯"]]).trim() : null,
        fee: Number(String(row[sMap["受験料"]] || 5500).replace(/[^0-9]/g, "")) || 5500,
        fee_note: row[sMap["受験料補足"]] ? String(row[sMap["受験料補足"]]).trim() : "会場・自宅共通",
        subjects_note: row[sMap["出題形式"]] ? String(row[sMap["出題形式"]]).trim() : null,
        apply_deadline: formatDateTimeString(row[sMap["申込締切日時"]]),
        ticket_shipping_date: formatDateTimeString(row[sMap["受験票発送予定日"]]),
        ticket_shipping_note: row[sMap["受験票発送の注記"]] ? String(row[sMap["受験票発送の注記"]]).trim() : null,
        result_shipping_date: formatDateTimeString(row[sMap["成績返却予定日"]]),
        result_shipping_note: row[sMap["成績返却の注記"]] ? String(row[sMap["成績返却の注記"]]).trim() : null,
        sort_order: row[sMap["表示順"]] ? Number(row[sMap["表示順"]]) : i,
      });
    }

    // B. venues のパース
    const venues = [];
    if (sheetVenues) {
      const vData = sheetVenues.getDataRange().getValues();
      const vHeaders = vData[0];
      const vMap = createHeaderMap(vHeaders);

      for (let i = 1; i < vData.length; i++) {
        const row = vData[i];
        const gradeRaw = row[vMap["学年"]];
        const monthRaw = row[vMap["月号"]];
        const vTypeRaw = row[vMap["会場区分"]];
        if (!gradeRaw || !monthRaw || !vTypeRaw) continue;

        const g = normalizeGrade(gradeRaw);
        const m = normalizeMonth(monthRaw);
        const schedId = `${g.code}_${m.num}`;
        const vSlug = normalizeVenueType(vTypeRaw);
        const venueId = `${schedId}_${vSlug}`;

        venues.push({
          id: venueId,
          schedule_id: schedId,
          venue_type: String(vTypeRaw).trim(),
          venue_name: row[vMap["会場施設名"]] ? String(row[vMap["会場施設名"]]).trim() : null,
          map_url: row[vMap["GoogleマップURL"]] ? String(row[vMap["GoogleマップURL"]]).trim() : null,
          exam_date_start: formatDateTimeString(row[vMap["実施開始日"]]) || "",
          exam_date_end: formatDateTimeString(row[vMap["実施終了日"]]),
          belongings: row[vMap["持参物"]] ? String(row[vMap["持参物"]]).trim() : null,
          notice: row[vMap["注意事項"]] ? String(row[vMap["注意事項"]]).trim() : null,
          deadline_home: formatDateTimeString(row[vMap["自宅受験答案締切"]]),
          sort_order: row[vMap["表示順"]] ? Number(row[vMap["表示順"]]) : i,
        });
      }
    }

    // C. timetables のパース
    const timetables = [];
    if (sheetTimetables) {
      const tData = sheetTimetables.getDataRange().getValues();
      const tHeaders = tData[0];
      const tMap = createHeaderMap(tHeaders);

      const venueCounter = {};
      for (let i = 1; i < tData.length; i++) {
        const row = tData[i];
        const gradeRaw = row[tMap["学年"]];
        const monthRaw = row[tMap["月号"]];
        const vTypeRaw = row[tMap["会場区分"]];
        const itemName = row[tMap["項目名"]];
        if (!gradeRaw || !monthRaw || !vTypeRaw || !itemName) continue;

        const g = normalizeGrade(gradeRaw);
        const m = normalizeMonth(monthRaw);
        const schedId = `${g.code}_${m.num}`;
        const vSlug = normalizeVenueType(vTypeRaw);
        const venueId = `${schedId}_${vSlug}`;

        venueCounter[venueId] = (venueCounter[venueId] || 0) + 1;
        const timetableId = `${venueId}_${venueCounter[venueId]}`;

        timetables.push({
          id: timetableId,
          venue_id: venueId,
          item_name: String(itemName).trim(),
          time_range: row[tMap["時間帯"]] ? String(row[tMap["時間帯"]]).trim() : "",
          sort_order: row[tMap["表示順"]] ? Number(row[tMap["表示順"]]) : i,
        });
      }
    }

    // D. scopes のパース
    const scopes = [];
    if (sheetScopes) {
      const scData = sheetScopes.getDataRange().getValues();
      const scHeaders = scData[0];
      const scMap = createHeaderMap(scHeaders);

      for (let i = 1; i < scData.length; i++) {
        const row = scData[i];
        const gradeRaw = row[scMap["学年"]];
        const monthRaw = row[scMap["月号"]];
        const subjRaw = row[scMap["教科名"]];
        if (!gradeRaw || !monthRaw || !subjRaw) continue;

        const g = normalizeGrade(gradeRaw);
        const m = normalizeMonth(monthRaw);
        const schedId = `${g.code}_${m.num}`;
        const subjSlug = normalizeSubject(subjRaw);
        const scopeId = `${schedId}_${subjSlug}`;

        scopes.push({
          id: scopeId,
          schedule_id: schedId,
          subject: String(subjRaw).trim(),
          units: row[scMap["出題単元"]] ? String(row[scMap["出題単元"]]).trim() : "",
          sort_order: row[scMap["表示順"]] ? Number(row[scMap["表示順"]]) : i,
        });
      }
    }

    // 2. ペイロード構築 & 送信
    const payload = {
      secret: EXAM_SYNC_CONFIG.SYNC_SECRET,
      schedules: schedules,
      venues: venues,
      timetables: timetables,
      scopes: scopes,
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      headers: {
        "x-sync-secret": EXAM_SYNC_CONFIG.SYNC_SECRET,
      },
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(EXAM_SYNC_CONFIG.API_URL, options);
    const statusCode = response.getResponseCode();
    const resText = response.getContentText();

    let resJson = {};
    try {
      resJson = JSON.parse(resText);
    } catch (e) {}

    if (statusCode === 200 && resJson.success) {
      ui.alert(
        "同期完了",
        `D1への同期が正常に完了しました！\n\n反映件数:\n・模試基本情報: ${schedules.length} 件\n・会場・日程: ${venues.length} 件\n・時間割: ${timetables.length} 件\n・出題範囲: ${scopes.length} 件`,
        ui.ButtonSet.OK
      );
    } else {
      ui.alert(
        "同期エラー",
        `同期に失敗しました。(HTTP ${statusCode})\n${resJson.error || resText}`,
        ui.ButtonSet.OK
      );
    }
  } catch (err) {
    ui.alert("実行エラー", `スクリプト実行中にエラーが発生しました:\n${err.message}`, ui.ButtonSet.OK);
  }
}
