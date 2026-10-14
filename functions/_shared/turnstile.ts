/**
 * Cloudflare Turnstile トークン検証共通モジュール
 */

export interface TurnstileVerifyResult {
  success: boolean;
  error?: string;
}

export const verifyTurnstile = async (
  request: Request,
  body: Record<string, any>,
  secretKey: string
): Promise<TurnstileVerifyResult> => {
  // シークレットキーが未設定の場合は安全のため検証スキップ（開発環境・設定漏れ警告）
  if (!secretKey) {
    console.warn("[turnstile] TURNSTILE_SECRET_KEY is not configured; skipping verification.");
    return { success: true };
  }

  const token =
    body["cf-turnstile-response"] ||
    body.turnstileToken ||
    body.turnstile_token ||
    "";

  if (!token) {
    return {
      success: false,
      error: "セキュリティ認証（Turnstile）が完了していません。もう一度お試しください。",
    };
  }

  try {
    const remoteIp = request.headers.get("CF-Connecting-IP") || "";
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", String(token));
    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      console.error("[turnstile] Siteverify HTTP error:", res.status);
      return {
        success: false,
        error: "セキュリティ認証サービスとの通信に失敗しました。",
      };
    }

    const outcome = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    if (!outcome.success) {
      console.warn("[turnstile] Verification failed:", outcome["error-codes"]);
      return {
        success: false,
        error: "セキュリティ認証の検証に失敗しました。ページを再読み込みしてお試しください。",
      };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[turnstile] Verification exception:", err);
    return {
      success: false,
      error: "セキュリティ認証の通信中にエラーが発生しました。",
    };
  }
};
