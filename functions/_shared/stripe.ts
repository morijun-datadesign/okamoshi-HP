/**
 * Stripe API 共通クライアント
 */

export const fetchCheckoutSession = async (
  sessionId: string,
  secretKey: string,
  logPrefix = "[stripe]"
): Promise<Record<string, any> | null> => {
  if (!sessionId || !secretKey) return null;
  const url = `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items&expand[]=payment_intent`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const data = (await res.json()) as Record<string, any>;
    if (!res.ok) {
      console.error(`${logPrefix} Failed to retrieve session ${sessionId}: HTTP ${res.status}`, JSON.stringify(data));
      return null;
    }
    return data;
  } catch (err) {
    console.error(`${logPrefix} Session fetch exception ${sessionId}:`, err);
    return null;
  }
};

export const fetchPaymentIntent = async (
  paymentIntentId: string,
  secretKey: string,
  logPrefix = "[stripe]"
): Promise<Record<string, any> | null> => {
  if (!paymentIntentId || !secretKey) return null;
  const url = `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const data = (await res.json()) as Record<string, any>;
    if (!res.ok) {
      console.error(`${logPrefix} Failed to retrieve payment_intent ${paymentIntentId}: HTTP ${res.status}`, JSON.stringify(data));
      return null;
    }
    return data;
  } catch (err) {
    console.error(`${logPrefix} PaymentIntent fetch exception ${paymentIntentId}:`, err);
    return null;
  }
};

/**
 * Stripe Webhook 署名（Stripe-Signature）を Web Crypto API (HMAC-SHA256) で検証する。
 * リプレイ攻撃防止（許容時間差: デフォルト300秒）およびタイミング攻撃対策（定時間比較）を実装。
 */
export const verifyStripeWebhookSignature = async (
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  toleranceSec = 300
): Promise<{ valid: boolean; error?: string }> => {
  if (!signatureHeader) {
    return { valid: false, error: "Missing stripe-signature header" };
  }
  if (!webhookSecret) {
    return { valid: false, error: "Missing webhookSecret" };
  }

  // 1. t と v1 を抽出
  const parts = signatureHeader.split(",");
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of parts) {
    const [k, v] = part.trim().split("=");
    if (k === "t") timestamp = v;
    if (k === "v1") signatures.push(v);
  }

  if (!timestamp || signatures.length === 0) {
    return { valid: false, error: "Invalid stripe-signature header format" };
  }

  // 2. タイムスタンプの検証（リプレイ攻撃防止）
  const eventTime = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Number.isNaN(eventTime) || Math.abs(now - eventTime) > toleranceSec) {
    return { valid: false, error: "Webhook timestamp outside tolerance zone" };
  }

  // 3. HMAC-SHA256 の計算
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signedPayload = `${timestamp}.${rawBody}`;
    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );

    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // 4. 定数時間比較（Timing Attack 対策）
    const isValid = signatures.some((sig) => {
      if (sig.length !== expectedSignature.length) return false;
      let mismatch = 0;
      for (let i = 0; i < sig.length; i++) {
        mismatch |= sig.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
      }
      return mismatch === 0;
    });

    return isValid ? { valid: true } : { valid: false, error: "Signature mismatch" };
  } catch (err) {
    return { valid: false, error: `Signature verification exception: ${err}` };
  }
};
