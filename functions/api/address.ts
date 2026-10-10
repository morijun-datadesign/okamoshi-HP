/**
 * GET /api/address?zip=7000822  （ハイフン・全角数字も可: 700-0822 / ７００−０８２２）
 *
 * D1(zip_codes) から住所を1件返す超低遅延エンドポイント。
 *   200: { zip, prefecture, city, town }
 *   400: { error: "invalid_zip" }
 *   404: { error: "not_found" }
 *
 * 郵便番号→住所は日次で変わらないため、ブラウザ/エッジの双方で 1 日キャッシュする。
 */
interface Env {
  DB: D1Database;
}

interface ZipRow {
  prefecture: string;
  city: string;
  town: string;
}

const CACHE_OK = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";
const CACHE_MISS = "public, max-age=3600";

const json = (body: unknown, status: number, cacheControl: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });

const normalizeZip = (raw: string | null): string =>
  String(raw || "")
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, "");

/** 1つの郵便番号に複数町域がある場合は共通部分のみ返す（例: 「霞が関」） */
const commonPrefix = (values: string[]): string => {
  if (values.length === 0) return "";
  let prefix = values[0];
  for (const v of values.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < v.length && prefix[i] === v[i]) i++;
    prefix = prefix.slice(0, i);
    if (!prefix) break;
  }
  return prefix;
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const zip = normalizeZip(url.searchParams.get("zip"));

  if (!/^\d{7}$/.test(zip)) {
    return json({ error: "invalid_zip" }, 400, "no-store");
  }

  // エッジキャッシュ（カスタムドメインで有効。*.pages.dev では no-op）
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  const cacheKey = new Request(`${url.origin}/api/address?zip=${zip}`, { method: "GET" });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  if (!env.DB) {
    return json({ error: "db_not_bound" }, 503, "no-store");
  }

  let response: Response;
  try {
    const { results } = await env.DB
      .prepare("SELECT prefecture, city, town FROM zip_codes WHERE zip_code = ?1 LIMIT 20")
      .bind(zip)
      .all<ZipRow>();

    if (!results || results.length === 0) {
      response = json({ error: "not_found" }, 404, CACHE_MISS);
    } else {
      const first = results[0];
      const sameArea = results.filter((r) => r.prefecture === first.prefecture && r.city === first.city);
      const towns = [...new Set(sameArea.map((r) => r.town))];
      response = json(
        {
          zip,
          prefecture: first.prefecture,
          city: first.city,
          town: towns.length === 1 ? towns[0] : commonPrefix(towns),
        },
        200,
        CACHE_OK,
      );
    }
  } catch (err) {
    console.error("[api/address] D1 query failed:", err);
    return json({ error: "internal_error" }, 500, "no-store");
  }

  if (cache) context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
