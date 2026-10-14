/**
 * Cloudflare Pages Functions 共通環境変数・定数定義
 */

export interface Env {
  // Cloudflare D1 データベース（マスターデータ: 郵便番号 / 学校）
  DB?: D1Database;

  // メール送信用 Resend APIキー（※セキュリティのためハードコード禁止）
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  ADMIN_EMAIL?: string;
  ORG_ADMIN_EMAIL?: string;
  ADMIN_EMAIL_ORG?: string;
  CHUO_KYOIKU_EMAIL?: string;

  // Cloudflare Turnstile
  TURNSTILE_SECRET_KEY?: string;

  // Stripe
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;

  // Google Apps Script (申込受付台帳)
  GAS_APPLY_URL?: string;
  GAS_SHARED_SECRET?: string;
}

export const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwYljLEwbfFCQWx-c6JneJUDINYbhYl0_M1-e9CwhBskBvRBEdIuwNotYceCg5i6M9z/exec";

export const DEFAULT_FROM_EMAIL = "岡山県統一模擬試験 <info@okayama-moshi.com>";
export const DEFAULT_ADMIN_EMAIL = "info@okayama-moshi.com";

/**
 * 環境変数を安全に取得するヘルパー（未定義の場合は空文字列またはフォールバック）
 */
export const readEnv = (env: Env | undefined, key: keyof Env, fallback = ""): string => {
  if (!env) return fallback;
  const val = env[key];
  if (typeof val === "string" && val.trim() !== "") {
    return val.trim();
  }
  return fallback;
};
