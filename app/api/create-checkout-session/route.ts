import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Server API Route create-checkout-session received:", body);

    const webhookUrl =
      process.env.CHECKOUT_WEBHOOK_URL ||
      "https://n8n.data-design-lab.com/webhook/create-checkout-session";

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
      return NextResponse.json(
        { success: false, message: `Checkout generation error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("create-checkout-session error:", error);
    return NextResponse.json({ success: false, message: error.message || "Server Error" }, { status: 500 });
  }
}
