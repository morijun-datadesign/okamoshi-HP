import { NextResponse } from 'next/server';

const N8N_WEBHOOK_URL =
  process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ||
  process.env.N8N_WEBHOOK_URL ||
  'http://n8n-ier65piurogdeiutvey9onrp.147.93.81.200.sslip.io/webhook-test/okamoshi-contact';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('[API /api/contact] Received contact request:', body);

    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('[API /api/contact] n8n response status:', n8nResponse.status);

    const responseText = await n8nResponse.text();
    console.log('[API /api/contact] n8n response text:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { message: responseText || 'Success' };
    }

    // n8nのテスト待機時（404含む）でも、通信自体が成立した場合はクライアントに情報を返す
    return NextResponse.json(data, {
      status: n8nResponse.ok ? 200 : n8nResponse.status,
    });
  } catch (error: any) {
    console.error('[API /api/contact] Error forwarding to n8n:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
