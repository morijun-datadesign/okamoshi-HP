/**
 * Resend API メール送信共通モジュール
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

export const sendResendEmail = async (
  apiKey: string,
  payload: ResendMailPayload,
  logPrefix = "[resend]"
): Promise<SendMailResult> => {
  if (!apiKey) {
    console.error(`${logPrefix} [CRITICAL] RESEND_API_KEY is not configured; cannot send email.`);
    return { ok: false, status: 500, error: "RESEND_API_KEY is not configured" };
  }

  const toList = Array.isArray(payload.to) ? payload.to.join(", ") : payload.to;
  console.log(`${logPrefix} Attempting email delivery: to=[${toList}], from=[${payload.from}], subject=[${payload.subject}]`);

  try {
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
    console.error(`${logPrefix} [EXCEPTION] Email sending threw exception:`, err);
    return {
      ok: false,
      status: 500,
      error: err?.message || "Internal error during email sending",
    };
  }
};
