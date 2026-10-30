import { Env, readEnv } from "../_shared/env";
import { jsonResponse, errorResponse } from "../_shared/http";

const LOG = "[functions/api/news-preview]";

// フォールバック用 microCMS 設定（環境変数が未設定の場合でも動作を保証）
const DEFAULT_MICROCMS_API_KEY = "4qO3xGjs5W1r7zolbBgAX2KXP8VEUooOpMtc";
const DEFAULT_MICROCMS_SERVICE_DOMAIN = "okamoshi-blog";
const DEFAULT_MICROCMS_ENDPOINT = "blogs";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id")?.trim() || "";
    const rawDraftKey = url.searchParams.get("draftKey");
    const draftKey = typeof rawDraftKey === "string" ? rawDraftKey.trim() : "";

    if (!id) {
      return errorResponse("記事ID（id）が指定されていません。", 400);
    }

    const apiKey = readEnv(context.env, "MICROCMS_API_KEY") || DEFAULT_MICROCMS_API_KEY;
    const serviceDomain = readEnv(context.env, "MICROCMS_SERVICE_DOMAIN") || DEFAULT_MICROCMS_SERVICE_DOMAIN;
    const endpoint = readEnv(context.env, "MICROCMS_ENDPOINT") || DEFAULT_MICROCMS_ENDPOINT;

    // microCMS API URL 構築（draftKeyが空文字でない実在文字列の場合のみクエリ付与）
    let microcmsUrl = `https://${serviceDomain}.microcms.io/api/v1/${endpoint}/${encodeURIComponent(id)}`;
    if (draftKey.length > 0) {
      microcmsUrl += `?draftKey=${encodeURIComponent(draftKey)}`;
    }

    console.log(`${LOG} Fetching preview from microCMS: id=${id} hasDraftKey=${draftKey.length > 0} url=${microcmsUrl}`);

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
          ? `記事が見つかりませんでした (ID: ${id})。IDまたは下書きキー（draftKey）を確認してください。`
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
      "Access-Control-Allow-Origin": "*",
    });
  } catch (err: any) {
    console.error(`${LOG} Unhandled exception:`, err);
    return errorResponse(`プレビューデータ取得処理で内部エラーが発生しました: ${err?.message || err}`, 500);
  }
};
