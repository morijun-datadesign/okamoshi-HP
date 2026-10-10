/**
 * GET /api/schools?q=東山&type=junior
 *
 * 全国の小・中学校（文科省 学校コード準拠）を部分一致検索する。
 *   q    : キーワード（必須・空白区切りで AND 検索、最大3語）
 *   type : 任意。junior = 中学校/義務教育学校/中等教育学校、elementary = 小学校/義務教育学校
 *
 *   200: { results: [{ code, name, type, prefecture, label }] }   ※ label = "学校名 (都道府県名)"
 *
 * 【ソート要件】地元受検生が最速で選べるよう「岡山県」の学校を常に最上位に並べる。
 */
interface Env {
  DB: D1Database;
}

interface SchoolRow {
  school_code: string;
  school_name: string;
  school_type: string;
  prefecture: string;
}

const MAX_RESULTS = 15;
const MAX_TERMS = 3;
const MAX_QUERY_LENGTH = 40;

const TYPE_FILTERS: Record<string, string[]> = {
  junior: ["中学校", "義務教育学校", "中等教育学校"],
  elementary: ["小学校", "義務教育学校"],
};

const json = (body: unknown, status: number, cacheControl: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });

/**
 * 文科省データの学校名は英数字が全角（例: 「第１中学校」）のため、
 * 入力の半角英数字を全角に揃える。
 */
const normalizeTerm = (s: string): string =>
  s.replace(/[0-9A-Za-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  const rawQuery = (url.searchParams.get("q") || "").slice(0, MAX_QUERY_LENGTH);
  const terms = rawQuery
    .split(/[\s\u3000]+/)
    .map((t) => normalizeTerm(t.trim()))
    .filter(Boolean)
    .slice(0, MAX_TERMS);

  if (terms.length === 0) {
    return json({ results: [] }, 200, "public, max-age=3600");
  }
  if (!env.DB) {
    return json({ error: "db_not_bound" }, 503, "no-store");
  }

  const isAll =
    url.searchParams.get("all") === "true" ||
    url.searchParams.get("all") === "1" ||
    url.searchParams.get("pref") === "all" ||
    url.searchParams.get("scope") === "all";

  const prefParam = url.searchParams.get("pref");
  // all 指定がなければ、指定された都道府県（デフォルトは「岡山県」）で絞り込み
  const targetPref = isAll ? null : (prefParam && prefParam !== "all" ? prefParam : "岡山県");

  const typeFilter = TYPE_FILTERS[url.searchParams.get("type") || ""] || null;

  const where: string[] = [];
  const binds: string[] = [];
  for (const term of terms) {
    binds.push(`%${escapeLike(term)}%`);
    where.push(`school_name LIKE ?${binds.length} ESCAPE '\\'`);
  }
  if (typeFilter) {
    const placeholders = typeFilter.map((t) => {
      binds.push(t);
      return `?${binds.length}`;
    });
    where.push(`school_type IN (${placeholders.join(", ")})`);
  }
  if (targetPref) {
    binds.push(targetPref);
    where.push(`prefecture = ?${binds.length}`);
  }

  const sql = `
    SELECT school_code, school_name, school_type, prefecture
    FROM schools
    WHERE ${where.join(" AND ")}
    ORDER BY CASE WHEN prefecture = '岡山県' THEN 0 ELSE 1 END, school_name ASC
    LIMIT ${MAX_RESULTS}`;

  try {
    const { results } = await env.DB.prepare(sql).bind(...binds).all<SchoolRow>();
    return json(
      {
        scope: targetPref ? "pref" : "all",
        pref: targetPref || "all",
        results: (results || []).map((r) => ({
          code: r.school_code,
          name: r.school_name,
          type: r.school_type,
          prefecture: r.prefecture,
          label: `${r.school_name} (${r.prefecture})`,
        })),
      },
      200,
      "public, max-age=3600, s-maxage=86400",
    );
  } catch (err) {
    console.error("[api/schools] D1 query failed:", err);
    return json({ error: "internal_error" }, 500, "no-store");
  }
};
