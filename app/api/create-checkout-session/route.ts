import { NextResponse } from 'next/server';

interface CheckoutLineItem {
  name: string;
  description: string;
  unitAmount: number;
  productMetadata: Record<string, string>;
}

/**
 * フロントから送られた exams 配列を、Stripe の line_items 用に1件ずつ正規化する。
 * 価格が不正（0以下・非数値）の要素は除外する。
 */
const buildExamLineItems = (exams: unknown): CheckoutLineItem[] => {
  if (!Array.isArray(exams)) return [];
  const items: CheckoutLineItem[] = [];
  for (const exam of exams) {
    if (!exam || typeof exam !== "object") continue;
    const e = exam as Record<string, any>;
    const unitAmount = Math.round(Number(e.price));
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) continue;

    const title = String(e.title || e.exam_name || "岡山県統一模擬試験").trim();
    const venue = String(e.venue_name || e.venueLabel || e.venue || "").trim();
    const examDate = String(e.exam_date || e.examDate || "").trim();

    const name = (venue ? `${title}（${venue}）` : title).slice(0, 250);
    const description = [examDate ? `試験日: ${examDate}` : "", venue ? `会場: ${venue}` : ""]
      .filter(Boolean)
      .join(" / ");

    const productMetadata: Record<string, string> = {};
    if (e.id !== undefined && e.id !== null) productMetadata.exam_id = String(e.id).slice(0, 500);
    productMetadata.exam_title = title.slice(0, 500);
    if (venue) productMetadata.venue_name = venue.slice(0, 500);
    if (examDate) productMetadata.exam_date = examDate.slice(0, 500);

    items.push({ name, description, unitAmount, productMetadata });
  }
  return items;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("[app/api/create-checkout-session] Received request:", JSON.stringify(body));

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";

    if (!stripeSecretKey) {
      console.error("[app/api/create-checkout-session] STRIPE_SECRET_KEY is not configured.");
      return NextResponse.json(
        {
          success: false,
          message: "Stripe APIキー（STRIPE_SECRET_KEY）が環境変数に設定されていません。",
        },
        { status: 500 }
      );
    }

    // 1. Origin と success_url / cancel_url の正確な生成
    const reqUrl = new URL(request.url);
    const origin =
      request.headers.get("origin") ||
      (request.headers.get("x-forwarded-host") ? `https://${request.headers.get("x-forwarded-host")}` : "") ||
      reqUrl.origin ||
      "https://okamoshi.pages.dev";

    const successUrl = `${origin}/complete.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/apply.html`;

    // 2. パラメータ抽出と正規化
    const existingMeta = body.metadata || {};
    const studentName = String(body.student_name || body.client_reference_id || existingMeta.student_name || "").trim();
    const studentKana = String(body.student_kana || body.student_kana_name || body.kana || existingMeta.student_kana || existingMeta.kana || "").trim();
    const grade = String(body.grade || body.student_grade_label || body.student_grade || existingMeta.grade || existingMeta.student_grade || "").trim();
    const schoolName = String(body.school_name || body.student_school || body.school || existingMeta.school_name || existingMeta.school || "").trim();
    const parentName = String(body.parent_name || body.guardian_name || existingMeta.parent_name || "").trim();
    const parentKana = String(body.parent_kana || existingMeta.parent_kana || "").trim();
    const venueName = String(body.venue_name || body.venue || body.venueName || (Array.isArray(body.exams) && body.exams[0]?.venue_name) || (Array.isArray(body.exams) && body.exams[0]?.venue) || existingMeta.venue_name || existingMeta.venue || "会場未指定").trim();
    const declaredAmount = Math.round(Number(body.amount || body.total_amount || body.price || existingMeta.amount || existingMeta.total_amount || (Array.isArray(body.exams) && body.exams[0]?.price) || 0)) || 4400;
    const phone = String(body.phone || existingMeta.phone || "").trim();
    const email = String(body.email || body.customer_email || existingMeta.email || "").trim();
    const postalCode = String(body.postal_code || existingMeta.postal_code || "").trim();
    const prefecture = String(body.prefecture || existingMeta.prefecture || "").trim();
    const city = String(body.city || body.address_line1 || existingMeta.city || "").trim();
    const address1 = String(body.address1 || body.address_line2 || existingMeta.address1 || "").trim();
    const address2 = String(body.address2 || body.address_line3 || existingMeta.address2 || "").trim();
    const address = String(body.address || existingMeta.address || [prefecture, city, address1, address2].filter(Boolean).join(" ")).trim();
    const examName = String(body.exam_name || (Array.isArray(body.exams) && body.exams[0]?.title) || existingMeta.exam_name || "岡山県統一模擬試験").trim();
    const paymentMethod = String(body.payment_method || body.selected_payment_method || (body.raw_payment_method === "convenience_store" ? "konbini" : "card")).trim();

    // 2-1. 選択された模試ごとに line_items を分割（レシートのように内訳を表示）
    const examLineItems = buildExamLineItems(body.exams);
    const itemizedTotal = examLineItems.reduce((sum, item) => sum + item.unitAmount, 0);
    if (examLineItems.length > 0 && itemizedTotal !== declaredAmount) {
      console.warn(
        `[app/api/create-checkout-session] Amount mismatch: declared=${declaredAmount}, itemized=${itemizedTotal}. Using itemized total.`
      );
    }
    // 実際に請求される金額（内訳合計）を正とする
    const amountVal = examLineItems.length > 0 ? itemizedTotal : declaredAmount;
    const examsDetail = examLineItems
      .map((item) => `${item.name}${item.productMetadata.exam_date ? ` [${item.productMetadata.exam_date}]` : ""} ¥${item.unitAmount}`)
      .join(" / ");

    // 3. metadata の構築とサニタイズ
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
      prefecture: prefecture,
      city: city,
      address1: address1,
      address2: address2,
      address: address,
      venue_name: venueName,
      exam_name: examName,
      payment_method: paymentMethod,
      amount: String(amountVal),
      exam_count: String(examLineItems.length || 1),
      exams_detail: examsDetail,

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

    for (const [k, v] of Object.entries(existingMeta)) {
      if (v !== undefined && v !== null && typeof v !== "object" && !metadataRaw[k]) {
        metadataRaw[k] = String(v);
      }
    }

    const sanitizedMetadata: Record<string, string> = {};
    for (const [k, v] of Object.entries(metadataRaw)) {
      const cleanVal = String(v).trim();
      if (cleanVal.length > 0) {
        sanitizedMetadata[String(k).slice(0, 40)] = cleanVal.slice(0, 500);
      }
    }

    // 4. Stripe API (POST /v1/checkout/sessions) 用の URLSearchParams 作成
    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("success_url", successUrl);
    params.append("cancel_url", cancelUrl);

    if (email) {
      params.append("customer_email", email);
    }
    if (studentName) {
      params.append("client_reference_id", studentName);
    }

    if (paymentMethod === "konbini") {
      params.append("payment_method_types[0]", "card");
      params.append("payment_method_types[1]", "konbini");
      params.append("payment_method_options[konbini][expires_after_days]", "3");
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
      // exams 配列が無い場合のフォールバック（従来通り1行）
      params.append("line_items[0][price_data][currency]", "jpy");
      params.append("line_items[0][price_data][unit_amount]", String(amountVal));
      params.append("line_items[0][price_data][product_data][name]", examName);
      params.append("line_items[0][quantity]", "1");
    }

    for (const [key, value] of Object.entries(sanitizedMetadata)) {
      params.append(`metadata[${key}]`, value);
    }

    console.log("[app/api/create-checkout-session] Dispatching directly to Stripe API...");

    // 5. Stripe API 直接呼び出し（n8n 完全撤廃）
    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Okamoshi-Server-Route/1.0",
      },
      body: params.toString(),
    });

    const stripeRawText = await stripeRes.text();
    let stripeData: any = {};
    try {
      stripeData = JSON.parse(stripeRawText);
    } catch (parseErr) {
      console.error("[app/api/create-checkout-session] Stripe response parse error:", stripeRawText);
    }

    if (!stripeRes.ok) {
      console.error("[app/api/create-checkout-session] Stripe API error:", stripeRes.status, stripeRawText);
      const errorMsg = stripeData?.error?.message || `Stripe API Error (HTTP ${stripeRes.status})`;
      return NextResponse.json({ success: false, message: errorMsg }, { status: stripeRes.status });
    }

    const sessionUrl = stripeData.url;
    const sessionId = stripeData.id;

    if (!sessionUrl) {
      return NextResponse.json({ success: false, message: "Stripeから決済URLが返却されませんでした。" }, { status: 502 });
    }

    console.log("[app/api/create-checkout-session] Stripe Checkout Session successfully created:", sessionId);

    return NextResponse.json({
      url: sessionUrl,
      checkout_url: sessionUrl,
      session_id: sessionId,
      sessionId: sessionId,
      id: sessionId,
      success: true,
    });
  } catch (error: any) {
    console.error("[app/api/create-checkout-session] Internal Exception:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
