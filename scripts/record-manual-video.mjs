/**
 * 保護者向け「お申し込みフォーム入力〜クレジットカード決済完了までの操作手順動画」自動撮影スクリプト
 *
 * 出力物（manual_video_assets/ 配下）:
 *  - full_manual.mp4         : 通しで録画した全体動画（780x1688 / H.264 MP4 / 30fps）
 *  - scene_01.mp4〜scene_07.mp4 : Google Vidsのスライド（シーン）ごとに分割した動画
 *  - google_vids_script.md   : 各シーンの実測秒数に合わせたGoogle Vidsコピペ用ナレーション台本
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { chromium } from '@playwright/test';
import { examGuidesFixture, cramSchoolsFixture } from '../tests/e2e/fixtures/api-fixtures.mjs';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'manual_video_assets');
const TMP_VIDEO_DIR = path.join('/tmp', `okamoshi_video_raw_${Date.now()}`);

function resolveFfmpegBinary() {
  const candidates = [
    '/tmp/py_ffmpeg/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1',
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('MP4対応の ffmpeg バイナリが見つかりません。');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const parsed = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(parsed.pathname);
      let filePath = path.join(ROOT, pathname);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      } else if (!fs.existsSync(filePath) && fs.existsSync(`${filePath}.html`)) {
        filePath = `${filePath}.html`;
      } else if (!fs.existsSync(filePath) && fs.existsSync(path.join(filePath, 'index.html'))) {
        filePath = path.join(filePath, 'index.html');
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function buildStripeCheckoutHtml({ email, successUrl }) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>岡山県統一模擬試験 - Stripe Checkout</title>
  <style>
    * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
      background: #ffffff;
      color: #1a1f36;
      padding-bottom: 120px;
    }
    .stripe-header {
      background: #f7fafc;
      border-bottom: 1px solid #e3e8ee;
      padding: 16px 20px 18px;
    }
    .merchant-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .merchant-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 700;
      color: #134230;
    }
    .merchant-icon {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      background: #134230;
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 800;
    }
    .secure-badge {
      font-size: 11px;
      font-weight: 600;
      color: #4f566b;
      background: #edf2f7;
      padding: 3px 8px;
      border-radius: 4px;
    }
    .order-label {
      font-size: 12px;
      color: #697386;
      margin-bottom: 2px;
    }
    .order-amount {
      font-size: 28px;
      font-weight: 800;
      color: #1a1f36;
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }
    .order-item {
      font-size: 13px;
      color: #3c4257;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      padding-top: 8px;
      border-top: 1px dashed #e3e8ee;
    }
    .order-sub {
      font-size: 11.5px;
      color: #697386;
      margin-top: 3px;
    }
    .checkout-main {
      padding: 20px 20px 28px;
    }
    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: #1a1f36;
      margin: 0 0 12px;
    }
    .field-group {
      margin-bottom: 16px;
    }
    .field-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #3c4257;
      margin-bottom: 6px;
    }
    .readonly-box {
      width: 100%;
      padding: 11px 12px;
      border-radius: 6px;
      border: 1px solid #e3e8ee;
      background: #f7fafc;
      color: #3c4257;
      font-size: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-box {
      border: 1px solid #d8dee4;
      border-radius: 6px;
      overflow: hidden;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .card-number-wrap {
      position: relative;
      border-bottom: 1px solid #e3e8ee;
    }
    .stripe-input {
      width: 100%;
      height: 44px;
      padding: 10px 12px;
      border: none;
      font-size: 15px;
      color: #1a1f36;
      outline: none;
      background: transparent;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .stripe-input.sans {
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif;
    }
    .stripe-input:focus {
      background: #f8fbff;
    }
    .card-brands {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      gap: 4px;
      pointer-events: none;
    }
    .brand-pill {
      font-size: 9px;
      font-weight: 800;
      padding: 2px 5px;
      border-radius: 3px;
      border: 1px solid #d8dee4;
      background: #fff;
      color: #1a1f36;
    }
    .brand-pill.visa { color: #1434cb; border-color: #93c5fd; background: #eff6ff; }
    .card-split {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .card-split > div:first-child {
      border-right: 1px solid #e3e8ee;
    }
    .single-input-box {
      border: 1px solid #d8dee4;
      border-radius: 6px;
      overflow: hidden;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .submit-btn {
      width: 100%;
      height: 48px;
      margin-top: 8px;
      border: none;
      border-radius: 6px;
      background: #0070f3;
      color: #ffffff;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(0, 112, 243, 0.25);
      transition: all 0.2s ease;
    }
    .submit-btn.processing {
      background: #005cc5;
    }
    .submit-btn.success {
      background: #10b981;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }
    .spinner {
      width: 18px;
      height: 18px;
      border: 2.5px solid rgba(255,255,255,0.35);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .footer-note {
      margin-top: 16px;
      text-align: center;
      font-size: 11px;
      color: #8792a2;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
  </style>
</head>
<body>
  <div class="stripe-header">
    <div class="merchant-row">
      <div class="merchant-brand">
        <span class="merchant-icon">岡</span>
        <span>岡山県統一模擬試験</span>
      </div>
      <span class="secure-badge">🔒 Stripe 安全決済</span>
    </div>
    <div class="order-label">お支払い合計（税込）</div>
    <div class="order-amount">￥5,500</div>
    <div class="order-item">
      <span>第5回 12月号 岡山県統一模擬試験</span>
      <span>￥5,500</span>
    </div>
    <div class="order-sub">中学3年生 ／ 岡山会場（山陽学園中学校・高等学校）</div>
  </div>

  <div class="checkout-main">
    <div class="field-group">
      <label class="field-label">連絡先メールアドレス</label>
      <div class="readonly-box" id="stripeEmailBox">
        <span>${email}</span>
        <span style="font-size:11px;color:#697386;">確認済み</span>
      </div>
    </div>

    <h2 class="section-title">カード情報</h2>

    <div class="field-group">
      <div class="card-box">
        <div class="card-number-wrap">
          <input id="cardNumber" class="stripe-input" type="text" inputmode="numeric" placeholder="1234 1234 1234 1234" maxlength="19" autocomplete="off">
          <div class="card-brands">
            <span class="brand-pill visa">VISA</span>
            <span class="brand-pill">MC</span>
            <span class="brand-pill">JCB</span>
          </div>
        </div>
        <div class="card-split">
          <div>
            <input id="cardExpiry" class="stripe-input" type="text" inputmode="numeric" placeholder="月 / 年 (MM/YY)" maxlength="7" autocomplete="off">
          </div>
          <div>
            <input id="cardCvc" class="stripe-input" type="text" inputmode="numeric" placeholder="CVC (3桁)" maxlength="4" autocomplete="off">
          </div>
        </div>
      </div>
    </div>

    <div class="field-group">
      <label class="field-label" for="billingName">カード名義人（ローマ字）</label>
      <div class="single-input-box">
        <input id="billingName" class="stripe-input sans" type="text" placeholder="TARO OKAYAMA" autocomplete="off">
      </div>
    </div>

    <button id="stripeSubmitBtn" type="button" class="submit-btn">
      <span id="stripeSubmitText">￥5,500 を支払う</span>
    </button>

    <div class="footer-note">
      <span>Powered by <strong>stripe</strong></span>
      <span>｜</span>
      <span>カード情報は暗号化され安全に処理されます</span>
    </div>
  </div>

  <script>
    const cardNumber = document.getElementById('cardNumber');
    cardNumber.addEventListener('input', () => {
      const digits = cardNumber.value.replace(/\\D/g, '').slice(0, 16);
      cardNumber.value = digits.replace(/(\\d{4})(?=\\d)/g, '$1 ');
    });
    const cardExpiry = document.getElementById('cardExpiry');
    cardExpiry.addEventListener('input', () => {
      const digits = cardExpiry.value.replace(/\\D/g, '').slice(0, 4);
      if (digits.length >= 3) {
        cardExpiry.value = digits.slice(0, 2) + ' / ' + digits.slice(2);
      } else {
        cardExpiry.value = digits;
      }
    });
    const submitBtn = document.getElementById('stripeSubmitBtn');
    submitBtn.addEventListener('click', () => {
      submitBtn.classList.add('processing');
      submitBtn.innerHTML = '<span class="spinner"></span><span>決済を処理しています...</span>';
      setTimeout(() => {
        submitBtn.classList.remove('processing');
        submitBtn.classList.add('success');
        submitBtn.innerHTML = '<span>✓ お支払いが完了しました</span>';
        setTimeout(() => {
          window.location.href = ${JSON.stringify(successUrl)};
        }, 700);
      }, 900);
    });
  </script>
</body>
</html>`;
}

/**
 * ページ内にテロップバー＆赤枠・波紋エフェクト用の DOM / CSS ヘルパーを注入する
 */
async function ensureOverlayHelpers(page) {
  await page.evaluate(() => {
    if (document.getElementById('okamoshi-video-overlay-style')) return;

    const style = document.createElement('style');
    style.id = 'okamoshi-video-overlay-style';
    style.textContent = `
      #okamoshi-caption-bar {
        position: fixed;
        left: 10px;
        right: 10px;
        bottom: 14px;
        z-index: 2147483645;
        background: rgba(15, 23, 42, 0.90);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        color: #ffffff;
        border: 1.5px solid rgba(255, 255, 255, 0.22);
        border-radius: 12px;
        padding: 10px 14px;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
        font-family: "Noto Sans JP", -apple-system, BlinkMacSystemFont, sans-serif;
        pointer-events: none;
        transition: opacity 0.25s ease, transform 0.25s ease;
      }
      #okamoshi-caption-bar .cap-step-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 3px;
      }
      #okamoshi-caption-bar .cap-badge {
        background: #ea580c;
        color: #ffffff;
        font-size: 11px;
        font-weight: 800;
        padding: 2px 8px;
        border-radius: 999px;
        letter-spacing: 0.04em;
        flex-shrink: 0;
      }
      #okamoshi-caption-bar .cap-title {
        font-size: 14px;
        font-weight: 800;
        color: #ffffff;
        line-height: 1.3;
      }
      #okamoshi-caption-bar .cap-sub {
        font-size: 11.5px;
        font-weight: 500;
        color: #e2e8f0;
        line-height: 1.4;
        padding-left: 2px;
      }
      .okamoshi-focus-ring {
        position: fixed;
        z-index: 2147483646;
        pointer-events: none;
        border: 3px solid #ef4444;
        border-radius: 10px;
        box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.28), 0 0 18px rgba(239, 68, 68, 0.55);
        animation: okamoshiPulseBox 0.4s ease-in-out infinite alternate;
      }
      .okamoshi-tap-ripple {
        position: fixed;
        z-index: 2147483647;
        pointer-events: none;
        width: 28px;
        height: 28px;
        margin-left: -14px;
        margin-top: -14px;
        border-radius: 50%;
        background: rgba(239, 68, 68, 0.45);
        border: 2.5px solid #ef4444;
        animation: okamoshiRippleAnim 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes okamoshiPulseBox {
        from { transform: scale(0.99); opacity: 0.9; }
        to   { transform: scale(1.02); opacity: 1; }
      }
      @keyframes okamoshiRippleAnim {
        0%   { transform: scale(0.5); opacity: 1; }
        70%  { transform: scale(2.2); opacity: 0.65; }
        100% { transform: scale(2.7); opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    const bar = document.createElement('div');
    bar.id = 'okamoshi-caption-bar';
    bar.innerHTML = `
      <div class="cap-step-row">
        <span class="cap-badge" id="okamoshi-cap-badge">STEP 1</span>
        <span class="cap-title" id="okamoshi-cap-title">模試と受験会場の選択</span>
      </div>
      <div class="cap-sub" id="okamoshi-cap-sub">お子様の学年・受験する模試・会場を選びます</div>
    `;
    document.body.appendChild(bar);
  });
}

async function setCaption(page, badge, title, sub) {
  await ensureOverlayHelpers(page);
  await page.evaluate(
    ({ b, t, s }) => {
      const badgeEl = document.getElementById('okamoshi-cap-badge');
      const titleEl = document.getElementById('okamoshi-cap-title');
      const subEl = document.getElementById('okamoshi-cap-sub');
      if (badgeEl) badgeEl.textContent = b;
      if (titleEl) titleEl.textContent = t;
      if (subEl) subEl.textContent = s;
    },
    { b: badge, t: title, s: sub }
  );
}

/**
 * 対象要素が画面中央（ヘッダーと下部テロップバーの間）に収まるよう滑らかにスクロールする
 */
async function smoothScrollToLocator(page, locator) {
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  const handle = await locator.elementHandle();
  if (!handle) return;
  await page.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const targetTop = Math.max(0, window.scrollY + rect.top - 210);
    if (Math.abs(window.scrollY - targetTop) > 35) {
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
  }, handle);
  await page.waitForTimeout(750);
}

/**
 * 対象要素を赤枠＋波紋エフェクトで 0.8秒（800ms）光らせる視覚演出
 */
async function highlightTarget(page, locator, durationMs = 800) {
  await ensureOverlayHelpers(page);
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  await locator.evaluate((el, dur) => {
    const rect = el.getBoundingClientRect();
    const ring = document.createElement('div');
    ring.className = 'okamoshi-focus-ring';
    ring.style.left = `${Math.max(4, rect.left - 5)}px`;
    ring.style.top = `${Math.max(4, rect.top - 5)}px`;
    ring.style.width = `${Math.min(window.innerWidth - 8, rect.width + 10)}px`;
    ring.style.height = `${rect.height + 10}px`;
    document.body.appendChild(ring);

    const cx = rect.left + Math.min(rect.width * 0.5, 140);
    const cy = rect.top + rect.height * 0.5;
    const ripple1 = document.createElement('div');
    ripple1.className = 'okamoshi-tap-ripple';
    ripple1.style.left = `${cx}px`;
    ripple1.style.top = `${cy}px`;
    document.body.appendChild(ripple1);

    setTimeout(() => {
      const ripple2 = document.createElement('div');
      ripple2.className = 'okamoshi-tap-ripple';
      ripple2.style.left = `${cx}px`;
      ripple2.style.top = `${cy}px`;
      document.body.appendChild(ripple2);
      setTimeout(() => ripple2.remove(), 650);
    }, 220);

    setTimeout(() => {
      ring.remove();
      ripple1.remove();
    }, dur);
  }, durationMs);
  await page.waitForTimeout(durationMs);
}

async function tapWithEffect(page, locator, { pauseBefore = 1500, pauseAfter = 1600 } = {}) {
  await smoothScrollToLocator(page, locator);
  if (pauseBefore > 0) await page.waitForTimeout(pauseBefore);
  await highlightTarget(page, locator, 800);
  await locator.click();
  if (pauseAfter > 0) await page.waitForTimeout(pauseAfter);
}

async function typeWithEffect(
  page,
  locator,
  text,
  { delay = 100, pauseBefore = 1500, pauseAfter = 1600 } = {}
) {
  await smoothScrollToLocator(page, locator);
  if (pauseBefore > 0) await page.waitForTimeout(pauseBefore);
  await highlightTarget(page, locator, 800);
  await locator.click();
  await locator.pressSequentially(text, { delay });
  if (pauseAfter > 0) await page.waitForTimeout(pauseAfter);
}

function getVideoDurationSec(ffmpegBin, filePath) {
  try {
    execFileSync(ffmpegBin, ['-i', filePath], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    const stderr = String(err.stderr || '');
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (m) {
      return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    }
  }
  return 0;
}

async function main() {
  const ffmpegBin = resolveFfmpegBinary();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(TMP_VIDEO_DIR, { recursive: true });

  const { server, baseUrl } = await startStaticServer();
  console.log(`[Video Recorder] Static server started at ${baseUrl}`);

  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const testEmail = `parent.test.${randomSuffix}@example.com`;
  const checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_manual_demo';
  const successUrl = `${baseUrl}/apply/success?session_id=cs_test_manual_demo`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: 'ja-JP',
    recordVideo: {
      dir: TMP_VIDEO_DIR,
      size: { width: 780, height: 1688 },
    },
  });

  const videoStartMs = performance.now();
  const page = await context.newPage();

  // Turnstile・郵便番号API・決済APIの安定したハンドリング
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch (_) {}
    window.turnstile = {
      getResponse: () => 'demo-turnstile-token',
      execute: () => {},
      reset: () => {},
    };
  });

  await page.route('**/challenges.cloudflare.com/**', (route) => route.abort());
  await page.route('**/api/exam-guides*', (route) => route.fulfill({ json: examGuidesFixture }));
  await page.route('**/api/cram-schools*', (route) => route.fulfill({ json: cramSchoolsFixture }));
  await page.route('**/api/address*', async (route) => {
    await new Promise((r) => setTimeout(r, 200));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prefecture: '岡山県',
        city: '岡山市北区',
        town: '表町',
      }),
    });
  });

  await page.route('**/api/create-checkout-session', async (route) => {
    await new Promise((r) => setTimeout(r, 900));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        session_id: 'cs_test_manual_demo',
        url: checkoutUrl,
      }),
    });
  });

  await page.route('**/api/apply', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route(checkoutUrl, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: buildStripeCheckoutHtml({ email: testEmail, successUrl }),
    });
  });

  const scenes = [];
  const nowSec = () => (performance.now() - videoStartMs) / 1000;

  // =========================================================================
  // SCENE 01: 模試と受験会場の選択
  // =========================================================================
  await page.goto(`${baseUrl}/apply/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});

  const s1Start = nowSec();
  await setCaption(
    page,
    'STEP 1',
    '模試と受験会場の選択',
    'お子様の学年を選び、受験する模試と会場を選択します'
  );
  await page.waitForTimeout(1800);

  // 学年「中3」を選択
  await tapWithEffect(page, page.locator('#grade-btn-chu3'), {
    pauseBefore: 1500,
    pauseAfter: 1700,
  });

  // 模試「第5回 12月号 岡山県統一模擬試験」をチェック
  await tapWithEffect(page, page.locator('#check-r12'), {
    pauseBefore: 1500,
    pauseAfter: 1600,
  });

  // 受験会場「岡山会場（山陽学園中学校・高等学校）」を選択
  const venueSelect = page.locator('#venue-r12');
  await smoothScrollToLocator(page, venueSelect);
  await page.waitForTimeout(1500);
  await highlightTarget(page, venueSelect, 800);
  await venueSelect.selectOption('venue_okayama');
  await page.waitForTimeout(1800);
  const s1End = nowSec();
  scenes.push({
    num: 1,
    file: 'scene_01.mp4',
    start: s1Start,
    end: s1End,
    caption: 'STEP 1：模試と受験会場の選択（お子様の学年を選び、受験する模試と会場を選択します）',
    motion:
      'お申し込みフォームを開き、学年「中3」をタップ →「12月号 岡山県統一模擬試験」にチェック → 受験会場「岡山会場（山陽学園中学校・高等学校）」を選択',
  });

  // =========================================================================
  // SCENE 02: 受験生（お子様）情報の入力
  // =========================================================================
  const s2Start = nowSec();
  await setCaption(
    page,
    'STEP 2',
    '受験生（お子様）情報の入力',
    'お子様の氏名・フリガナ・性別・在籍中学校を入力します'
  );
  await page.waitForTimeout(1500);

  await typeWithEffect(page, page.locator('#studentLastName'), '岡山', {
    delay: 110,
    pauseBefore: 1500,
    pauseAfter: 1200,
  });
  await typeWithEffect(page, page.locator('#studentFirstName'), '太郎', {
    delay: 110,
    pauseBefore: 1200,
    pauseAfter: 1500,
  });
  await typeWithEffect(page, page.locator('#studentKanaLastName'), 'オカヤマ', {
    delay: 100,
    pauseBefore: 1200,
    pauseAfter: 1200,
  });
  await typeWithEffect(page, page.locator('#studentKanaFirstName'), 'タロウ', {
    delay: 100,
    pauseBefore: 1200,
    pauseAfter: 1500,
  });

  // 性別（男子）を選択
  const maleLabel = page.locator('input[name="gender"][value="male"]').locator('..');
  await tapWithEffect(page, maleLabel, {
    pauseBefore: 1500,
    pauseAfter: 1500,
  });

  // 在籍中学校を入力
  await typeWithEffect(page, page.locator('#currentSchool'), '岡山市立操南中学校', {
    delay: 100,
    pauseBefore: 1500,
    pauseAfter: 1200,
  });
  // サジェストドロップダウンを閉じてすっきり見せる
  await page.evaluate(() => {
    const dd = document.getElementById('schoolSuggestDropdown');
    if (dd) dd.classList.add('hidden');
  });
  await page.waitForTimeout(1600);
  const s2End = nowSec();
  scenes.push({
    num: 2,
    file: 'scene_02.mp4',
    start: s2Start,
    end: s2End,
    caption: 'STEP 2：受験生（お子様）情報の入力（お子様の氏名・フリガナ・性別・在籍中学校を入力します）',
    motion:
      '受験生情報へスクロールし、お子様の氏名「岡山 太郎」、フリガナ「オカヤマ タロウ」、性別「男子」、在籍校「岡山市立操南中学校」を順に入力',
  });

  // =========================================================================
  // SCENE 03: 保護者様のお名前・ご連絡先の入力
  // =========================================================================
  const s3Start = nowSec();
  await setCaption(
    page,
    'STEP 3',
    '保護者様のご連絡先の入力',
    '保護者様の氏名・メールアドレス・電話番号を入力します'
  );
  await page.waitForTimeout(1500);

  await typeWithEffect(page, page.locator('#parentLastName'), '岡山', {
    delay: 110,
    pauseBefore: 1500,
    pauseAfter: 1200,
  });
  await typeWithEffect(page, page.locator('#parentFirstName'), '花子', {
    delay: 110,
    pauseBefore: 1200,
    pauseAfter: 1500,
  });
  await typeWithEffect(page, page.locator('#parentKanaLastName'), 'オカヤマ', {
    delay: 100,
    pauseBefore: 1200,
    pauseAfter: 1200,
  });
  await typeWithEffect(page, page.locator('#parentKanaFirstName'), 'ハナコ', {
    delay: 100,
    pauseBefore: 1200,
    pauseAfter: 1500,
  });

  // ランダムなテスト用メールアドレス（Linkポップアップ回避）
  await typeWithEffect(page, page.locator('#parentEmail'), testEmail, {
    delay: 85,
    pauseBefore: 1500,
    pauseAfter: 1500,
  });
  await typeWithEffect(page, page.locator('#parentEmailConfirm'), testEmail, {
    delay: 85,
    pauseBefore: 1200,
    pauseAfter: 1500,
  });

  // 電話番号
  await typeWithEffect(page, page.locator('#parentTel'), '09012345678', {
    delay: 100,
    pauseBefore: 1500,
    pauseAfter: 1800,
  });
  const s3End = nowSec();
  scenes.push({
    num: 3,
    file: 'scene_03.mp4',
    start: s3Start,
    end: s3End,
    caption: 'STEP 3：保護者様のご連絡先の入力（保護者様の氏名・メールアドレス・電話番号を入力します）',
    motion:
      '保護者氏名「岡山 花子」、フリガナ「オカヤマ ハナコ」、メールアドレス（確認用含む）、日中連絡先の電話番号を入力',
  });

  // =========================================================================
  // SCENE 04: ご住所（成績表のお届け先）の入力
  // =========================================================================
  const s4Start = nowSec();
  await setCaption(
    page,
    'STEP 4',
    'ご住所（お届け先）の入力',
    '郵便番号から住所を自動入力し、番地・建物名を入力します'
  );
  await page.waitForTimeout(1500);

  await typeWithEffect(page, page.locator('#postalCode'), '700-0822', {
    delay: 110,
    pauseBefore: 1500,
    pauseAfter: 1500,
  });

  // 住所自動入力ボタンをタップ
  await tapWithEffect(page, page.locator('#btnSearchAddress'), {
    pauseBefore: 1500,
    pauseAfter: 1800,
  });
  const addr1Val = await page.locator('#addressLine1').inputValue();
  if (!addr1Val) {
    await page.locator('#addressLine1').fill('岡山県岡山市北区表町');
  }

  // 丁目・番地・号、建物名を入力
  await typeWithEffect(page, page.locator('#addressLine2'), '1丁目5-1', {
    delay: 110,
    pauseBefore: 1500,
    pauseAfter: 1500,
  });
  await typeWithEffect(page, page.locator('#addressLine3'), '岡山教育ビル3F', {
    delay: 100,
    pauseBefore: 1500,
    pauseAfter: 1800,
  });
  const s4End = nowSec();
  scenes.push({
    num: 4,
    file: 'scene_04.mp4',
    start: s4Start,
    end: s4End,
    caption: 'STEP 4：ご住所（お届け先）の入力（郵便番号から住所を自動入力し、番地・建物名を入力します）',
    motion:
      '郵便番号「700-0822」を入力 →「住所自動入力」ボタンをタップして町名まで自動反映 → 番地「1丁目5-1」と建物名「岡山教育ビル3F」を入力',
  });

  // =========================================================================
  // SCENE 05: お支払い方法の選択と内容確認・送信
  // =========================================================================
  const s5Start = nowSec();
  await setCaption(
    page,
    'STEP 5',
    'お支払い方法の選択と確認',
    'クレジットカード決済を選び、同意チェックを入れて決済へ進みます'
  );
  await page.waitForTimeout(1500);

  // クレジットカード決済を選択確認
  const cardMethodLabel = page.locator('input[name="payment_method"][value="credit_card"]').locator('../..');
  await tapWithEffect(page, cardMethodLabel, {
    pauseBefore: 1500,
    pauseAfter: 1700,
  });

  // お申し込みサマリー（合計金額 ¥5,500）を確認
  await smoothScrollToLocator(page, page.locator('#summaryTotalAmount'));
  await page.waitForTimeout(1800);

  // 規約同意チェックボックスをタップ
  await tapWithEffect(page, page.locator('#agreeTerms'), {
    pauseBefore: 1500,
    pauseAfter: 1700,
  });

  // 「入力内容を確認し、お支払いへ進む」ボタンをタップ → Stripe Checkout へ遷移
  const submitBtn = page.locator('#submitApplyBtn');
  await smoothScrollToLocator(page, submitBtn);
  await page.waitForTimeout(1500);
  await highlightTarget(page, submitBtn, 800);
  await Promise.all([
    page.waitForURL(checkoutUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }),
    submitBtn.click(),
  ]);
  await setCaption(
    page,
    'STEP 6',
    'クレジットカード情報の入力',
    'カード番号・有効期限・セキュリティコードを入力して決済します'
  );
  await page.waitForTimeout(1500);
  const s5End = nowSec();
  scenes.push({
    num: 5,
    file: 'scene_05.mp4',
    start: s5Start,
    end: s5End,
    caption: 'STEP 5：お支払い方法の選択と確認（クレジットカード決済を選び、同意チェックを入れて決済へ進みます）',
    motion:
      '「クレジットカード決済」を選択 → お申し込みサマリー（￥5,500）を確認 → 規約同意にチェック →「入力内容を確認し、お支払いへ進む」をタップして決済画面へ遷移',
  });

  // =========================================================================
  // SCENE 06: Stripe クレジットカード決済の入力・実行
  // =========================================================================
  const s6Start = nowSec();
  await setCaption(
    page,
    'STEP 6',
    'クレジットカード情報の入力',
    'カード番号・有効期限・セキュリティコードを入力して決済します'
  );
  await page.waitForTimeout(1600);

  // カード番号: 4242 4242 4242 4242
  await typeWithEffect(page, page.locator('#cardNumber'), '4242424242424242', {
    delay: 100,
    pauseBefore: 1500,
    pauseAfter: 1600,
  });

  // 有効期限: 12/28
  await typeWithEffect(page, page.locator('#cardExpiry'), '1228', {
    delay: 115,
    pauseBefore: 1500,
    pauseAfter: 1600,
  });

  // CVC: 123
  await typeWithEffect(page, page.locator('#cardCvc'), '123', {
    delay: 120,
    pauseBefore: 1500,
    pauseAfter: 1600,
  });

  // カード名義人: HANAKO OKAYAMA
  await typeWithEffect(page, page.locator('#billingName'), 'HANAKO OKAYAMA', {
    delay: 95,
    pauseBefore: 1500,
    pauseAfter: 1600,
  });

  // 「￥5,500 を支払う」ボタンをタップ → サンクスページへ遷移
  const stripeSubmitBtn = page.locator('#stripeSubmitBtn');
  await smoothScrollToLocator(page, stripeSubmitBtn);
  await page.waitForTimeout(1500);
  await highlightTarget(page, stripeSubmitBtn, 800);
  await Promise.all([
    page.waitForURL(/\/apply\/success/, { waitUntil: 'domcontentloaded', timeout: 15000 }),
    stripeSubmitBtn.click(),
  ]);
  await setCaption(
    page,
    'STEP 7',
    'お申し込み完了・メールのご確認',
    'お申し込み完了です。自動返信メールと今後の流れをご確認ください'
  );
  await page.waitForTimeout(1200);
  const s6End = nowSec();
  scenes.push({
    num: 6,
    file: 'scene_06.mp4',
    start: s6Start,
    end: s6End,
    caption: 'STEP 6：クレジットカード情報の入力（カード番号・有効期限・セキュリティコードを入力して決済します）',
    motion:
      'Stripe決済画面でカード番号「4242 4242 4242 4242」、有効期限「12/28」、CVC「123」、カード名義人を入力し「￥5,500 を支払う」をタップして決済完了',
  });

  // =========================================================================
  // SCENE 07: お申し込み完了（サンクスページ）の確認
  // =========================================================================
  const s7Start = nowSec();
  await setCaption(
    page,
    'STEP 7',
    'お申し込み完了・メールのご確認',
    'お申し込み完了です。自動返信メールと今後の流れをご確認ください'
  );
  await page.waitForTimeout(2200);

  // 今後のスケジュール案内まで滑らかにスクロールし、3秒間しっかり映して終了
  const scheduleHeading = page.locator('main h2').first();
  await smoothScrollToLocator(page, scheduleHeading);
  await page.waitForTimeout(3200);
  const s7End = nowSec();
  scenes.push({
    num: 7,
    file: 'scene_07.mp4',
    start: s7Start,
    end: s7End,
    caption: 'STEP 7：お申し込み完了・メールのご確認（お申し込み完了です。自動返信メールと今後の流れをご確認ください）',
    motion:
      'お申し込み完了画面（「お申し込みを受け付けました」）を表示し、今後のスケジュール案内を滑らかにスクロールして3秒間表示',
  });

  const recordedTotalSec = nowSec();
  const videoObj = page.video();
  await page.close();
  await context.close();
  await browser.close();
  server.close();

  const rawWebmPath = await videoObj.path();
  console.log(`[Video Recorder] Raw video saved: ${rawWebmPath}`);

  // 1. 通し動画 full_manual.mp4 への高画質変換（390x844領域を切り出し、780x1688の2x高解像度へLanczosアップスケール）
  const fullMp4Path = path.join(OUT_DIR, 'full_manual.mp4');
  console.log('[Video Recorder] Encoding full_manual.mp4...');
  execFileSync(
    ffmpegBin,
    [
      '-y',
      '-i',
      rawWebmPath,
      '-vf',
      'crop=390:844:0:0,scale=780:1688:flags=lanczos',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '30',
      '-movflags',
      '+faststart',
      fullMp4Path,
    ],
    { stdio: 'ignore' }
  );

  const actualFullDuration = getVideoDurationSec(ffmpegBin, fullMp4Path) || recordedTotalSec;
  const timeScale = actualFullDuration / recordedTotalSec;
  console.log(
    `[Video Recorder] full_manual.mp4 duration: ${actualFullDuration.toFixed(2)}s (scale=${timeScale.toFixed(4)})`
  );

  // 2. シーン別動画（scene_01.mp4 〜 scene_07.mp4）の分割出力＆実測秒数取得
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const startSec = i === 0 ? 0 : Number((sc.start * timeScale).toFixed(2));
    const endSec =
      i === scenes.length - 1
        ? Number(actualFullDuration.toFixed(2))
        : Number((sc.end * timeScale).toFixed(2));
    const scenePath = path.join(OUT_DIR, sc.file);

    execFileSync(
      ffmpegBin,
      [
        '-y',
        '-ss',
        String(startSec),
        '-to',
        String(endSec),
        '-i',
        fullMp4Path,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-r',
        '30',
        '-movflags',
        '+faststart',
        scenePath,
      ],
      { stdio: 'ignore' }
    );

    const measuredSec = getVideoDurationSec(ffmpegBin, scenePath) || endSec - startSec;
    sc.durationSec = Number(measuredSec.toFixed(1));
    console.log(
      `[Video Recorder] Generated ${sc.file}: ${sc.durationSec}s (${startSec.toFixed(1)}s -> ${endSec.toFixed(1)}s)`
    );
  }

  // 3. 実測秒数に合わせた Google Vids 用ナレーション台本（1秒あたり約4〜5文字目安）を生成
  const narrationTemplates = {
    1: '岡山県統一模擬試験の、お申し込み手順をご案内いたします。まずは、お子様の学年をタップし、ご希望の模試にチェックを入れます。続けて、受験される会場をお選びください。',
    2: '次に、受験されるお子様の情報を入力いたします。お子様の氏名を漢字で入力し、続けて、フリガナをカタカナで入力してください。次に、性別をタップして選択いたします。続いて、現在通われている中学校名を入力してください。文字を入力すると、学校の候補が表示されますので、そのまま入力いただけます。',
    3: '続いて、保護者様のご連絡先を入力いたします。保護者様の氏名を漢字で入力し、フリガナをカタカナで入力してください。次に、お申し込み完了メールを受け取るメールアドレスを、確認用とあわせて2回入力いたします。キャリアメールをご利用の場合は、受信設定もあわせてご確認ください。最後に、日中にご連絡のつく電話番号を、ハイフンなしで入力いたします。',
    4: '次に、問題用紙や成績表のお届け先となる、ご住所を入力いたします。郵便番号を7桁で入力し、住所自動入力ボタンをタップすると、町名まで自動で反映されます。続けて、丁目や番地と、マンション名や部屋番号を、お間違いのないようご入力ください。',
    5: '続いて、お支払い方法で、クレジットカード決済を選択いたします。お申し込み内容と合計金額をご確認のうえ、個人情報の取扱いなどの同意欄にチェックを入れ、オレンジ色のボタンをタップして決済画面へ進みます。',
    6: '安全な決済画面に切り替わりましたら、クレジットカードの情報を入力いたします。まずは、16桁のカード番号を入力してください。続けて、カードの有効期限を、月、年の順番で入力し、裏面のセキュリティコード3桁を入力いたします。次に、カード名義人をローマ字で入力し、最後に、支払うボタンをタップすると、決済が完了いたします。',
    7: 'これでお申し込みは完了です。完了通知メールをご確認ください。',
  };

  let md = `# 岡山県統一模擬試験（おかもし）お申し込み手順動画 ナレーション台本（Google Vids用）

- **全体動画ファイル**: \`manual_video_assets/full_manual.mp4\`（総尺：約 ${actualFullDuration.toFixed(1)} 秒 ／ スマホ縦画面 780×1688px 高解像度）
- **対象視聴者**: 中学生・小学生のお子様を持つ保護者様（40代中心）
- **読み上げ速度基準**: 1秒あたり約4〜5文字目安（Google Vids の AI 音声ナレーションで自然・丁寧に聞き取れる速度）

---

`;

  for (const sc of scenes) {
    const scriptText = narrationTemplates[sc.num];
    const charCount = scriptText.replace(/[、。]/g, '').length;
    const charsPerSec = (charCount / sc.durationSec).toFixed(1);
    md += `## シーン ${String(sc.num).padStart(2, '0')}：\`${sc.file}\`（${sc.durationSec.toFixed(1)}秒）

- **シーン番号・対応動画ファイル名（秒数）**: シーン ${String(sc.num).padStart(2, '0')} ／ \`${sc.file}\`（${sc.durationSec.toFixed(1)}秒）
- **画面内の動き・表示テロップ**:
  - **表示テロップ**: 「${sc.caption}」
  - **画面内の動き**: ${sc.motion}
- **文字数・読み上げペース目安**: ${charCount}文字（約 ${charsPerSec} 文字/秒）

### 【Google Vidsコピペ用ナレーション原稿】
\`\`\`text
${scriptText}
\`\`\`

---

`;
  }

  const scriptMdPath = path.join(OUT_DIR, 'google_vids_script.md');
  fs.writeFileSync(scriptMdPath, md, 'utf8');
  console.log(`[Video Recorder] Generated ${scriptMdPath}`);

  // 一時ディレクトリのクリーンアップ
  fs.rmSync(TMP_VIDEO_DIR, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
