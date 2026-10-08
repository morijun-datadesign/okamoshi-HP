interface Env {
  STRIPE_SECRET_KEY?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as Record<string, any>;
    console.log("[functions/api/create-checkout-session] Received request:", JSON.stringify(body));

    const stripeSecretKey =
      context.env.STRIPE_SECRET_KEY ||
      (typeof process !== "undefined" && process.env?.STRIPE_SECRET_KEY) ||
      "";

    if (!stripeSecretKey) {
      console.error("[functions/api/create-checkout-session] STRIPE_SECRET_KEY is not configured.");
      return new Response(
        JSON.stringify({
          success: false,
          message: "Stripe APIキー（STRIPE_SECRET_KEY）が環境変数に設定されていません。Cloudflare Pages の設定をご確認ください。",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Origin と success_url / cancel_url の正確な生成
    const reqUrl = new URL(context.request.url);
    const origin =
      context.request.headers.get("origin") ||
      context.request.headers.get("x-forwarded-host") ? `https://${context.request.headers.get("x-forwarded-host")}` :
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
    const amountVal = Math.round(Number(body.amount || body.total_amount || body.price || existingMeta.amount || existingMeta.total_amount || (Array.isArray(body.exams) && body.exams[0]?.price) || 0)) || 4400;
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

    // 3. metadata の構築とサニタイズ（全値文字列・最大500文字・キー長最大40文字）
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

    // フォームから渡された existingMeta もマージ
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

    // 決済方法
    if (paymentMethod === "konbini") {
      params.append("payment_method_types[0]", "card");
      params.append("payment_method_types[1]", "konbini");
      params.append("payment_method_options[konbini][expires_after_days]", "3");
    } else {
      params.append("payment_method_types[0]", "card");
    }

    // 商品・金額（JPYはゼロデシマル）
    params.append("line_items[0][price_data][currency]", "jpy");
    params.append("line_items[0][price_data][unit_amount]", String(amountVal));
    params.append("line_items[0][price_data][product_data][name]", examName);
    params.append("line_items[0][quantity]", "1");

    // metadata
    for (const [key, value] of Object.entries(sanitizedMetadata)) {
      params.append(`metadata[${key}]`, value);
    }

    console.log("[functions/api/create-checkout-session] Dispatching directly to Stripe API...");

    // 5. Stripe API 直接呼び出し（n8n 完全撤廃）
    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Okamoshi-Cloudflare-Functions/1.0",
      },
      body: params.toString(),
    });

    const stripeRawText = await stripeRes.text();
    let stripeData: any = {};
    try {
      stripeData = JSON.parse(stripeRawText);
    } catch (parseErr) {
      console.error("[functions/api/create-checkout-session] Stripe response JSON parse error:", stripeRawText);
    }

    if (!stripeRes.ok) {
      console.error("[functions/api/create-checkout-session] Stripe API error:", stripeRes.status, stripeRawText);
      const errorMsg = stripeData?.error?.message || `Stripe API Error (HTTP ${stripeRes.status})`;
      return new Response(
        JSON.stringify({ success: false, message: errorMsg }),
        { status: stripeRes.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const sessionUrl = stripeData.url;
    const sessionId = stripeData.id;

    if (!sessionUrl) {
      console.error("[functions/api/create-checkout-session] No url returned from Stripe:", stripeData);
      return new Response(
        JSON.stringify({ success: false, message: "Stripeから決済URLが返却されませんでした。" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("[functions/api/create-checkout-session] Stripe Checkout Session successfully created:", sessionId);

    // 6. 要求形式通りのレスポンス返却
    const responsePayload = {
      url: sessionUrl,
      checkout_url: sessionUrl,
      session_id: sessionId,
      sessionId: sessionId,
      id: sessionId,
      success: true,
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[functions/api/create-checkout-session] Internal Exception:", error);
    return new Response(
      JSON.stringify({ success: false, message: error.message || "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
