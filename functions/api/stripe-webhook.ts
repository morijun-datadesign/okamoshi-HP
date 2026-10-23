import {
  Env,
  DEFAULT_GAS_URL,
  DEFAULT_FROM_EMAIL,
  DEFAULT_ADMIN_EMAIL,
  readEnv,
  getResendApiKey,
  getFromEmail,
  getAdminEmail,
} from "../_shared/env";
import { jsonResponse } from "../_shared/http";
import { ExamRecord, recordsFromMetadata } from "../_shared/exam";
import { fetchCheckoutSession, fetchPaymentIntent, verifyStripeWebhookSignature } from "../_shared/stripe";
import { sendResendEmail } from "../_shared/resend";

const LOG = "[functions/api/stripe-webhook]";

/** 台帳の決済ステータス（F列）に書き込む値 */
const LEDGER_STATUS = {
  PAID: "paid",
  UNPAID: "未入金",
  EXPIRED: "期限切れ",
} as const;

const EVENT_COMPLETED = "checkout.session.completed";
const EVENT_ASYNC_SUCCEEDED = "checkout.session.async_payment_succeeded";
const EVENT_ASYNC_FAILED = "checkout.session.async_payment_failed";
const HANDLED_EVENTS = [EVENT_COMPLETED, EVENT_ASYNC_SUCCEEDED, EVENT_ASYNC_FAILED];

interface KonbiniInfo {
  customerNumber: string;
  confirmationNumber: string;
  voucherUrl: string;
  expiresAt: string;
}

const EMPTY_KONBINI: KonbiniInfo = { customerNumber: "", confirmationNumber: "", voucherUrl: "", expiresAt: "" };

const KONBINI_STORE_LABELS: Record<string, string> = {
  familymart: "ファミリーマート",
  lawson: "ローソン",
  ministop: "ミニストップ",
  seicomart: "セイコーマート",
};

const formatJst = (date: Date): string =>
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

/**
 * 店舗ごとの値を1つの文字列にまとめる。
 * 全店舗で同じ値ならその値のみ、異なる場合は「ファミリーマート: xxx / ローソン・ミニストップ: yyy」形式。
 */
const joinStoreValues = (stores: Record<string, any>, field: "payment_code" | "confirmation_number"): string => {
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
const extractKonbiniInfo = (paymentIntent: Record<string, any> | null): KonbiniInfo => {
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
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const rawBody = await context.request.text();
    const env = context.env;
    const webhookSecret = readEnv(env, "STRIPE_WEBHOOK_SECRET");
    const signatureHeader = context.request.headers.get("stripe-signature");

    // 0. 【セキュリティ改修】Stripe 公式の Webhook 署名検証（HMAC-SHA256）
    if (webhookSecret) {
      const sigResult = await verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret);
      if (!sigResult.valid) {
        console.error(`${LOG} Webhook signature verification failed:`, sigResult.error);
        return jsonResponse({ error: "Invalid signature", details: sigResult.error }, 400);
      }
      console.log(`${LOG} Webhook signature verified successfully.`);
    } else {
      console.warn(`${LOG} STRIPE_WEBHOOK_SECRET is not configured. Falling back to direct Stripe API verification.`);
    }

    let event: Record<string, any>;
    try {
      event = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error(`${LOG} Failed to parse JSON body:`, parseErr);
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const eventType = String(event?.type || "");
    console.log(`${LOG} Stripe webhook received event:`, eventType, event?.id);

    // 対象外のイベントは 200 で受け流す（Stripe の再送を防ぐ）
    if (!HANDLED_EVENTS.includes(eventType)) {
      return jsonResponse({ received: true, ignored: eventType || "unknown" });
    }

    const eventSession = (event?.data?.object || {}) as Record<string, any>;
    const sessionId = String(eventSession.id || "");
    if (!sessionId.startsWith("cs_")) {
      console.warn(`${LOG} Missing checkout session id in event`, event?.id);
      return jsonResponse({ received: true, ignored: "no_session_id" });
    }

    const stripeSecretKey = readEnv(env, "STRIPE_SECRET_KEY");
    const gasUrl = readEnv(env, "GAS_APPLY_URL", DEFAULT_GAS_URL);
    const gasSecret = readEnv(env, "GAS_SHARED_SECRET");
    const resendConfig = getResendApiKey(env);
    const apiKey = resendConfig.key;
    const fromEmail = getFromEmail(env);
    const adminEmail = getAdminEmail(env);

    console.log(`${LOG} Environment configuration for session=${sessionId}:`, {
      has_stripe_key: !!stripeSecretKey,
      gas_url_configured: !!gasUrl,
      gas_url_preview: gasUrl ? gasUrl.slice(0, 45) + "..." : "(none)",
      has_gas_secret: !!gasSecret,
      has_resend_api_key: !!apiKey,
      resend_key_source: resendConfig.source,
      resend_key_prefix: apiKey ? apiKey.slice(0, 7) + "..." : "(none)",
      from_email: fromEmail,
      admin_email: adminEmail,
    });

    // 1. イベント内容をそのまま信用せず、Stripe API から最新のセッションを再取得して検証する
    if (!stripeSecretKey) {
      console.error(`${LOG} STRIPE_SECRET_KEY is not configured; cannot verify event.`);
      return jsonResponse({ error: "STRIPE_SECRET_KEY is not configured" }, 500);
    }
    const session = await fetchCheckoutSession(sessionId, stripeSecretKey, LOG);
    if (!session) {
      return jsonResponse({ error: "Failed to retrieve checkout session" }, 500);
    }

    const sessionPaymentStatus = String(session.payment_status || "");
    const paymentMethodVal = String(session.payment_method_types?.[0] || session.metadata?.payment_method || "card").trim();
    const isKonbini = paymentMethodVal === "konbini";
    const paymentMethodLabel = isKonbini ? "コンビニ決済" : "クレジットカード決済";

    // 2. イベント種別 → GAS アクション／台帳ステータスの決定
    let action: "create" | "update";
    let ledgerStatus: string;
    if (eventType === EVENT_COMPLETED) {
      action = "create";
      ledgerStatus = sessionPaymentStatus === "unpaid" ? LEDGER_STATUS.UNPAID : LEDGER_STATUS.PAID;
    } else if (eventType === EVENT_ASYNC_SUCCEEDED) {
      action = "update";
      ledgerStatus = LEDGER_STATUS.PAID;
      if (sessionPaymentStatus !== "paid") {
        console.warn(`${LOG} async_payment_succeeded but session ${sessionId} is "${sessionPaymentStatus}". Ignored.`);
        return jsonResponse({ received: true, ignored: "session_not_paid" });
      }
    } else {
      action = "update";
      ledgerStatus = LEDGER_STATUS.EXPIRED;
      if (sessionPaymentStatus === "paid") {
        console.warn(`${LOG} async_payment_failed but session ${sessionId} is paid. Ignored.`);
        return jsonResponse({ received: true, ignored: "session_already_paid" });
      }
    }

    // 3. コンビニ支払情報（申込時の未入金レコードのみ）
    let konbini: KonbiniInfo = { ...EMPTY_KONBINI };
    if (action === "create" && isKonbini && ledgerStatus === LEDGER_STATUS.UNPAID) {
      let paymentIntent: Record<string, any> | null =
        session.payment_intent && typeof session.payment_intent === "object" ? session.payment_intent : null;
      if (!paymentIntent && typeof session.payment_intent === "string") {
        paymentIntent = await fetchPaymentIntent(session.payment_intent, stripeSecretKey, LOG);
      }
      konbini = extractKonbiniInfo(paymentIntent);
      if (!konbini.voucherUrl) {
        console.warn(`${LOG} Konbini display details not found for session ${sessionId}`);
      }
    }

    // 4. 申込者情報の正規化
    const metadata = (session.metadata || {}) as Record<string, any>;
    const customerDetails = (session.customer_details || {}) as Record<string, any>;
    const jstReceivedAt = formatJst(new Date());

    const studentFullName = String(metadata.student_name || "").trim();
    const studentKana = String(metadata.student_kana || metadata.kana || metadata.student_kana_name || "").trim();
    const grade = String(metadata.grade || metadata.student_grade_label || metadata.student_grade || "").trim();
    const schoolName = String(metadata.school_name || metadata.school || metadata.student_school || "").trim();
    const parentName = String(metadata.parent_name || metadata.guardian_name || customerDetails.name || "").trim();
    const parentKana = String(metadata.parent_kana || "").trim();
    const venueName = String(metadata.venue_name || metadata.venue || "会場未指定").trim();
    const amountVal = Number(session.amount_total || metadata.amount || metadata.total_amount || 0);
    const emailVal = String(customerDetails.email || session.customer_email || metadata.email || "").trim();
    const phoneVal = String(metadata.phone || customerDetails.phone || "").trim();
    const postalCodeVal = String(metadata.postal_code || customerDetails.address?.postal_code || "").trim();
    let prefVal = String(metadata.pref || metadata.prefecture || customerDetails.address?.state || "").trim();
    let cityVal = String(metadata.city || customerDetails.address?.city || "").trim();
    let addr1Val = String(metadata.addr1 || metadata.address1 || customerDetails.address?.line1 || "").trim();
    let addr2Val = String(metadata.addr2 || metadata.address2 || customerDetails.address?.line2 || "").trim();

    // 万一 pref/city が空で address のみある場合のフォールバックパース
    if (!cityVal && metadata.address) {
      const rawAddr = String(metadata.address).trim();
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

    const fullAddress = String(metadata.address || [prefVal, cityVal, addr1Val, addr2Val].filter(Boolean).join(" ")).trim();
    const examNameVal = String(metadata.exam_name || "岡山県統一模擬試験").trim();
    const remarksVal = String(metadata.remarks || "").trim().slice(0, 300);

    // 1模試＝1レコード
    const parsedRecords = recordsFromMetadata(metadata);
    const examRecords: ExamRecord[] = parsedRecords.length > 0
      ? parsedRecords
      : [{ id: "", label: examNameVal, issue: "", title: examNameVal, venue: venueName, price: amountVal, date: "" }];

    // 5. GAS へ送信
    const gasPayload = {
      action,
      token: gasSecret || undefined,
      event_type: eventType,
      event_id: String(event?.id || ""),
      session_id: sessionId,
      payment_status: ledgerStatus,
      payment_method: paymentMethodVal,
      payment_method_label: paymentMethodLabel,
      received_at: jstReceivedAt,
      konbini_customer_number: konbini.customerNumber,
      konbini_confirmation_number: konbini.confirmationNumber,
      konbini_voucher_url: konbini.voucherUrl,
      konbini_expires_at: konbini.expiresAt,
      student_name: studentFullName,
      student_kana: studentKana,
      grade,
      school_name: schoolName,
      parent_name: parentName,
      parent_kana: parentKana,
      email: emailVal,
      phone: phoneVal,
      postal_code: postalCodeVal,
      prefecture: prefVal,
      city: cityVal,
      address_line1: addr1Val,
      address_line2: addr2Val,
      address: fullAddress,
      remarks: remarksVal,
      total_amount: amountVal,
      records: examRecords.map((r) => ({
        exam_id: r.id,
        exam_name: r.label,
        venue_name: r.venue,
        price: r.price,
        issue_name: r.issue,
        exam_date: r.date,
      })),
    };

    let gasResult: Record<string, any> = {};
    let gasOk = false;
    try {
      console.log(`${LOG} Forwarding to GAS: action=${action} status=${ledgerStatus} records=${examRecords.length} session=${sessionId}`);
      const gasRes = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Okamoshi-StripeWebhook/1.0" },
        body: JSON.stringify(gasPayload),
        redirect: "follow",
      });
      gasResult = ((await gasRes.json().catch(() => null)) as Record<string, any>) || { status: "error", message: `non-JSON response (HTTP ${gasRes.status})` };
      gasOk = gasRes.ok && gasResult.status === "success";
      if (!gasOk) console.error(`${LOG} GAS error:`, gasRes.status, JSON.stringify(gasResult));
    } catch (gErr) {
      gasResult = { status: "error", message: String(gErr) };
      console.error(`${LOG} GAS request failed:`, gErr);
    }

    const gasSummary = gasOk
      ? `連携成功（${action === "create" ? `作成 ${gasResult.created ?? 0} 行${gasResult.skipped ? "・登録済みのためスキップ" : ""}` : `更新 ${gasResult.updated ?? 0} 行${gasResult.fallback_created ? "・該当行が無いため新規作成" : ""}`}）`
      : `エラー（${gasResult.message || "不明"}）`;

    const examsListText = examRecords
      .map((r) => `  ・${r.label}（${r.venue}） ￥${r.price.toLocaleString()}${r.date ? ` / 試験日: ${r.date}` : ""}`)
      .join("\n");

    // 6. ステータス更新イベント（入金完了／期限切れ）
    if (action === "update") {
      if (!gasOk) {
        return jsonResponse({ received: true, gas: gasResult, retry: true }, 500);
      }
      let adminMailId: string | null = null;
      let updateMailError: string | null = null;

      if (!apiKey) {
        console.error(`${LOG} [CRITICAL] RESEND_API_KEY is not configured; cannot send status update email.`);
      } else {
        const label = ledgerStatus === LEDGER_STATUS.PAID ? "コンビニ入金完了" : "コンビニ支払期限切れ";
        try {
          const mailRes = await sendResendEmail(
            apiKey,
            {
              from: fromEmail,
              to: [adminEmail],
              reply_to: emailVal || undefined,
              subject: `【${label}】${studentFullName} 様 (${grade})：${examNameVal}`,
              text: `
【岡山県統一模擬試験 ${label}】
--------------------------------------------------
■ お申し込み模試:
${examsListText}
■ 合計金額: ￥${Number(amountVal).toLocaleString()} (税込)
■ 決済ステータス: ${ledgerStatus}
■ 決済セッションID: ${sessionId}
■ 生徒氏名: ${studentFullName} / 保護者氏名: ${parentName}
■ 連絡先: ${emailVal} / ${phoneVal}
--------------------------------------------------
■ スプレッドシート連携 (GAS): ${gasSummary}
通知日時: ${jstReceivedAt}
`.trim(),
            },
            `${LOG}[update]`
          );
          adminMailId = mailRes.id || null;
          if (!mailRes.ok) {
            updateMailError = mailRes.error || `HTTP ${mailRes.status}`;
            console.error(`${LOG} Status update email delivery failed:`, mailRes.error, "status:", mailRes.status);
          }
        } catch (err: any) {
          updateMailError = err?.message || String(err);
          console.error(`${LOG} Exception while sending status update email:`, err);
        }
      }
      return jsonResponse({
        received: true,
        action,
        status: ledgerStatus,
        gas: gasResult,
        resend: {
          admin_mail_id: adminMailId,
          hasApiKey: !!apiKey,
          apiKeyPrefix: apiKey ? apiKey.trim().slice(0, 5) : "",
          applicantEmail: emailVal || "",
          skipReason: !apiKey ? "RESEND_API_KEY is not configured" : null,
          error: updateMailError,
        },
      });
    }

    // 7. 申込完了イベント：管理者・申込者へメール送信
    const isUnpaidKonbini = ledgerStatus === LEDGER_STATUS.UNPAID;
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

    let applicantMailId: string | null = null;
    let adminMailId: string | null = null;

    if (apiKey) {
      const adminSubject = isUnpaidKonbini
        ? `【個人申込受付・未入金（コンビニ）】${studentFullName} 様 (${grade})：${examNameVal}`
        : `【個人申込受付 (Webhook)】${studentFullName} 様 (${grade})：${examNameVal}`;
      const adminText = `
【岡山県統一模擬試験 Webhookより${isUnpaidKonbini ? "コンビニ決済の申込（未入金）" : "決済完了"}が検知されました】
--------------------------------------------------
■ お申し込み模試:
${examsListText}
■ 合計金額: ￥${Number(amountVal).toLocaleString()} (税込)
■ 決済ステータス: ${ledgerStatus}
■ 決済方法: ${paymentMethodLabel}
■ 決済セッションID: ${sessionId}${konbiniAdminBlock}
--------------------------------------------------
【生徒情報】
■ 生徒氏名: ${studentFullName} (${studentKana || "未入力"})
■ 学年: ${grade || "未入力"}
■ 在籍校: ${schoolName || "未入力"}

【保護者・連絡先情報】
■ 保護者氏名: ${parentName || "未入力"}
■ メールアドレス: ${emailVal || "未入力"}
■ 電話番号: ${phoneVal || "未入力"}
■ 住所: 〒${postalCodeVal} ${fullAddress}${remarksVal ? `\n■ 連絡事項・ご要望:\n${remarksVal}` : ""}
--------------------------------------------------
■ スプレッドシート連携 (GAS): ${gasSummary}
受付日時: ${jstReceivedAt}
`.trim();

      const userSubject = "【岡山県統一模擬試験】お申し込みを受け付けました";
      const userText = `
${parentName ? parentName + " 様\n\n" : ""}岡山県統一模擬試験（おかもし）へのお申し込み、誠にありがとうございます。
以下の内容でお申し込みを受け付けいたしました。

--------------------------------------------------
■ お申し込み模試:
${examsListText}
■ 合計金額: ￥${Number(amountVal).toLocaleString()} (税込)
■ 決済方法: ${paymentMethodLabel}
■ 決済状況: ${isUnpaidKonbini ? "お支払い待ち（コンビニでのお支払い後に確定）" : "お支払い完了"}
--------------------------------------------------
${konbiniUserBlock}
【ご登録内容】
■ 生徒氏名: ${studentFullName} 様 (${studentKana})
■ 学年: ${grade}
■ 学校名: ${schoolName}
■ お届け先住所: 〒${postalCodeVal} ${fullAddress}
■ お電話番号: ${phoneVal}
■ メールアドレス: ${emailVal}${remarksVal ? `\n■ 連絡事項・ご要望:\n${remarksVal}` : ""}
--------------------------------------------------

【今後のスケジュール・受験票のお届け】
・会場受験：試験日の約1週間前に受験票をご自宅宛てにお届けします。
・自宅受験：試験日の約1週間前に問題冊子・解答用紙一式をご自宅宛てにお届けします。

--------------------------------------------------
岡山県統一模擬試験実行委員会（中央教育研究所株式会社）
TEL : 082-227-3999（平日 10:00〜18:00）
MAIL: info@okayama-moshi.com
Web : https://okayama-moshi.com
--------------------------------------------------
`.trim();

      let mailErrors: { admin?: string; user?: string } = {};
      let skipReason: string | null = null;

      const hasApiKey = !!apiKey && apiKey.trim().length > 0;
      const apiKeyPrefix = hasApiKey ? apiKey.trim().slice(0, 5) : "";
      const applicantEmail = emailVal || "";

      console.log(`${LOG} [Pre-Mail-Check] Mail dispatch diagnostic:`, {
        hasApiKey,
        apiKeyPrefix,
        applicantEmail,
        adminEmail,
        fromEmail,
        ledgerStatus,
      });

      if (!hasApiKey) {
        skipReason = "RESEND_API_KEY is not configured or empty";
        console.error(`${LOG} [CRITICAL] Email dispatch skipped: ${skipReason}`);
      } else {
        // A. 管理者宛て ジャーナル通知メール
        try {
          console.log(`${LOG} Sending admin journal email to ${adminEmail}...`);
          const adminRes = await sendResendEmail(
            apiKey,
            {
              from: fromEmail,
              to: [adminEmail],
              reply_to: applicantEmail || undefined,
              subject: adminSubject,
              text: adminText,
            },
            `${LOG}[admin]`
          );
          adminMailId = adminRes.id || null;
          if (!adminRes.ok) {
            mailErrors.admin = adminRes.error || `HTTP ${adminRes.status}`;
            console.error(`${LOG} Admin email delivery failed:`, adminRes.error, "status:", adminRes.status);
          } else {
            console.log(`${LOG} Admin email delivered successfully: id=${adminMailId}`);
          }
        } catch (err: any) {
          mailErrors.admin = err?.message || String(err);
          console.error(`${LOG} Exception occurred while sending admin email:`, err);
        }

        // B. 申込者宛て サンクスメール
        if (applicantEmail) {
          try {
            console.log(`${LOG} Sending applicant confirmation email to ${applicantEmail}...${gasResult.skipped ? " (ledger row already existed)" : ""}`);
            const userRes = await sendResendEmail(
              apiKey,
              {
                from: fromEmail,
                to: [applicantEmail],
                reply_to: adminEmail,
                subject: userSubject,
                text: userText,
              },
              `${LOG}[user]`
            );
            applicantMailId = userRes.id || null;
            if (!userRes.ok) {
              mailErrors.user = userRes.error || `HTTP ${userRes.status}`;
              console.error(`${LOG} Applicant email delivery failed to ${applicantEmail}:`, userRes.error, "status:", userRes.status);
            } else {
              console.log(`${LOG} Applicant confirmation email delivered successfully to ${applicantEmail}: id=${applicantMailId}`);
            }
          } catch (err: any) {
            mailErrors.user = err?.message || String(err);
            console.error(`${LOG} Exception occurred while sending applicant email:`, err);
          }
        } else {
          skipReason = "Applicant email address is missing/empty";
          console.warn(`${LOG} Applicant email is missing; skipped sending user confirmation email.`);
        }
      }

      return jsonResponse({
        received: true,
        action,
        status: ledgerStatus,
        gas: gasResult,
        resend: {
          admin_mail_id: adminMailId,
          applicant_mail_id: applicantMailId,
          hasApiKey,
          apiKeyPrefix,
          applicantEmail,
          skipReason: skipReason || (mailErrors.admin || mailErrors.user ? "Delivery failed with error" : null),
          errors: Object.keys(mailErrors).length > 0 ? mailErrors : undefined,
          from_email: fromEmail,
          admin_email: adminEmail,
        },
      });
  } catch (error: any) {
    console.error(`${LOG} error:`, error);
    return jsonResponse({ error: error?.message || "Webhook error" }, 500);
  }
};
