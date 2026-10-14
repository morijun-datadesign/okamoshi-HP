import { Env, DEFAULT_FROM_EMAIL, DEFAULT_ADMIN_EMAIL, readEnv } from "../_shared/env";
import { jsonResponse, errorResponse } from "../_shared/http";
import { recordsFromExams, recordsFromMetadata } from "../_shared/exam";
import { fetchCheckoutSession } from "../_shared/stripe";
import { sendResendEmail } from "../_shared/resend";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as Record<string, any>;
    console.log("[functions/api/apply] Received apply request:", JSON.stringify(body));

    const apiKey = readEnv(context.env, "RESEND_API_KEY");
    const fromEmail = readEnv(context.env, "RESEND_FROM_EMAIL", DEFAULT_FROM_EMAIL);
    const adminEmail = readEnv(context.env, "ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL);
    const stripeSecretKey = readEnv(context.env, "STRIPE_SECRET_KEY");

    // 1. 【セキュリティ改修】Stripe Session ID の検証ガード（未認証での無制限メール送信を完全遮断）
    const incomingSessionId = String(
      body.session_id || body.stripe_session_id || (body.metadata && body.metadata.session_id) || ""
    ).trim();
    if (!incomingSessionId || !incomingSessionId.startsWith("cs_")) {
      console.warn("[functions/api/apply] Unauthorized request: missing or invalid session_id");
      return errorResponse("有効なStripe決済セッションID（session_id）が提供されていません。", 400);
    }

    if (!stripeSecretKey) {
      console.error("[functions/api/apply] STRIPE_SECRET_KEY is not configured.");
      return errorResponse("決済認証サービスの設定が完了していません。", 500);
    }

    // Stripe API から最新のセッションを取得して決済完了状態を照合する
    console.log(`[functions/api/apply] Verifying Stripe session ${incomingSessionId}...`);
    const stripeSessionData = await fetchCheckoutSession(incomingSessionId, stripeSecretKey, "[functions/api/apply]");
    if (!stripeSessionData) {
      console.warn(`[functions/api/apply] Stripe session not found: ${incomingSessionId}`);
      return errorResponse("指定された決済セッションが見つかりません。", 404);
    }

    const sessionStatus = String(stripeSessionData.status || "");
    const sessionPaymentStatus = String(stripeSessionData.payment_status || "");
    if (sessionStatus !== "complete" && sessionPaymentStatus !== "paid" && sessionPaymentStatus !== "unpaid") {
      console.warn(
        `[functions/api/apply] Incomplete Stripe session state: status=${sessionStatus}, payment_status=${sessionPaymentStatus}`
      );
      return errorResponse("決済が完了していないセッションへの通知送信はできません。", 400);
    }

    const sessionMeta = (stripeSessionData && stripeSessionData.metadata) || {};
    const sessionCustomer = (stripeSessionData && stripeSessionData.customer_details) || {};

    // 2. フィールド正規化
    const now = new Date();
    const jstReceivedAt =
      body.received_at ||
      new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now).replace(/\//g, "-");

    const meta = {
      ...(body.metadata || {}),
      ...sessionMeta,
    };

    const activeSessionId = incomingSessionId || (stripeSessionData && stripeSessionData.id) || "";
    const studentFullName = String(body.student_name || meta.student_name || sessionCustomer.name || body.client_reference_id || "").trim();
    const studentKanaFullName = String(body.student_kana || meta.student_kana || body.student_kana_name || meta.student_kana_name || body.kana || meta.kana || "").trim();
    const gradeVal = String(body.grade || meta.grade || body.student_grade_label || meta.student_grade_label || body.student_grade || meta.student_grade || "").trim();
    const schoolVal = String(body.school_name || meta.school_name || body.student_school || meta.student_school || body.school || meta.school || "").trim();
    const parentFullName = String(body.parent_name || meta.parent_name || body.guardian_name || meta.guardian_name || sessionCustomer.name || "").trim();
    const parentKanaVal = String(body.parent_kana || meta.parent_kana || "").trim();
    const venueVal = String(body.venue_name || meta.venue_name || body.venue || meta.venue || body.venueName || (Array.isArray(body.exams) && body.exams[0]?.venue_name) || (Array.isArray(body.exams) && body.exams[0]?.venue) || "会場未指定").trim();
    const amountVal = Number(body.amount || meta.amount || body.total_amount || meta.total_amount || (stripeSessionData && stripeSessionData.amount_total) || (Array.isArray(body.exams) && body.exams[0]?.price) || 0);
    const emailVal = String(body.email || meta.email || body.customer_email || sessionCustomer.email || (stripeSessionData && stripeSessionData.customer_email) || "").trim();
    const phoneVal = String(body.phone || meta.phone || sessionCustomer.phone || "").trim();
    const postalCodeVal = String(body.postal_code || meta.postal_code || sessionCustomer.address?.postal_code || "").trim();
    const prefectureVal = String(body.prefecture || meta.prefecture || sessionCustomer.address?.state || "").trim();
    const cityVal = String(body.city || meta.city || body.address_line1 || sessionCustomer.address?.city || "").trim();
    const address1Val = String(body.address1 || meta.address1 || body.address_line2 || sessionCustomer.address?.line1 || "").trim();
    const address2Val = String(body.address2 || meta.address2 || body.address_line3 || sessionCustomer.address?.line2 || "").trim();
    const fullAddress = String(body.address || meta.address || [prefectureVal, cityVal, address1Val, address2Val].filter(Boolean).join(" ")).trim();
    const examNameVal = String(body.exam_name || meta.exam_name || (Array.isArray(body.exams) && body.exams[0]?.title) || "岡山県統一模擬試験").trim();
    const paymentMethodVal = String(body.payment_method || meta.payment_method || body.selected_payment_method || (body.raw_payment_method === "convenience_store" ? "konbini" : "card")).trim();
    const paymentStatusVal = String(body.payment_status || (stripeSessionData && stripeSessionData.payment_status) || "paid").trim();

    // 3. 台帳（GAS）への書き込みは Stripe Webhook（functions/api/stripe-webhook.ts）に一本化。
    let examRecords = recordsFromExams(body.exams);
    if (examRecords.length === 0) examRecords = recordsFromMetadata(meta);
    if (examRecords.length === 0) {
      examRecords = [{ id: "", label: examNameVal, issue: "", title: examNameVal, venue: venueVal, price: amountVal, date: "" }];
    }

    const gasSuccess = true;
    const gasResponseData = { delegated_to: "stripe-webhook", records: examRecords.length };
    const gasErrorMessage: string | null = null;

    // 4. Resend API によるメール送信
    let applicantMailId: string | null = null;
    let adminMailId: string | null = null;
    let mailError: string | null = null;

    const paymentMethodLabel = (paymentMethodVal === "konbini" || body.raw_payment_method === "convenience_store")
      ? "コンビニ決済"
      : "クレジットカード決済";

    const examsListText = examRecords
      .map((r) => `  ・${r.label}（${r.venue}） / ￥${r.price.toLocaleString()}${r.date ? ` / 試験日: ${r.date}` : ""}`)
      .join("\n");

    // A. 管理者宛て ジャーナル通知メール
    const adminSubject = `【個人申込受付】${studentFullName || "生徒氏名未入力"} 様 (${gradeVal || "学年未入力"})：${examNameVal}`;
    const adminTextContent = `
【岡山県統一模擬試験 Webサイトより個人申し込み・決済完了がありました】
--------------------------------------------------
■ お申し込み模試:
${examsListText}
■ 合計金額: ￥${Number(amountVal).toLocaleString()} (税込)
■ 決済状況: ${paymentMethodLabel === "コンビニ決済" ? "未入金（コンビニでのお支払い待ち）" : (paymentStatusVal === "paid" ? "決済完了 (paid)" : paymentStatusVal)}
■ 決済方法: ${paymentMethodLabel}
■ 決済セッションID: ${activeSessionId || "なし"}
--------------------------------------------------
【生徒情報】
■ 生徒氏名: ${studentFullName} (${studentKanaFullName || "未入力"})
■ 学年: ${gradeVal || "未入力"}
■ 在籍校: ${schoolVal || "未入力"}
■ 性別: ${body.student_gender || meta.student_gender || "未回答"}

【保護者・連絡先情報】
■ 保護者氏名: ${parentFullName || "未入力"} (${parentKanaVal || "未入力"})
■ メールアドレス: ${emailVal || "未入力"}
■ 電話番号: ${phoneVal || "未入力"}
■ 郵便番号: 〒${postalCodeVal || "未入力"}
■ 住所: ${fullAddress || "未入力"}
--------------------------------------------------
■ スプレッドシート連携 (GAS): Stripe Webhook から登録（このメールからは書き込みません）
受付日時: ${jstReceivedAt}
`.trim();

    // B. 申込者宛て サンクスメール
    const userSubject = "【岡山県統一模擬試験】お申し込みを受け付けました";
    const userTextContent = `
${parentFullName ? parentFullName + " 様\n（生徒様：" + (studentFullName || "生徒") + " 様）\n\n" : (studentFullName ? studentFullName + " 様\n\n" : "")}岡山県統一模擬試験（おかもし）へのお申し込み、誠にありがとうございます。
以下の内容でお申し込みおよび決済手続きを受け付けいたしました。

--------------------------------------------------
■ お申し込み模試:
${examsListText}
■ 合計金額: ￥${Number(amountVal).toLocaleString()} (税込)
■ 決済方法: ${paymentMethodLabel}
■ 決済状況: ${paymentMethodLabel === "コンビニ決済" ? "お支払い待ち（コンビニでのお支払い後に確定）" : "お支払い完了"}
--------------------------------------------------
【ご登録内容】
■ 生徒氏名: ${studentFullName} 様
■ フリガナ: ${studentKanaFullName || ""}
■ 学年: ${gradeVal}
■ 学校名: ${schoolVal || "未入力"}
■ お届け先住所: 〒${postalCodeVal} ${fullAddress}
■ お電話番号: ${phoneVal}
■ メールアドレス: ${emailVal}
--------------------------------------------------

${paymentMethodLabel === "コンビニ決済" ? `
【コンビニ決済をご選択された方へ】
決済代行システムより、お支払い番号・払込手順を記載した案内メールが別途届きます。
記載されたお支払い期限（払込票に記載の期限）までにお近くのコンビニエンスストアにてお支払いをお願いいたします。
期限を過ぎますとお申し込みは自動キャンセルとなりますのでご注意ください。
--------------------------------------------------
` : ""}
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

    if (apiKey) {
      // 1) 管理者宛て ジャーナル通知送信
      console.log("[functions/api/apply] Sending admin notification via Resend...");
      const adminMailResult = await sendResendEmail(
        apiKey,
        {
          from: fromEmail,
          to: [adminEmail],
          reply_to: emailVal || undefined,
          subject: adminSubject,
          text: adminTextContent,
        },
        "[functions/api/apply/admin]"
      );
      if (adminMailResult.ok && adminMailResult.id) {
        adminMailId = adminMailResult.id;
      } else {
        mailError = adminMailResult.error || "Admin email delivery failed";
      }

      // 2) 申込者宛て サンクスメール送信
      if (emailVal) {
        console.log(`[functions/api/apply] Sending applicant confirmation via Resend to ${emailVal}...`);
        const userMailResult = await sendResendEmail(
          apiKey,
          {
            from: fromEmail,
            to: [emailVal],
            reply_to: adminEmail,
            subject: userSubject,
            text: userTextContent,
          },
          "[functions/api/apply/user]"
        );
        if (userMailResult.ok && userMailResult.id) {
          applicantMailId = userMailResult.id;
        } else {
          mailError = mailError
            ? `${mailError}, ${userMailResult.error || "User email delivery failed"}`
            : userMailResult.error || "User email delivery failed";
        }
      }
    } else {
      console.warn("[functions/api/apply] RESEND_API_KEY is not defined, email sending skipped.");
    }

    return jsonResponse({
      success: true,
      status: "success",
      message: "お申し込みを受け付けました",
      gas: {
        success: gasSuccess,
        response: gasResponseData,
        error: gasErrorMessage,
      },
      resend: {
        admin_mail_id: adminMailId,
        applicant_mail_id: applicantMailId,
        error: mailError,
      },
      session_id: activeSessionId,
      redirect_url: "/apply/success",
    });
  } catch (error: any) {
    console.error("[functions/api/apply] Internal Error:", error);
    return errorResponse(error.message || "Server Error", 500);
  }
};
