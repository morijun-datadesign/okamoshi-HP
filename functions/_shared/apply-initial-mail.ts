/**
 * 初回受付メール（申込者サンクス＋管理者通知）共通送信＆D1冪等性ロックモジュール
 *
 * - 完了画面（POST /api/apply）と Webhook（POST /api/stripe-webhook の checkout.session.completed）の
 *   双方から呼び出される唯一の初回メール送信経路。
 * - Cloudflare D1（apply_initial_emails テーブル）をアトミックロックおよび送信履歴台帳として使い、
 *   さらに Resend の Idempotency-Key ヘッダーを併用することで、
 *   「完了画面リロード」「両エンドポイントの同時着弾」「完了画面未到達」のいずれのケースでも
 *   同一 session_id に対して初回受付メールがシステム全体で必ず1回だけ送信されることを保証する。
 */
import {
  Env,
  readEnv,
  getResendApiKey,
  getFromEmail,
  getAdminEmail,
} from "./env";
import {
  ExamRecord,
  ExamType,
  recordsFromExams,
  recordsFromMetadata,
  detectExamType,
  getExamBrandTitle,
} from "./exam";
import { fetchPaymentIntent } from "./stripe";
import { sendResendEmail } from "./resend";
import { extractKonbiniInfo, KonbiniInfo, EMPTY_KONBINI, formatJst } from "./konbini";

export type InitialMailSource = "apply_api" | "stripe_webhook";

export interface DispatchInitialMailInput {
  env: Env | undefined;
  sessionId: string;
  source: InitialMailSource;
  stripeSession: Record<string, any>;
  stripeSecretKey: string;
  fallbackBody?: Record<string, any>;
  preExtractedKonbini?: KonbiniInfo;
}

export interface InitialMailDispatchResult {
  alreadySent: boolean;
  inProgress: boolean;
  dispatchSource: string | null;
  adminMailId: string | null;
  applicantMailId: string | null;
  mailError: string | null;
  mailErrors?: { admin?: string; user?: string };
  skipReason: string | null;
  hasApiKey: boolean;
  apiKeyPrefix: string;
  fromEmail: string;
  adminEmail: string;
  applicantEmail: string;
  examType: ExamType;
  examName: string;
  examRecords: ExamRecord[];
  paymentStatus: string;
  paymentMethod: string;
  isUnpaidKonbini: boolean;
}

interface InitialEmailLockRow {
  session_id: string;
  status: string;
  source: string;
  admin_mail_id: string | null;
  applicant_mail_id: string | null;
  last_error: string | null;
  is_stale?: number;
}

const LOG = "[apply-initial-mail]";
const LOCK_STALE_SECONDS = 120;
const PROCESSING_POLL_COUNT = 2;
const PROCESSING_POLL_DELAY_MS = 1200;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const ensureLockTable = async (db: D1Database): Promise<void> => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS apply_initial_emails (
        session_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'processing',
        source TEXT NOT NULL DEFAULT '',
        payment_status TEXT NOT NULL DEFAULT '',
        payment_method TEXT NOT NULL DEFAULT '',
        applicant_email TEXT NOT NULL DEFAULT '',
        admin_mail_id TEXT,
        applicant_mail_id TEXT,
        last_error TEXT,
        attempts INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        sent_at TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_apply_initial_emails_status_updated ON apply_initial_emails(status, updated_at)`
    )
    .run();
};

const fetchLockRow = async (db: D1Database, sessionId: string): Promise<InitialEmailLockRow | null> => {
  const row = await db
    .prepare(
      `SELECT session_id, status, source, admin_mail_id, applicant_mail_id, last_error,
              CASE WHEN updated_at <= datetime('now', '-${LOCK_STALE_SECONDS} seconds') THEN 1 ELSE 0 END AS is_stale
       FROM apply_initial_emails
       WHERE session_id = ?`
    )
    .bind(sessionId)
    .first<InitialEmailLockRow>();
  return row || null;
};

const tryInsertLockRow = async (
  db: D1Database,
  sessionId: string,
  source: InitialMailSource,
  paymentStatus: string,
  paymentMethod: string,
  applicantEmail: string
): Promise<boolean> => {
  const stmt = `INSERT INTO apply_initial_emails (
      session_id, status, source, payment_status, payment_method, applicant_email, attempts, created_at, updated_at
    ) VALUES (?, 'processing', ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    ON CONFLICT(session_id) DO NOTHING`;

  try {
    const res = await db
      .prepare(stmt)
      .bind(sessionId, source, paymentStatus, paymentMethod, applicantEmail)
      .run();
    return Number(res?.meta?.changes || 0) === 1;
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    if (msg.toLowerCase().includes("no such table")) {
      await ensureLockTable(db);
      const retryRes = await db
        .prepare(stmt)
        .bind(sessionId, source, paymentStatus, paymentMethod, applicantEmail)
        .run();
      return Number(retryRes?.meta?.changes || 0) === 1;
    }
    throw err;
  }
};

const tryReacquireLockRow = async (
  db: D1Database,
  sessionId: string,
  source: InitialMailSource,
  paymentStatus: string,
  paymentMethod: string,
  applicantEmail: string
): Promise<boolean> => {
  const res = await db
    .prepare(
      `UPDATE apply_initial_emails
       SET status = 'processing',
           source = ?,
           payment_status = ?,
           payment_method = ?,
           applicant_email = ?,
           attempts = attempts + 1,
           updated_at = datetime('now')
       WHERE session_id = ?
         AND (status = 'failed' OR (status = 'processing' AND updated_at <= datetime('now', '-${LOCK_STALE_SECONDS} seconds')))`
    )
    .bind(source, paymentStatus, paymentMethod, applicantEmail, sessionId)
    .run();
  return Number(res?.meta?.changes || 0) === 1;
};

/**
 * Stripe セッション（および /api/apply からの補助ボディ）から、決定論的な申込データ・メール文面を正規化する
 */
const buildNormalizedPayload = async (input: DispatchInitialMailInput) => {
  const { stripeSession, stripeSecretKey, fallbackBody, preExtractedKonbini, sessionId } = input;
  const body = fallbackBody || {};
  const sessionMeta = (stripeSession?.metadata || {}) as Record<string, any>;
  const sessionCustomer = (stripeSession?.customer_details || {}) as Record<string, any>;

  // Stripe 側の metadata を Single Source of Truth として優先する（両経路で完全同一の文面を生成するため）
  const meta = {
    ...((body.metadata && typeof body.metadata === "object" ? body.metadata : {}) as Record<string, any>),
    ...sessionMeta,
  };

  // 受付日時は Stripe Session の created タイムスタンプを基準にして両経路で完全一致させる
  const createdSec = Number(stripeSession?.created);
  const receivedDate = Number.isFinite(createdSec) && createdSec > 0 ? new Date(createdSec * 1000) : new Date();
  const jstReceivedAt = formatJst(receivedDate);

  const studentFullName = String(
    meta.student_name || sessionCustomer.name || body.student_name || body.client_reference_id || ""
  ).trim();
  const studentKanaFullName = String(
    meta.student_kana ||
      meta.student_kana_name ||
      meta.kana ||
      body.student_kana ||
      body.student_kana_name ||
      body.kana ||
      ""
  ).trim();
  const gradeVal = String(
    meta.grade ||
      meta.student_grade_label ||
      meta.student_grade ||
      body.grade ||
      body.student_grade_label ||
      body.student_grade ||
      ""
  ).trim();
  const schoolVal = String(
    meta.school_name ||
      meta.student_school ||
      meta.school ||
      body.school_name ||
      body.student_school ||
      body.school ||
      ""
  ).trim();
  const parentFullName = String(
    meta.parent_name || meta.guardian_name || sessionCustomer.name || body.parent_name || body.guardian_name || ""
  ).trim();
  const parentKanaVal = String(meta.parent_kana || body.parent_kana || "").trim();
  const genderVal = String(meta.student_gender || body.student_gender || "").trim();
  const venueVal = String(
    meta.venue_name ||
      meta.venue ||
      body.venue_name ||
      body.venue ||
      body.venueName ||
      (Array.isArray(body.exams) && body.exams[0]?.venue_name) ||
      (Array.isArray(body.exams) && body.exams[0]?.venue) ||
      "会場未指定"
  ).trim();
  const amountVal = Number(
    stripeSession?.amount_total ||
      meta.amount ||
      meta.total_amount ||
      body.amount ||
      body.total_amount ||
      (Array.isArray(body.exams) && body.exams[0]?.price) ||
      0
  );
  const emailVal = String(
    sessionCustomer.email ||
      stripeSession?.customer_email ||
      meta.email ||
      body.email ||
      body.customer_email ||
      ""
  ).trim();
  const phoneVal = String(meta.phone || sessionCustomer.phone || body.phone || "").trim();
  const postalCodeVal = String(
    meta.postal_code || sessionCustomer.address?.postal_code || body.postal_code || ""
  ).trim();

  let prefVal = String(
    meta.pref || meta.prefecture || sessionCustomer.address?.state || body.prefecture || body.pref || ""
  ).trim();
  let cityVal = String(
    meta.city || sessionCustomer.address?.city || body.city || body.address_line1 || ""
  ).trim();
  let addr1Val = String(
    meta.addr1 || meta.address1 || sessionCustomer.address?.line1 || body.address1 || body.address_line2 || ""
  ).trim();
  const addr2Val = String(
    meta.addr2 || meta.address2 || sessionCustomer.address?.line2 || body.address2 || body.address_line3 || ""
  ).trim();

  if (!cityVal && (meta.address || body.address)) {
    const rawAddr = String(meta.address || body.address).trim();
    const pMatch = rawAddr.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)(.*)$/);
    if (pMatch) {
      if (!prefVal) prefVal = pMatch[1];
      const rest = pMatch[2].trim();
      const cMatch = rest.match(/^([^0-9]+?郡[^0-9]+?[町村]|[^0-9]+?市[^0-9]+?区|[^0-9]+?[市区町村])(.*)$/);
      if (cMatch) {
        cityVal = cMatch[1].trim();
        if (!addr1Val) addr1Val = cMatch[2].trim();
      }
    }
  }

  const fullAddress = String(
    meta.address || body.address || [prefVal, cityVal, addr1Val, addr2Val].filter(Boolean).join(" ")
  ).trim();
  const remarksVal = String(meta.remarks || body.remarks || "").trim().slice(0, 300);

  const paymentMethodVal = String(
    stripeSession?.payment_method_types?.[0] ||
      meta.payment_method ||
      body.payment_method ||
      body.selected_payment_method ||
      (body.raw_payment_method === "convenience_store" ? "konbini" : "card")
  ).trim();
  const paymentStatusVal = String(stripeSession?.payment_status || body.payment_status || "paid").trim();
  const isKonbini = paymentMethodVal === "konbini" || body.raw_payment_method === "convenience_store";
  const isUnpaidKonbini = isKonbini && paymentStatusVal === "unpaid";
  const paymentMethodLabel = isKonbini ? "コンビニ決済" : "クレジットカード決済";

  const examNameVal = String(
    meta.exam_name || body.exam_name || (Array.isArray(body.exams) && body.exams[0]?.title) || "岡山県統一模擬試験"
  ).trim();

  let examRecords = recordsFromMetadata(meta);
  if (examRecords.length === 0) examRecords = recordsFromExams(body.exams);
  if (examRecords.length === 0) {
    examRecords = [{ id: "", label: examNameVal, issue: "", title: examNameVal, venue: venueVal, price: amountVal, date: "" }];
  }

  const examType = detectExamType(
    examRecords,
    examNameVal,
    gradeVal,
    String(meta.exam_type || body.exam_type || "")
  );
  const examBrandTitle = getExamBrandTitle(examType);
  const subjectPrefix = examType === "tekisei" ? "【岡山県適性検査対策模試】" : "【岡山県統一模擬試験】";

  // コンビニ支払情報の取得（呼び出し元で未取得時のみ取得）
  let konbini: KonbiniInfo = preExtractedKonbini ? { ...preExtractedKonbini } : { ...EMPTY_KONBINI };
  if (isUnpaidKonbini && !konbini.voucherUrl && !konbini.customerNumber) {
    try {
      let paymentIntent: Record<string, any> | null =
        stripeSession?.payment_intent && typeof stripeSession.payment_intent === "object"
          ? stripeSession.payment_intent
          : null;
      if (!paymentIntent && typeof stripeSession?.payment_intent === "string" && stripeSecretKey) {
        paymentIntent = await fetchPaymentIntent(stripeSession.payment_intent, stripeSecretKey, LOG);
      }
      konbini = extractKonbiniInfo(paymentIntent);
    } catch (kErr) {
      console.warn(`${LOG} Failed to extract konbini info for ${sessionId}:`, kErr);
    }
  }

  const examsListText = examRecords
    .map((r) => `  ・${r.label}（${r.venue}） / ￥${r.price.toLocaleString()}${r.date ? ` / 試験日: ${r.date}` : ""}`)
    .join("\n");

  const konbiniAdminBlock = isUnpaidKonbini
    ? `
■ お客様番号: ${konbini.customerNumber || "取得できませんでした"}
■ 確認番号: ${konbini.confirmationNumber || "取得できませんでした"}
■ 払込票URL: ${konbini.voucherUrl || "取得できませんでした"}
■ 支払期限: ${konbini.expiresAt || "不明"}`
    : "";

  const konbiniUserBlock = isUnpaidKonbini
    ? `
【コンビニでのお支払いについて】
以下の内容で、お近くのコンビニエンスストアにてお支払いください。
■ お支払い期限: ${konbini.expiresAt || "払込票に記載の期限"}
${konbini.customerNumber ? `■ お客様番号: ${konbini.customerNumber}\n` : ""}${konbini.confirmationNumber ? `■ 確認番号: ${konbini.confirmationNumber}\n` : ""}${konbini.voucherUrl ? `■ 払込票（お支払い方法の詳細）: ${konbini.voucherUrl}\n` : ""}
期限までにお支払いが確認できない場合、お申し込みは自動キャンセルとなります。
お支払いの確認後、受付が確定いたします。
--------------------------------------------------
`
    : "";

  const adminSubject = isUnpaidKonbini
    ? `【個人申込受付・未入金（コンビニ）】${studentFullName || "生徒氏名未入力"} 様 (${gradeVal || "学年未入力"})：${examNameVal}`
    : `【個人申込受付】${studentFullName || "生徒氏名未入力"} 様 (${gradeVal || "学年未入力"})：${examNameVal}`;

  const adminText = `
【岡山県統一模擬試験 Webサイトより${isUnpaidKonbini ? "コンビニ決済の申込（未入金）" : "個人申し込み・決済完了"}がありました】
--------------------------------------------------
■ お申し込み模試:
${examsListText}
■ 合計金額: ￥${Number(amountVal).toLocaleString()} (税込)
■ 決済状況: ${isUnpaidKonbini ? "未入金（コンビニでのお支払い待ち）" : (paymentStatusVal === "paid" ? "決済完了 (paid)" : paymentStatusVal)}
■ 決済方法: ${paymentMethodLabel}
■ 決済セッションID: ${sessionId || "なし"}${konbiniAdminBlock}
--------------------------------------------------
【生徒情報】
■ 生徒氏名: ${studentFullName} (${studentKanaFullName || "未入力"})
■ 学年: ${gradeVal || "未入力"}
■ 在籍校: ${schoolVal || "未入力"}${genderVal ? `\n■ 性別: ${genderVal}` : ""}

【保護者・連絡先情報】
■ 保護者氏名: ${parentFullName || "未入力"}${parentKanaVal ? ` (${parentKanaVal})` : ""}
■ メールアドレス: ${emailVal || "未入力"}
■ 電話番号: ${phoneVal || "未入力"}
■ 郵便番号: 〒${postalCodeVal || "未入力"}
■ 住所: ${fullAddress || "未入力"}${remarksVal ? `\n■ 連絡事項・ご要望:\n${remarksVal}` : ""}
--------------------------------------------------
■ スプレッドシート連携 (GAS): Stripe Webhook により自動登録
受付日時: ${jstReceivedAt}
`.trim();

  const userSubject = isUnpaidKonbini
    ? `${subjectPrefix}お申し込みを受け付けました（コンビニ決済のお願い）`
    : `${subjectPrefix}お申し込みを受け付けました`;

  const userText = `
${parentFullName ? parentFullName + " 様\n（生徒様：" + (studentFullName || "生徒") + " 様）\n\n" : (studentFullName ? studentFullName + " 様\n\n" : "")}${examBrandTitle}へのお申し込み、誠にありがとうございます。
以下の内容でお申し込みおよび決済手続きを受け付けいたしました。

--------------------------------------------------
■ お申し込み模試:
${examsListText}
■ 合計金額: ￥${Number(amountVal).toLocaleString()} (税込)
■ 決済方法: ${paymentMethodLabel}
■ 決済状況: ${isUnpaidKonbini ? "お支払い待ち（コンビニでのお支払い後に確定）" : "お支払い完了"}
--------------------------------------------------
${konbiniUserBlock}
【ご登録内容】
■ 生徒氏名: ${studentFullName} 様
■ フリガナ: ${studentKanaFullName || ""}
■ 学年: ${gradeVal}
■ 学校名: ${schoolVal || "未入力"}
■ お届け先住所: 〒${postalCodeVal} ${fullAddress}
■ お電話番号: ${phoneVal}
■ メールアドレス: ${emailVal}${remarksVal ? `\n■ 連絡事項・ご要望:\n${remarksVal}` : ""}
--------------------------------------------------

【今後のスケジュール・受験票のお届け】
・会場受験：試験日の約1週間前に受験票をご自宅宛てにお届けします。
・自宅受験：試験日の約1週間前に問題冊子・解答用紙一式をご自宅宛てにお届けします。

※本メールは送信専用アドレスより自動配信されています。
ご不明な点がございましたら、お手数ですが下記お問い合わせ窓口までご連絡ください。

--------------------------------------------------
岡山県統一模擬試験実行委員会（中央教育研究所株式会社）
〒730-0013 広島県広島市中区八丁堀15番6号 広島ちゅうぎんビル3階
TEL : 082-227-3999（平日 10:00〜18:00）
MAIL: info@okayama-moshi.com
Web : https://okayama-moshi.com
--------------------------------------------------
`.trim();

  return {
    emailVal,
    paymentMethodVal,
    paymentStatusVal,
    isUnpaidKonbini,
    examNameVal,
    examRecords,
    examType,
    adminSubject,
    adminText,
    userSubject,
    userText,
  };
};

/**
 * 同一 session_id に対して初回受付メール（管理者通知＋申込者サンクス）を必ず1回だけ送信する。
 * D1 の原子ロック（apply_initial_emails）により、/api/apply と /api/stripe-webhook の競合・リロード・再送を完全排除する。
 */
export const dispatchInitialApplicationEmails = async (
  input: DispatchInitialMailInput
): Promise<InitialMailDispatchResult> => {
  const { env, sessionId, source } = input;
  const resendConfig = getResendApiKey(env);
  const apiKey = resendConfig.key;
  const hasApiKey = !!apiKey && apiKey.trim().length > 0;
  const apiKeyPrefix = hasApiKey ? apiKey.trim().slice(0, 5) : "";
  const fromEmail = getFromEmail(env);
  const adminEmail = getAdminEmail(env);

  const normalized = await buildNormalizedPayload(input);
  const {
    emailVal,
    paymentMethodVal,
    paymentStatusVal,
    isUnpaidKonbini,
    examNameVal,
    examRecords,
    examType,
    adminSubject,
    adminText,
    userSubject,
    userText,
  } = normalized;

  const baseMeta = {
    hasApiKey,
    apiKeyPrefix,
    fromEmail,
    adminEmail,
    applicantEmail: emailVal,
    examType,
    examName: examNameVal,
    examRecords,
    paymentStatus: paymentStatusVal,
    paymentMethod: paymentMethodVal,
    isUnpaidKonbini,
  };

  // 1. D1 アトミックロック獲得（未バインド/D1障害時はフェイルセーフで Resend Idempotency-Key 付き送信へフォールバック）
  const db = env?.DB;
  let d1LockActive = false;
  let existingAdminMailId: string | null = null;
  let existingApplicantMailId: string | null = null;

  if (db) {
    try {
      let acquired = await tryInsertLockRow(
        db,
        sessionId,
        source,
        paymentStatusVal,
        paymentMethodVal,
        emailVal
      );

      if (!acquired) {
        let row = await fetchLockRow(db, sessionId);

        // 別経路が処理中の場合、完了まで短時間待機して再確認する
        for (let poll = 0; poll < PROCESSING_POLL_COUNT; poll++) {
          if (!row || row.status !== "processing" || row.is_stale === 1) break;
          await sleep(PROCESSING_POLL_DELAY_MS);
          row = await fetchLockRow(db, sessionId);
        }

        if (row?.status === "sent") {
          console.log(`${LOG} [${source}] Session ${sessionId} already sent by ${row.source || "other"}. Skipping.`);
          return {
            ...baseMeta,
            alreadySent: true,
            inProgress: false,
            dispatchSource: row.source || null,
            adminMailId: row.admin_mail_id || null,
            applicantMailId: row.applicant_mail_id || null,
            mailError: null,
            skipReason: `Already sent by ${row.source || "previous_request"}`,
          };
        }

        if (row && (row.status === "failed" || row.is_stale === 1)) {
          const reacquired = await tryReacquireLockRow(
            db,
            sessionId,
            source,
            paymentStatusVal,
            paymentMethodVal,
            emailVal
          );
          if (reacquired) {
            acquired = true;
            existingAdminMailId = row.admin_mail_id || null;
            existingApplicantMailId = row.applicant_mail_id || null;
            console.log(`${LOG} [${source}] Reacquired lock for ${sessionId} (previous status=${row.status}).`);
          } else {
            row = await fetchLockRow(db, sessionId);
          }
        }

        if (!acquired) {
          const isStillProcessing = row?.status === "processing";
          console.log(
            `${LOG} [${source}] Session ${sessionId} locked by ${row?.source || "other"} (status=${row?.status || "unknown"}). Skipping.`
          );
          return {
            ...baseMeta,
            alreadySent: true,
            inProgress: isStillProcessing,
            dispatchSource: row?.source || null,
            adminMailId: row?.admin_mail_id || null,
            applicantMailId: row?.applicant_mail_id || null,
            mailError: null,
            skipReason: isStillProcessing
              ? `In progress by ${row?.source || "other"}`
              : `Already sent by ${row?.source || "other"}`,
          };
        }
      }

      d1LockActive = true;
      console.log(`${LOG} [${source}] Acquired D1 initial-mail lock for session=${sessionId}.`);
    } catch (dbErr) {
      console.warn(
        `${LOG} [${source}] D1 lock operation failed for ${sessionId}; falling back to Resend Idempotency-Key:`,
        dbErr
      );
    }
  } else {
    console.warn(`${LOG} [${source}] env.DB is not bound; relying on Resend Idempotency-Key for ${sessionId}.`);
  }

  // 2. Resend API キー未設定時
  if (!hasApiKey) {
    const missingErr = "RESEND_API_KEY is not configured or empty";
    console.error(`${LOG} [${source}] [CRITICAL] ${missingErr}`);
    if (db && d1LockActive) {
      try {
        await db
          .prepare(
            `UPDATE apply_initial_emails SET status = 'failed', last_error = ?, updated_at = datetime('now') WHERE session_id = ?`
          )
          .bind(missingErr, sessionId)
          .run();
      } catch (uErr) {
        console.warn(`${LOG} Failed to mark missing-api-key failure in D1:`, uErr);
      }
    }
    return {
      ...baseMeta,
      alreadySent: false,
      inProgress: false,
      dispatchSource: source,
      adminMailId: existingAdminMailId,
      applicantMailId: existingApplicantMailId,
      mailError: missingErr,
      skipReason: missingErr,
    };
  }

  // 3. メール送信実行（同一 session_id に対して固定 Idempotency-Key を付与＋既送信分はスキップ）
  let adminMailId: string | null = existingAdminMailId;
  let applicantMailId: string | null = existingApplicantMailId;
  const mailErrors: { admin?: string; user?: string } = {};

  if (!adminMailId) {
    try {
      const adminRes = await sendResendEmail(
        apiKey,
        {
          from: fromEmail,
          to: [adminEmail],
          reply_to: emailVal || undefined,
          subject: adminSubject,
          text: adminText,
        },
        `${LOG}[${source}][admin]`,
        { idempotencyKey: `apply-initial-admin:${sessionId}` }
      );
      if (adminRes.ok) {
        adminMailId = adminRes.id || "sent";
      } else {
        mailErrors.admin = adminRes.error || `HTTP ${adminRes.status}`;
      }
    } catch (err: any) {
      mailErrors.admin = err?.message || String(err);
    }
  }

  if (emailVal && !applicantMailId) {
    try {
      const userRes = await sendResendEmail(
        apiKey,
        {
          from: fromEmail,
          to: [emailVal],
          reply_to: adminEmail,
          subject: userSubject,
          text: userText,
        },
        `${LOG}[${source}][user]`,
        { idempotencyKey: `apply-initial-user:${sessionId}` }
      );
      if (userRes.ok) {
        applicantMailId = userRes.id || "sent";
      } else {
        mailErrors.user = userRes.error || `HTTP ${userRes.status}`;
      }
    } catch (err: any) {
      mailErrors.user = err?.message || String(err);
    }
  }

  const errorParts: string[] = [];
  if (mailErrors.admin) errorParts.push(`admin: ${mailErrors.admin}`);
  if (mailErrors.user) errorParts.push(`user: ${mailErrors.user}`);
  const mailError = errorParts.length > 0 ? errorParts.join("; ") : null;

  const adminDone = Boolean(adminMailId) && !mailErrors.admin;
  const userDone = !emailVal || (Boolean(applicantMailId) && !mailErrors.user);
  const allSucceeded = adminDone && userDone;

  // 4. D1 ロック状態の確定更新
  if (db && d1LockActive) {
    try {
      if (allSucceeded) {
        await db
          .prepare(
            `UPDATE apply_initial_emails
             SET status = 'sent',
                 admin_mail_id = ?,
                 applicant_mail_id = ?,
                 last_error = NULL,
                 sent_at = datetime('now'),
                 updated_at = datetime('now')
             WHERE session_id = ?`
          )
          .bind(adminMailId, applicantMailId, sessionId)
          .run();
      } else {
        await db
          .prepare(
            `UPDATE apply_initial_emails
             SET status = 'failed',
                 admin_mail_id = ?,
                 applicant_mail_id = ?,
                 last_error = ?,
                 updated_at = datetime('now')
             WHERE session_id = ?`
          )
          .bind(adminMailId, applicantMailId, mailError || "Email delivery failed", sessionId)
          .run();
      }
    } catch (uErr) {
      console.warn(`${LOG} Failed to update D1 initial-mail status for ${sessionId}:`, uErr);
    }
  }

  return {
    ...baseMeta,
    alreadySent: false,
    inProgress: false,
    dispatchSource: source,
    adminMailId,
    applicantMailId,
    mailError,
    mailErrors: Object.keys(mailErrors).length > 0 ? mailErrors : undefined,
    skipReason: !emailVal
      ? "Applicant email address is missing/empty"
      : mailError
        ? "Delivery failed with error"
        : null,
  };
};
