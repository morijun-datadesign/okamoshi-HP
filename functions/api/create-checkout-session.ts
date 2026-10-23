import { Env, readEnv } from "../_shared/env";
import { jsonResponse } from "../_shared/http";
import { verifyTurnstile } from "../_shared/turnstile";
import { formatExamLabel } from "../_shared/exam";

/** 国内電話番号（例: 090-1234-5678）を E.164 形式（+819012345678）へ変換する。変換できない場合は空文字。 */
const toE164JP = (raw: string): string => {
  const s = String(raw || "").normalize("NFKC").trim();
  if (!s) return "";
  const digits = s.replace(/[^\d]/g, "");
  if (s.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : "";
  if (digits.startsWith("0") && (digits.length === 10 || digits.length === 11)) return `+81${digits.slice(1)}`;
  if (digits.startsWith("81") && (digits.length === 11 || digits.length === 12)) return `+${digits}`;
  return "";
};

interface CheckoutLineItem {
  name: string;
  description: string;
  unitAmount: number;
  productMetadata: Record<string, string>;
  /** Webhook / スプレッドシート用の1模試＝1レコード情報（session.metadata[exam_N] に JSON で保存） */
  record: { id: string; label: string; issue: string; title: string; venue: string; price: number; date: string };
}

/** 岡山県統一模擬試験・適性検査対策模試の正規定価（税込） */
const OFFICIAL_EXAM_PRICE = 5500;

/**
 * フロントから送られた exams 配列を、Stripe の line_items 用に1件ずつ正規化する。
 * 【セキュリティ改修】クライアントから送られた価格は一切信用せず、
 * サーバー側で定義された正規定価（5,500円）を強制適用して金額改ざんを防止する。
 */
const buildExamLineItems = (exams: unknown): CheckoutLineItem[] => {
  if (!Array.isArray(exams)) return [];
  const items: CheckoutLineItem[] = [];
  for (const exam of exams) {
    if (!exam || typeof exam !== "object") continue;
    const e = exam as Record<string, any>;
    // サーバー側の正規定価を強制適用
    const unitAmount = OFFICIAL_EXAM_PRICE;

    const title = String(e.title || e.exam_name || "岡山県統一模擬試験").trim();
    const venue = String(e.venue_name || e.venueLabel || e.venue || "").trim();
    const examDate = String(e.exam_date || e.examDate || "").trim();
    const examId = e.id !== undefined && e.id !== null ? String(e.id) : "";
    const { issue, label } = formatExamLabel(e.issue_name || e.issueName || "", title, examId);

    const name = label.slice(0, 250);
    const description = [venue ? `会場: ${venue}` : "", examDate ? `試験日: ${examDate}` : ""]
      .filter(Boolean)
      .join(" / ");

    const productMetadata: Record<string, string> = {};
    if (examId) productMetadata.exam_id = examId.slice(0, 500);
    productMetadata.exam_title = title.slice(0, 500);
    productMetadata.exam_label = label.slice(0, 500);
    if (issue) productMetadata.issue_name = issue.slice(0, 500);
    if (venue) productMetadata.venue_name = venue.slice(0, 500);
    if (examDate) productMetadata.exam_date = examDate.slice(0, 500);

    // 各フィールドを短く制限し、JSON 全体が Stripe metadata の上限（500文字）に収まるようにする
    const record = {
      id: examId.slice(0, 60),
      label: label.slice(0, 80),
      issue: issue.slice(0, 20),
      title: title.slice(0, 60),
      venue: venue.slice(0, 120),
      price: unitAmount,
      date: examDate.slice(0, 60),
    };

    items.push({ name, description, unitAmount, productMetadata, record });
  }
  return items;
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const stripeSecretKey = readEnv(context.env, "STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      console.error("[functions/api/create-checkout-session] STRIPE_SECRET_KEY is not set.");
      return jsonResponse(
        { success: false, message: "Stripe APIキー（STRIPE_SECRET_KEY）が環境変数に設定されていません。" },
        500
      );
    }

    const body = (await context.request.json()) as Record<string, any>;
    console.log("[functions/api/create-checkout-session] Received request:", JSON.stringify(body));

    // 1. Turnstile トークンの検証
    const turnstileSecret = readEnv(context.env, "TURNSTILE_SECRET_KEY");
    const turnstileResult = await verifyTurnstile(context.request, body, turnstileSecret);
    if (!turnstileResult.success) {
      return jsonResponse(
        {
          success: false,
          message: turnstileResult.error || "セキュリティ認証に失敗しました。もう一度お試しください。",
        },
        403
      );
    }

    // 2. success_url / cancel_url
    const origin = new URL(context.request.url).origin;
    const successUrl = `${origin}/apply/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/apply.html`;

    // 3. パラメータ抽出と正規化
    const existingMeta = body.metadata || {};
    const studentName = String(body.student_name || body.client_reference_id || existingMeta.student_name || "").trim();
    const studentKana = String(body.student_kana || body.student_kana_name || body.kana || existingMeta.student_kana || existingMeta.kana || "").trim();
    const grade = String(body.grade || body.student_grade_label || body.student_grade || existingMeta.grade || existingMeta.student_grade || "").trim();
    const schoolName = String(body.school_name || body.student_school || body.school || existingMeta.school_name || existingMeta.school || "").trim();
    const parentName = String(body.parent_name || body.guardian_name || existingMeta.parent_name || "").trim();
    const parentKana = String(body.parent_kana || existingMeta.parent_kana || "").trim();
    const venueName = String(body.venue_name || body.venue || body.venueName || (Array.isArray(body.exams) && body.exams[0]?.venue_name) || (Array.isArray(body.exams) && body.exams[0]?.venue) || existingMeta.venue_name || existingMeta.venue || "会場未指定").trim();
    const declaredAmount = Math.round(Number(body.amount || body.total_amount || existingMeta.amount || existingMeta.total_amount || 0)) || OFFICIAL_EXAM_PRICE;
    const phone = String(body.phone || existingMeta.phone || "").trim();
    const email = String(body.email || body.customer_email || existingMeta.email || "").trim();
    const postalCode = String(body.postal_code || existingMeta.postal_code || "").trim();
    const pref = String(body.pref || body.prefecture || existingMeta.pref || existingMeta.prefecture || "").trim();
    const city = String(body.city || existingMeta.city || "").trim();
    const addr1 = String(body.addr1 || body.address1 || body.address_line2 || existingMeta.addr1 || existingMeta.address1 || "").trim();
    const addr2 = String(body.addr2 || body.address2 || body.address_line3 || existingMeta.addr2 || existingMeta.address2 || "").trim();
    const address = String(body.address || existingMeta.address || [pref, city, addr1, addr2].filter(Boolean).join(" ")).trim();
    const remarks = String(body.remarks || existingMeta.remarks || "").trim().slice(0, 300);
    const examName = String(body.exam_name || (Array.isArray(body.exams) && body.exams[0]?.title) || existingMeta.exam_name || "岡山県統一模擬試験").trim();
    const paymentMethod = String(body.payment_method || body.selected_payment_method || (body.raw_payment_method === "convenience_store" ? "konbini" : "card")).trim();
    // コンビニ支払期限（日数）。フォームが申込締切を考慮して算出した値を 1〜3 日に丸める（Stripe の最小値は 1）
    const requestedKonbiniDays = Math.round(Number(body.konbini_expires_after_days ?? body.payment_method_options?.konbini?.expires_after_days ?? 3));
    const konbiniExpiresAfterDays = Number.isFinite(requestedKonbiniDays) ? Math.min(3, Math.max(1, requestedKonbiniDays)) : 3;

    // 3-1. 選択された模試ごとに line_items を分割（レシートのように内訳を表示）
    const examLineItems = buildExamLineItems(body.exams);
    if (examLineItems.length === 0) {
      return jsonResponse(
        { success: false, message: "お申込み対象の模試が正しく選択されていません。" },
        400
      );
    }
    const itemizedTotal = examLineItems.reduce((sum, item) => sum + item.unitAmount, 0);
    // 実際に請求される金額（内訳合計・サーバー正規価格の合算）を正とする
    const amountVal = itemizedTotal;
    const examsDetail = examLineItems
      .map((item) => `${item.record.label}${item.record.venue ? `（${item.record.venue}）` : ""} ¥${item.unitAmount}`)
      .join(" / ");
    // 月号付きの模試名（合算表示用・従来互換）
    const examNameWithIssue = examLineItems.length > 0
      ? examLineItems.map((item) => item.record.label).join(" / ")
      : examName;

    // 4. metadata の構築とサニタイズ（全値文字列・最大500文字・キー長最大40文字）
    const metadataRaw: Record<string, string> = {
      student_name: studentName,
      student_kana: studentKana,
      grade: grade,
      school_name: schoolName,
      parent_name: parentName,
      parent_kana: parentKana,
      phone: phone,
      email: email,
      postal_code: postalCode,
      pref: pref,
      city: city,
      addr1: addr1,
      addr2: addr2,
      remarks: remarks,
      prefecture: pref,
      address1: addr1,
      address2: addr2,
      address: address,
      venue_name: venueName,
      exam_name: examNameWithIssue,
      payment_method: paymentMethod,
      amount: String(amountVal),
      exam_count: String(examLineItems.length || 1),
      exams_detail: examsDetail,

      // エイリアス（GAS連携用互換）
      venue: venueName,
      school: schoolName,
      student_grade: grade,
      student_grade_label: grade,
      student_school: schoolName,
      student_kana_name: studentKana,
      kana: studentKana,
      guardian_name: parentName,
      total_amount: String(amountVal),
    };

    // 1模試＝1レコード（Webhook → スプレッドシート用）。existingMeta より優先して確保する
    examLineItems.forEach((item, i) => {
      metadataRaw[`exam_${i + 1}`] = JSON.stringify(item.record);
    });

    for (const [k, v] of Object.entries(existingMeta)) {
      if (v !== undefined && v !== null && typeof v !== "object" && !metadataRaw[k]) {
        metadataRaw[k] = String(v);
      }
    }

    // Stripe metadata の上限：最大50キー・値500文字・キー40文字
    const sanitizedMetadata: Record<string, string> = {};
    for (const [k, v] of Object.entries(metadataRaw)) {
      const cleanVal = String(v).trim();
      if (cleanVal.length > 0) {
        if (Object.keys(sanitizedMetadata).length >= 50) {
          console.warn(`[functions/api/create-checkout-session] metadata key limit reached; dropped key: ${k}`);
          continue;
        }
        sanitizedMetadata[String(k).slice(0, 40)] = cleanVal.slice(0, 500);
      }
    }

    // 5. Stripe API（POST /v1/checkout/sessions）を直接呼び出す
    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("success_url", successUrl);
    params.append("cancel_url", cancelUrl);

    // 5-1. Checkout へ連絡先を事前入力するため、Stripe Customer を作成して紐付ける
    const billingName = parentName || studentName;
    const phoneE164 = toE164JP(phone);
    let customerId = "";
    if (billingName || email || phoneE164) {
      const customerParams = new URLSearchParams();
      if (billingName) customerParams.append("name", billingName.slice(0, 256));
      if (email) customerParams.append("email", email);
      if (phoneE164) customerParams.append("phone", phoneE164);
      customerParams.append("preferred_locales[0]", "ja");
      if (studentName) customerParams.append("metadata[student_name]", studentName.slice(0, 500));
      if (parentName) customerParams.append("metadata[parent_name]", parentName.slice(0, 500));

      try {
        const customerRes = await fetch("https://api.stripe.com/v1/customers", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: customerParams.toString(),
        });
        const customer = (await customerRes.json().catch(() => ({}))) as Record<string, any>;
        if (customerRes.ok && customer.id) {
          customerId = String(customer.id);
        } else {
          console.warn("[functions/api/create-checkout-session] Customer creation failed; falling back to customer_email:", customerRes.status, JSON.stringify(customer));
        }
      } catch (e) {
        console.warn("[functions/api/create-checkout-session] Customer creation exception; falling back to customer_email:", e);
      }
    }

    if (customerId) {
      params.append("customer", customerId);
    } else if (email) {
      params.append("customer_email", email);
    }
    if (studentName) {
      params.append("client_reference_id", studentName);
    }

    // 5-2. 決済手段の限定：コンビニ選択時は konbini のみ、それ以外は card のみ
    if (paymentMethod === "konbini") {
      params.append("payment_method_types[0]", "konbini");
      params.append("payment_method_options[konbini][expires_after_days]", String(konbiniExpiresAfterDays));
      if (customerId && phoneE164) {
        params.append("phone_number_collection[enabled]", "true");
      }
    } else {
      params.append("payment_method_types[0]", "card");
    }

    if (examLineItems.length > 0) {
      examLineItems.forEach((item, i) => {
        params.append(`line_items[${i}][price_data][currency]`, "jpy");
        params.append(`line_items[${i}][price_data][unit_amount]`, String(item.unitAmount));
        params.append(`line_items[${i}][price_data][product_data][name]`, item.name);
        if (item.description) {
          params.append(`line_items[${i}][price_data][product_data][description]`, item.description);
        }
        for (const [mk, mv] of Object.entries(item.productMetadata)) {
          params.append(`line_items[${i}][price_data][product_data][metadata][${mk}]`, mv);
        }
        params.append(`line_items[${i}][quantity]`, "1");
      });
    } else {
      params.append("line_items[0][price_data][currency]", "jpy");
      params.append("line_items[0][price_data][unit_amount]", String(amountVal));
      params.append("line_items[0][price_data][product_data][name]", examName);
      params.append("line_items[0][quantity]", "1");
    }

    for (const [key, value] of Object.entries(sanitizedMetadata)) {
      params.append(`metadata[${key}]`, value);
    }

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = (await stripeRes.json().catch(() => ({}))) as Record<string, any>;

    if (!stripeRes.ok || !session.url) {
      console.error("[functions/api/create-checkout-session] Stripe API error:", stripeRes.status, JSON.stringify(session));
      return jsonResponse(
        { success: false, message: session?.error?.message || `Stripe API Error (HTTP ${stripeRes.status})` },
        stripeRes.ok ? 502 : stripeRes.status
      );
    }

    console.log("[functions/api/create-checkout-session] Checkout Session created:", session.id);

    return jsonResponse({ success: true, url: session.url, session_id: session.id });
  } catch (error: any) {
    console.error("[functions/api/create-checkout-session] Internal Exception:", error);
    return jsonResponse({ success: false, message: error?.message || "Internal Server Error" }, 500);
  }
};
