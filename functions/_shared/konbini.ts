/**
 * コンビニ決済共通ユーティリティ
 */

export interface KonbiniInfo {
  customerNumber: string;
  confirmationNumber: string;
  voucherUrl: string;
  expiresAt: string;
}

export const EMPTY_KONBINI: KonbiniInfo = {
  customerNumber: "",
  confirmationNumber: "",
  voucherUrl: "",
  expiresAt: "",
};

export const KONBINI_STORE_LABELS: Record<string, string> = {
  familymart: "ファミリーマート",
  lawson: "ローソン",
  ministop: "ミニストップ",
  seicomart: "セイコーマート",
};

export const formatJst = (date: Date): string =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date).replace(/\//g, "-");

export const joinStoreValues = (stores: Record<string, any>, field: "payment_code" | "confirmation_number"): string => {
  const byValue = new Map<string, string[]>();
  for (const [store, info] of Object.entries(stores || {})) {
    const value = String(info?.[field] || "").trim();
    if (!value) continue;
    const label = KONBINI_STORE_LABELS[store] || store;
    byValue.set(value, [...(byValue.get(value) || []), label]);
  }
  if (byValue.size === 0) return "";
  if (byValue.size === 1) return [...byValue.keys()][0];
  return [...byValue.entries()].map(([value, labels]) => `${labels.join("・")}: ${value}`).join(" / ");
};

/** PaymentIntent.next_action.konbini_display_details からお客様番号・確認番号・払込票URL・支払期限を抽出 */
export const extractKonbiniInfo = (paymentIntent: Record<string, any> | null): KonbiniInfo => {
  try {
    const details = paymentIntent?.next_action?.konbini_display_details;
    if (!details) return { ...EMPTY_KONBINI };
    const stores = details.stores || {};
    const expiresAtSec = Number(details.expires_at);
    return {
      customerNumber: joinStoreValues(stores, "payment_code"),
      confirmationNumber: joinStoreValues(stores, "confirmation_number"),
      voucherUrl: String(details.hosted_voucher_url || ""),
      expiresAt: Number.isFinite(expiresAtSec) && expiresAtSec > 0 ? formatJst(new Date(expiresAtSec * 1000)) : "",
    };
  } catch (err) {
    console.warn("[konbini] Failed to extract konbini info from paymentIntent:", err);
    return { ...EMPTY_KONBINI };
  }
};
