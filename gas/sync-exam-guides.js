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
  // 本番環境とプレビュー環境へ同時同期するエンドポイント配列
  API_URLS: [
    "https://okamoshi-hp.pages.dev/api/admin/sync-exam-guides",
    "https://feature-idea-b.okamoshi-hp.pages.dev/api/admin/sync-exam-guides",
  ],

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
  const urlListText = EXAM_SYNC_CONFIG.API_URLS.map((url, idx) => `${idx + 1}. ${url}`).join("\n");
  ui.alert(
    "同期設定の確認",
    `同期先URL (${EXAM_SYNC_CONFIG.API_URLS.length}件):\n${urlListText}\n\n認証シークレット:\n${EXAM_SYNC_CONFIG.SYNC_SECRET.substring(0, 10)}...`,
    ui.ButtonSet.OK
  );
}

// 文字列の余計な半角・全角スペースや改行を完全除去
function cleanStr(val) {
  if (val === null || val === undefined) return "";
  return String(val)
    .replace(/[！-～]/g, function (s) {
      return String.fromCharCode(s.charCodeAt(0) - 0xfee0); // 全角英数を半角に
    })
    .replace(/[\s\u3000\r\n\t]+/g, "")
    .trim();
}

// 学年名 -> 学年コード
function normalizeGrade(val) {
  const clean = cleanStr(val).toLowerCase();
  if (clean.includes("3") || clean.includes("中3") || clean.includes("c3")) return { code: "c3", name: "中3" };
  if (clean.includes("2") || clean.includes("中2") || clean.includes("c2")) return { code: "c2", name: "中2" };
  if (clean.includes("1") || clean.includes("中1") || clean.includes("c1")) return { code: "c1", name: "中1" };
  if (clean.includes("6") || clean.includes("小6") || clean.includes("p6")) return { code: "p6", name: "小6" };
  return { code: "c3", name: "中3" };
}

// 月号 -> 月号数字
function normalizeMonth(val) {
  const clean = cleanStr(val);
  const m = clean.match(/(\d+)/);
  const num = m ? parseInt(m[1], 10) : 10;
  return { num: num, name: `${num}月号` };
}

// 会場区分 -> 会場スラッグ
function normalizeVenueType(val) {
  const clean = cleanStr(val);
  if (clean.includes("岡山")) return "okayama";
  if (clean.includes("倉敷")) return "kurashiki";
  if (clean.includes("津山")) return "tsuyama";
  if (clean.includes("自宅")) return "home";
  return "venue_" + Utilities.base64EncodeWebSafe(clean).substring(0, 6);
}

// 教科名 -> 教科スラッグ
function normalizeSubject(val) {
  const clean = cleanStr(val);
  if (clean.includes("国語")) return "kokugo";
  if (clean.includes("数学") || clean.includes("算数")) return "sugaku";
  if (clean.includes("英語")) return "eigo";
  if (clean.includes("理科")) return "rika";
  if (clean.includes("社会")) return "shakai";
  if (clean.includes("適性")) return "tekisei";
  if (clean.includes("作文")) return "sakubun";
  return "subject_" + Utilities.base64EncodeWebSafe(clean).substring(0, 6);
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
      const trimmed = String(h).trim();
      map[trimmed] = idx;
      const cleaned = trimmed.replace(/[\s\u3000\r\n\t]+/g, "");
      if (cleaned) {
        map[cleaned] = idx;
      }
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
    const validScheduleIds = new Set();
    const scheduleHomeReturnMap = {};

    for (let i = 1; i < schedData.length; i++) {
      const row = schedData[i];
      const gradeRaw = row[sMap["学年"]];
      const monthRaw = row[sMap["月号"]];
      if (!gradeRaw || !monthRaw) continue;

      const g = normalizeGrade(gradeRaw);
      const m = normalizeMonth(monthRaw);
      const schedId = `${g.code}_${m.num}`;
      validScheduleIds.add(schedId);

      // L列「自宅受験答案返送締切日」の取得（ヘッダー名一致を優先し、表記揺れにも対応）
      const homeReturnColIdx =
        sMap["自宅受験答案返送締切日"] !== undefined
          ? sMap["自宅受験答案返送締切日"]
          : sMap["自宅受験答案締切"] !== undefined
          ? sMap["自宅受験答案締切"]
          : sMap["答案返送締切日"] !== undefined
          ? sMap["答案返送締切日"]
          : sMap["自宅受験返送締切日"] !== undefined
          ? sMap["自宅受験返送締切日"]
          : undefined;
      const homeReturnDeadline =
        homeReturnColIdx !== undefined ? formatDateTimeString(row[homeReturnColIdx]) : null;
      scheduleHomeReturnMap[schedId] = homeReturnDeadline;

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
        home_return_deadline: homeReturnDeadline,
        result_shipping_date: formatDateTimeString(row[sMap["成績返却予定日"]]),
        result_shipping_note: row[sMap["成績返却の注記"]] ? String(row[sMap["成績返却の注記"]]).trim() : null,
        sort_order: row[sMap["表示順"]] ? Number(row[sMap["表示順"]]) : i,
      });
    }

    // B. venues のパース
    const venues = [];
    const validVenueIds = new Set();

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
        if (!validScheduleIds.has(schedId)) {
          // schedules に定義されていない模試の会場行はスキップ
          continue;
        }

        const vSlug = normalizeVenueType(vTypeRaw);
        const venueId = `${schedId}_${vSlug}`;
        validVenueIds.add(venueId);

        const venueDeadlineHome =
          formatDateTimeString(row[vMap["自宅受験答案締切"]]) ||
          (vSlug === "home" ? scheduleHomeReturnMap[schedId] || null : null);

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
          deadline_home: venueDeadlineHome,
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

        if (!validVenueIds.has(venueId)) {
          // venues に定義されていない会場の時間割行はスキップ
          continue;
        }

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

        if (!validScheduleIds.has(schedId)) {
          // schedules に定義されていない模試の出題範囲行はスキップ
          continue;
        }

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

    // 2. ペイロード構築 & 複数エンドポイントへ順次送信
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

    const results = [];
    let allSucceeded = true;

    for (let i = 0; i < EXAM_SYNC_CONFIG.API_URLS.length; i++) {
      const apiUrl = EXAM_SYNC_CONFIG.API_URLS[i];
      try {
        const response = UrlFetchApp.fetch(apiUrl, options);
        const statusCode = response.getResponseCode();
        const resText = response.getContentText();

        let resJson = {};
        try {
          resJson = JSON.parse(resText);
        } catch (e) {}

        if (statusCode === 200 && resJson.success) {
          results.push(`✅ [成功] ${apiUrl} (HTTP ${statusCode})`);
        } else {
          allSucceeded = false;
          results.push(`❌ [失敗] ${apiUrl} (HTTP ${statusCode})\n   理由: ${resJson.error || resText}`);
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
      `${summaryHeader}\n\n` +
        `【送信結果】\n${results.join("\n\n")}\n\n` +
        `【反映データ件数】\n` +
        `・模試基本情報: ${schedules.length} 件\n` +
        `・会場・日程: ${venues.length} 件\n` +
        `・時間割: ${timetables.length} 件\n` +
        `・出題範囲: ${scopes.length} 件`,
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert("実行エラー", `スクリプト実行中にエラーが発生しました:\n${err.message}`, ui.ButtonSet.OK);
  }
}
