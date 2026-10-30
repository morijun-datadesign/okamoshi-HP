import { Env, readEnv } from "../_shared/env";
import { jsonResponse, errorResponse } from "../_shared/http";

const LOG = "[functions/api/news-preview]";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id")?.trim();
    const draftKey = url.searchParams.get("draftKey")?.trim();

    if (!id) {
      return errorResponse("記事ID（id）が指定されていません。", 400);
    }

    const apiKey = readEnv(context.env, "MICROCMS_API_KEY");
    const serviceDomain = readEnv(context.env, "MICROCMS_SERVICE_DOMAIN", "okamoshi-blog");
    const endpoint = readEnv(context.env, "MICROCMS_ENDPOINT", "blogs");

    if (!apiKey) {
      console.error(`${LOG} MICROCMS_API_KEY is not configured.`);
      return errorResponse("サーバー側の microCMS APIキーが設定されていません。", 500);
    }

    // microCMS API URL 構築
    let microcmsUrl = `https://${serviceDomain}.microcms.io/api/v1/${endpoint}/${encodeURIComponent(id)}`;
    if (draftKey) {
      microcmsUrl += `?draftKey=${encodeURIComponent(draftKey)}`;
    }

    console.log(`${LOG} Fetching preview from microCMS: id=${id} hasDraftKey=${!!draftKey}`);

    const res = await fetch(microcmsUrl, {
      method: "GET",
      headers: {
        "X-MICROCMS-API-KEY": apiKey,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`${LOG} microCMS API error (${res.status}):`, errText);
      return errorResponse(
        res.status === 404
          ? "指定された記事が見つかりませんでした。IDまたは下書きキー（draftKey）を確認してください。"
          : `microCMS APIエラー (${res.status}): ${errText}`,
        res.status
      );
    }

    const data = await res.json();

    // プレビュー画面用に常に最新状態を返すため、キャッシュを無効化
    return jsonResponse(data, 200, {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    });
  } catch (err: any) {
    console.error(`${LOG} Unhandled exception:`, err);
    return errorResponse(`プレビューデータ取得処理で内部エラーが発生しました: ${err?.message || err}`, 500);
  }
};
