import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const event = await request.json();
    console.log("Stripe webhook received event:", event?.type);

    const gasUrl =
      process.env.GAS_APPLY_URL ||
      "https://script.google.com/macros/s/AKfycbwYljLEwbfFCQWx-c6JneJUDINYbhYl0_M1-e9CwhBskBvRBEdIuwNotYceCg5i6M9z/exec";

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

    const gasPayload = {
      received_at: jstReceivedAt,
      session_id: session.id || metadata.session_id || "",
      exam_name: metadata.exam_name || "岡山県統一模擬試験",
      venue_name: metadata.venue_name || "会場未指定",
      amount: Number(session.amount_total || metadata.total_amount || 0),
      payment_status: session.payment_status || "paid",
      payment_method: session.payment_method_types?.[0] || metadata.payment_method || "card",
      student_name: metadata.student_name || customerDetails.name || "",
      student_kana: metadata.student_kana || "",
      grade: metadata.grade || metadata.student_grade_label || metadata.student_grade || "",
      school_name: metadata.school_name || metadata.student_school || "",
      parent_name: metadata.parent_name || customerDetails.name || "",
      email: customerDetails.email || session.customer_email || metadata.email || "",
      phone: customerDetails.phone || metadata.phone || "",
      postal_code: metadata.postal_code || customerDetails.address?.postal_code || "",
      prefecture: metadata.prefecture || customerDetails.address?.state || "",
      city: metadata.city || customerDetails.address?.city || "",
      address1: metadata.address1 || customerDetails.address?.line1 || "",
      address2: metadata.address2 || customerDetails.address?.line2 || "",
      metadata: metadata,
    };

    console.log("Stripe Webhook forwarding normalized payload to GAS:", gasPayload);

    const gasRes = await fetch(gasUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Okamoshi-StripeWebhook/1.0",
      },
      body: JSON.stringify(gasPayload),
      redirect: "follow",
    });

    const gasResult = await gasRes.json().catch(() => ({ status: "success" }));
    return NextResponse.json({ received: true, gas: gasResult });
  } catch (error: any) {
    console.error("Stripe webhook error:", error);
    return NextResponse.json({ error: error.message || "Webhook error" }, { status: 500 });
  }
}
