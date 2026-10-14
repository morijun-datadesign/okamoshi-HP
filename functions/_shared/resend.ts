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
    console.error(`${logPrefix} RESEND_API_KEY is not configured; cannot send email.`);
    return { ok: false, status: 500, error: "RESEND_API_KEY is not configured" };
  }

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
      console.error(`${logPrefix} Email delivery failed: HTTP ${res.status}`, JSON.stringify(data));
      return {
        ok: false,
        status: res.status,
        error: data.message || "Failed to send email",
      };
    }

    const mailId = typeof data.id === "string" ? data.id : undefined;
    console.log(`${logPrefix} Email sent successfully: ${mailId || "ok"}`);
    return { ok: true, id: mailId, status: res.status };
  } catch (err: any) {
    console.error(`${logPrefix} Email sending exception:`, err);
    return {
      ok: false,
      status: 500,
      error: err?.message || "Internal error during email sending",
    };
  }
};
