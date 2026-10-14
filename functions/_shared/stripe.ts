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
