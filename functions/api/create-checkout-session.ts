interface Env {
  STRIPE_SECRET_KEY?: string;
  CHECKOUT_WEBHOOK_URL?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json();
    console.log("Cloudflare Function create-checkout-session received:", body);

    const webhookUrl =
      context.env.CHECKOUT_WEBHOOK_URL ||
      (typeof process !== "undefined" && process.env?.CHECKOUT_WEBHOOK_URL) ||
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

    body.metadata = enrichedMetadata;
    body.student_name = studentName;
    body.student_kana = studentKana;
    body.grade = grade;
    body.school_name = schoolName;
    body.parent_name = parentName;
    body.venue_name = venueName;
    body.amount = Number(amountStr) || body.amount || 0;
    body.total_amount = body.amount;

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Okamoshi-Apply/1.0",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Checkout session generator error:", res.status, errText);
      return new Response(
        JSON.stringify({ success: false, message: `Checkout generation error: ${res.status}` }),
        { status: res.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("create-checkout-session error:", error);
    return new Response(
      JSON.stringify({ success: false, message: error.message || "Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
