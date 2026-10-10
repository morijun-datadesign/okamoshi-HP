import { NextResponse } from 'next/server';

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

/** 月号ラベルを生成する（例: 「10月号（岡山県統一模擬試験）」）。月号が取れない場合は「月号不明」を明示する。 */
const formatExamLabel = (issueRaw: string, title: string, id: string): { issue: string; label: string } => {
  let issue = String(issueRaw || "").trim();
  if (issue && /^\d{1,2}月$/.test(issue)) issue += "号";
  if (!issue) {
    const m = String(id || "").match(/_(\d{1,2})$/);
    if (m) issue = `${Number(m[1])}月号`;
  }
  const baseTitle = title.replace(/[（(][^（）()]*[）)]\s*$/, "").trim() || title;
  return { issue, label: issue ? `${issue}（${baseTitle}）` : `月号不明（${baseTitle}）` };
};

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
    // コンビニ支払期限（日数）。フォームが申込締切を考慮して算出した値を 1〜3 日に丸める（Stripe の最小値は 1）
    const requestedKonbiniDays = Math.round(Number(body.konbini_expires_after_days ?? body.payment_method_options?.konbini?.expires_after_days ?? 3));
    const konbiniExpiresAfterDays = Number.isFinite(requestedKonbiniDays) ? Math.min(3, Math.max(1, requestedKonbiniDays)) : 3;

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
      .map((item) => `${item.record.label}${item.record.venue ? `（${item.record.venue}）` : ""} ¥${item.unitAmount}`)
      .join(" / ");
    const examNameWithIssue = examLineItems.length > 0
      ? examLineItems.map((item) => item.record.label).join(" / ")
      : examName;

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
      exam_name: examNameWithIssue,
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
          console.warn(`[app/api/create-checkout-session] metadata key limit reached; dropped key: ${k}`);
          continue;
        }
        sanitizedMetadata[String(k).slice(0, 40)] = cleanVal.slice(0, 500);
      }
    }

    // 4. Stripe API (POST /v1/checkout/sessions) 用の URLSearchParams 作成
    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("success_url", successUrl);
    params.append("cancel_url", cancelUrl);

    // 4-1. Checkout へ連絡先を事前入力するため、Stripe Customer を作成して紐付ける
    //      （customer と customer_email は併用不可）
    //      - email: Customer.email があれば Checkout で事前入力される
    //      - phone: phone_number_collection 有効時、Customer.phone（E.164）が事前入力される
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
            "User-Agent": "Okamoshi-Server-Route/1.0",
          },
          body: customerParams.toString(),
        });
        const customer: any = await customerRes.json().catch(() => ({}));
        if (customerRes.ok && customer.id) {
          customerId = String(customer.id);
        } else {
          console.warn("[app/api/create-checkout-session] Customer creation failed; falling back to customer_email:", customerRes.status, JSON.stringify(customer));
        }
      } catch (e) {
        console.warn("[app/api/create-checkout-session] Customer creation exception; falling back to customer_email:", e);
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

    // 4-2. 決済手段の限定：コンビニ選択時は konbini のみ、それ以外は card のみ
    if (paymentMethod === "konbini") {
      params.append("payment_method_types[0]", "konbini");
      params.append("payment_method_options[konbini][expires_after_days]", String(konbiniExpiresAfterDays));
      // 電話番号欄を Customer.phone で事前入力させる（Stripe 仕様：既存 Customer の phone がプリフィルされる）
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
