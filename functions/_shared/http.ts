/**
 * HTTPレスポンス生成ユーティリティ
 */

export const jsonResponse = (data: unknown, status = 200, headers: Record<string, string> = {}): Response => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
};

export const errorResponse = (message: string, status = 500, extra: Record<string, unknown> = {}): Response => {
  return jsonResponse(
    {
      success: false,
      message,
      ...extra,
    },
    status
  );
};
