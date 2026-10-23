/**
 * GET /api/cram-schools
 *
 * Cloudflare D1 (okamoshi-master) の cram_schools テーブルから
 * 実施塾・教室一覧データを取得する。
 *
 * クエリパラメータ (任意):
 *   - area: 学区ID (okayama-east, kurashiki, mimasaka, seibi) で絞り込み
 *
 * レスポンス (200):
 *   {
 *     success: true,
 *     total: 119,
 *     districts: { [area_id]: { name, count, schools: [...] } },
 *     schools: [
 *       { id, display_order, area_id, area_name, name, website_url, phone_number },
 *       ...
 *     ]
 *   }
 */
import { Env } from "../_shared/env";
import { jsonResponse } from "../_shared/http";

interface CramSchoolRow {
  id: number;
  display_order: number;
  area_id: string;
  area_name: string;
  name: string;
  website_url: string | null;
  phone_number: string | null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.DB) {
    console.error("[api/cram-schools] D1 database (DB) is not bound");
    return jsonResponse(
      { success: false, error: "Database not bound", schools: [] },
      503
    );
  }

  try {
    const url = new URL(request.url);
    const targetArea = (url.searchParams.get("area") || "").trim();

    let query = `
      SELECT id, display_order, area_id, area_name, name, website_url, phone_number
      FROM cram_schools
    `;
    const binds: any[] = [];

    if (targetArea) {
      query += ` WHERE area_id = ?1`;
      binds.push(targetArea);
    }

    query += ` ORDER BY display_order ASC;`;

    const stmt = binds.length > 0 ? env.DB.prepare(query).bind(...binds) : env.DB.prepare(query);
    const { results } = await stmt.all<CramSchoolRow>();

    const rows = results || [];

    // 学区ごとにグループ化
    const districts: Record<string, { name: string; count: number; schools: CramSchoolRow[] }> = {};
    for (const r of rows) {
      if (!districts[r.area_id]) {
        districts[r.area_id] = {
          name: r.area_name,
          count: 0,
          schools: [],
        };
      }
      districts[r.area_id].count++;
      districts[r.area_id].schools.push(r);
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: rows.length,
        districts,
        schools: rows,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          // CDNエッジで1分キャッシュ、更新時は max-age 経過後に即時リフレッシュ
          "Cache-Control": "public, max-age=60, s-maxage=60",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error: any) {
    console.error("[api/cram-schools] Error fetching cram schools:", error);
    return jsonResponse(
      {
        success: false,
        error: error?.message || "Internal Server Error",
        schools: [],
      },
      500
    );
  }
};
