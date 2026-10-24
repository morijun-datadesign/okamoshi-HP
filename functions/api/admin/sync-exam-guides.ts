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
    const statements: D1PreparedStatement[] = [];

    // 1. 既存データの削除 (子テーブルから順に、または CASCADE)
    statements.push(env.DB.prepare("DELETE FROM exam_scopes;"));
    statements.push(env.DB.prepare("DELETE FROM exam_timetables;"));
    statements.push(env.DB.prepare("DELETE FROM exam_venues;"));
    statements.push(env.DB.prepare("DELETE FROM exam_schedules;"));

    // 2. exam_schedules INSERT
    const insertScheduleSql = `
      INSERT INTO exam_schedules (
        id, grade_code, grade_name, issue_name, title, catch_copy, announcement,
        fee, fee_note, subjects_note, apply_deadline, ticket_shipping_date,
        ticket_shipping_note, result_shipping_date, result_shipping_note, sort_order
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16);
    `;

    for (let i = 0; i < rawSchedules.length; i++) {
      const s = rawSchedules[i];
      const feeNum = Number(String(s.fee || "0").replace(/[^0-9]/g, "")) || 5500;
      statements.push(
        env.DB.prepare(insertScheduleSql).bind(
          String(s.id).trim(),
          String(s.grade_code).trim(),
          String(s.grade_name).trim(),
          String(s.issue_name).trim(),
          String(s.title || "岡山県統一模擬試験").trim(),
          s.catch_copy ? String(s.catch_copy).trim() : null,
          s.announcement ? String(s.announcement).trim() : null,
          feeNum,
          s.fee_note ? String(s.fee_note).trim() : "会場・自宅共通",
          s.subjects_note ? String(s.subjects_note).trim() : null,
          s.apply_deadline ? String(s.apply_deadline).trim() : null,
          s.ticket_shipping_date ? String(s.ticket_shipping_date).trim() : null,
          s.ticket_shipping_note ? String(s.ticket_shipping_note).trim() : null,
          s.result_shipping_date ? String(s.result_shipping_date).trim() : null,
          s.result_shipping_note ? String(s.result_shipping_note).trim() : null,
          Number(s.sort_order ?? i + 1)
        )
      );
    }

    // 3. exam_venues INSERT
    const insertVenueSql = `
      INSERT INTO exam_venues (
        id, schedule_id, venue_type, venue_name, map_url,
        exam_date_start, exam_date_end, belongings, notice, deadline_home, sort_order
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11);
    `;

    for (let i = 0; i < rawVenues.length; i++) {
      const v = rawVenues[i];
      statements.push(
        env.DB.prepare(insertVenueSql).bind(
          String(v.id).trim(),
          String(v.schedule_id).trim(),
          String(v.venue_type).trim(),
          v.venue_name ? String(v.venue_name).trim() : null,
          v.map_url ? String(v.map_url).trim() : null,
          String(v.exam_date_start).trim(),
          v.exam_date_end ? String(v.exam_date_end).trim() : null,
          v.belongings ? String(v.belongings).trim() : null,
          v.notice ? String(v.notice).trim() : null,
          v.deadline_home ? String(v.deadline_home).trim() : null,
          Number(v.sort_order ?? i + 1)
        )
      );
    }

    // 4. exam_timetables INSERT
    const insertTimetableSql = `
      INSERT INTO exam_timetables (
        id, venue_id, item_name, time_range, sort_order
      ) VALUES (?1, ?2, ?3, ?4, ?5);
    `;

    for (let i = 0; i < rawTimetables.length; i++) {
      const t = rawTimetables[i];
      statements.push(
        env.DB.prepare(insertTimetableSql).bind(
          String(t.id).trim(),
          String(t.venue_id).trim(),
          String(t.item_name).trim(),
          String(t.time_range).trim(),
          Number(t.sort_order ?? i + 1)
        )
      );
    }

    // 5. exam_scopes INSERT
    const insertScopeSql = `
      INSERT INTO exam_scopes (
        id, schedule_id, subject, units, sort_order
      ) VALUES (?1, ?2, ?3, ?4, ?5);
    `;

    for (let i = 0; i < rawScopes.length; i++) {
      const sc = rawScopes[i];
      statements.push(
        env.DB.prepare(insertScopeSql).bind(
          String(sc.id).trim(),
          String(sc.schedule_id).trim(),
          String(sc.subject).trim(),
          String(sc.units).trim(),
          Number(sc.sort_order ?? i + 1)
        )
      );
    }

    // 6. トランザクション一括実行 (D1 batch)
    console.log(
      `${LOG} Executing batch: schedules=${rawSchedules.length}, venues=${rawVenues.length}, timetables=${rawTimetables.length}, scopes=${rawScopes.length}, total_statements=${statements.length}`
    );

    // D1のバッチ制限（通常100〜128件程度）に備え、必要に応じてチャンク分割実行
    const CHUNK_SIZE = 100;
    for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
      const chunk = statements.slice(i, i + CHUNK_SIZE);
      await env.DB.batch(chunk);
    }

    console.log(`${LOG} Sync completed successfully`);

    return jsonResponse({
      success: true,
      message: "Exam guides synced successfully",
      syncedCounts: {
        schedules: rawSchedules.length,
        venues: rawVenues.length,
        timetables: rawTimetables.length,
        scopes: rawScopes.length,
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
