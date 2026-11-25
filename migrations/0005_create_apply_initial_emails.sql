-- 0005: 初回受付メール（申込者サンクス＋管理者通知）送信冪等性管理テーブル
-- 同一 session_id に対して /api/apply と /api/stripe-webhook のどちらが先に実行されても、
-- またリロード・Webhook再送が発生しても初回メールがシステム全体で必ず1回だけ送信されることを保証する。
CREATE TABLE IF NOT EXISTS apply_initial_emails (
  session_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'processing',      -- 'processing' | 'sent' | 'failed'
  source TEXT NOT NULL DEFAULT '',                -- ロック獲得元: 'apply_api' | 'stripe_webhook'
  payment_status TEXT NOT NULL DEFAULT '',        -- 'paid' | 'unpaid'
  payment_method TEXT NOT NULL DEFAULT '',        -- 'card' | 'konbini'
  applicant_email TEXT NOT NULL DEFAULT '',
  admin_mail_id TEXT,
  applicant_mail_id TEXT,
  last_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_apply_initial_emails_status_updated
  ON apply_initial_emails(status, updated_at);
