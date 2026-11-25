/**
 * バックエンド堅牢化（冪等性メール配信・Stripe 100件上限突破・GASバッチ更新）単体テスト
 * 実行: node tests/unit/backend-hardening.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const ROOT = process.cwd();

async function bundleAndImportTs(relPath, outDir, name) {
  const outFile = path.join(outDir, `${name}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(ROOT, relPath)],
    outfile: outFile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    mainFields: ['module', 'main'],
  });
  return import(pathToFileURL(outFile).href);
}

/**
 * apply_initial_emails テーブル用のインメモリ D1Database モック
 */
function createMockD1() {
  const rows = new Map();

  const normalizeSql = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  const parseOffsetSeconds = (sql) => {
    const m = sql.match(/datetime\('now',\s*'-(\d+)\s+seconds'\)/i);
    return m ? Number(m[1]) : 120;
  };

  class MockPreparedStatement {
    constructor(sql) {
      this.sql = normalizeSql(sql);
      this.params = [];
    }
    bind(...args) {
      this.params = args;
      return this;
    }
    async run() {
      const s = this.sql;
      if (/^CREATE TABLE IF NOT EXISTS/i.test(s) || /^CREATE INDEX IF NOT EXISTS/i.test(s)) {
        return { success: true, meta: { changes: 0 } };
      }
      if (/^INSERT INTO apply_initial_emails/i.test(s)) {
        const [sessionId, source, paymentStatus, paymentMethod, applicantEmail] = this.params;
        if (rows.has(sessionId)) {
          return { success: true, meta: { changes: 0 } };
        }
        const nowMs = Date.now();
        rows.set(sessionId, {
          session_id: sessionId,
          status: 'processing',
          source,
          payment_status: paymentStatus,
          payment_method: paymentMethod,
          applicant_email: applicantEmail,
          admin_mail_id: null,
          applicant_mail_id: null,
          last_error: null,
          attempts: 1,
          created_at_ms: nowMs,
          updated_at_ms: nowMs,
          sent_at: null,
        });
        return { success: true, meta: { changes: 1 } };
      }
      if (/^UPDATE apply_initial_emails SET status = 'processing'/i.test(s)) {
        const [source, paymentStatus, paymentMethod, applicantEmail, sessionId] = this.params;
        const row = rows.get(sessionId);
        const staleSec = parseOffsetSeconds(s);
        const isStale = row ? Date.now() - row.updated_at_ms >= staleSec * 1000 : false;
        if (!row || !(row.status === 'failed' || (row.status === 'processing' && isStale))) {
          return { success: true, meta: { changes: 0 } };
        }
        row.status = 'processing';
        row.source = source;
        row.payment_status = paymentStatus;
        row.payment_method = paymentMethod;
        row.applicant_email = applicantEmail;
        row.attempts += 1;
        row.updated_at_ms = Date.now();
        return { success: true, meta: { changes: 1 } };
      }
      if (/^UPDATE apply_initial_emails SET status = 'sent'/i.test(s)) {
        const [adminMailId, applicantMailId, sessionId] = this.params;
        const row = rows.get(sessionId);
        if (!row) return { success: true, meta: { changes: 0 } };
        row.status = 'sent';
        row.admin_mail_id = adminMailId;
        row.applicant_mail_id = applicantMailId;
        row.last_error = null;
        row.sent_at = new Date().toISOString();
        row.updated_at_ms = Date.now();
        return { success: true, meta: { changes: 1 } };
      }
      if (/^UPDATE apply_initial_emails SET status = 'failed'/i.test(s)) {
        if (this.params.length === 2) {
          const [lastError, sessionId] = this.params;
          const row = rows.get(sessionId);
          if (!row) return { success: true, meta: { changes: 0 } };
          row.status = 'failed';
          row.last_error = lastError;
          row.updated_at_ms = Date.now();
          return { success: true, meta: { changes: 1 } };
        }
        const [adminMailId, applicantMailId, lastError, sessionId] = this.params;
        const row = rows.get(sessionId);
        if (!row) return { success: true, meta: { changes: 0 } };
        row.status = 'failed';
        row.admin_mail_id = adminMailId;
        row.applicant_mail_id = applicantMailId;
        row.last_error = lastError;
        row.updated_at_ms = Date.now();
        return { success: true, meta: { changes: 1 } };
      }
      throw new Error(`Unexpected SQL run: ${s}`);
    }
    async first() {
      const s = this.sql;
      if (/^SELECT .* FROM apply_initial_emails WHERE session_id = \?/i.test(s)) {
        const [sessionId] = this.params;
        const row = rows.get(sessionId);
        if (!row) return null;
        const staleSec = parseOffsetSeconds(s);
        const isStale = Date.now() - row.updated_at_ms >= staleSec * 1000 ? 1 : 0;
        return { ...row, is_stale: isStale };
      }
      throw new Error(`Unexpected SQL first: ${s}`);
    }
  }

  return {
    prepare(sql) {
      return new MockPreparedStatement(sql);
    },
    _rows: rows,
  };
}

function buildStripeSession(id, overrides = {}) {
  return {
    id,
    object: 'checkout.session',
    status: 'complete',
    payment_status: 'paid',
    payment_method_types: ['card'],
    amount_total: 5500,
    created: 1795000000,
    success_url: 'https://okayama-moshi.com/apply/success?session_id=' + id,
    customer_email: 'parent@example.com',
    customer_details: {
      email: 'parent@example.com',
      name: '岡山 花子',
      phone: '+819012345678',
      address: {
        postal_code: '7000822',
        state: '岡山県',
        city: '岡山市北区',
        line1: '表町1-5-1',
        line2: 'ビル3F',
      },
    },
    metadata: {
      source: 'okamoshi_apply',
      student_name: '岡山 太郎',
      student_kana: 'オカヤマ タロウ',
      grade: '中学3年生',
      school_name: '岡山市立操南中学校',
      parent_name: '岡山 花子',
      parent_kana: 'オカヤマ ハナコ',
      email: 'parent@example.com',
      phone: '09012345678',
      postal_code: '7000822',
      pref: '岡山県',
      city: '岡山市北区',
      addr1: '表町1-5-1',
      venue_name: '岡山会場（山陽学園中学校・高等学校）',
      exam_name: '12月号（岡山県統一模擬試験）',
      payment_method: 'card',
      amount: '5500',
      exam_1: JSON.stringify({
        id: 'c3_12',
        label: '12月号（岡山県統一模擬試験）',
        issue: '12月号',
        title: '岡山県統一模擬試験',
        venue: '岡山会場（山陽学園中学校・高等学校）',
        price: 5500,
        date: '2026年12月26日(土)',
      }),
    },
    ...overrides,
  };
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okamoshi-unit-'));

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('初回受付メール冪等性: /api/apply と stripe-webhook の同時着弾・リロード・未到達・部分失敗リトライ', async () => {
  const applyMod = await bundleAndImportTs('functions/api/apply.ts', tmpDir, 'apply');
  const webhookMod = await bundleAndImportTs('functions/api/stripe-webhook.ts', tmpDir, 'webhook');

  const originalFetch = globalThis.fetch;
  try {
    // --- シナリオ 1 & 2: 同一 session_id で /api/apply と stripe-webhook を同時実行 → 1回だけ送信 + 後続リロードスキップ
    {
      const db = createMockD1();
      const resendCalls = [];
      const gasCalls = [];
      const session = buildStripeSession('cs_unit_race_001');

      globalThis.fetch = async (url, init = {}) => {
        const u = String(url);
        if (u.startsWith('https://api.stripe.com/v1/checkout/sessions/')) {
          return new Response(JSON.stringify(session), { status: 200 });
        }
        if (u === 'https://api.resend.com/emails') {
          const payload = JSON.parse(init.body);
          const idempKey = init.headers?.['Idempotency-Key'] || init.headers?.['idempotency-key'];
          resendCalls.push({ payload, idempKey });
          // レース状況をリアルに再現するため初回リクエストで少し遅延を入れる
          await new Promise((r) => setTimeout(r, 40));
          return new Response(JSON.stringify({ id: `mail_${resendCalls.length}` }), { status: 200 });
        }
        if (u.includes('script.google.com')) {
          gasCalls.push(JSON.parse(init.body));
          return new Response(JSON.stringify({ status: 'success', created: 1 }), { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${u}`);
      };

      const env = {
        DB: db,
        STRIPE_SECRET_KEY: 'test-stripe-secret',
        RESEND_API_KEY: 'test-resend-secret',
        GAS_APPLY_URL: 'https://script.google.com/macros/s/test/exec',
        GAS_SHARED_SECRET: 'test-gas-secret',
      };

      const applyReq = new Request('https://okayama-moshi.com/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'cs_unit_race_001' }),
      });
      const webhookReq = new Request('https://okayama-moshi.com/api/stripe-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'evt_unit_001',
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_unit_race_001' } },
        }),
      });

      const [applyRes, webhookRes] = await Promise.all([
        applyMod.onRequestPost({ request: applyReq, env }),
        webhookMod.onRequestPost({ request: webhookReq, env }),
      ]);

      const applyJson = await applyRes.json();
      const webhookJson = await webhookRes.json();

      assert.equal(applyRes.status, 200);
      assert.equal(webhookRes.status, 200);
      assert.equal(gasCalls.length, 1, 'GAS create は Webhook から1回実行されること');
      assert.equal(gasCalls[0].records[0].exam_name, '12月号', 'GAS C列(exam_name)は月号のみになること');
      assert.equal(gasCalls[0].records[0].venue_name, '岡山会場', 'GAS D列(venue_name)は会場区分名のみになること');
      assert.equal(resendCalls.length, 2, '管理者1通＋申込者1通の計2通のみ送信されること');
      const sentUserMail = resendCalls.find((c) => c.payload.to.includes('parent@example.com'));
      assert.match(sentUserMail.payload.text, /12月号（岡山県統一模擬試験）/, 'メール本文は従来の label を維持すること');
      assert.notEqual(
        applyJson.already_sent,
        webhookJson.already_sent,
        '同時実行の片方が送信し、もう片方は already_sent=true になること'
      );
      assert.deepEqual(
        resendCalls.map((c) => c.idempKey).sort(),
        ['apply-initial-admin:cs_unit_race_001', 'apply-initial-user:cs_unit_race_001']
      );

      // リロード再実行（2回目・3回目）
      for (let i = 0; i < 2; i++) {
        const reloadReq = new Request('https://okayama-moshi.com/api/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: 'cs_unit_race_001' }),
        });
        const reloadRes = await applyMod.onRequestPost({ request: reloadReq, env });
        const reloadJson = await reloadRes.json();
        assert.equal(reloadJson.already_sent, true, '完了画面リロード時は already_sent=true になること');
      }
      assert.equal(resendCalls.length, 2, 'リロード後もメール送信回数は増えないこと');
    }

    // --- シナリオ 3: 完了画面未到達時でも Webhook 単独でコンビニ払込票付き初回メール送信
    {
      const db = createMockD1();
      const resendCalls = [];
      const konbiniSession = buildStripeSession('cs_unit_konbini_002', {
        payment_status: 'unpaid',
        payment_method_types: ['konbini'],
        payment_intent: {
          id: 'pi_unit_konbini',
          next_action: {
            konbini_display_details: {
              hosted_voucher_url: 'https://payments.stripe.com/konbini/voucher/test123',
              expires_at: 1795259200,
              stores: {
                lawson: { payment_code: '12345678', confirmation_number: '9999' },
              },
            },
          },
        },
        metadata: {
          ...buildStripeSession('cs_unit_konbini_002').metadata,
          payment_method: 'konbini',
        },
      });

      globalThis.fetch = async (url, init = {}) => {
        const u = String(url);
        if (u.startsWith('https://api.stripe.com/v1/checkout/sessions/')) {
          return new Response(JSON.stringify(konbiniSession), { status: 200 });
        }
        if (u === 'https://api.resend.com/emails') {
          resendCalls.push(JSON.parse(init.body));
          return new Response(JSON.stringify({ id: `mail_k_${resendCalls.length}` }), { status: 200 });
        }
        if (u.includes('script.google.com')) {
          return new Response(JSON.stringify({ status: 'success', created: 1 }), { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${u}`);
      };

      const env = {
        DB: db,
        STRIPE_SECRET_KEY: 'test-stripe-secret',
        RESEND_API_KEY: 'test-resend-secret',
        GAS_APPLY_URL: 'https://script.google.com/macros/s/test/exec',
        GAS_SHARED_SECRET: 'test-gas-secret',
      };

      const webhookReq = new Request('https://okayama-moshi.com/api/stripe-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'evt_unit_k_001',
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_unit_konbini_002' } },
        }),
      });
      const res = await webhookMod.onRequestPost({ request: webhookReq, env });
      const json = await res.json();

      assert.equal(json.already_sent, false);
      assert.equal(resendCalls.length, 2);
      const userMail = resendCalls.find((m) => m.to.includes('parent@example.com'));
      assert.ok(userMail, '申込者宛メールが送信されていること');
      assert.match(userMail.subject, /コンビニ決済のお願い/);
      assert.match(userMail.text, /https:\/\/payments\.stripe\.com\/konbini\/voucher\/test123/);
      assert.match(userMail.text, /12345678/);
    }

    // --- シナリオ 4: 部分失敗（管理者成功・申込者失敗）からのリトライ時、管理者宛は再送せず申込者宛のみ補完送信
    {
      const db = createMockD1();
      const resendCalls = [];
      const session = buildStripeSession('cs_unit_partial_003');
      let failUserOnce = true;

      globalThis.fetch = async (url, init = {}) => {
        const u = String(url);
        if (u.startsWith('https://api.stripe.com/v1/checkout/sessions/')) {
          return new Response(JSON.stringify(session), { status: 200 });
        }
        if (u === 'https://api.resend.com/emails') {
          const body = JSON.parse(init.body);
          resendCalls.push(body);
          if (body.to.includes('parent@example.com') && failUserOnce) {
            failUserOnce = false;
            return new Response(JSON.stringify({ message: 'Simulated 400 error' }), { status: 400 });
          }
          return new Response(JSON.stringify({ id: `mail_p_${resendCalls.length}` }), { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${u}`);
      };

      const env = {
        DB: db,
        STRIPE_SECRET_KEY: 'test-stripe-secret',
        RESEND_API_KEY: 'test-resend-secret',
      };

      // 1回目: 管理者成功、申込者失敗 -> status='failed'
      const req1 = new Request('https://okayama-moshi.com/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'cs_unit_partial_003' }),
      });
      const res1 = await (await applyMod.onRequestPost({ request: req1, env })).json();
      assert.equal(res1.already_sent, false);
      assert.ok(res1.resend.admin_mail_id);
      assert.equal(res1.resend.applicant_mail_id, null);
      assert.equal(db._rows.get('cs_unit_partial_003').status, 'failed');

      // 2回目リトライ: 管理者宛は送らず申込者宛のみ送信して sent に確定
      const req2 = new Request('https://okayama-moshi.com/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'cs_unit_partial_003' }),
      });
      const res2 = await (await applyMod.onRequestPost({ request: req2, env })).json();
      assert.equal(res2.already_sent, false);
      assert.ok(res2.resend.applicant_mail_id);
      assert.equal(resendCalls.length, 3, '初回2回＋リトライ時申込者宛のみ1回＝計3回');
      assert.equal(db._rows.get('cs_unit_partial_003').status, 'sent');

      // 3回目: 完全スキップ
      const req3 = new Request('https://okayama-moshi.com/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'cs_unit_partial_003' }),
      });
      const res3 = await (await applyMod.onRequestPost({ request: req3, env })).json();
      assert.equal(res3.already_sent, true);
      assert.equal(resendCalls.length, 3);
    }

    // --- シナリオ 5: update イベント（期限切れ）時の Idempotency-Key が ASCII のみであること
    {
      const db = createMockD1();
      const idempKeys = [];
      const expiredSession = buildStripeSession('cs_unit_exp_004', {
        status: 'expired',
        payment_status: 'unpaid',
        payment_method_types: ['konbini'],
      });

      globalThis.fetch = async (url, init = {}) => {
        const u = String(url);
        if (u.startsWith('https://api.stripe.com/v1/checkout/sessions/cs_unit_exp_004')) {
          return new Response(JSON.stringify(expiredSession), { status: 200 });
        }
        if (u.startsWith('https://api.stripe.com/v1/checkout/sessions?')) {
          return new Response(JSON.stringify({ data: [], has_more: false }), { status: 200 });
        }
        if (u === 'https://api.resend.com/emails') {
          idempKeys.push(init.headers?.['Idempotency-Key']);
          return new Response(JSON.stringify({ id: `mail_exp_${idempKeys.length}` }), { status: 200 });
        }
        if (u.includes('script.google.com')) {
          return new Response(JSON.stringify({ status: 'success', updated: 1 }), { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${u}`);
      };

      const env = {
        DB: db,
        STRIPE_SECRET_KEY: 'test-stripe-secret',
        RESEND_API_KEY: 'test-resend-secret',
        GAS_APPLY_URL: 'https://script.google.com/macros/s/test/exec',
      };
      const req = new Request('https://okayama-moshi.com/api/stripe-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'evt_exp_004',
          type: 'checkout.session.expired',
          data: { object: { id: 'cs_unit_exp_004' } },
        }),
      });
      const res = await webhookMod.onRequestPost({ request: req, env });
      assert.equal(res.status, 200);
      assert.deepEqual(idempKeys, [
        'apply-update-expired-admin:cs_unit_exp_004',
        'apply-update-expired-user:cs_unit_exp_004',
      ]);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Stripe checkRecentPaidSession: 100件超ページネーション（Phase 1 ＆ Phase 2）', async () => {
  const stripeMod = await bundleAndImportTs('functions/_shared/stripe.ts', tmpDir, 'stripe');
  const originalFetch = globalThis.fetch;

  const makeListItem = (id, email, studentName, examLabel, paymentStatus = 'paid') => ({
    id,
    payment_status: paymentStatus,
    customer_details: { email },
    metadata: {
      student_name: studentName,
      exam_1: JSON.stringify({ label: examLabel, title: '岡山県統一模擬試験' }),
    },
  });

  try {
    // 1. Phase 1（customer_details[email] 絞り込み）で 2ページ目（105件目）の paid セッションを捕捉
    {
      const page1 = Array.from({ length: 100 }, (_, i) =>
        makeListItem(`cs_other_${i}`, 'other@example.com', '別人', '12月号（岡山県統一模擬試験）')
      );
      const page2 = [
        makeListItem('cs_paid_target_105', 'parent@example.com', '岡山太郎', '12月号（岡山県統一模擬試験）'),
      ];
      const requestedUrls = [];

      globalThis.fetch = async (url) => {
        requestedUrls.push(String(url));
        const u = new URL(String(url));
        const after = u.searchParams.get('starting_after');
        if (u.searchParams.get('customer_details[email]') === 'parent@example.com') {
          if (!after) return new Response(JSON.stringify({ data: page1, has_more: true }), { status: 200 });
          if (after === 'cs_other_99') return new Response(JSON.stringify({ data: page2, has_more: false }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [], has_more: false }), { status: 200 });
      };

      const res = await stripeMod.checkRecentPaidSession(
        'parent@example.com',
        '岡山 太郎',
        ['12月号（岡山県統一模擬試験）'],
        'test-stripe-secret',
        'cs_expired_001'
      );
      assert.equal(res.hasPaid, true);
      assert.equal(res.matchedSessionId, 'cs_paid_target_105');
      assert.equal(requestedUrls.length, 2, 'Phase 1 の2ページ走査のみで早期終了すること');
    }

    // 2. Phase 2（大文字小文字差異等で Phase 1 がヒットしない場合でも全件ページネーションで 2ページ目（150件目）を捕捉）
    {
      const page1 = Array.from({ length: 100 }, (_, i) =>
        makeListItem(`cs_bulk_${i}`, 'someone@example.com', '別生徒', '10月号（岡山県統一模擬試験）')
      );
      const page2 = [
        ...Array.from({ length: 49 }, (_, i) =>
          makeListItem(`cs_bulk_${100 + i}`, 'someone@example.com', '別生徒', '10月号（岡山県統一模擬試験）')
        ),
        makeListItem('cs_paid_150_upper', 'Parent@Example.COM', '岡山 太郎', '12月号（岡山県統一模擬試験）'),
      ];

      globalThis.fetch = async (url) => {
        const u = new URL(String(url));
        if (u.searchParams.has('customer_details[email]')) {
          return new Response(JSON.stringify({ data: [], has_more: false }), { status: 200 });
        }
        const after = u.searchParams.get('starting_after');
        if (!after) return new Response(JSON.stringify({ data: page1, has_more: true }), { status: 200 });
        if (after === 'cs_bulk_99') return new Response(JSON.stringify({ data: page2, has_more: true }), { status: 200 });
        return new Response(JSON.stringify({ data: [], has_more: false }), { status: 200 });
      };

      const res = await stripeMod.checkRecentPaidSession(
        'parent@example.com',
        '岡山太郎',
        ['12月号（岡山県統一模擬試験）'],
        'test-stripe-secret',
        'cs_expired_002'
      );
      assert.equal(res.hasPaid, true);
      assert.equal(res.matchedSessionId, 'cs_paid_150_upper');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GAS apply-ledger.gs updateStatus_: バッチ読み書き最適化 ＆ paid上書き禁止保護', () => {
  const gsCode = fs.readFileSync(path.join(ROOT, 'gas/apply-ledger.gs'), 'utf8');
  const ctx = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'JSON' } },
  });
  vm.runInContext(gsCode, ctx);

  // 1000行分のシートを模擬（5行目・7行目が未入金、9行目が paid）
  const grid = Array.from({ length: 1000 }, (_, idx) => {
    const row = new Array(25).fill('');
    row[1] = `cs_other_${idx}`;
    row[5] = '未入金';
    return row;
  });
  grid[3][1] = 'cs_target_batch'; // row 5
  grid[3][5] = '未入金';
  grid[5][1] = 'cs_target_batch'; // row 7
  grid[5][5] = '未入金';
  grid[7][1] = 'cs_target_batch'; // row 9
  grid[7][5] = 'paid';

  const stats = { getValuesCalls: 0, getRangeListCalls: [], singleCellCalls: 0 };
  const mockSheet = {
    getLastRow: () => grid.length + 1,
    getRange(startRow, startCol, numRows, numCols) {
      if (numRows === undefined && numCols === undefined) {
        stats.singleCellCalls++;
        throw new Error('1セル単位の getRange(row, col) が呼ばれました');
      }
      return {
        getValues() {
          stats.getValuesCalls++;
          return grid.slice(startRow - 2, startRow - 2 + numRows).map((r) =>
            r.slice(startCol - 1, startCol - 1 + numCols)
          );
        },
        setValue() {
          stats.singleCellCalls++;
        },
      };
    },
    getRangeList(a1List) {
      stats.getRangeListCalls.push(Array.from(a1List));
      return {
        setValue(val) {
          for (const a1 of a1List) {
            const m = a1.match(/^([A-Z]+)(\d+)$/);
            assert.ok(m);
            assert.equal(m[1], 'F');
            const rowNum = Number(m[2]);
            grid[rowNum - 2][5] = val;
          }
        },
      };
    },
    appendRow() {},
  };

  const result = ctx.updateStatus_(mockSheet, {
    session_id: 'cs_target_batch',
    payment_status: '期限切れ',
  });

  assert.equal(result.status, 'success');
  assert.equal(result.matched, 3);
  assert.equal(result.updated, 2);
  assert.equal(result.skipped, 1);
  assert.equal(stats.getValuesCalls, 1, 'getValues は1回のみであること');
  assert.equal(stats.singleCellCalls, 0, '1セル単位の getValue/setValue が0回であること');
  assert.deepEqual(stats.getRangeListCalls, [['F5', 'F7']], '未入金行 F5, F7 のみバッチ更新されること');
  assert.equal(grid[3][5], '期限切れ');
  assert.equal(grid[5][5], '期限切れ');
  assert.equal(grid[7][5], 'paid', 'paid 行 F9 は上書きされないこと');

  // 該当行0件時のフォールバック新規作成も正常動作すること（C列・D列の括弧除去二重ガード含む）
  let fallbackRowsWritten = null;
  const emptyMockSheet = {
    getLastRow: () => 1,
    getRange(startRow, startCol, numRows, numCols) {
      return {
        getValues: () => [],
        setValues: (rows) => {
          fallbackRowsWritten = { startRow, startCol, numRows, numCols, count: rows.length, rows };
        },
      };
    },
  };
  const fallbackRes = ctx.updateStatus_(emptyMockSheet, {
    session_id: 'cs_missing_fallback',
    payment_status: 'paid',
    records: [{ exam_name: '12月号（岡山県統一模擬試験）', venue_name: '岡山会場(岡山商科大学)', price: 5500 }],
  });
  assert.equal(fallbackRes.status, 'success');
  assert.equal(fallbackRes.fallback_created, true);
  assert.equal(fallbackRes.created, 1);
  assert.equal(fallbackRowsWritten.count, 1);
  assert.equal(fallbackRowsWritten.rows[0][2], '12月号');
  assert.equal(fallbackRowsWritten.rows[0][3], '岡山会場');

  // stripParens_ / buildRow_ 直接テスト
  assert.equal(ctx.stripParens_('12月号(岡山県統一模擬試験)'), '12月号');
  assert.equal(ctx.stripParens_('12月号（岡山県統一模擬試験）'), '12月号');
  assert.equal(ctx.stripParens_('倉敷会場（作陽学園高等学校）'), '倉敷会場');
  assert.equal(ctx.stripParens_('岡山会場(岡山商科大学)'), '岡山会場');

  const rowKurashiki = ctx.buildRow_(
    { session_id: 'cs_gas_guard_1', payment_status: 'paid' },
    { exam_name: '12月号(岡山県統一模擬試験)', venue_name: '倉敷会場(作陽学園高等学校)', price: 5500 }
  );
  assert.equal(rowKurashiki[2], '12月号', 'C列は月号のみになること');
  assert.equal(rowKurashiki[3], '倉敷会場', 'D列は会場区分名のみになること');

  const rowOkayama = ctx.buildRow_(
    { session_id: 'cs_gas_guard_2', payment_status: 'paid' },
    { issue_name: '12月号', exam_name: '12月号（岡山県統一模擬試験）', venue_name: '岡山会場(岡山商科大学)', price: 5500 }
  );
  assert.equal(rowOkayama[2], '12月号');
  assert.equal(rowOkayama[3], '岡山会場');

  // doGet(e) 動作確認 ＆ ?action=unsubscribe -> handleUnsubscribeGet_(e) 連携テスト
  assert.deepEqual(JSON.parse(ctx.doGet()), {
    status: 'success',
    message: 'okamoshi apply ledger is running',
  });
  assert.deepEqual(JSON.parse(ctx.doGet({ parameter: {} })), {
    status: 'success',
    message: 'okamoshi apply ledger is running',
  });
  // handleUnsubscribeGet_ 未定義時も例外なく稼働確認 JSON にフォールバックすること
  assert.deepEqual(JSON.parse(ctx.doGet({ parameter: { action: 'unsubscribe' } })), {
    status: 'success',
    message: 'okamoshi apply ledger is running',
  });
  // handleUnsubscribeGet_ 定義時は ?action=unsubscribe で委譲されること
  const capturedUnsubEvents = [];
  const mockUnsubOutput = { type: 'HtmlOutput', content: 'unsubscribed-ok' };
  ctx.handleUnsubscribeGet_ = (ev) => {
    capturedUnsubEvents.push(ev);
    return mockUnsubOutput;
  };
  const unsubEvent = { parameter: { action: 'unsubscribe', e: 'parent@example.com', s: 'sig123' } };
  const unsubRes = ctx.doGet(unsubEvent);
  assert.equal(capturedUnsubEvents.length, 1);
  assert.equal(capturedUnsubEvents[0], unsubEvent);
  assert.equal(unsubRes, mockUnsubOutput);
});

test('exam.ts 短縮表記正規化: normalizeVenueShortName / normalizeIssueShortName / records生成', async () => {
  const examMod = await bundleAndImportTs('functions/_shared/exam.ts', tmpDir, 'exam');

  // normalizeVenueShortName
  assert.equal(examMod.normalizeVenueShortName('倉敷会場（作陽学園高等学校）'), '倉敷会場');
  assert.equal(examMod.normalizeVenueShortName('倉敷会場(作陽学園高等学校)'), '倉敷会場');
  assert.equal(examMod.normalizeVenueShortName('岡山会場(岡山商科大学)'), '岡山会場');
  assert.equal(examMod.normalizeVenueShortName('津山会場（会場未定）'), '津山会場');
  assert.equal(examMod.normalizeVenueShortName('自宅受験（問題冊子郵送・期日内答案返送）'), '自宅受験');
  assert.equal(examMod.normalizeVenueShortName('venue_kurashiki'), '倉敷会場');
  assert.equal(examMod.normalizeVenueShortName('home'), '自宅受験');

  // normalizeIssueShortName
  assert.equal(examMod.normalizeIssueShortName('12月号（岡山県統一模擬試験）'), '12月号');
  assert.equal(examMod.normalizeIssueShortName('12月号(岡山県統一模擬試験)'), '12月号');
  assert.equal(examMod.normalizeIssueShortName('12月号', '12月号（岡山県統一模擬試験）', 'c3_12'), '12月号');
  assert.equal(examMod.normalizeIssueShortName('', '12月号（岡山県統一模擬試験）', 'c3_12'), '12月号');
  assert.equal(examMod.normalizeIssueShortName('12月'), '12月号');
  assert.equal(examMod.normalizeIssueShortName('', '', 'c3_12'), '12月号');

  // recordsFromExams
  const recsFromExams = examMod.recordsFromExams([
    {
      id: 'c3_12',
      title: '岡山県統一模擬試験',
      issue_name: '12月号',
      venue_name: '倉敷会場（作陽学園高等学校）',
      venue_type: '倉敷会場',
      price: 5500,
      exam_date: '2026年12月26日(土)',
    },
  ]);
  assert.equal(recsFromExams.length, 1);
  assert.equal(recsFromExams[0].issue, '12月号');
  assert.equal(recsFromExams[0].venue, '倉敷会場');
  assert.equal(recsFromExams[0].label, '12月号（岡山県統一模擬試験）');

  // recordsFromMetadata
  const recsFromMeta = examMod.recordsFromMetadata({
    exam_1: JSON.stringify({
      id: 'c3_12',
      label: '12月号(岡山県統一模擬試験)',
      issue: '',
      title: '岡山県統一模擬試験',
      venue: '岡山会場(岡山商科大学)',
      price: 5500,
      date: '2026年12月26日(土)',
    }),
  });
  assert.equal(recsFromMeta.length, 1);
  assert.equal(recsFromMeta[0].issue, '12月号');
  assert.equal(recsFromMeta[0].venue, '岡山会場');
  assert.equal(recsFromMeta[0].label, '12月号(岡山県統一模擬試験)');
});

test('create-checkout-session.ts ＆ stripe-webhook.ts: 短縮名メタデータ格納とGAS連携・メール文面維持', async () => {
  const checkoutMod = await bundleAndImportTs('functions/api/create-checkout-session.ts', tmpDir, 'checkout');
  const webhookMod = await bundleAndImportTs('functions/api/stripe-webhook.ts', tmpDir, 'webhook_short');
  const originalFetch = globalThis.fetch;

  try {
    // 1. create-checkout-session.ts が metadata に短縮 venue_type / issue_name / exam_1 を格納すること
    let capturedSessionParams = null;
    globalThis.fetch = async (url, init = {}) => {
      const u = String(url);
      if (u.includes('turnstile/v0/siteverify')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (u === 'https://api.stripe.com/v1/customers') {
        return new Response(JSON.stringify({ id: 'cus_unit_001' }), { status: 200 });
      }
      if (u === 'https://api.stripe.com/v1/checkout/sessions') {
        capturedSessionParams = new URLSearchParams(String(init.body || ''));
        return new Response(
          JSON.stringify({ id: 'cs_checkout_unit_001', url: 'https://checkout.stripe.com/test/cs_checkout_unit_001' }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch: ${u}`);
    };

    const checkoutReq = new Request('https://okayama-moshi.com/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_name: '岡山 太郎',
        grade: '中学3年生',
        parent_name: '岡山 花子',
        email: 'parent@example.com',
        phone: '09012345678',
        venue_name: '倉敷会場（作陽学園高等学校）',
        venue_type: '倉敷会場',
        payment_method: 'card',
        'cf-turnstile-response': 'mock-token',
        exams: [
          {
            id: 'c3_12',
            title: '岡山県統一模擬試験',
            issue_name: '12月号',
            venue: 'venue_kurashiki',
            venue_name: '倉敷会場（作陽学園高等学校）',
            venue_type: '倉敷会場',
            price: 5500,
            exam_date: '2026年12月26日(土)',
          },
        ],
      }),
    });
    const checkoutRes = await checkoutMod.onRequestPost({
      request: checkoutReq,
      env: { STRIPE_SECRET_KEY: 'test-stripe-secret', TURNSTILE_SECRET_KEY: 'test-turnstile-secret' },
    });
    assert.equal(checkoutRes.status, 200);
    assert.ok(capturedSessionParams);
    assert.equal(capturedSessionParams.get('metadata[venue_type]'), '倉敷会場');
    assert.equal(capturedSessionParams.get('metadata[issue_name]'), '12月号');
    const exam1Json = JSON.parse(capturedSessionParams.get('metadata[exam_1]'));
    assert.equal(exam1Json.issue, '12月号');
    assert.equal(exam1Json.venue, '倉敷会場');
    assert.equal(exam1Json.venue_type, '倉敷会場');
    assert.equal(exam1Json.label, '12月号（岡山県統一模擬試験）');

    // 2. stripe-webhook.ts が旧形式（括弧付き）メタデータを受け取っても GAS には短縮名のみ送り、メールには label を残すこと
    const db = createMockD1();
    const gasCalls = [];
    const resendCalls = [];
    const legacyBracketSession = buildStripeSession('cs_unit_short_gas_005', {
      metadata: {
        ...buildStripeSession('cs_unit_short_gas_005').metadata,
        venue_name: '倉敷会場(作陽学園高等学校)',
        exam_name: '12月号(岡山県統一模擬試験)',
        exam_1: JSON.stringify({
          id: 'c3_12',
          label: '12月号(岡山県統一模擬試験)',
          issue: '',
          title: '岡山県統一模擬試験',
          venue: '倉敷会場(作陽学園高等学校)',
          price: 5500,
          date: '2026年12月26日(土)',
        }),
      },
    });

    globalThis.fetch = async (url, init = {}) => {
      const u = String(url);
      if (u.startsWith('https://api.stripe.com/v1/checkout/sessions/')) {
        return new Response(JSON.stringify(legacyBracketSession), { status: 200 });
      }
      if (u === 'https://api.resend.com/emails') {
        resendCalls.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ id: `mail_s_${resendCalls.length}` }), { status: 200 });
      }
      if (u.includes('script.google.com')) {
        gasCalls.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ status: 'success', created: 1 }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${u}`);
    };

    const webhookReq = new Request('https://okayama-moshi.com/api/stripe-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'evt_unit_short_005',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_unit_short_gas_005' } },
      }),
    });
    const webhookRes = await webhookMod.onRequestPost({
      request: webhookReq,
      env: {
        DB: db,
        STRIPE_SECRET_KEY: 'test-stripe-secret',
        RESEND_API_KEY: 'test-resend-secret',
        GAS_APPLY_URL: 'https://script.google.com/macros/s/test/exec',
        GAS_SHARED_SECRET: 'test-gas-secret',
      },
    });
    assert.equal(webhookRes.status, 200);
    assert.equal(gasCalls.length, 1);
    assert.equal(gasCalls[0].records[0].exam_name, '12月号');
    assert.equal(gasCalls[0].records[0].venue_name, '倉敷会場');
    assert.equal(gasCalls[0].records[0].issue_name, '12月号');
    assert.equal(resendCalls.length, 2);
    for (const mail of resendCalls) {
      assert.match(mail.text, /12月号\(岡山県統一模擬試験\)/, '通知メール本文には従来の label が維持されること');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
