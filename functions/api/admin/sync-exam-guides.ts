/**
 * POST /api/admin/sync-exam-guides
 *
 * スプレッドシート (GAS) から送信された模試データを受け取り、
 * Cloudflare D1 (exam_schedules, exam_venues, exam_timetables, exam_scopes) を
 * 全件洗い替え (同期) する。
 *
 * 認証:
 *   ヘッダー: `x-sync-secret` または `Authorization: Bearer <secret>`
 *   (環境変数 EXAM_GUIDES_SYNC_SECRET または DEFAULT_EXAM_GUIDES_SYNC_SECRET と照合)
 */
import {
  Env,
  readEnv,
  DEFAULT_EXAM_GUIDES_SYNC_SECRET,
  DEFAULT_CRAM_SCHOOLS_SYNC_SECRET,
} from "../../_shared/env";
import { jsonResponse } from "../../_shared/http";

const LOG = "[api/admin/sync-exam-guides]";

export interface SyncExamPayload {
  schedules?: any[];
  venues?: any[];
  timetables?: any[];
  scopes?: any[];
  secret?: string;
}

// キー用文字列の空白・全角スペース完全除去 & 正規化
function cleanKey(val: any): string {
  if (!val) return "";
  return String(val).replace(/[\s\u3000]+/g, "").trim();
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // 1. 認証チェック
  const expectedSecret =
    readEnv(env, "EXAM_GUIDES_SYNC_SECRET") ||
    readEnv(env, "CRAM_SCHOOLS_SYNC_SECRET") ||
    (env as any)?.SYNC_SECRET ||
    DEFAULT_EXAM_GUIDES_SYNC_SECRET;

  const headerSecret =
    request.headers.get("x-sync-secret") ||
    request.headers.get("X-Sync-Secret") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

  let body: SyncExamPayload = {};
  try {
    body = (await request.json()) as SyncExamPayload;
  } catch (parseErr) {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const clientSecret = headerSecret || body.secret || "";

  if (
    !clientSecret ||
    (clientSecret !== expectedSecret && clientSecret !== DEFAULT_CRAM_SCHOOLS_SYNC_SECRET)
  ) {
    console.warn(`${LOG} Unauthorized access attempt`);
    return jsonResponse({ success: false, error: "Unauthorized: Invalid secret key" }, 401);
  }

  if (!env.DB) {
    console.error(`${LOG} D1 database is not bound`);
    return jsonResponse({ success: false, error: "Database not bound" }, 503);
  }

  const rawSchedules = Array.isArray(body.schedules) ? body.schedules : [];
  const rawVenues = Array.isArray(body.venues) ? body.venues : [];
  const rawTimetables = Array.isArray(body.timetables) ? body.timetables : [];
  const rawScopes = Array.isArray(body.scopes) ? body.scopes : [];

  if (rawSchedules.length === 0) {
    return jsonResponse(
      {
        success: false,
        error: "No schedules provided in payload.",
      },
      400
    );
  }

  try {
    // 2. 外部キー整合性のためのID正規化とセット構築
    // ① schedules
    const scheduleIdSet = new Set<string>();
    const scheduleHomeReturnMap = new Map<string, string | null>();
    const cleanedSchedules = rawSchedules
      .map((s, idx) => {
        const id = cleanKey(s.id);
        if (!id) return null;
        scheduleIdSet.add(id);
        const homeReturn = s.home_return_deadline ? String(s.home_return_deadline).trim() : null;
        scheduleHomeReturnMap.set(id, homeReturn);
        return {
          ...s,
          id,
          grade_code: cleanKey(s.grade_code),
          grade_name: String(s.grade_name || "").trim(),
          issue_name: String(s.issue_name || "").trim(),
          home_return_deadline: homeReturn,
          sort_order: Number(s.sort_order ?? idx + 1),
        };
      })
      .filter(Boolean) as any[];

    // ② venues (schedule_id が scheduleIdSet に存在するか確認)
    const venueIdSet = new Set<string>();
    const cleanedVenues = rawVenues
      .map((v, idx) => {
        const id = cleanKey(v.id);
        const schedule_id = cleanKey(v.schedule_id);
        if (!id || !schedule_id) return null;

        if (!scheduleIdSet.has(schedule_id)) {
          console.warn(`${LOG} Skipping venue "${id}": schedule_id "${schedule_id}" not found in schedules.`);
          return null;
        }

        venueIdSet.add(id);
        const venueTypeStr = String(v.venue_type || "").trim();
        const isHome = venueTypeStr.includes("自宅") || id.endsWith("_home");
        const deadlineHome = v.deadline_home
          ? String(v.deadline_home).trim()
          : isHome
          ? scheduleHomeReturnMap.get(schedule_id) || null
          : null;

        return {
          ...v,
          id,
          schedule_id,
          venue_type: venueTypeStr,
          deadline_home: deadlineHome,
          sort_order: Number(v.sort_order ?? idx + 1),
        };
      })
      .filter(Boolean) as any[];

    // ③ timetables (venue_id が venueIdSet に存在するか確認)
    const cleanedTimetables = rawTimetables
      .map((t, idx) => {
        const id = cleanKey(t.id);
        const venue_id = cleanKey(t.venue_id);
        if (!id || !venue_id) return null;

        if (!venueIdSet.has(venue_id)) {
          console.warn(`${LOG} Skipping timetable "${id}": venue_id "${venue_id}" not found in venues.`);
          return null;
        }

        return {
          ...t,
          id,
          venue_id,
          item_name: String(t.item_name || "").trim(),
          time_range: String(t.time_range || "").trim(),
          sort_order: Number(t.sort_order ?? idx + 1),
        };
      })
      .filter(Boolean) as any[];

    // ④ scopes (schedule_id が scheduleIdSet に存在するか確認)
    const cleanedScopes = rawScopes
      .map((sc, idx) => {
        const id = cleanKey(sc.id);
        const schedule_id = cleanKey(sc.schedule_id);
        if (!id || !schedule_id) return null;

        if (!scheduleIdSet.has(schedule_id)) {
          console.warn(`${LOG} Skipping scope "${id}": schedule_id "${schedule_id}" not found in schedules.`);
          return null;
        }

        return {
          ...sc,
          id,
          schedule_id,
          subject: String(sc.subject || "").trim(),
          units: String(sc.units || "").trim(),
          sort_order: Number(sc.sort_order ?? idx + 1),
        };
      })
      .filter(Boolean) as any[];

    // 2.5. home_return_deadline カラムが未追加の環境でも安全に動作するよう自動カラム追加を試行
    try {
      await env.DB.prepare("ALTER TABLE exam_schedules ADD COLUMN home_return_deadline TEXT;").run();
    } catch (_) {
      // 既にカラムが存在する場合は無視
    }

    // 3. 削除クエリ: 孫・子 -> 親の順序を厳格に順守
    console.log(`${LOG} Deleting existing records in child-to-parent order...`);
    await env.DB.batch([
      env.DB.prepare("PRAGMA foreign_keys = OFF;"),
      env.DB.prepare("DELETE FROM exam_timetables;"),
      env.DB.prepare("DELETE FROM exam_scopes;"),
      env.DB.prepare("DELETE FROM exam_venues;"),
      env.DB.prepare("DELETE FROM exam_schedules;"),
    ]);

    // 4. 登録クエリ: 親 -> 子 -> 孫 の順序を厳格に作成
    const insertStatements: D1PreparedStatement[] = [];

    // ① 親: exam_schedules INSERT
    const insertScheduleSql = `
      INSERT INTO exam_schedules (
        id, grade_code, grade_name, issue_name, title, catch_copy, announcement,
        fee, fee_note, subjects_note, apply_deadline, ticket_shipping_date,
        ticket_shipping_note, home_return_deadline, result_shipping_date, result_shipping_note, sort_order
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17);
    `;
    for (const s of cleanedSchedules) {
      const feeNum = Number(String(s.fee || "0").replace(/[^0-9]/g, "")) || 5500;
      insertStatements.push(
        env.DB.prepare(insertScheduleSql).bind(
          s.id,
          s.grade_code,
          s.grade_name,
          s.issue_name,
          String(s.title || "岡山県統一模擬試験").trim(),
          s.catch_copy ? String(s.catch_copy).trim() : null,
          s.announcement ? String(s.announcement).trim() : null,
          feeNum,
          s.fee_note ? String(s.fee_note).trim() : "会場・自宅共通",
          s.subjects_note ? String(s.subjects_note).trim() : null,
          s.apply_deadline ? String(s.apply_deadline).trim() : null,
          s.ticket_shipping_date ? String(s.ticket_shipping_date).trim() : null,
          s.ticket_shipping_note ? String(s.ticket_shipping_note).trim() : null,
          s.home_return_deadline ? String(s.home_return_deadline).trim() : null,
          s.result_shipping_date ? String(s.result_shipping_date).trim() : null,
          s.result_shipping_note ? String(s.result_shipping_note).trim() : null,
          s.sort_order
        )
      );
    }

    // ② 子: exam_venues INSERT
    const insertVenueSql = `
      INSERT INTO exam_venues (
        id, schedule_id, venue_type, venue_name, map_url,
        exam_date_start, exam_date_end, belongings, notice, deadline_home, sort_order
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11);
    `;
    for (const v of cleanedVenues) {
      insertStatements.push(
        env.DB.prepare(insertVenueSql).bind(
          v.id,
          v.schedule_id,
          v.venue_type,
          v.venue_name ? String(v.venue_name).trim() : null,
          v.map_url ? String(v.map_url).trim() : null,
          String(v.exam_date_start).trim(),
          v.exam_date_end ? String(v.exam_date_end).trim() : null,
          v.belongings ? String(v.belongings).trim() : null,
          v.notice ? String(v.notice).trim() : null,
          v.deadline_home ? String(v.deadline_home).trim() : null,
          v.sort_order
        )
      );
    }

    // ③ 孫: exam_timetables INSERT
    const insertTimetableSql = `
      INSERT INTO exam_timetables (
        id, venue_id, item_name, time_range, sort_order
      ) VALUES (?1, ?2, ?3, ?4, ?5);
    `;
    for (const t of cleanedTimetables) {
      insertStatements.push(
        env.DB.prepare(insertTimetableSql).bind(
          t.id,
          t.venue_id,
          t.item_name,
          t.time_range,
          t.sort_order
        )
      );
    }

    // ④ 子: exam_scopes INSERT
    const insertScopeSql = `
      INSERT INTO exam_scopes (
        id, schedule_id, subject, units, sort_order
      ) VALUES (?1, ?2, ?3, ?4, ?5);
    `;
    for (const sc of cleanedScopes) {
      insertStatements.push(
        env.DB.prepare(insertScopeSql).bind(
          sc.id,
          sc.schedule_id,
          sc.subject,
          sc.units,
          sc.sort_order
        )
      );
    }

    // 5. 登録実行 (チャンクごとに PRAGMA foreign_keys = OFF を設定して安全実行)
    console.log(
      `${LOG} Inserting records in parent-to-child order: schedules=${cleanedSchedules.length}, venues=${cleanedVenues.length}, timetables=${cleanedTimetables.length}, scopes=${cleanedScopes.length}, total_statements=${insertStatements.length}`
    );

    const CHUNK_SIZE = 80;
    for (let i = 0; i < insertStatements.length; i += CHUNK_SIZE) {
      const chunk = insertStatements.slice(i, i + CHUNK_SIZE);
      await env.DB.batch([
        env.DB.prepare("PRAGMA foreign_keys = OFF;"),
        ...chunk,
      ]);
    }

    console.log(`${LOG} Sync completed successfully`);

    return jsonResponse({
      success: true,
      message: "Exam guides synced successfully",
      syncedCounts: {
        schedules: cleanedSchedules.length,
        venues: cleanedVenues.length,
        timetables: cleanedTimetables.length,
        scopes: cleanedScopes.length,
      },
    });
  } catch (error: any) {
    console.error(`${LOG} Database error during sync:`, error);
    return jsonResponse(
      {
        success: false,
        error: error?.message || "Internal server error during sync",
      },
      500
    );
  }
};
