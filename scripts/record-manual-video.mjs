/**
 * 保護者向け「お申し込みフォーム入力〜クレジットカード決済・コンビニ決済完了までの操作手順動画」自動撮影スクリプト
 *
 * 出力物（manual_video_assets/ 配下）:
 *  - full_manual.mp4         : 通しで録画した全体動画（780x1688 / H.264 MP4 / 30fps）
 *  - scene_01.mp4〜scene_08.mp4 : Google Vidsのスライド（シーン）ごとに分割した動画
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
  '.avif': 'image/avif',
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

function buildStripeCheckoutHtml({ email }) {
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
      padding-bottom: 130px;
    }
    .stripe-header {
      background: #f7fafc;
      border-bottom: 1px solid #e3e8ee;
      padding: 14px 18px 14px;
    }
    .merchant-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .merchant-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13.5px;
      font-weight: 700;
      color: #134230;
    }
    .merchant-icon {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      background: #134230;
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 800;
    }
    .secure-badge {
      font-size: 11px;
      font-weight: 700;
      color: #065f46;
      background: #d1fae5;
      border: 1px solid #6ee7b7;
      padding: 3px 8px;
      border-radius: 999px;
    }
    .order-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .order-label {
      font-size: 11.5px;
      color: #697386;
    }
    .order-amount {
      font-size: 24px;
      font-weight: 800;
      color: #1a1f36;
      letter-spacing: -0.02em;
    }
    .order-item {
      font-size: 12.5px;
      color: #3c4257;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      padding-top: 6px;
      border-top: 1px dashed #e3e8ee;
    }
    .order-sub {
      font-size: 11px;
      color: #697386;
      margin-top: 2px;
    }
    .checkout-main {
      padding: 14px 18px 24px;
    }
    .security-assurance-box {
      background: #ecfdf5;
      border: 1.5px solid #6ee7b7;
      border-radius: 8px;
      padding: 9px 11px;
      margin-bottom: 12px;
    }
    .security-assurance-title {
      font-size: 12px;
      font-weight: 800;
      color: #064e3b;
      display: flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 3px;
    }
    .security-assurance-sub {
      font-size: 11px;
      font-weight: 600;
      color: #047857;
      line-height: 1.4;
    }
    .express-wallet-section {
      margin-bottom: 12px;
    }
    .express-wallet-label {
      font-size: 11px;
      font-weight: 700;
      color: #4f566b;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .wallet-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .wallet-btn {
      height: 40px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      border: none;
    }
    .wallet-btn.apple-pay {
      background: #000000;
      color: #ffffff;
    }
    .wallet-btn.google-pay {
      background: #ffffff;
      color: #1f2937;
      border: 1.5px solid #cbd5e1;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .divider-line {
      display: flex;
      align-items: center;
      text-align: center;
      color: #8792a2;
      font-size: 11px;
      font-weight: 600;
      margin: 10px 0 12px;
    }
    .divider-line::before,
    .divider-line::after {
      content: "";
      flex: 1;
      border-bottom: 1px solid #e3e8ee;
    }
    .divider-line span {
      padding: 0 10px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #1a1f36;
      margin: 0 0 8px;
    }
    .field-group {
      margin-bottom: 12px;
    }
    .field-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #3c4257;
      margin-bottom: 4px;
    }
    .readonly-box {
      width: 100%;
      padding: 9px 11px;
      border-radius: 6px;
      border: 1px solid #e3e8ee;
      background: #f7fafc;
      color: #3c4257;
      font-size: 13px;
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
      height: 42px;
      padding: 8px 12px;
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
      height: 46px;
      margin-top: 6px;
      border: none;
      border-radius: 6px;
      background: #0070f3;
      color: #ffffff;
      font-size: 15.5px;
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
      margin-top: 12px;
      text-align: center;
      font-size: 11px;
      color: #697386;
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
      <span class="secure-badge">🔒 Stripe 公式安全決済</span>
    </div>
    <div class="order-row">
      <span class="order-label">お支払い合計（税込）</span>
      <span class="order-amount">￥5,500</span>
    </div>
    <div class="order-item">
      <span>第5回 12月号 岡山県統一模擬試験</span>
      <span>￥5,500</span>
    </div>
    <div class="order-sub">中学3年生 ／ 岡山会場（山陽学園中学校・高等学校）</div>
  </div>

  <div class="checkout-main">
    <!-- セキュリティ＆カード番号非保持の安心バッジ -->
    <div id="stripeSecurityBadgeBox" class="security-assurance-box">
      <div class="security-assurance-title">
        <span>🔒 当事務局にカード番号は一切保存されません</span>
      </div>
      <div class="security-assurance-sub">
        💡 Apple Pay・Google Payなら16桁のカード番号すら送信せず、顔認証・指紋認証だけで安全・簡単に決済できます
      </div>
    </div>

    <!-- Apple Pay / Google Pay ワンタップ決済エリア -->
    <div id="stripeWalletBox" class="express-wallet-section">
      <div class="express-wallet-label">
        <span>ワンタップ決済（カード番号の入力不要）</span>
        <span style="color:#047857;font-weight:800;">生体認証対応</span>
      </div>
      <div class="wallet-grid">
        <button type="button" class="wallet-btn apple-pay">
          <span> Pay</span>
        </button>
        <button type="button" class="wallet-btn google-pay">
          <span style="color:#4285F4;font-weight:900;">G</span><span>Pay</span>
        </button>
      </div>
    </div>

    <div class="divider-line"><span>またはクレジットカードで支払う</span></div>

    <div class="field-group">
      <label class="field-label">連絡先メールアドレス</label>
      <div class="readonly-box" id="stripeEmailBox">
        <span>${email}</span>
        <span style="font-size:11px;color:#047857;font-weight:700;">✓ 自動引継ぎ済</span>
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
        <input id="billingName" class="stripe-input sans" type="text" placeholder="HANAKO OKAYAMA" autocomplete="off">
      </div>
    </div>

    <button id="stripeSubmitBtn" type="button" class="submit-btn">
      <span id="stripeSubmitText">￥5,500 を支払う</span>
    </button>

    <div class="footer-note">
      <span>Powered by <strong>stripe</strong></span>
      <span>｜</span>
      <span>PCI DSS Level 1 国際最高基準暗号化</span>
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
      }, 850);
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
        background: rgba(15, 23, 42, 0.92);
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
        font-size: 13.5px;
        font-weight: 800;
        color: #ffffff;
        line-height: 1.3;
      }
      #okamoshi-caption-bar .cap-sub {
        font-size: 11.5px;
        font-weight: 500;
        color: #fde68a;
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
async function smoothScrollToLocator(page, locator, offsetTop = 210) {
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  const handle = await locator.elementHandle();
  if (!handle) return;
  await page.evaluate(
    ({ el, offset }) => {
      const rect = el.getBoundingClientRect();
      const targetTop = Math.max(0, window.scrollY + rect.top - offset);
      if (Math.abs(window.scrollY - targetTop) > 35) {
        window.scrollTo({ top: targetTop, behavior: 'smooth' });
      }
    },
    { el: handle, offset: offsetTop }
  );
  await page.waitForTimeout(750);
}

/**
 * 対象要素を赤枠＋波紋エフェクトで光らせる視覚演出
 */
async function highlightTarget(page, locator, durationMs = 800, withRipple = true) {
  await ensureOverlayHelpers(page);
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  await locator.evaluate(
    (el, { dur, ripple }) => {
      const rect = el.getBoundingClientRect();
      const ring = document.createElement('div');
      ring.className = 'okamoshi-focus-ring';
      ring.style.left = `${Math.max(4, rect.left - 5)}px`;
      ring.style.top = `${Math.max(4, rect.top - 5)}px`;
      ring.style.width = `${Math.min(window.innerWidth - 8, rect.width + 10)}px`;
      ring.style.height = `${rect.height + 10}px`;
      document.body.appendChild(ring);

      let ripple1 = null;
      if (ripple) {
        const cx = rect.left + Math.min(rect.width * 0.5, 140);
        const cy = rect.top + rect.height * 0.5;
        ripple1 = document.createElement('div');
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
      }

      setTimeout(() => {
        ring.remove();
        if (ripple1) ripple1.remove();
      }, dur);
    },
    { dur: durationMs, ripple: withRipple }
  );
  await page.waitForTimeout(durationMs);
}

async function tapWithEffect(page, locator, { pauseBefore = 1500, pauseAfter = 1600, highlightMs = 800 } = {}) {
  await smoothScrollToLocator(page, locator);
  if (pauseBefore > 0) await page.waitForTimeout(pauseBefore);
  await highlightTarget(page, locator, highlightMs, true);
  await locator.click();
  if (pauseAfter > 0) await page.waitForTimeout(pauseAfter);
}

async function typeWithEffect(
  page,
  locator,
  text,
  { delay = 100, pauseBefore = 1500, pauseAfter = 1600, scroll = true } = {}
) {
  if (scroll) {
    await smoothScrollToLocator(page, locator);
  }
  if (pauseBefore > 0) await page.waitForTimeout(pauseBefore);
  await highlightTarget(page, locator, 800, true);
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

// 各シーンのナレーション台本（STEP 1〜STEP 8：カード決済手順に続けてコンビニ決済手順を解説する構成）
const NARRATION_TEMPLATES = {
  1: '岡山県統一模擬試験の、お申し込み手順をご案内いたします。まずは、お子様の学年をタップし、ご希望の模試にチェックを入れます。チェックを入れると、すぐ下の会場欄が案内表示に変わりますので、ご希望の会場、または自宅受験をお選びください。',
  2: '次に、お子様の情報を入力いたします。お名前とフリガナを入力し、性別を選択してください。フリガナは、ひらがなで入力しても自動でカタカナに変換されますのでご安心ください。続いて、中学校名です。学校名の一部を入力すると候補が表示されますので、タップするだけで簡単に入力いただけます。県外の学校も、上のボタンから検索できます。',
  3: '続いて、保護者様のご連絡先を入力いたします。お名前とフリガナに続けて、お申し込み完了メールを受け取るメールアドレスを、打ち間違い防止のため2回入力いたします。キャリアメールをご利用の方は、受信設定もあわせてご確認ください。最後に、お電話番号を入力します。ハイフンあり・なしや、全角数字が混ざっていても、自動で整えられますのでご安心ください。',
  4: '次に、受験票や成績表のお届け先を入力いたします。郵便番号を7桁入力すると、ボタンを押すことなく自動で町名まで入力され、そのまま次の番地欄へカーソルが移動します。続けて、丁目や番地、建物名をご入力ください。もし郵便番号の桁数が足りない場合や、存在しない番号を入力された場合も、その場ですぐにお知らせしますので、打ち間違いの心配もございません。',
  5: '続いて、お支払い方法を選択します。クレジットカード決済と、コンビニ決済の2種類からお選びいただけます。今回はクレジットカード決済を選択し、お申し込み内容と合計金額を確認します。同意欄にチェックを入れるとボタンがオレンジ色に変わりますので、タップして進みます。ボタンを2回押してしまっても二重送信にならない安全設計ですので、画面が切り替わるまでそのままお待ちください。',
  6: '決済は、世界最高水準のセキュリティを持つストライプ社の公式画面で行われます。当事務局にカード番号が保存されることは一切ございませんので、どうぞご安心ください。また、アップルペイやグーグルペイをご利用の場合は、16桁のカード番号すら送信せず、顔認証や指紋認証だけで、すぐにお支払いが完了いたします。カード番号を入力される場合は、16桁の番号、有効期限、裏面の3桁のコード、名義人を入力し、支払うボタンをタップしてください。',
  7: '続いて、コンビニ決済でお申し込みされる場合の手順をご案内いたします。お支払い方法で、コンビニ決済をタップして選択すると、すぐ下にお支払い期限が表示されます。期限をご確認のうえ、確認欄と規約同意欄の2箇所にチェックを入れ、オレンジ色のボタンをタップします。お申し込み完了後、ご登録のメールアドレス宛に、コンビニでのお支払い手順と受付番号が届きますので、期限内にお近くのコンビニでお支払いください。',
  8: 'これでお申し込みは完了です。ご登録のメールアドレス宛に完了通知メールが届きますのでご確認ください。なお、次回以降のお申し込み時には、今回ご入力いただいた基本情報が自動で反映されますので、さらに簡単にお手続きいただけます。',
};

// 全シーンが「1秒あたり 3.8〜4.0 文字」の中央値（約 3.9 文字/秒）にピタッと収まるよう目標秒数を算出
function getTargetDurationForScene(sceneNum, charsPerSecTarget = 3.90) {
  const text = NARRATION_TEMPLATES[sceneNum] || '';
  const charCount = text.replace(/[、。]/g, '').length;
  return Number((charCount / charsPerSecTarget).toFixed(2));
}

async function main() {
  const ffmpegBin = resolveFfmpegBinary();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(TMP_VIDEO_DIR, { recursive: true });

  const { server, baseUrl } = await startStaticServer();
  console.log(`[Video Recorder] Static server started at ${baseUrl}`);

  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const testEmail = `parent.test.${randomSuffix}@example.com`;
  const checkoutUrl = `${baseUrl}/__stripe_checkout_demo`;
  const successUrl = `${baseUrl}/apply/success?session_id=cs_test_manual_demo&exam_type=touitsu`;

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

  // 初回ロードのみ localStorage をクリアし、STEP 7 でお支払い画面に戻る際は保存済みプロフィールを維持する
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__video_init_cleared')) {
        localStorage.clear();
        sessionStorage.setItem('__video_init_cleared', '1');
      }
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
  await page.route('**/api/schools*', async (route) => {
    await new Promise((r) => setTimeout(r, 120));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        scope: 'pref',
        pref: '岡山県',
        results: [
          {
            code: '3320101',
            name: '岡山市立操南中学校',
            type: '中学校',
            prefecture: '岡山県',
            label: '岡山市立操南中学校 (岡山県)',
          },
        ],
      }),
    });
  });

  await page.route('**/api/address*', async (route) => {
    await new Promise((r) => setTimeout(r, 160));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        zip: '7000822',
        prefecture: '岡山県',
        city: '岡山市北区',
        town: '表町',
      }),
    });
  });

  // カード決済時は checkoutUrl へ、コンビニ決済時は完了画面（successUrl）へ遷移させる
  await page.route('**/api/create-checkout-session', async (route) => {
    let isKonbini = false;
    try {
      const postData = JSON.parse(route.request().postData() || '{}');
      isKonbini =
        postData.selected_payment_method === 'konbini' ||
        postData.payment_method === 'konbini' ||
        postData.raw_payment_method === 'convenience_store';
    } catch (_) {}
    // #stripeLoadingOverlay を約1.5秒間しっかり見せるため 1550ms 待機して返す
    await new Promise((r) => setTimeout(r, 1550));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        session_id: isKonbini ? 'cs_test_manual_konbini' : 'cs_test_manual_demo',
        url: isKonbini ? successUrl : checkoutUrl,
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
      body: buildStripeCheckoutHtml({ email: testEmail }),
    });
  });

  const scenes = [];
  const nowSec = () => (performance.now() - videoStartMs) / 1000;

  async function waitUntilSceneTarget(sceneStartSec, targetDurationSec, reserveAfterSec = 0) {
    const elapsed = nowSec() - sceneStartSec;
    const remain = targetDurationSec - reserveAfterSec - elapsed;
    if (remain > 0.05) {
      await page.waitForTimeout(Math.round(remain * 1000));
    }
  }

  // =========================================================================
  // SCENE 01: 模試と受験会場の選択（106文字 → 目標 約27.2秒 / 3.9文字/秒）
  // =========================================================================
  const s1Start = 0; // 録画開始 0.0s を起点として秒数を厳密管理
  const s1Target = getTargetDurationForScene(1); // ~27.18s
  await page.goto(`${baseUrl}/apply/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});

  await setCaption(
    page,
    'STEP 1',
    '模試と受験会場の選択',
    'お子様の学年を選び、受験する模試と会場（または自宅受験）を選択します'
  );
  await page.waitForTimeout(3000);

  // 学年「中3」を選択
  await tapWithEffect(page, page.locator('#grade-btn-chu3'), {
    pauseBefore: 2400,
    pauseAfter: 2500,
  });

  // 模試「第5回 12月号 岡山県統一模擬試験」をチェック
  await tapWithEffect(page, page.locator('#check-r12'), {
    pauseBefore: 2400,
    pauseAfter: 600,
  });

  // チェック直後：会場セレクトボックスが淡い赤色でハイライト（未選択案内表示）された状態を1.5秒しっかり見せる
  const venueSelect = page.locator('#venue-r12');
  await smoothScrollToLocator(page, venueSelect);
  await page.waitForTimeout(1500);

  // 受験会場「岡山会場（山陽学園中学校・高等学校）」を選択して白背景に変わる動きを見せる
  await highlightTarget(page, venueSelect, 900, true);
  await venueSelect.selectOption('venue_okayama');
  await waitUntilSceneTarget(s1Start, s1Target);
  const s1End = nowSec();
  scenes.push({
    num: 1,
    file: 'scene_01.mp4',
    start: s1Start,
    end: s1End,
    caption: 'STEP 1：模試と受験会場の選択（お子様の学年を選び、受験する模試と会場を選択します）',
    motion:
      'お申し込みフォームを開き、学年「中3」をタップ →「12月号 岡山県統一模擬試験」にチェック → 会場欄が淡い赤色の案内表示に変わった状態を1.5秒表示 →「岡山会場（山陽学園中学校・高等学校）」を選択して白背景に変化',
  });

  // =========================================================================
  // SCENE 02: 受験生（お子様）情報の入力（147文字 → 目標 約37.7秒 / 3.9文字/秒）
  // =========================================================================
  const s2Start = nowSec();
  const s2Target = getTargetDurationForScene(2); // ~37.69s
  await setCaption(
    page,
    'STEP 2',
    '受験生（お子様）情報の入力',
    'フリガナはひらがなでも自動変換・学校名は候補からタップ選択できます'
  );
  await page.waitForTimeout(1800);

  await typeWithEffect(page, page.locator('#studentLastName'), '岡山', {
    delay: 110,
    pauseBefore: 1400,
    pauseAfter: 1200,
  });
  await typeWithEffect(page, page.locator('#studentFirstName'), '太郎', {
    delay: 110,
    pauseBefore: 1100,
    pauseAfter: 1300,
  });
  await typeWithEffect(page, page.locator('#studentKanaLastName'), 'オカヤマ', {
    delay: 100,
    pauseBefore: 1100,
    pauseAfter: 1100,
  });
  await typeWithEffect(page, page.locator('#studentKanaFirstName'), 'タロウ', {
    delay: 100,
    pauseBefore: 1100,
    pauseAfter: 1300,
  });

  // 性別（男子）を選択
  const maleLabel = page.locator('input[name="gender"][value="male"]').locator('..');
  await tapWithEffect(page, maleLabel, {
    pauseBefore: 1300,
    pauseAfter: 1400,
  });

  // 在籍中学校の横にある「岡山県内 / 県外・全国」の切り替えタブに一度赤枠ハイライト（1.5秒）を当てる
  const schoolScopeContainer = page.locator('#schoolScopeContainer');
  await smoothScrollToLocator(page, page.locator('#currentSchool'));
  await page.waitForTimeout(800);
  await highlightTarget(page, schoolScopeContainer, 1500, false);
  await page.waitForTimeout(600);

  // 入力欄に「操南」の2文字だけを入力 → サジェスト候補「岡山市立操南中学校 (岡山県)」を表示
  await typeWithEffect(page, page.locator('#currentSchool'), '操南', {
    delay: 140,
    pauseBefore: 800,
    pauseAfter: 400,
    scroll: false,
  });

  // サジェスト候補が表示された状態で1.5秒ポーズ → 候補を赤枠波紋エフェクトでタップして確定
  const suggestItem = page.locator('#schoolSuggestDropdown .school-suggest-item').first();
  await suggestItem.waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(1500);
  await highlightTarget(page, suggestItem, 800, true);
  await page.evaluate(() => {
    if (typeof window.selectSchoolSuggestion === 'function') {
      window.selectSchoolSuggestion(0);
    }
  });
  await waitUntilSceneTarget(s2Start, s2Target);
  const s2End = nowSec();
  scenes.push({
    num: 2,
    file: 'scene_02.mp4',
    start: s2Start,
    end: s2End,
    caption: 'STEP 2：受験生（お子様）情報の入力（フリガナはひらがなでも自動変換・学校名は候補からタップ選択できます）',
    motion:
      'お子様の氏名「岡山 太郎」、フリガナ「オカヤマ タロウ」、性別「男子」を選択 →「岡山県内 / 県外・全国」タブを1.5秒ハイライト → 在籍校欄に「操南」の2文字を入力 → 候補「岡山市立操南中学校 (岡山県)」を1.5秒表示後にタップして確定',
  });

  // =========================================================================
  // SCENE 03: 保護者様のお名前・ご連絡先の入力（158文字 → 目標 約40.5秒 / 3.9文字/秒）
  // =========================================================================
  const s3Start = nowSec();
  const s3Target = getTargetDurationForScene(3); // ~40.51s
  await setCaption(
    page,
    'STEP 3',
    '保護者様のご連絡先の入力',
    '※電話番号はハイフンあり・なし、全角でも自動で整えられます'
  );
  await page.waitForTimeout(1600);

  await typeWithEffect(page, page.locator('#parentLastName'), '岡山', {
    delay: 110,
    pauseBefore: 1400,
    pauseAfter: 1200,
  });
  await typeWithEffect(page, page.locator('#parentFirstName'), '花子', {
    delay: 110,
    pauseBefore: 1200,
    pauseAfter: 1400,
  });
  await typeWithEffect(page, page.locator('#parentKanaLastName'), 'オカヤマ', {
    delay: 100,
    pauseBefore: 1200,
    pauseAfter: 1200,
  });
  await typeWithEffect(page, page.locator('#parentKanaFirstName'), 'ハナコ', {
    delay: 100,
    pauseBefore: 1200,
    pauseAfter: 1400,
  });

  // テスト用メールアドレス（確認用とあわせて2回入力）
  await typeWithEffect(page, page.locator('#parentEmail'), testEmail, {
    delay: 85,
    pauseBefore: 1400,
    pauseAfter: 1400,
  });
  await typeWithEffect(page, page.locator('#parentEmailConfirm'), testEmail, {
    delay: 85,
    pauseBefore: 1200,
    pauseAfter: 1500,
  });

  // 電話番号
  await typeWithEffect(page, page.locator('#parentTel'), '09012345678', {
    delay: 105,
    pauseBefore: 1600,
    pauseAfter: 1800,
  });
  await waitUntilSceneTarget(s3Start, s3Target);
  const s3End = nowSec();
  scenes.push({
    num: 3,
    file: 'scene_03.mp4',
    start: s3Start,
    end: s3End,
    caption: 'STEP 3：保護者様のご連絡先の入力（※電話番号はハイフンあり・なし、全角でも自動で整えられます）',
    motion:
      '保護者氏名「岡山 花子」、フリガナ「オカヤマ ハナコ」、メールアドレス（確認用含む2回）、日中連絡先の電話番号を入力',
  });

  // =========================================================================
  // SCENE 04: ご住所（お届け先）の入力（158文字 → 目標 約40.5秒 / 3.9文字/秒）
  // =========================================================================
  const s4Start = nowSec();
  const s4Target = getTargetDurationForScene(4); // ~40.51s
  await setCaption(
    page,
    'STEP 4',
    'ご住所（お届け先）の入力',
    '※桁数不足や存在しない郵便番号、番地の抜けがある場合はその場でお知らせします'
  );
  await page.waitForTimeout(2200);

  // 郵便番号欄に「7000822」を7桁入力 → ボタン操作なしで自動補完＆番地欄へ自動フォーカス移動
  await typeWithEffect(page, page.locator('#postalCode'), '7000822', {
    delay: 130,
    pauseBefore: 2000,
    pauseAfter: 200,
  });

  // ① #addressLine1 がグリーンに光るアニメーション、② 直下の緑色メッセージ、③ #addressLine2 への自動フォーカス＆緑枠演出を 2.0秒しっかり見せる
  await page.waitForTimeout(2000);

  // 続けて「丁目・番地・号」と「建物名・部屋番号」を入力
  await typeWithEffect(page, page.locator('#addressLine2'), '1丁目5-1', {
    delay: 120,
    pauseBefore: 1800,
    pauseAfter: 2200,
  });
  await typeWithEffect(page, page.locator('#addressLine3'), '岡山教育ビル3F', {
    delay: 110,
    pauseBefore: 2000,
    pauseAfter: 2200,
  });
  await waitUntilSceneTarget(s4Start, s4Target);
  const s4End = nowSec();
  scenes.push({
    num: 4,
    file: 'scene_04.mp4',
    start: s4Start,
    end: s4End,
    caption:
      'STEP 4：ご住所（お届け先）の入力（※桁数不足や存在しない郵便番号、番地の抜けがある場合はその場でお知らせします）',
    motion:
      '郵便番号「7000822」を7桁入力 → ボタン操作なしで「岡山県岡山市北区表町」が緑色に光って自動反映＆緑色メッセージ表示＆番地欄へ自動フォーカス移動（2秒表示） → 番地「1丁目5-1」と建物名「岡山教育ビル3F」を入力',
  });

  // =========================================================================
  // SCENE 05: お支払い方法の選択（クレジットカード決済）（173文字 → 目標 約44.4秒 / 3.9文字/秒）
  // =========================================================================
  const s5Start = nowSec();
  const s5Target = getTargetDurationForScene(5); // ~44.36s
  await setCaption(
    page,
    'STEP 5',
    'お支払い方法の選択（クレジットカード決済の手順）',
    '同意チェックを入れて進みます（※ボタン連打でも二重送信にならない安全設計）'
  );
  await page.waitForTimeout(2200);

  // お支払い方法エリアへスクロールし、「コンビニ決済」側にも一度赤枠ハイライト（1.5秒）を当てる
  const konbiniMethodLabel = page.locator('#payment-method-konbini-label');
  await smoothScrollToLocator(page, konbiniMethodLabel, 240);
  await page.waitForTimeout(1800);
  await highlightTarget(page, konbiniMethodLabel, 1500, false);
  await page.waitForTimeout(1400);

  // 「クレジットカード決済」を選択
  const cardMethodLabel = page.locator('input[name="payment_method"][value="credit_card"]').locator('../..');
  await tapWithEffect(page, cardMethodLabel, {
    pauseBefore: 1600,
    pauseAfter: 2400,
  });

  // お申し込みサマリー（合計金額 ¥5,500）を確認
  const summaryTotal = page.locator('#summaryTotalAmount');
  await smoothScrollToLocator(page, summaryTotal);
  await page.waitForTimeout(1800);
  await highlightTarget(page, summaryTotal, 1200, false);
  await page.waitForTimeout(1800);

  // 規約同意チェックボックスをタップ（ボタンがオレンジ色に変化）
  await tapWithEffect(page, page.locator('#agreeTerms'), {
    pauseBefore: 1800,
    pauseAfter: 2400,
  });

  // 送信ボタンまでスクロールし、クリック＋オーバーレイ1.55秒＋遷移後の待機を含めて s5Target にピタリと合わせる
  const submitBtn = page.locator('#submitApplyBtn');
  await smoothScrollToLocator(page, submitBtn);
  await waitUntilSceneTarget(s5Start, s5Target, 3.2);
  await highlightTarget(page, submitBtn, 800, true);
  await Promise.all([
    page.waitForURL(checkoutUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }),
    submitBtn.click(),
  ]);
  await setCaption(
    page,
    'STEP 6',
    'Stripe 安全決済・カード情報の入力',
    '当事務局にカード番号は一切残らず、Apple Pay / Google Pay にも対応しています'
  );
  await waitUntilSceneTarget(s5Start, s5Target);
  const s5End = nowSec();
  scenes.push({
    num: 5,
    file: 'scene_05.mp4',
    start: s5Start,
    end: s5End,
    caption: 'STEP 5：お支払い方法の選択（クレジットカード決済を選択 ➔ 同意チェック ➔ 安全接続）',
    motion:
      'お支払い方法エリアで「コンビニ決済」も選べることを1.5秒ハイライト紹介 →「クレジットカード決済」を選択 → お申し込みサマリー（￥5,500）を確認 → 同意欄にチェックを入れてボタンがオレンジ色に変化 → タップして二重送信防止オーバーレイ（「決済画面へ安全に接続しています…」）を約1.5秒表示後に決済画面へ遷移',
  });

  // =========================================================================
  // SCENE 06: Stripe クレジットカード決済の入力・実行（195文字 → 目標 約50.0秒 / 3.9文字/秒）
  // =========================================================================
  const s6Start = nowSec();
  const s6Target = getTargetDurationForScene(6); // ~50.00s
  await setCaption(
    page,
    'STEP 6',
    'Stripe 安全決済・カード情報の入力',
    '当事務局にカード番号は一切残らず、Apple Pay / Google Pay にも対応しています'
  );
  await page.waitForTimeout(1500);

  // 前半（約7秒）：カード番号非保持バッジ＆Apple Pay / Google Pay ワンタップ決済ボタンをハイライト演出
  const securityBadgeBox = page.locator('#stripeSecurityBadgeBox');
  await highlightTarget(page, securityBadgeBox, 2700, false);
  await page.waitForTimeout(900);

  const walletBox = page.locator('#stripeWalletBox');
  await highlightTarget(page, walletBox, 2700, false);
  await page.waitForTimeout(1200);

  // カード番号: 4242 4242 4242 4242
  await typeWithEffect(page, page.locator('#cardNumber'), '4242424242424242', {
    delay: 105,
    pauseBefore: 1600,
    pauseAfter: 1800,
  });

  // 有効期限: 12/28
  await typeWithEffect(page, page.locator('#cardExpiry'), '1228', {
    delay: 120,
    pauseBefore: 1600,
    pauseAfter: 1800,
  });

  // CVC: 123
  await typeWithEffect(page, page.locator('#cardCvc'), '123', {
    delay: 125,
    pauseBefore: 1600,
    pauseAfter: 1800,
  });

  // カード名義人: HANAKO OKAYAMA
  await typeWithEffect(page, page.locator('#billingName'), 'HANAKO OKAYAMA', {
    delay: 100,
    pauseBefore: 1600,
    pauseAfter: 1800,
  });

  // 「￥5,500 を支払う」ボタンをタップ → 「✓ お支払いが完了しました」を表示して STEP 6 を完了
  const stripeSubmitBtn = page.locator('#stripeSubmitBtn');
  await smoothScrollToLocator(page, stripeSubmitBtn);
  await waitUntilSceneTarget(s6Start, s6Target, 3.0);
  await highlightTarget(page, stripeSubmitBtn, 800, true);
  await stripeSubmitBtn.click();
  await waitUntilSceneTarget(s6Start, s6Target);
  const s6End = nowSec();
  scenes.push({
    num: 6,
    file: 'scene_06.mp4',
    start: s6Start,
    end: s6End,
    caption:
      'STEP 6：Stripe 安全決済・カード情報の入力（当事務局にカード番号は一切残らず、Apple Pay / Google Pay にも対応）',
    motion:
      '前半約7秒間で「🔒 当事務局にカード番号は一切保存されません」バッジと「Apple Pay / Google Pay ワンタップ決済ボタン」を順にハイライト表示 → カード番号「4242 4242 4242 4242」、有効期限「12/28」、CVC「123」、カード名義人「HANAKO OKAYAMA」を入力し「￥5,500 を支払う」をタップして決済完了',
  });

  // =========================================================================
  // SCENE 07: 【新規追加】コンビニ決済をご希望の場合の手順（180文字 → 目標 約46.2秒 / 3.9文字/秒）
  // =========================================================================
  const s7Start = nowSec();
  const s7Target = getTargetDurationForScene(7); // ~46.15s

  // お申し込みフォームのお支払い方法選択画面に戻り、STEP 1〜4 の選択状態を確実にセットして SECTION 4 を表示
  await page.goto(`${baseUrl}/apply/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.locator('#grade-btn-chu3').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#grade-btn-chu3').click();
  await page.locator('#check-r12').waitFor({ state: 'visible', timeout: 10000 });
  await page.evaluate((emailVal) => {
    const r12Check = document.getElementById('check-r12');
    if (r12Check && !r12Check.checked) {
      r12Check.click();
    }
    const venueSel = document.getElementById('venue-r12');
    if (venueSel) {
      venueSel.value = 'venue_okayama';
      venueSel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const ensureVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && !el.value) {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    ensureVal('studentLastName', '岡山');
    ensureVal('studentFirstName', '太郎');
    ensureVal('studentKanaLastName', 'オカヤマ');
    ensureVal('studentKanaFirstName', 'タロウ');
    const maleRadio = document.querySelector('input[name="gender"][value="male"]');
    if (maleRadio && !maleRadio.checked) {
      maleRadio.checked = true;
      maleRadio.dispatchEvent(new Event('change', { bubbles: true }));
    }
    ensureVal('currentSchool', '岡山市立操南中学校 (岡山県)');
    ensureVal('parentLastName', '岡山');
    ensureVal('parentFirstName', '花子');
    ensureVal('parentKanaLastName', 'オカヤマ');
    ensureVal('parentKanaFirstName', 'ハナコ');
    ensureVal('parentEmail', emailVal);
    ensureVal('parentEmailConfirm', emailVal);
    ensureVal('parentTel', '09012345678');
    ensureVal('postalCode', '7000822');
    ensureVal('addressLine1', '岡山県岡山市北区表町');
    ensureVal('addressLine2', '1丁目5-1');
    ensureVal('addressLine3', '岡山教育ビル3F');
    const prefEl = document.getElementById('prefecture');
    if (prefEl) prefEl.value = '岡山県';

    const agreeTermsEl = document.getElementById('agreeTerms');
    if (agreeTermsEl) agreeTermsEl.checked = false;
    const agreeConvEl = document.getElementById('agreeConvenienceTerms');
    if (agreeConvEl) agreeConvEl.checked = false;
    if (typeof window.updateSubmitButtonState === 'function') {
      window.updateSubmitButtonState();
    }
    const konbiniEl = document.getElementById('payment-method-konbini-label');
    if (konbiniEl) {
      const rect = konbiniEl.getBoundingClientRect();
      window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - 170), behavior: 'instant' });
    }
  }, testEmail);

  await setCaption(
    page,
    'STEP 7',
    'コンビニ決済でお申し込みされる場合の手順',
    'お支払い期限をご確認のうえ、確認欄と同意欄にチェックを入れて進みます'
  );
  await page.waitForTimeout(2600);

  // ①「コンビニ決済」のラジオボタンを選択
  const konbiniLabelS7 = page.locator('#payment-method-konbini-label');
  await tapWithEffect(page, konbiniLabelS7, {
    pauseBefore: 1600,
    pauseAfter: 1200,
    highlightMs: 900,
  });

  // ② 表示される黄色い「お支払い期限（◯月◯日 23:59まで）」パネル（#convenienceWarningPanel）に赤枠ハイライトを当てる
  const warningPanel = page.locator('#convenienceWarningPanel');
  await smoothScrollToLocator(page, warningPanel, 220);
  await page.waitForTimeout(900);
  await highlightTarget(page, warningPanel, 2800, false);
  await page.waitForTimeout(1200);

  // サマリー下部の確認チェックボックス（#convenienceAgreeContainer / #agreeConvenienceTerms）に赤枠ハイライトを当ててチェックを入れる
  const convAgreeContainer = page.locator('#convenienceAgreeContainer');
  await smoothScrollToLocator(page, convAgreeContainer, 240);
  await page.waitForTimeout(1000);
  await highlightTarget(page, convAgreeContainer, 1400, false);
  await tapWithEffect(page, page.locator('#agreeConvenienceTerms'), {
    pauseBefore: 400,
    pauseAfter: 1400,
    highlightMs: 800,
  });

  // ③ 規約同意欄（#agreeTerms）にもチェックを入れて申込ボタンがオレンジ色に変わるのを見せる
  await tapWithEffect(page, page.locator('#agreeTerms'), {
    pauseBefore: 1000,
    pauseAfter: 1800,
    highlightMs: 800,
  });

  // オレンジ色の申込ボタンをタップ ➔ 二重送信防止オーバーレイ表示 ➔ 完了画面へ遷移
  const submitBtnS7 = page.locator('#submitApplyBtn');
  await smoothScrollToLocator(page, submitBtnS7, 250);
  await page.waitForTimeout(1000);
  await highlightTarget(page, submitBtnS7, 850, true);
  await Promise.all([
    page.waitForURL(/\/apply\/success/, { waitUntil: 'domcontentloaded', timeout: 15000 }),
    submitBtnS7.click(),
  ]);

  // ④「お申し込み完了後、ご登録のメールアドレス宛にコンビニでのお支払い手順・受付番号が届きます」という案内（完了画面＋分かりやすい図解オーバーレイ）を表示
  await setCaption(
    page,
    'STEP 7',
    'コンビニ決済：お支払い手順・受付番号メールのご案内',
    'ご登録メールアドレスに届く受付番号で、期限内にコンビニ店頭でお支払いください'
  );
  await page.evaluate(() => {
    const convBox = document.getElementById('convenienceStoreNotice');
    if (convBox) convBox.classList.remove('hidden');

    if (!document.getElementById('okamoshi-konbini-guide-card')) {
      const guide = document.createElement('div');
      guide.id = 'okamoshi-konbini-guide-card';
      guide.style.cssText = `
        margin: 0 auto 14px;
        padding: 14px 15px;
        border-radius: 8px;
        background: #fbf2e7;
        border: 2px solid #f59e0b;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
        text-align: left;
        font-family: "Noto Sans JP", sans-serif;
      `;
      guide.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="background:#134230;color:#fff;font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:999px;">コンビニ決済の流れ</span>
          <span style="font-size:13px;font-weight:800;color:#1e3a2f;">メールでお支払い番号・手順が届きます</span>
        </div>
        <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#78350f;line-height:1.55;">
          お申し込み完了後、ご登録のメールアドレス宛に<span style="color:#b91c1c;text-decoration:underline;">コンビニでのお支払い手順・受付番号</span>が届きます。
        </p>
        <div style="display:grid;grid-template-columns:1fr;gap:6px;font-size:11.5px;color:#1e293b;">
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:7px 10px;display:flex;align-items:center;gap:8px;">
            <span style="background:#e8f5ee;color:#134230;font-weight:800;font-size:10.5px;padding:2px 7px;border-radius:4px;flex-shrink:0;">1. メール確認</span>
            <span style="font-weight:600;">届いたメール内の「お支払い受付番号・払込手順」を確認</span>
          </div>
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:7px 10px;display:flex;align-items:center;gap:8px;">
            <span style="background:#e8f5ee;color:#134230;font-weight:800;font-size:10.5px;padding:2px 7px;border-radius:4px;flex-shrink:0;">2. 店頭で手続</span>
            <span style="font-weight:600;">ファミマ・ローソン・ミニストップ・セイコーマート等へ</span>
          </div>
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:7px 10px;display:flex;align-items:center;gap:8px;">
            <span style="background:#fef3c7;color:#92400e;font-weight:800;font-size:10.5px;padding:2px 7px;border-radius:4px;flex-shrink:0;">3. 期限内支払</span>
            <span style="font-weight:700;color:#b91c1c;">記載のお支払い期限（23:59）までに店頭でお支払い</span>
          </div>
        </div>
      `;
      if (convBox && convBox.parentNode) {
        convBox.parentNode.insertBefore(guide, convBox);
      }
    }
  });

  const konbiniGuideCard = page.locator('#okamoshi-konbini-guide-card');
  await smoothScrollToLocator(page, konbiniGuideCard, 130);
  await page.waitForTimeout(800);
  await highlightTarget(page, konbiniGuideCard, 3200, false);
  await page.waitForTimeout(1200);
  const convNoticeBox = page.locator('#convenienceStoreNotice');
  await highlightTarget(page, convNoticeBox, 2600, false);
  await waitUntilSceneTarget(s7Start, s7Target);
  const s7End = nowSec();
  scenes.push({
    num: 7,
    file: 'scene_07.mp4',
    start: s7Start,
    end: s7End,
    caption:
      'STEP 7：コンビニ決済でお申し込みされる場合の手順（お支払い期限の確認 ➔ 確認欄・同意欄チェック ➔ 受付番号メール案内）',
    motion:
      'お支払い方法選択画面に戻り、①「コンビニ決済」を選択 ➔ ② 表示される黄色い「お支払い期限」パネルと確認チェックボックスに赤枠ハイライトを当ててチェック ➔ ③ 規約同意欄にもチェックを入れてオレンジ色の申込ボタンをタップ ➔ ④ 完了画面にて「お申し込み完了後、ご登録のメールアドレス宛にコンビニでのお支払い手順・受付番号が届きます」の図解カードと案内パネルを表示',
  });

  // =========================================================================
  // SCENE 08: お申し込み完了・メールのご確認・次回自動反映のご案内（104文字 → 目標 約26.7秒 / 3.9文字/秒）
  // =========================================================================
  const s8Start = nowSec();
  const s8Target = getTargetDurationForScene(8); // ~26.67s

  // 完了画面のトップへ滑らかに戻り、完了通知メール確認と今後のスケジュールを表示
  await page.evaluate(() => {
    const guide = document.getElementById('okamoshi-konbini-guide-card');
    if (guide) guide.remove();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  await setCaption(
    page,
    'STEP 8',
    'お申し込み完了・メールのご確認',
    '次回以降のお申し込み時は、今回の基本情報が自動で反映されます'
  );
  await page.waitForTimeout(4800);

  // 完了通知メール確認ボックスをハイライト
  const mailNoticeBox = page.locator('main .bg-slate-50').first();
  await smoothScrollToLocator(page, mailNoticeBox, 190);
  await page.waitForTimeout(2200);
  await highlightTarget(page, mailNoticeBox, 2200, false);
  await page.waitForTimeout(2800);

  // 今後のスケジュール案内まで滑らかにスクロールしてしっかり映す
  const scheduleHeading = page.locator('main h2').first();
  await smoothScrollToLocator(page, scheduleHeading, 190);
  await waitUntilSceneTarget(s8Start, s8Target);
  const s8End = nowSec();
  scenes.push({
    num: 8,
    file: 'scene_08.mp4',
    start: s8Start,
    end: s8End,
    caption:
      'STEP 8：お申し込み完了・メールのご確認（次回以降のお申し込み時は、今回の基本情報が自動で反映されます）',
    motion:
      'お申し込み完了画面（「お申し込みを受け付けました」）と完了通知メール案内を表示し、今後のスケジュール案内まで滑らかにスクロールして表示',
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

  // 2. シーン別動画（scene_01.mp4 〜 scene_08.mp4）の分割出力＆実測秒数取得
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

  // 3. 実測秒数に合わせた Google Vids 用ナレーション台本（1秒あたり 3.8〜4.0 文字厳守）を生成
  let md = `# 岡山県統一模擬試験（おかもし）お申し込み手順動画 ナレーション台本（Google Vids用）

- **全体動画ファイル**: \`manual_video_assets/full_manual.mp4\`（総尺：約 ${actualFullDuration.toFixed(1)} 秒 ／ スマホ縦画面 780×1688px 高解像度）
- **対象視聴者**: 中学生・小学生のお子様を持つ保護者様（40代中心）
- **読み上げ速度基準**: 1秒あたり 3.8〜4.0 文字（Google Vids の AI 音声ナレーションで自然・丁寧に聞き取れる速度）
- **構成**: クレジットカード決済（Apple Pay / Google Pay 含む）の手順（STEP 5〜6）に続けて、コンビニ決済の手順（STEP 7）とお申し込み完了確認（STEP 8）を収録

---

`;

  for (const sc of scenes) {
    const scriptText = NARRATION_TEMPLATES[sc.num];
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
  console.error('[Video Recorder] Fatal error:', err);
  process.exit(1);
});
