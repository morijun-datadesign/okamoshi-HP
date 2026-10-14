import { Env, DEFAULT_GAS_URL, DEFAULT_FROM_EMAIL, DEFAULT_ADMIN_EMAIL, readEnv } from "../_shared/env";
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
    const apiKey = readEnv(env, "RESEND_API_KEY");
    const fromEmail = readEnv(env, "RESEND_FROM_EMAIL", DEFAULT_FROM_EMAIL);
    const adminEmail = readEnv(env, "ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL);

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
    const prefectureVal = String(metadata.prefecture || customerDetails.address?.state || "").trim();
    const cityVal = String(metadata.city || customerDetails.address?.city || "").trim();
    const address1Val = String(metadata.address1 || customerDetails.address?.line1 || "").trim();
    const address2Val = String(metadata.address2 || customerDetails.address?.line2 || "").trim();
    const fullAddress = String(metadata.address || [prefectureVal, cityVal, address1Val, address2Val].filter(Boolean).join(" ")).trim();
    const examNameVal = String(metadata.exam_name || "岡山県統一模擬試験").trim();

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
      address: fullAddress,
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
      if (apiKey) {
        const label = ledgerStatus === LEDGER_STATUS.PAID ? "コンビニ入金完了" : "コンビニ支払期限切れ";
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
          LOG
        );
        adminMailId = mailRes.id || null;
      }
      return jsonResponse({ received: true, action, status: ledgerStatus, gas: gasResult, resend: { admin_mail_id: adminMailId } });
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
■ 住所: 〒${postalCodeVal} ${fullAddress}
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
■ メールアドレス: ${emailVal}
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

      const adminRes = await sendResendEmail(
        apiKey,
        {
          from: fromEmail,
          to: [adminEmail],
          reply_to: emailVal || undefined,
          subject: adminSubject,
          text: adminText,
        },
        LOG
      );
      adminMailId = adminRes.id || null;

      if (emailVal && !gasResult.skipped) {
        const userRes = await sendResendEmail(
          apiKey,
          {
            from: fromEmail,
            to: [emailVal],
            reply_to: adminEmail,
            subject: userSubject,
            text: userText,
          },
          LOG
        );
        applicantMailId = userRes.id || null;
      }
    }

    return jsonResponse({
      received: true,
      action,
      status: ledgerStatus,
      gas: gasResult,
      resend: { admin_mail_id: adminMailId, applicant_mail_id: applicantMailId },
    });
  } catch (error: any) {
    console.error(`${LOG} error:`, error);
    return jsonResponse({ error: error?.message || "Webhook error" }, 500);
  }
};
