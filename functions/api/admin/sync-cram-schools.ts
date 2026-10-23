/**
 * POST /api/admin/sync-cram-schools
 *
 * スプレッドシート (GAS) から送信された実施塾一覧データを受け取り、
 * Cloudflare D1 (cram_schools) テーブルを全件洗い替え (同期) する。
 *
 * 認証:
 *   ヘッダー: `x-sync-secret` または `Authorization: Bearer <secret>`
 *   (環境変数 CRAM_SCHOOLS_SYNC_SECRET または DEFAULT_CRAM_SCHOOLS_SYNC_SECRET と照合)
 *
 * リクエストボディ (以下のいずれの形式にも対応):
 *   形式 1 (オブジェクト配列):
 *     {
 *       "schools": [
 *         {
 *           "display_order": 1,
 *           "area_id": "okayama-east",
 *           "area_name": "岡山・東備学区",
 *           "name": "R.studyroom",
 *           "website_url": "http://rstudyroom.com/",
 *           "phone_number": "080-3890-7171"
 *         }
 *       ]
 *     }
 *
 *   形式 2 (スプレッドシートの2次元配列):
 *     {
 *       "rows": [
 *         ["okayama-east", "岡山・東備学区", "R.studyroom", "http://rstudyroom.com/", "080-3890-7171", 1]
 *       ]
 *     }
 */
import {
  Env,
  readEnv,
  DEFAULT_CRAM_SCHOOLS_SYNC_SECRET,
} from "../../_shared/env";
import { jsonResponse } from "../../_shared/http";

interface IncomingSchool {
  display_order: number;
  area_id: string;
  area_name: string;
  name: string;
  website_url?: string | null;
  phone_number?: string | null;
}

const LOG = "[api/admin/sync-cram-schools]";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // 1. 認証チェック
  const expectedSecret =
    readEnv(env, "CRAM_SCHOOLS_SYNC_SECRET") ||
    (env as any)?.SYNC_SECRET ||
    DEFAULT_CRAM_SCHOOLS_SYNC_SECRET;

  const headerSecret =
    request.headers.get("x-sync-secret") ||
    request.headers.get("X-Sync-Secret") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

  let body: Record<string, any> = {};
  try {
    body = (await request.json()) as Record<string, any>;
  } catch (parseErr) {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const clientSecret = headerSecret || body.secret || "";

  if (!clientSecret || clientSecret !== expectedSecret) {
    console.warn(`${LOG} Unauthorized access attempt`);
    return jsonResponse({ success: false, error: "Unauthorized: Invalid secret key" }, 401);
  }

  if (!env.DB) {
    console.error(`${LOG} D1 database is not bound`);
    return jsonResponse({ success: false, error: "Database not bound" }, 503);
  }

  // 2. データの正規化
  const incomingList: IncomingSchool[] = [];

  // パターン A: body.schools (オブジェクト配列)
  if (Array.isArray(body.schools)) {
    for (let i = 0; i < body.schools.length; i++) {
      const s = body.schools[i];
      if (!s || typeof s !== "object") continue;
      const name = String(s.name || s.school_name || "").trim();
      if (!name) continue;

      incomingList.push({
        display_order: Number(s.display_order ?? s.order ?? i + 1),
        area_id: String(s.area_id || s.area || "okayama-east").trim(),
        area_name: String(s.area_name || "").trim() || "岡山・東備学区",
        name: name,
        website_url: s.website_url ? String(s.website_url).trim() : null,
        phone_number: s.phone_number ? String(s.phone_number).trim() : null,
      });
    }
  }
  // パターン B: body.rows または body.values (2次元配列)
  else if (Array.isArray(body.rows) || Array.isArray(body.values)) {
    const rawRows: any[][] = body.rows || body.values;
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!Array.isArray(row) || row.length < 3) continue;

      // ヘッダー行判定 (1行目が "学区ID" 等の場合はスキップ)
      const col0 = String(row[0] || "").trim();
      if (col0 === "学区ID" || col0 === "area_id" || col0.toLowerCase() === "area") {
        continue;
      }

      // カラム構成: [学区ID, 学区名, 塾・教室名, 公式サイトURL, 電話番号, 表示順]
      const areaId = String(row[0] || "okayama-east").trim();
      const areaName = String(row[1] || "").trim();
      const name = String(row[2] || "").trim();
      const url = String(row[3] || "").trim();
      const tel = String(row[4] || "").trim();
      const order = Number(row[5]) || incomingList.length + 1;

      if (!name) continue;

      incomingList.push({
        display_order: order,
        area_id: areaId,
        area_name: areaName || "岡山・東備学区",
        name: name,
        website_url: url ? url : null,
        phone_number: tel ? tel : null,
      });
    }
  }

  if (incomingList.length === 0) {
    return jsonResponse(
      {
        success: false,
        error: "No valid school data found in request payload. Expected 'schools' or 'rows' array.",
      },
      400
    );
  }

  // 表示順でソート
  incomingList.sort((a, b) => a.display_order - b.display_order);

  console.log(`${LOG} Starting sync transaction for ${incomingList.length} cram schools...`);

  // 3. D1 への反映 (全件洗い替えトランザクション)
  try {
    // A. 既存データ全削除
    await env.DB.prepare("DELETE FROM cram_schools;").run();

    // B. チャンク分割して一括 INSERT (50件ずつバッチ実行)
    const CHUNK_SIZE = 50;
    let insertedCount = 0;

    for (let i = 0; i < incomingList.length; i += CHUNK_SIZE) {
      const chunk = incomingList.slice(i, i + CHUNK_SIZE);
      const statements = chunk.map((item) =>
        env.DB!.prepare(
          `INSERT INTO cram_schools (display_order, area_id, area_name, name, website_url, phone_number)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6);`
        ).bind(
          item.display_order,
          item.area_id,
          item.area_name,
          item.name,
          item.website_url || null,
          item.phone_number || null
        )
      );

      await env.DB.batch(statements);
      insertedCount += chunk.length;
    }

    // C. 投入結果の件数検証
    const countRes = await env.DB.prepare("SELECT count(*) AS total FROM cram_schools;").first<{ total: number }>();
    const totalInDb = countRes?.total ?? insertedCount;

    console.log(`${LOG} Sync finished successfully. Total in D1: ${totalInDb}`);

    return jsonResponse({
      success: true,
      message: `Successfully synchronized ${totalInDb} cram schools to D1.`,
      synced_count: totalInDb,
      timestamp: new Date().toISOString(),
    });
  } catch (dbErr: any) {
    console.error(`${LOG} Database sync failed:`, dbErr);
    return jsonResponse(
      {
        success: false,
        error: `Database sync failed: ${dbErr?.message || String(dbErr)}`,
      },
      500
    );
  }
};
