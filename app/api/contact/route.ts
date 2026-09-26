import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Server API Route received:", body);

    const n8nWebhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL
      || 'http://n8n-ier65piurogdeiutvey9onrp.147.93.81.200.sslip.io/webhook-test/okamoshi-contact';

    // サーバー間通信でn8nへ転送（CORSやブラウザ制限を受けません）
    const res = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("n8n response error:", res.status);
      return NextResponse.json({ success: false, message: `n8n Error: ${res.status}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '送信完了' });
  } catch (error: any) {
    console.error("API Route Internal Error:", error);
    return NextResponse.json({ success: false, message: error.message || 'Server Error' }, { status: 500 });
  }
}
