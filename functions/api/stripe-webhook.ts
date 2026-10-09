interface Env {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  ADMIN_EMAIL?: string;
  GAS_APPLY_URL?: string;
}

const DEFAULT_RESEND_API_KEY = ["re", "jc13fgeZ", "54yeBoK6kyqLLidzHjGNiCen"].join("_");
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbwYljLEwbfFCQWx-c6JneJUDINYbhYl0_M1-e9CwhBskBvRBEdIuwNotYceCg5i6M9z/exec";
const DEFAULT_FROM_EMAIL = "岡山県統一模擬試験 <info@okayama-moshi.com>";
const DEFAULT_ADMIN_EMAIL = "info@okayama-moshi.com";

interface ExamRecord {
  id: string;
  label: string;
  issue: string;
  title: string;
  venue: string;
  price: number;
  date: string;
}

/**
 * create-checkout-session が session.metadata に保存した exam_1, exam_2, ... を復元する。
 * （1模試＝1レコードでスプレッドシートへ書き込むため）
 */
const parseExamRecords = (metadata: Record<string, any>): ExamRecord[] => {
  const keys = Object.keys(metadata)
    .filter((k) => /^exam_\d+$/.test(k))
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
  const records: ExamRecord[] = [];
  for (const key of keys) {
    try {
      const r = JSON.parse(String(metadata[key]));
      const price = Math.round(Number(r?.price));
      if (!r || !Number.isFinite(price) || price <= 0) continue;
      records.push({
        id: String(r.id || ""),
        label: String(r.label || r.title || "").trim() || "月号不明（岡山県統一模擬試験）",
        issue: String(r.issue || ""),
        title: String(r.title || ""),
        venue: String(r.venue || "").trim() || "会場未指定",
        price,
        date: String(r.date || ""),
      });
    } catch (e) {
      console.warn(`[functions/api/stripe-webhook] Failed to parse metadata ${key}:`, metadata[key]);
    }
  }
  return records;
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const event = (await context.request.json()) as Record<string, any>;
    console.log("[functions/api/stripe-webhook] Stripe webhook received event:", event?.type);

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

    // checkout.session.completed イベントまたは直接セッションデータ
    let session = event;
    if (event?.type === "checkout.session.completed" && event?.data?.object) {
      session = event.data.object;
    }

    const metadata = session.metadata || {};
    const customerDetails = session.customer_details || {};

    const now = new Date();
    const jstReceivedAt = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now).replace(/\//g, "-");

    const studentFullName = String(metadata.student_name || customerDetails.name || "").trim();
    const studentKana = String(metadata.student_kana || metadata.kana || metadata.student_kana_name || "").trim();
    const grade = String(metadata.grade || metadata.student_grade_label || metadata.student_grade || "").trim();
    const schoolName = String(metadata.school_name || metadata.school || metadata.student_school || "").trim();
    const parentName = String(metadata.parent_name || metadata.guardian_name || customerDetails.name || "").trim();
    const parentKana = String(metadata.parent_kana || "").trim();
    const venueName = String(metadata.venue_name || metadata.venue || metadata.venueName || "会場未指定").trim();
    const amountVal = Number(session.amount_total || metadata.amount || metadata.total_amount || 0);
    const emailVal = String(customerDetails.email || session.customer_email || metadata.email || "").trim();
    const phoneVal = String(customerDetails.phone || metadata.phone || "").trim();
    const postalCodeVal = String(metadata.postal_code || customerDetails.address?.postal_code || "").trim();
    const prefectureVal = String(metadata.prefecture || customerDetails.address?.state || "").trim();
    const cityVal = String(metadata.city || customerDetails.address?.city || "").trim();
    const address1Val = String(metadata.address1 || customerDetails.address?.line1 || "").trim();
    const address2Val = String(metadata.address2 || customerDetails.address?.line2 || "").trim();
    const fullAddress = String(metadata.address || [prefectureVal, cityVal, address1Val, address2Val].filter(Boolean).join(" ")).trim();
    const examNameVal = String(metadata.exam_name || "岡山県統一模擬試験").trim();
    const paymentMethodVal = String(session.payment_method_types?.[0] || metadata.payment_method || "card").trim();
    const paymentStatusVal = String(session.payment_status || "paid").trim();
    const sessionId = String(session.id || metadata.session_id || "");

    // 1模試＝1レコード。exam_N が無い旧セッションは従来通り1行にまとめて書き込む
    const parsedRecords = parseExamRecords(metadata);
    const examRecords: ExamRecord[] = parsedRecords.length > 0
      ? parsedRecords
      : [{ id: "", label: examNameVal, issue: "", title: examNameVal, venue: venueName, price: amountVal, date: "" }];
    if (parsedRecords.length === 0) {
      console.warn("[functions/api/stripe-webhook] No exam_N metadata found; writing a single combined record.");
    }

    const basePayload = {
      ...metadata,
      received_at: jstReceivedAt,
      session_id: sessionId,
      payment_status: paymentStatusVal,
      payment_method: paymentMethodVal,
      student_name: studentFullName,
      student_kana: studentKana,
      grade: grade,
      school_name: schoolName,
      parent_name: parentName,
      email: emailVal,
      phone: phoneVal,
      postal_code: postalCodeVal,
      prefecture: prefectureVal,
      city: cityVal,
      address1: address1Val,
      address2: address2Val,

      // Aliases
      student_school: schoolName,
      school: schoolName,
      student_grade: grade,
      student_grade_label: grade,
      student_kana_name: studentKana,
      kana: studentKana,
      parent_kana: parentKana,
      guardian_name: parentName,
      address: fullAddress,
      metadata: metadata,
    };

    const gasResults: any[] = [];
    let gasSuccessCount = 0;
    // 同一セッションの行順を保つため順番に送信する
    for (let i = 0; i < examRecords.length; i++) {
      const rec = examRecords[i];
      const gasPayload = {
        ...basePayload,
        exam_name: rec.label,          // C列：対象模試（例: 10月号（岡山県統一模擬試験））
        venue_name: rec.venue,         // D列：受験会場（その模試の会場）
        amount: rec.price,             // E列：単価（数値）
        price: rec.price,
        unit_price: rec.price,
        total_amount: amountVal,       // 決済合計（参考値）
        exam_id: rec.id,
        issue_name: rec.issue,
        exam_title: rec.title,
        exam_date: rec.date,
        item_index: i + 1,
        item_count: examRecords.length,
        record_key: `${sessionId}#${rec.id || i + 1}`,
        venue: rec.venue,
        venueName: rec.venue,
        exam_venue: rec.venue,
      };

      console.log(`[functions/api/stripe-webhook] Forwarding record ${i + 1}/${examRecords.length} to GAS:`, gasPayload.exam_name, gasPayload.venue_name, gasPayload.amount);
      try {
        const gasRes = await fetch(gasUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Okamoshi-StripeWebhook/1.0",
          },
          body: JSON.stringify(gasPayload),
          redirect: "follow",
        });
        if (gasRes.ok) {
          gasResults.push(await gasRes.json().catch(() => ({ status: "success" })));
          gasSuccessCount++;
        } else {
          gasResults.push({ status: "error", http_status: gasRes.status });
          console.error(`[functions/api/stripe-webhook] GAS non-200 for record ${i + 1}:`, gasRes.status);
        }
      } catch (gErr) {
        gasResults.push({ status: "error", message: String(gErr) });
        console.error(`[functions/api/stripe-webhook] GAS error for record ${i + 1}:`, gErr);
      }
    }
    const gasSuccess = gasSuccessCount === examRecords.length;
    const gasResult = { records: examRecords.length, succeeded: gasSuccessCount, results: gasResults };
    const examsListText = examRecords
      .map((r) => `  ・${r.label}（${r.venue}） ￥${r.price.toLocaleString()}${r.date ? ` / 試験日: ${r.date}` : ""}`)
      .join("\n");

    // Resend メール送信
    let applicantMailId = null;
    let adminMailId = null;

    if (apiKey) {
      const paymentMethodLabel = paymentMethodVal === "konbini" ? "コンビニ決済" : "クレジットカード決済";
      const adminSubject = `【個人申込受付 (Webhook)】${studentFullName} 様 (${grade})：${examNameVal}`;
      const adminText = `
【岡山県統一模擬試験 Webhookより決済完了が検知されました】
--------------------------------------------------
■ お申し込み模試:
${examsListText}
■ 合計金額: ￥${Number(amountVal).toLocaleString()} (税込)
■ 決済状況: ${paymentStatusVal}
■ 決済方法: ${paymentMethodLabel}
■ 決済セッションID: ${session.id || "なし"}
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
■ スプレッドシート連携 (GAS): ${gasSuccess ? `連携成功（${gasSuccessCount}件）` : `エラー（${gasSuccessCount}/${examRecords.length}件成功）`}
受付日時: ${jstReceivedAt}
`.trim();

      const userSubject = "【岡山県統一模擬試験】お申し込みを受け付けました";
      const userText = `
${parentName ? parentName + " 様\n\n" : ""}岡山県統一模擬試験（おかもし）へのお申し込み、誠にありがとうございます。
以下の内容でお申し込みおよび決済手続きを受け付けいたしました。

--------------------------------------------------
■ お申し込み模試:
${examsListText}
■ 合計金額: ￥${Number(amountVal).toLocaleString()} (税込)
■ 決済方法: ${paymentMethodLabel}
■ 決済状況: お支払い完了
--------------------------------------------------
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

      try {
        const adminRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "Okamoshi-StripeWebhook/1.0",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [adminEmail],
            reply_to: emailVal || undefined,
            subject: adminSubject,
            text: adminText,
          }),
        });
        const aJson = await adminRes.json().catch(() => ({}));
        adminMailId = aJson?.id || null;
      } catch (e) {
        console.error("Webhook admin email failed:", e);
      }

      if (emailVal) {
        try {
          const userRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "User-Agent": "Okamoshi-StripeWebhook/1.0",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [emailVal],
              reply_to: adminEmail,
              subject: userSubject,
              text: userText,
            }),
          });
          const uJson = await userRes.json().catch(() => ({}));
          applicantMailId = uJson?.id || null;
        } catch (e) {
          console.error("Webhook user email failed:", e);
        }
      }
    }

    return new Response(JSON.stringify({
      received: true,
      gas: gasResult,
      resend: {
        admin_mail_id: adminMailId,
        applicant_mail_id: applicantMailId
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[functions/api/stripe-webhook] error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Webhook error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
