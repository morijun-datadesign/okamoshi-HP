/**
 * お問い合わせフォーム 設定ファイル
 * n8n Webhook URL などのエンドポイント設定
 */
(function() {
  window.CONTACT_CONFIG = {
    // n8n Webhook URL
    // 環境変数 NEXT_PUBLIC_N8N_WEBHOOK_URL または window.N8N_WEBHOOK_URL を優先
    webhookUrl: (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL)
      || window.NEXT_PUBLIC_N8N_WEBHOOK_URL
      || window.N8N_WEBHOOK_URL
      || 'https://n8n.example.com/webhook/okamoshi-contact'
  };
})();
