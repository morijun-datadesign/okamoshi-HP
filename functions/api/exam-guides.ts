/**
 * GET /api/exam-guides
 *
 * Cloudflare D1 から模試日程・会場・時間割・出題範囲を取得し、
 * フロントエンド（index.html等）で直感的に扱える階層化JSON形式で高速配信する。
 *
 * クエリパラメータ (任意):
 *   - grade: 学年コード (c3, c2, c1, p6) で絞り込み
 *   - month: 月号数字 (10, 12, 3 等) で絞り込み
 */
import { Env } from "../_shared/env";
import { jsonResponse } from "../_shared/http";

interface ScheduleRow {
  id: string;
  grade_code: string;
  grade_name: string;
  issue_name: string;
  title: string;
  catch_copy: string | null;
  announcement: string | null;
  fee: number;
  fee_note: string | null;
  subjects_note: string | null;
  apply_deadline: string | null;
  ticket_shipping_date: string | null;
  ticket_shipping_note: string | null;
  result_shipping_date: string | null;
  result_shipping_note: string | null;
  sort_order: number;
}

interface VenueRow {
  id: string;
  schedule_id: string;
  venue_type: string;
  venue_name: string | null;
  map_url: string | null;
  exam_date_start: string;
  exam_date_end: string | null;
  belongings: string | null;
  notice: string | null;
  deadline_home: string | null;
  sort_order: number;
}

interface TimetableRow {
  id: string;
  venue_id: string;
  item_name: string;
  time_range: string;
  sort_order: number;
}

interface ScopeRow {
  id: string;
  schedule_id: string;
  subject: string;
  units: string;
  sort_order: number;
}

// YYYY-MM-DD または ISO文字列を「YYYY年M月D日(曜)」に変換
function formatJapaneseDate(dateStr: string | null | undefined, includeYear = true): string {
  if (!dateStr) return "";
  const clean = dateStr.trim();
  const m = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mon = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    const dt = new Date(Date.UTC(y, mon - 1, d, 12, 0, 0));
    const weekDays = ["日", "月", "火", "水", "木", "金", "土"];
    const w = weekDays[dt.getUTCDay()];
    return includeYear ? `${y}年${mon}月${d}日(${w})` : `${mon}月${d}日(${w})`;
  }
  return clean;
}

// 締切文字列からステータス判定 (active, finished, pending)
function determineStatus(applyDeadlineStr: string | null | undefined): "active" | "finished" | "pending" {
  if (!applyDeadlineStr) return "pending";
  const clean = applyDeadlineStr.trim();
  // 例: "2026-10-16 23:59" または "2026-10-16T23:59:59+09:00"
  const m = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (!m) return "active";

  const y = parseInt(m[1], 10);
  const mon = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const h = m[4] ? parseInt(m[4], 10) : 23;
  const min = m[5] ? parseInt(m[5], 10) : 59;

  // JSTでミリ秒算出
  const deadlineMs = new Date(y, mon - 1, d, h, min, 59, 999).getTime();
  const nowMs = Date.now();

  if (nowMs > deadlineMs) {
    return "finished";
  }
  return "active";
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.DB) {
    console.error("[api/exam-guides] D1 database is not bound");
    return jsonResponse({ success: false, error: "Database not bound" }, 503);
  }

  try {
    const url = new URL(request.url);
    const filterGrade = (url.searchParams.get("grade") || "").trim().toLowerCase();
    const filterMonth = (url.searchParams.get("month") || "").trim();

    // 1. 各テーブルからデータ取得
    let schedQuery = `SELECT * FROM exam_schedules`;
    const schedBinds: any[] = [];
    if (filterGrade) {
      schedQuery += ` WHERE grade_code = ?1`;
      schedBinds.push(filterGrade);
    }
    schedQuery += ` ORDER BY sort_order ASC, id ASC;`;

    const schedStmt = schedBinds.length > 0 ? env.DB.prepare(schedQuery).bind(...schedBinds) : env.DB.prepare(schedQuery);
    const schedulesRes = await schedStmt.all<ScheduleRow>();
    const schedules = schedulesRes.results || [];

    const venuesRes = await env.DB.prepare(`SELECT * FROM exam_venues ORDER BY sort_order ASC, id ASC;`).all<VenueRow>();
    const venues = venuesRes.results || [];

    const timetablesRes = await env.DB.prepare(`SELECT * FROM exam_timetables ORDER BY sort_order ASC, id ASC;`).all<TimetableRow>();
    const timetables = timetablesRes.results || [];

    const scopesRes = await env.DB.prepare(`SELECT * FROM exam_scopes ORDER BY sort_order ASC, id ASC;`).all<ScopeRow>();
    const scopes = scopesRes.results || [];

    // 2. timetables を venue_id ごとにグループ化
    const timetablesByVenue: Record<string, { label: string; time: string }[]> = {};
    for (const t of timetables) {
      if (!timetablesByVenue[t.venue_id]) {
        timetablesByVenue[t.venue_id] = [];
      }
      timetablesByVenue[t.venue_id].push({
        label: t.item_name,
        time: t.time_range,
      });
    }

    // 3. venues を schedule_id ごとにグループ化
    const venuesBySchedule: Record<string, VenueRow[]> = {};
    for (const v of venues) {
      if (!venuesBySchedule[v.schedule_id]) {
        venuesBySchedule[v.schedule_id] = [];
      }
      venuesBySchedule[v.schedule_id].push(v);
    }

    // 4. scopes を schedule_id ごとにグループ化
    const scopesBySchedule: Record<string, { subject: string; topics: string[] }[]> = {};
    for (const sc of scopes) {
      if (!scopesBySchedule[sc.schedule_id]) {
        scopesBySchedule[sc.schedule_id] = [];
      }
      const unitList = sc.units
        ? sc.units
            .split(/[,、]/)
            .map((u) => u.trim())
            .filter(Boolean)
        : [];
      scopesBySchedule[sc.schedule_id].push({
        subject: sc.subject,
        topics: unitList,
      });
    }

    // 5. 学年別の階層化データ構造を構築
    const grades: Record<string, any> = {
      c3: { gradeCode: "c3", gradeName: "中3", examName: "岡山県統一模擬試験", price: "5,500円", rounds: [] },
      c2: { gradeCode: "c2", gradeName: "中2", examName: "岡山県統一模擬試験", price: "5,500円", rounds: [] },
      c1: { gradeCode: "c1", gradeName: "中1", examName: "岡山県統一模擬試験", price: "5,500円", rounds: [] },
      p6: { gradeCode: "p6", gradeName: "小6", examName: "岡山県適性検査対策模試", price: "5,500円", rounds: [] },
    };

    for (const s of schedules) {
      const gCode = s.grade_code;
      if (!grades[gCode]) {
        grades[gCode] = {
          gradeCode: gCode,
          gradeName: s.grade_name || gCode,
          examName: s.title || "岡山県統一模擬試験",
          price: `${(s.fee || 5500).toLocaleString()}円`,
          rounds: [],
        };
      } else {
        grades[gCode].price = `${(s.fee || 5500).toLocaleString()}円`;
        grades[gCode].examName = s.title || grades[gCode].examName;
      }

      // 月号数字の抽出（例: "10月号" -> 10）
      const monthNumMatch = s.issue_name.match(/(\d+)/);
      const monthNum = monthNumMatch ? parseInt(monthNumMatch[1], 10) : 0;

      // 月号フィルター指定がある場合はスキップ
      if (filterMonth && String(monthNum) !== filterMonth) {
        continue;
      }

      // 会場一覧 (venuesList / venueDetails)
      const schedVenues = venuesBySchedule[s.id] || [];
      const venuesList = schedVenues.map((v) => {
        const isHome = v.venue_type.includes("自宅");
        let dateText = "";
        if (isHome && v.exam_date_start && v.exam_date_end) {
          dateText = `${formatJapaneseDate(v.exam_date_start, true)}〜${formatJapaneseDate(v.exam_date_end, false)}`;
        } else if (v.exam_date_start) {
          dateText = formatJapaneseDate(v.exam_date_start, true);
        }
        return {
          badge: v.venue_type,
          school: isHome ? (v.venue_name || "全国どこからでも") : (v.venue_name || ""),
          date: dateText,
        };
      });

      const venueDetails = schedVenues.map((v) => {
        const isHome = v.venue_type.includes("自宅");
        let dateText = "";
        if (isHome && v.exam_date_start && v.exam_date_end) {
          dateText = `${formatJapaneseDate(v.exam_date_start, true)}〜${formatJapaneseDate(v.exam_date_end, false)} 答案返送締切`;
        } else if (v.exam_date_start) {
          dateText = formatJapaneseDate(v.exam_date_start, true);
        }

        const tTable = timetablesByVenue[v.id] || [];
        const timetableItems =
          tTable.length > 0
            ? tTable
            : isHome
            ? [{ label: "問題同封の時間割・タイマーに沿って本番と同じ制限時間で自室にてご解答ください。", time: "" }]
            : [
                { label: "集合・諸注意", time: "8:45 〜 9:00" },
                { label: "第1科目 〜 最終科目", time: "9:05 〜 14:40" },
              ];

        const belongingsText =
          v.belongings ||
          (isHome
            ? "お届けする問題用紙・解答用紙、筆記用具、同封の返信用封筒（ポスト投函）"
            : "受験票、筆記用具（HB以上の鉛筆またはシャープペンシル、消しゴム）、コンパス、三角定規、腕時計、昼食・飲料、上履き（要持参）");

        const ticketDispatch = isHome
          ? s.ticket_shipping_date
            ? `${formatJapaneseDate(s.ticket_shipping_date, true)}頃に問題一式をご自宅へお届け`
            : "10月20日(火)頃に問題一式をご自宅へお届け"
          : s.ticket_shipping_date
          ? `${formatJapaneseDate(s.ticket_shipping_date, true)}頃発送予定`
          : "試験日の約5日前発送予定";

        const reportDispatch = s.result_shipping_date
          ? `${formatJapaneseDate(s.result_shipping_date, true)}発送予定`
          : isHome
          ? "答案受領後、約10日〜2週間で返送"
          : "試験実施の約10日後発送予定";

        return {
          id: v.id,
          name: isHome ? "🏠 自宅受験" : v.venue_type,
          place: isHome ? "全国どこからでも" : v.venue_name || "指定会場",
          mapUrl: v.map_url || null,
          examDate: dateText,
          ticketDispatch,
          reportDispatch,
          schedule: timetableItems,
          items: belongingsText,
          notice: v.notice || null,
        };
      });

      // 出題範囲
      const scopeList = scopesBySchedule[s.id] || [];

      // 申込締切の表示テキスト整形
      let deadlineDisplay = s.apply_deadline || "";
      if (s.apply_deadline) {
        const formattedDate = formatJapaneseDate(s.apply_deadline, true);
        const timePart = s.apply_deadline.match(/\d{1,2}:\d{1,2}/)?.[0] || "23:59";
        deadlineDisplay = `${formattedDate} ${timePart}まで`;
      }

      const status = determineStatus(s.apply_deadline);

      grades[gCode].rounds.push({
        id: s.id,
        monthNum,
        monthName: s.issue_name,
        title: s.title,
        catchCopy: s.catch_copy || "",
        announcement: s.announcement || "",
        fee: s.fee,
        feeNote: s.fee_note || "会場・自宅共通",
        subjectsNote: s.subjects_note || "",
        deadline: deadlineDisplay,
        applyDeadlineRaw: s.apply_deadline,
        ticketShippingDate: s.ticket_shipping_date,
        ticketShippingNote: s.ticket_shipping_note,
        resultShippingDate: s.result_shipping_date,
        resultShippingNote: s.result_shipping_note,
        status,
        venuesList,
        venueDetails,
        scopeList,
      });
    }

    // 各学年の rounds を monthNum 順にソート
    for (const gKey of Object.keys(grades)) {
      grades[gKey].rounds.sort((a: any, b: any) => a.monthNum - b.monthNum);
    }

    return new Response(
      JSON.stringify({
        success: true,
        grades,
        flat: {
          schedules,
          venues,
          timetables,
          scopes,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          // CDNエッジキャッシュ 60秒
          "Cache-Control": "public, max-age=60, s-maxage=60",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error: any) {
    console.error("[api/exam-guides] Error fetching exam guides:", error);
    return jsonResponse(
      {
        success: false,
        error: error?.message || "Internal Server Error",
      },
      500
    );
  }
};
