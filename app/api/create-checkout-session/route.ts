import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Server API Route create-checkout-session received:", body);

    const webhookUrl =
      process.env.CHECKOUT_WEBHOOK_URL ||
      "https://n8n.data-design-lab.com/webhook/create-checkout-session";

    const existingMeta = body.metadata || {};
    const studentName = String(body.student_name || body.client_reference_id || existingMeta.student_name || "");
    const studentKana = String(body.student_kana || body.student_kana_name || body.kana || existingMeta.student_kana || existingMeta.kana || "");
    const grade = String(body.grade || body.student_grade_label || body.student_grade || existingMeta.grade || existingMeta.student_grade || "");
    const schoolName = String(body.school_name || body.student_school || body.school || existingMeta.school_name || existingMeta.school || "");
    const parentName = String(body.parent_name || body.guardian_name || existingMeta.parent_name || "");
    const venueName = String(body.venue_name || body.venue || body.venueName || (Array.isArray(body.exams) && body.exams[0]?.venue_name) || (Array.isArray(body.exams) && body.exams[0]?.venue) || existingMeta.venue_name || existingMeta.venue || "会場未指定");
    const amountStr = String(body.amount || body.total_amount || body.price || existingMeta.amount || existingMeta.total_amount || (Array.isArray(body.exams) && body.exams[0]?.price) || "0");
    const phone = String(body.phone || existingMeta.phone || "");
    const email = String(body.email || body.customer_email || existingMeta.email || "");
    const postalCode = String(body.postal_code || existingMeta.postal_code || "");
    const prefecture = String(body.prefecture || existingMeta.prefecture || "");
    const city = String(body.city || body.address_line1 || existingMeta.city || "");
    const address1 = String(body.address1 || body.address_line2 || existingMeta.address1 || "");
    const address2 = String(body.address2 || body.address_line3 || existingMeta.address2 || "");
    const address = String(body.address || existingMeta.address || [prefecture, city, address1, address2].filter(Boolean).join(" "));
    const examName = String(body.exam_name || (Array.isArray(body.exams) && body.exams[0]?.title) || existingMeta.exam_name || "岡山県統一模擬試験");
    const paymentMethod = String(body.payment_method || body.selected_payment_method || (body.raw_payment_method === "convenience_store" ? "konbini" : "card"));

    const enrichedMetadata = {
      ...existingMeta,
      student_name: studentName,
      student_kana: studentKana,
      grade: grade,
      school_name: schoolName,
      parent_name: parentName,
      venue_name: venueName,
      amount: amountStr,
      exam_name: examName,
      payment_method: paymentMethod,
      phone: phone,
      email: email,
      postal_code: postalCode,
      prefecture: prefecture,
      city: city,
      address1: address1,
      address2: address2,
      address: address,

      // Aliases
      venue: venueName,
      venueName: venueName,
      school: schoolName,
      student_school: schoolName,
      student_grade: grade,
      student_grade_label: grade,
      student_kana_name: studentKana,
      kana: studentKana,
      parent_kana: String(body.parent_kana || existingMeta.parent_kana || ""),
      total_amount: amountStr,
      selected_payment_method: paymentMethod
    };

    // Stripe metadata の完全サニタイズ（全値文字列・最大500文字・オブジェクト除外）
    const sanitizedMetadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(enrichedMetadata)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "object") continue; // Stripe制限：オブジェクトや配列は禁止
      const strVal = String(value).trim();
      if (strVal.length > 0) {
        sanitizedMetadata[String(key).slice(0, 40)] = strVal.slice(0, 500);
      }
    }

    body.metadata = sanitizedMetadata;
    body.student_name = studentName;
    body.student_kana = studentKana;
    body.grade = grade;
    body.school_name = schoolName;
    body.parent_name = parentName;
    body.venue_name = venueName;
    body.amount = Number(amountStr) || body.amount || 0;
    body.total_amount = body.amount;
    body.email = email;
    body.customer_email = email;

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify(body),
    });

    const rawText = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("Checkout session generator error:", res.status, rawText);
      return NextResponse.json(
        { success: false, message: `Checkout generation error: ${res.status}` },
        { status: res.status }
      );
    }

    let data: any = {};
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        console.warn("Failed to parse JSON response from checkout webhook:", rawText);
      }
    }

    const checkoutUrl = (data && (data.checkout_url || data.url)) || (Array.isArray(data) && (data[0]?.checkout_url || data[0]?.url)) || "";
    const sessionId = (data && (data.session_id || data.sessionId || data.id)) || (checkoutUrl ? checkoutUrl.match(/(cs_[a-zA-Z0-9_]+)/)?.[1] : "") || "";

    if (!checkoutUrl) {
      console.error("No checkout_url returned from webhook:", rawText);
      return NextResponse.json(
        { success: false, message: "決済URLの発行に失敗しました。" },
        { status: 502 }
      );
    }

    const responsePayload = {
      url: checkoutUrl,
      checkout_url: checkoutUrl,
      session_id: sessionId,
      sessionId: sessionId,
      id: sessionId,
      success: true
    };

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error("create-checkout-session error:", error);
    return NextResponse.json({ success: false, message: error.message || "Server Error" }, { status: 500 });
  }
}
