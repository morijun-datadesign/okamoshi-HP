export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const N8N_WEBHOOK_URL =
    process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ||
    process.env.N8N_WEBHOOK_URL ||
    'http://n8n-ier65piurogdeiutvey9onrp.147.93.81.200.sslip.io/webhook-test/okamoshi-contact';

  try {
    const body = req.body;
    console.log('[Pages API /api/contact] Received contact request:', body);

    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('[Pages API /api/contact] n8n response status:', n8nResponse.status);
    const responseText = await n8nResponse.text();
    console.log('[Pages API /api/contact] n8n response text:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { message: responseText || 'Success' };
    }

    return res.status(n8nResponse.ok ? 200 : n8nResponse.status).json(data);
  } catch (error: any) {
    console.error('[Pages API /api/contact] Error forwarding to n8n:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
