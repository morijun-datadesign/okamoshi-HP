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
  CONTACT_ADMIN_EMAILS?: string;

  // Cloudflare Turnstile
  TURNSTILE_SECRET_KEY?: string;

  // Stripe
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;

  // Google Apps Script (申込受付台帳)
  GAS_APPLY_URL?: string;
  GAS_SHARED_SECRET?: string;

  // 実施塾データ同期用シークレット
  CRAM_SCHOOLS_SYNC_SECRET?: string;

  // 模試日程・会場データ同期用シークレット
  EXAM_GUIDES_SYNC_SECRET?: string;

  // microCMS API（ブログプレビュー・記事取得用）
  MICROCMS_API_KEY?: string;
  MICROCMS_SERVICE_DOMAIN?: string;
  MICROCMS_ENDPOINT?: string;
}

// ※シークレット（Resend APIキー・同期シークレット・microCMS APIキー等）のソースコード直書きは禁止。
//   すべて Cloudflare Pages の環境変数（シークレット）でのみ設定する。品質ゲートで自動検出される。

export const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwYljLEwbfFCQWx-c6JneJUDINYbhYl0_M1-e9CwhBskBvRBEdIuwNotYceCg5i6M9z/exec";

export const DEFAULT_FROM_EMAIL = "岡山県統一模擬試験 <info@okayama-moshi.com>";
export const DEFAULT_ADMIN_EMAIL = "info@okayama-moshi.com";

/**
 * Resend API キーを取得（環境変数 RESEND_API_KEY / RESEND_KEY / RESEND_TOKEN）。未設定時は空文字（送信不可）
 */
export const getResendApiKey = (env: Env | undefined): { key: string; source: string } => {
  if (!env) return { key: "", source: "missing" };
  const anyEnv = env as Record<string, any>;
  const envKey = anyEnv.RESEND_API_KEY || anyEnv.RESEND_KEY || anyEnv.RESEND_TOKEN;
  if (typeof envKey === "string" && envKey.trim() !== "") {
    return { key: envKey.trim(), source: "env" };
  }
  console.error("[env] RESEND_API_KEY is not configured.");
  return { key: "", source: "missing" };
};

/**
 * 送信元（From）アドレスを取得（環境変数 RESEND_FROM_EMAIL / FROM_EMAIL を最優先）
 */
export const getFromEmail = (env: Env | undefined): string => {
  if (!env) return DEFAULT_FROM_EMAIL;
  const anyEnv = env as Record<string, any>;
  const val = anyEnv.RESEND_FROM_EMAIL || anyEnv.FROM_EMAIL;
  return typeof val === "string" && val.trim() !== "" ? val.trim() : DEFAULT_FROM_EMAIL;
};

/**
 * 管理者通知先（Admin）メールアドレスを取得（ADMIN_EMAIL / ADMIN_NOTIFICATION_EMAIL / JOURNAL_EMAIL 等）
 */
export const getAdminEmail = (env: Env | undefined): string => {
  if (!env) return DEFAULT_ADMIN_EMAIL;
  const anyEnv = env as Record<string, any>;
  const val =
    anyEnv.ADMIN_EMAIL ||
    anyEnv.ADMIN_NOTIFICATION_EMAIL ||
    anyEnv.JOURNAL_EMAIL ||
    anyEnv.NOTIFICATION_EMAIL ||
    anyEnv.ORG_ADMIN_EMAIL ||
    anyEnv.ADMIN_EMAIL_ORG;
  return typeof val === "string" && val.trim() !== "" ? val.trim() : DEFAULT_ADMIN_EMAIL;
};

/**
 * お問い合わせ通知（管理者宛て）の宛先メールアドレス一覧を取得
 * - Cloudflare Pages 環境変数 CONTACT_ADMIN_EMAILS (カンマ区切り) から取得
 * - 複数アドレス指定時は配列に分割してトリム
 * - 未設定・空文字列の場合は DEFAULT_ADMIN_EMAIL ("info@okayama-moshi.com") をフォールバック
 */
export const getContactAdminEmails = (env: Env | undefined): string[] => {
  if (!env) return [DEFAULT_ADMIN_EMAIL];
  const anyEnv = env as Record<string, any>;
  const raw = anyEnv.CONTACT_ADMIN_EMAILS || anyEnv.CONTACT_ADMIN_EMAIL;
  if (typeof raw === "string" && raw.trim() !== "") {
    const list = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.includes("@"));
    if (list.length > 0) {
      return list;
    }
  }
  return [DEFAULT_ADMIN_EMAIL];
};

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
