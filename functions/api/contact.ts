interface Env {
  NEXT_PUBLIC_N8N_WEBHOOK_URL?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json();
    console.log("Cloudflare Function received:", body);

    const n8nWebhookUrl =
      context.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ||
      'http://n8n-ier65piurogdeiutvey9onrp.147.93.81.200.sslip.io/webhook/okamoshi-contact';

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
      return new Response(
        JSON.stringify({ success: false, message: `n8n Error: ${res.status}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: '送信完了' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error("Function Internal Error:", error);
    return new Response(
      JSON.stringify({ success: false, message: error.message || 'Server Error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
