import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("API Route received body:", body);

    const n8nWebhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL
      || process.env.N8N_WEBHOOK_URL
      || 'https://n8n-ier65piurogdeiutvey9onrp.147.93.81.200.sslip.io/webhook-test/okamoshi-contact';

    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error("n8n responded with status:", response.status);
      return NextResponse.json({ error: `n8n error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json().catch(() => ({ status: "ok" }));
    return NextResponse.json({ success: true, data });

  } catch (error: any) {
    console.error("API Route error:", error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
