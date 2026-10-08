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
