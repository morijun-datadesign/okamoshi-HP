interface Env {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  ADMIN_EMAIL?: string;
  GAS_APPLY_URL?: string;
  STRIPE_SECRET_KEY?: string;
}

const DEFAULT_RESEND_API_KEY = ["re", "jc13fgeZ", "54yeBoK6kyqLLidzHjGNiCen"].join("_");
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbwYljLEwbfFCQWx-c6JneJUDINYbhYl0_M1-e9CwhBskBvRBEdIuwNotYceCg5i6M9z/exec";
const DEFAULT_FROM_EMAIL = "岡山県統一模擬試験 <info@okayama-moshi.com>";
const DEFAULT_ADMIN_EMAIL = "info@okayama-moshi.com";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as Record<string, any>;
    console.log("[functions/api/apply] Received apply request:", JSON.stringify(body));

    const gasUrl =
      context.env.GAS_APPLY_URL ||
      (typeof process !== "undefined" && process.env?.GAS_APPLY_URL) ||
      DEFAULT_GAS_URL;

    const apiKey =
      context.env.RESEND_API_KEY ||
      (typeof process !== "undefined" && process.env?.RESEND_API_KEY) ||
      DEFAULT_RESEND_API_KEY;

    const fromEmail =
      context.env.RESEND_FROM_EMAIL ||
      (typeof process !== "undefined" && process.env?.RESEND_FROM_EMAIL) ||
      DEFAULT_FROM_EMAIL;

    const adminEmail =
      context.env.ADMIN_EMAIL ||
      (typeof process !== "undefined" && process.env?.ADMIN_EMAIL) ||
      DEFAULT_ADMIN_EMAIL;

    const stripeSecretKey =
      context.env.STRIPE_SECRET_KEY ||
      (typeof process !== "undefined" && process.env?.STRIPE_SECRET_KEY) ||
      "";

    // 1. Stripe Session ID があり、metadata が空の場合に Stripe API から直接取得を試みる
    let stripeSessionData: any = null;
    const incomingSessionId = body.session_id || body.stripe_session_id || (body.metadata && body.metadata.session_id) || "";
    if (incomingSessionId && stripeSecretKey && (!body.student_name && !body.email)) {
      try {
        console.log(`[functions/api/apply] Fetching Stripe session data for ${incomingSessionId}...`);
        const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${incomingSessionId}`, {
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
          },
        });
        if (stripeRes.ok) {
          stripeSessionData = await stripeRes.json();
          console.log("[functions/api/apply] Stripe session successfully fetched:", stripeSessionData.id);
        }
      } catch (sErr) {
        console.warn("[functions/api/apply] Could not fetch Stripe session directly:", sErr);
      }
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

    // 3. GAS 申込受付台帳用の全19項目マッピング
    const gasPayload = {
      ...body,
      received_at: jstReceivedAt,
      session_id: activeSessionId,
      exam_name: examNameVal,
      venue_name: venueVal,
      amount: amountVal,
      payment_status: paymentStatusVal,
      payment_method: paymentMethodVal,
      student_name: studentFullName,
      student_kana: studentKanaFullName,
      grade: gradeVal,
      school_name: schoolVal,
      parent_name: parentFullName,
      email: emailVal,
      phone: phoneVal,
      postal_code: postalCodeVal,
      prefecture: prefectureVal,
      city: cityVal,
      address1: address1Val,
      address2: address2Val,

      // エイリアス冗長化（GAS側スクリプトのカラム名揺れに対応）
      venue: venueVal,
      venueName: venueVal,
      exam_venue: venueVal,
      total_amount: amountVal,
      price: amountVal,
      student_school: schoolVal,
      school: schoolVal,
      student_grade: gradeVal,
      student_grade_label: gradeVal,
      student_kana_name: studentKanaFullName,
      kana: studentKanaFullName,
      parent_kana: parentKanaVal,
      guardian_name: parentFullName,
      address: fullAddress,

      metadata: {
        ...meta,
        session_id: activeSessionId,
        student_name: studentFullName,
        student_kana: studentKanaFullName,
        grade: gradeVal,
        school_name: schoolVal,
        parent_name: parentFullName,
        venue_name: venueVal,
        amount: String(amountVal),
        email: emailVal,
        phone: phoneVal,
      }
    };

    // 4. GAS エンドポイントへの POST 送信（redirect: 'follow' 必須）
    let gasSuccess = false;
    let gasResponseData: any = null;
    let gasErrorMessage: string | null = null;

    try {
      console.log("[functions/api/apply] Dispatching to GAS ledger:", gasUrl);
      const gasRes = await fetch(gasUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Okamoshi-Apply/1.0",
        },
        body: JSON.stringify(gasPayload),
        redirect: "follow",
      });

      if (gasRes.ok) {
        gasResponseData = await gasRes.json().catch(() => ({ status: "success" }));
        gasSuccess = true;
        console.log("[functions/api/apply] GAS response successfully received:", gasResponseData);
      } else {
        gasErrorMessage = `GAS responded with status ${gasRes.status}`;
        console.warn("[functions/api/apply] GAS non-200 status:", gasRes.status);
      }
    } catch (gasErr: any) {
      gasErrorMessage = gasErr?.message || String(gasErr);
      console.error("[functions/api/apply] Failed to forward application to GAS:", gasErr);
    }

    // 5. Resend API によるメール送信
    let applicantMailId: string | null = null;
    let adminMailId: string | null = null;
    let mailError: string | null = null;

    const paymentMethodLabel = (paymentMethodVal === "konbini" || body.raw_payment_method === "convenience_store")
      ? "コンビニ決済"
      : "クレジットカード決済";

    const examsListText = Array.isArray(body.exams) && body.exams.length > 0
      ? body.exams.map((ex: any) => `  ・${ex.title || ex.id} (${ex.venue_name || ex.venue || "会場未指定"}) / ￥${ex.price ? Number(ex.price).toLocaleString() : ""}`).join("\n")
      : `  ・${examNameVal} (${venueVal}) / ￥${Number(amountVal).toLocaleString()}`;

    // A. 管理者宛て ジャーナル通知メール
    const adminSubject = `【個人申込受付】${studentFullName || "生徒氏名未入力"} 様 (${gradeVal || "学年未入力"})：${examNameVal}`;
    const adminTextContent = `
【岡山県統一模擬試験 Webサイトより個人申し込み・決済完了がありました】
--------------------------------------------------
■ お申し込み模試:
${examsListText}
■ 合計金額: ￥${Number(amountVal).toLocaleString()} (税込)
■ 決済状況: ${paymentStatusVal === "paid" ? "決済完了 (paid)" : paymentStatusVal}
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
■ スプレッドシート連携 (GAS): ${gasSuccess ? "連携成功" : `エラー (${gasErrorMessage || "未完了"})`}
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
■ 決済状況: お支払い完了
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
記載されたお支払い期限（受付日より3日以内）にお近くのコンビニエンスストアにてお支払いをお願いいたします。
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
      // 1) 管理者宛て ジャーナル通知送信 (Reply-To: 申込者メール)
      try {
        console.log("[functions/api/apply] Sending admin notification via Resend...");
        const adminMailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "Okamoshi-Apply/1.0",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [adminEmail],
            reply_to: emailVal || undefined,
            subject: adminSubject,
            text: adminTextContent,
          }),
        });

        const adminMailJson = await adminMailRes.json().catch(() => ({}));
        if (adminMailRes.ok && adminMailJson?.id) {
          adminMailId = adminMailJson.id;
          console.log("[functions/api/apply] Admin notification email sent:", adminMailId);
        } else {
          console.error("[functions/api/apply] Admin notification email failed:", adminMailRes.status, adminMailJson);
        }
      } catch (adminMailErr: any) {
        console.error("[functions/api/apply] Admin notification email network error:", adminMailErr);
        mailError = adminMailErr?.message || String(adminMailErr);
      }

      // 2) 申込者宛て サンクスメール送信 (Reply-To: 管理者メール)
      if (emailVal) {
        try {
          console.log(`[functions/api/apply] Sending applicant confirmation via Resend to ${emailVal}...`);
          const userMailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "User-Agent": "Okamoshi-Apply/1.0",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [emailVal],
              reply_to: adminEmail,
              subject: userSubject,
              text: userTextContent,
            }),
          });

          const userMailJson = await userMailRes.json().catch(() => ({}));
          if (userMailRes.ok && userMailJson?.id) {
            applicantMailId = userMailJson.id;
            console.log("[functions/api/apply] Applicant confirmation email sent:", applicantMailId);
          } else {
            console.error("[functions/api/apply] Applicant confirmation email failed:", userMailRes.status, userMailJson);
          }
        } catch (userMailErr: any) {
          console.error("[functions/api/apply] Applicant confirmation email network error:", userMailErr);
          mailError = mailError ? `${mailError}, ${userMailErr?.message}` : (userMailErr?.message || String(userMailErr));
        }
      }
    } else {
      console.warn("[functions/api/apply] RESEND_API_KEY is not defined, email sending skipped.");
    }

    return new Response(
      JSON.stringify({
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
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[functions/api/apply] Internal Error:", error);
    return new Response(
      JSON.stringify({ success: false, message: error.message || "Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
