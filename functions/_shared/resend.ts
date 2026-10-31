/**
 * Resend API メール送信共通モジュール
 * - 同一リクエスト内での連続送信（管理者宛＋本人宛の2通送信）における Resend レート制限（秒間2リクエスト）回避のため、
 *   連続送信時の自動インターバル制御（600ms）＋ HTTP 429 / 5xx 時の自動リトライ（最大3回）を標準搭載。
 */

export interface ResendMailPayload {
  from: string;
  to: string | string[];
  reply_to?: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface SendMailResult {
  ok: boolean;
  id?: string;
  status: number;
  error?: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let lastSendTimestamp = 0;
const MIN_INTERVAL_MS = 600;

export const sendResendEmail = async (
  apiKey: string,
  payload: ResendMailPayload,
  logPrefix = "[resend]"
): Promise<SendMailResult> => {
  if (!apiKey) {
    console.error(`${logPrefix} [CRITICAL] RESEND_API_KEY is not configured; cannot send email.`);
    return { ok: false, status: 500, error: "RESEND_API_KEY is not configured" };
  }

  // 連続送信時のレート制限（2 req/sec）回避インターバル
  const elapsed = Date.now() - lastSendTimestamp;
  if (lastSendTimestamp > 0 && elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }

  const toList = Array.isArray(payload.to) ? payload.to.join(", ") : payload.to;
  console.log(`${logPrefix} Attempting email delivery: to=[${toList}], from=[${payload.from}], subject=[${payload.subject}]`);

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      lastSendTimestamp = Date.now();
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as Record<string, any>;

      if (!res.ok) {
        const errDetail = data.message || (typeof data === "object" ? JSON.stringify(data) : String(data));

        // レート制限 (429) または一時的サーバーエラー (5xx) の場合は待機してリトライ
        if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
          const waitMs = 800 * attempt;
          console.warn(
            `${logPrefix} [RETRY ${attempt}/${maxAttempts}] HTTP ${res.status} (${errDetail}). Retrying in ${waitMs}ms...`
          );
          await sleep(waitMs);
          continue;
        }

        console.error(`${logPrefix} [ERROR] Email delivery failed: HTTP ${res.status}`, JSON.stringify(data));

        // ドメイン未認証エラーの場合の特別な警告
        if (res.status === 403 && String(errDetail).includes("domain is not verified")) {
          console.error(`${logPrefix} [DOMAIN_UNVERIFIED] The domain in '${payload.from}' is not verified in Resend!`);
          console.error(`${logPrefix} Action required: Add and verify the domain at https://resend.com/domains or set RESEND_FROM_EMAIL to a verified address.`);
        }

        return {
          ok: false,
          status: res.status,
          error: errDetail || "Failed to send email",
        };
      }

      const mailId = typeof data.id === "string" ? data.id : undefined;
      console.log(`${logPrefix} [SUCCESS] Email sent successfully: id=${mailId || "ok"} to=[${toList}]`);
      return { ok: true, id: mailId, status: res.status };
    } catch (err: any) {
      if (attempt < maxAttempts) {
        const waitMs = 800 * attempt;
        console.warn(`${logPrefix} [RETRY ${attempt}/${maxAttempts}] Exception (${err?.message}). Retrying in ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }
      console.error(`${logPrefix} [EXCEPTION] Email sending threw exception:`, err);
      return {
        ok: false,
        status: 500,
        error: err?.message || "Internal error during email sending",
      };
    }
  }

  return { ok: false, status: 500, error: "Exhausted retry attempts" };
};
