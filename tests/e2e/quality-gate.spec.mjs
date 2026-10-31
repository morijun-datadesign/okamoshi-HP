/**
 * 品質ゲート [2][3][4]: 実ブラウザ描画・コンソールエラーゼロ・表示崩れ・SEO/アクセシビリティ検査
 *  - PC 1280px / スマホ 375px の2プロジェクトで全ページを検査
 *  - /api/* はフィクスチャでモック（ネットワーク・D1 の状態に依存せず決定的に検査）
 *  - 計測タグ（GTM / Clarity）や Turnstile 等の外部スクリプトは遮断
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { examGuidesFixture, cramSchoolsFixture } from './fixtures/api-fixtures.mjs';

const KNOWN = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/e2e/known-issues.json'), 'utf8'));

// ------------------------------------------------------------------ 対象ページ
const articleIds = fs.readdirSync('news', { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== 'preview' && fs.existsSync(path.join('news', d.name, 'index.html')))
  .map((d) => d.name);

const PAGES = [
  { path: '/', name: 'トップ', schedule: true },
  { path: '/lp', name: 'LP', schedule: true },
  { path: '/news', name: 'お知らせ一覧', articleList: true },
  { path: '/blog.html', name: 'お知らせ・受験情報（blog）' },
  { path: '/apply', name: '申込フォーム' },
  { path: '/schools', name: '実施塾一覧' },
  { path: '/contact', name: 'お問い合わせ' },
  { path: '/contact/individual', name: 'お問い合わせ（個人）' },
  { path: '/contact/organization', name: 'お問い合わせ（団体）' },
  { path: '/tokushoho', name: '特定商取引法' },
  { path: '/privacy', name: 'プライバシーポリシー' },
  ...articleIds.map((id) => ({ path: `/news/${id}/`, name: `記事 ${id}`, article: id })),
];

// 描画に必須の外部リソースのみ許可（計測タグ GTM / Clarity 等は遮断）
// ※ cdn.tailwindcss.com は 32 ページが依存している Tailwind Play CDN（本番非推奨。将来 css/style.min.css へ移行予定）
const ALLOW_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'images.microcms-assets.io', 'cdn.tailwindcss.com']);

async function setupPage(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const loc = msg.location()?.url || '';
    // 遮断した外部ドメイン由来のリソース読込エラーは対象外（自サイト起因のエラーのみ検出）
    if (loc && !loc.startsWith('http://127.0.0.1') && !(process.env.QG_BASE_URL && loc.startsWith(process.env.QG_BASE_URL))) return;
    if (/net::ERR_(FAILED|BLOCKED_BY_CLIENT|ABORTED)/.test(msg.text())) return;
    errors.push(`console.error: ${msg.text()}`);
  });

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const local = url.hostname === '127.0.0.1' || (process.env.QG_BASE_URL && url.origin === new URL(process.env.QG_BASE_URL).origin);
    if (local && url.pathname.startsWith('/api/') && !process.env.QG_BASE_URL) {
      if (url.pathname.startsWith('/api/exam-guides')) return route.fulfill({ json: examGuidesFixture });
      if (url.pathname.startsWith('/api/cram-schools')) return route.fulfill({ json: cramSchoolsFixture });
      return route.fulfill({ json: { success: true, results: [], schools: [] } });
    }
    if (local || ALLOW_HOSTS.has(url.hostname) || url.protocol === 'data:') return route.continue();
    return route.abort('blockedbyclient');
  });
  return errors;
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  // 遅延読み込み画像・スクロール連動要素を発火させるため最下部までスクロール
  await page.evaluate(async () => {
    const step = Math.max(400, window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(400);
}

for (const pg of PAGES) {
  test(`${pg.name} (${pg.path})`, async ({ page }, testInfo) => {
    const isSP = testInfo.project.name.startsWith('sp');
    const errors = await setupPage(page);

    const res = await page.goto(pg.path, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), 'HTTPステータス').toBeLessThan(400);
    await settle(page);

    // ---- [3] コンソールエラー / ページエラー ゼロ
    expect(errors, 'pageerror / console.error が発生しています').toEqual([]);

    // ---- [2] ゴミ文字列・未解決プレースホルダー・読み込み中のまま停止
    const text = await page.evaluate(() => document.body.innerText);
    const garbage = [
      [/【★画像挿入/, '未置換の画像プレースホルダー'],
      [/\[object Object\]/, '[object Object]'],
      [/(^|[\s「（(：:])(undefined|null|NaN)(?=[\s」）)]|$)/m, 'undefined / null / NaN'],
      [/\b(TODO|FIXME)\b/, 'TODO / FIXME'],
      [/LOADING\.\.\.|読み込み中\.\.\.|取得中\.\.\./, '読み込み中表示のまま停止'],
      [/データを取得できませんでした/, 'データ取得エラー表示'],
    ];
    for (const [re, label] of garbage) {
      const m = text.match(re);
      expect(m, `${label} が表示されています: "${m ? text.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, ' ') : ''}"`).toBeNull();
    }

    // ---- [3] 画像が実際に描画されていること（表示中の <img> はすべて読み込み完了・サイズ>0）
    const broken = await page.evaluate(async () => {
      const imgs = [...document.images].filter((img) => img.offsetParent !== null && img.getBoundingClientRect().width > 0);
      // 横スクロールのカルーセル等で未発火の loading="lazy" 画像も強制的に読み込んで実在・デコード可否を確認
      imgs.forEach((img) => { img.loading = 'eager'; });
      await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => {
        img.addEventListener('load', r, { once: true });
        img.addEventListener('error', r, { once: true });
        setTimeout(r, 8000);
      }))));
      return imgs.filter((img) => !(img.complete && img.naturalWidth > 0)).map((img) => img.currentSrc || img.src);
    });
    expect(broken, '読み込めていない画像があります').toEqual([]);

    // ---- [3] スマホ幅で意図しない横スクロール・はみ出しがないこと
    if (isSP) {
      const overflow = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const out = [];
        if (document.documentElement.scrollWidth > vw + 1) out.push(`document.scrollWidth=${document.documentElement.scrollWidth} > ${vw}`);
        // 横スクロール領域の中身、および固定配置パネル（閉じたドロワーメニュー等）の中身は対象外
        const scrollable = (el) => {
          for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (['auto', 'scroll', 'hidden', 'clip'].includes(cs.overflowX) || cs.position === 'fixed') return true;
          }
          return false;
        };
        for (const el of document.body.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed' || cs.visibility === 'hidden' || cs.display === 'none') continue;
          if ((r.right > vw + 2 || r.left < -2) && !scrollable(el)) {
            out.push(`<${el.tagName.toLowerCase()} class="${(el.className?.baseVal ?? el.className ?? '').toString().slice(0, 60)}"> right=${Math.round(r.right)}`);
            if (out.length >= 5) break;
          }
        }
        return out;
      });
      expect(overflow, 'スマホ幅(375px)で横にはみ出している要素があります').toEqual([]);
    }

    // ---- ページ固有: 実施日程・会場リストが描画され、会場名が省略されず注釈が控えめに表示されること
    if (pg.schedule) {
      const list = page.locator('#schedule-list');
      await expect(list).toBeVisible();
      await expect(list.locator(':scope > div')).toHaveCount(3);
      await expect(list).toContainText('津山圏域雇用労働センター');
      const venue = await page.evaluate(() => {
        const listEl = document.getElementById('schedule-list');
        const note = [...listEl.querySelectorAll('div')].find((d) => d.textContent.trim() === '※会場は弊社にて決定');
        const main = [...listEl.querySelectorAll('div')].find((d) => d.textContent.trim().startsWith('津山福祉総合会館'));
        if (!note || !main) return null;
        const truncated = [...listEl.querySelectorAll('*')].some((e) => {
          const cs = getComputedStyle(e);
          return cs.textOverflow === 'ellipsis' || (e.scrollWidth > e.clientWidth + 1 && cs.overflow === 'hidden');
        });
        return {
          ratio: parseFloat(getComputedStyle(note).fontSize) / parseFloat(getComputedStyle(main).fontSize),
          color: getComputedStyle(note).color,
          truncated,
        };
      });
      expect(venue, '津山会場の会場名本体と ※注釈 が別要素で描画されていません').not.toBeNull();
      expect(venue.ratio, '※注釈のフォントサイズは本体の約0.85倍').toBeGreaterThan(0.8);
      expect(venue.ratio).toBeLessThan(0.9);
      expect(venue.color, '※注釈の色は text-slate-500').toBe('rgb(100, 116, 139)');
      expect(venue.truncated, '会場名が1行省略（ellipsis）されています').toBe(false);
    }

    if (pg.articleList) {
      expect(await page.locator('article a[href^="/news/"]').count(), 'お知らせ記事カード').toBeGreaterThan(0);
    }

    if (pg.article) {
      const body = await page.evaluate(() => {
        const el = document.querySelector('#article-body, .article-body, #article-content, article .prose, article');
        return el ? { len: el.innerText.trim().length, imgs: el.querySelectorAll('img').length } : { len: 0, imgs: 0 };
      });
      if (KNOWN.emptyArticleBodies.includes(pg.article)) {
        testInfo.annotations.push({ type: 'warning', description: `既知の課題: 記事 ${pg.article} の本文が空です（microCMSで本文の入力が必要）` });
      } else {
        expect(body.len, '記事本文が描画されていません').toBeGreaterThan(200);
      }
    }

    // ---- [4] SEO・アクセシビリティ（PCプロジェクトのみで実施）
    if (!isSP) {
      const seo = await page.evaluate(() => {
        const meta = (sel) => document.querySelector(sel)?.getAttribute('content')?.trim() || '';
        // 表示中の見出しのみ対象（PC/SP 出し分けで display:none の重複見出しや、送信完了メッセージ等の非表示要素は除外）
        const visible = (el) => el.offsetParent !== null;
        const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map((h) => Number(h.tagName[1]));
        const jumps = [];
        for (let i = 1; i < heads.length; i++) if (heads[i] > heads[i - 1] + 1) jumps.push(`h${heads[i - 1]}→h${heads[i]}`);
        return {
          title: document.title.trim(),
          description: meta('meta[name="description"]'),
          ogTitle: meta('meta[property="og:title"]'),
          ogDescription: meta('meta[property="og:description"]'),
          ogImage: meta('meta[property="og:image"]'),
          h1: [...document.querySelectorAll('h1')].filter(visible).length,
          jumps: [...new Set(jumps)],
          noAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).map((i) => i.getAttribute('src')),
          lang: document.documentElement.lang,
        };
      });
      expect(seo.title, '<title>').not.toBe('');
      expect(seo.description, '<meta name="description">').not.toBe('');
      expect(seo.ogTitle, 'og:title').not.toBe('');
      expect(seo.ogDescription, 'og:description').not.toBe('');
      expect(seo.ogImage, 'og:image').not.toBe('');
      expect(seo.lang, '<html lang>').toBe('ja');
      expect(seo.h1, '表示中の <h1> はページに1つ').toBe(1);
      expect(seo.jumps, '見出し階層の飛び（例: h2→h4）').toEqual([]);
      expect(seo.noAlt, 'alt 属性のない画像').toEqual([]);
    }
  });
}

// ---- [3] お問い合わせフォーム（/contact/）のインタラクション・送信完了画面・学年プルダウン表記検査
test('お問い合わせフォーム（/contact/）: 学年プルダウン表記＆送信完了画面の視認性検査', async ({ page }) => {
  const errors = await setupPage(page);

  // 外部スクリプト遮断環境向けに Turnstile オブジェクトをモック
  await page.addInitScript(() => {
    window.turnstile = {
      getResponse: () => 'mock-turnstile-token',
      execute: () => {},
      reset: () => {},
    };
  });

  // /api/contact をモック（実際に外部へメール送信せず 200 OK を返す）
  const submittedPayloads = [];
  await page.route('**/api/contact', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      submittedPayloads.push(req.postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: 'お問い合わせを受け付けました。' }),
      });
    }
    return route.continue();
  });

  // 要素の可視性・テキスト非空・背景色とのコントラスト比（非透明・非同化）を検証するヘルパー
  const verifyReadableStyle = async (locator, label) => {
    await expect(locator, `${label} が表示されていること`).toBeVisible();
    const textContent = (await locator.innerText()).trim();
    expect(textContent.length, `${label} のテキストが空でないこと`).toBeGreaterThan(0);

    const styleCheck = await locator.evaluate((el) => {
      const parseRgba = (str) => {
        const m = str && str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
        if (!m) return null;
        return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
      };
      const luminance = ({ r, g, b }) => {
        const toLinear = (c) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
      };

      const cs = getComputedStyle(el);
      const opacity = parseFloat(cs.opacity || '1');
      const fg = parseRgba(cs.color);

      // 祖先要素をたどって実効背景色を取得（すべて透明なら白背景）
      let bg = { r: 255, g: 255, b: 255, a: 1 };
      for (let cur = el; cur && cur !== document.documentElement; cur = cur.parentElement) {
        const parsed = parseRgba(getComputedStyle(cur).backgroundColor);
        if (parsed && parsed.a > 0.1) {
          bg = parsed;
          break;
        }
      }

      const l1 = fg ? luminance(fg) : 0;
      const l2 = luminance(bg);
      const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

      return {
        opacity,
        fgAlpha: fg ? fg.a : 0,
        fgColor: cs.color,
        bgColor: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
        contrast: Number(contrast.toFixed(2)),
      };
    });

    expect(styleCheck.opacity, `${label} の opacity が透明でないこと`).toBeGreaterThan(0.5);
    expect(styleCheck.fgAlpha, `${label} の文字色 alpha が透明でないこと`).toBeGreaterThan(0.5);
    expect(
      styleCheck.contrast,
      `${label} の文字色(${styleCheck.fgColor})が背景色(${styleCheck.bgColor})と同化していないこと`
    ).toBeGreaterThanOrEqual(3.0);
  };

  await page.goto('/contact/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});

  // ----------------------------------------------------------------
  // 1. 「個人申込の方」タブ：学年プルダウン選択肢の表記テスト＆フォーム送信
  // ----------------------------------------------------------------
  await page.locator('#tab-btn-individual').click();
  await expect(page.locator('#container-individual')).toBeVisible();

  const gradeOptions = await page.locator('#student-grade option:not([disabled])').evaluateAll((opts) =>
    opts.map((o) => ({ value: o.value, label: o.textContent.trim() }))
  );
  expect(gradeOptions, '学年プルダウンの選択肢が指定のシンプル表記であること').toEqual([
    { value: '中学3年生', label: '中学3年生' },
    { value: '中学2年生', label: '中学2年生' },
    { value: '中学1年生', label: '中学1年生' },
    { value: '小学6年生', label: '小学6年生' },
    { value: 'その他', label: 'その他' },
  ]);
  for (const opt of gradeOptions) {
    expect(opt.label, '学年選択肢に不要なカッコ書きが含まれていないこと').not.toMatch(/[（(]/);
  }

  // 個人フォーム入力 → 送信
  await page.locator('#indiv-name').fill('岡山 花子');
  await page.locator('#indiv-kana').fill('オカヤマ ハナコ');
  await page.locator('#student-name').fill('岡山 太郎');
  await page.locator('#student-grade').selectOption('中学3年生');
  await page.locator('#indiv-email').fill('test-indiv@example.com');
  await page.locator('#indiv-tel').fill('090-0000-0000');
  await page.locator('#indiv-type').selectOption('個人受験のお申込み方法について');
  await page.locator('#indiv-message').fill('個人申込のテストお問い合わせです。');
  await page.locator('#privacy-agree-indiv').check();
  await page.locator('#submit-btn-indiv').click();

  // 個人フォーム送信後の完了画面検証
  await expect(page.locator('#individual-contact-form')).toBeHidden();
  const completeIndiv = page.locator('#complete-msg-indiv');
  await expect(completeIndiv).toBeVisible();

  const indivHeading = completeIndiv.locator('h2');
  const indivBody = completeIndiv.locator('p');
  const indivBtn = completeIndiv.locator('a');

  await expect(indivHeading).toHaveText('お問い合わせを受け付けました');
  await expect(indivBody).toContainText('お問い合わせいただきありがとうございます。');
  await expect(indivBody).toContainText('ご入力いただいたメールアドレス宛に自動返信メール（控え）をお送りいたしました。');
  await expect(indivBtn).toContainText('トップページへ戻る');

  await verifyReadableStyle(indivHeading, '個人タブ完了画面の見出し');
  await verifyReadableStyle(indivBody, '個人タブ完了画面の本文');
  await verifyReadableStyle(indivBtn, '個人タブ完了画面の導線ボタン');

  // ----------------------------------------------------------------
  // 2. 「塾・学校関係者様」タブ：フォーム送信＆完了画面テスト
  // ----------------------------------------------------------------
  await page.locator('#tab-btn-organization').click();
  await expect(page.locator('#container-organization')).toBeVisible();

  await page.locator('#org-name').fill('テスト学習塾');
  await page.locator('#org-branch').fill('岡山駅前校');
  await page.locator('#org-contact-name').fill('岡山 太郎');
  await page.locator('#org-contact-kana').fill('オカヤマ タロウ');
  await page.locator('#org-email').fill('test-org@example.com');
  await page.locator('#org-tel').fill('086-000-0000');
  await page.locator('#org-type').selectOption('模試導入のご検討・ご相談');
  await page.locator('#org-message').fill('塾・学校関係者様のテストお問い合わせです。');
  await page.locator('#privacy-agree-org').check();
  await page.locator('#submit-btn-org').click();

  // 塾・学校関係者様フォーム送信後の完了画面検証
  await expect(page.locator('#org-contact-form')).toBeHidden();
  const completeOrg = page.locator('#complete-msg-org');
  await expect(completeOrg).toBeVisible();

  const orgHeading = completeOrg.locator('h2');
  const orgBody = completeOrg.locator('p');
  const orgBtn = completeOrg.locator('a');

  await expect(orgHeading).toHaveText('お問い合わせを受け付けました');
  await expect(orgBody).toContainText('お問い合わせいただきありがとうございます。');
  await expect(orgBody).toContainText('ご入力いただいたメールアドレス宛に自動返信メール（控え）をお送りいたしました。');
  await expect(orgBtn).toContainText('トップページへ戻る');

  await verifyReadableStyle(orgHeading, '塾・学校タブ完了画面の見出し');
  await verifyReadableStyle(orgBody, '塾・学校タブ完了画面の本文');
  await verifyReadableStyle(orgBtn, '塾・学校タブ完了画面の導線ボタン');

  // APIモックが2回（individual / organization）正しく呼ばれたこと＆エラーゼロを確認
  expect(submittedPayloads.map((p) => p.type)).toEqual(['individual', 'organization']);
  expect(submittedPayloads[0].grade).toBe('中学3年生');
  expect(errors, 'フォーム送信中に pageerror / console.error が発生しています').toEqual([]);
});

// ---- [2] 内部リンク切れ検査（全ページの href / src を収集して HTTP ステータスを確認）
test('内部リンク切れゼロ', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'pc-1280', 'PCプロジェクトのみで実行');
  const targets = new Map();
  for (const pg of PAGES) {
    const resp = await request.get(pg.path);
    const basePath = new URL(resp.url()).pathname; // /contact → /contact/ のようなリダイレクト後のURLを基準に相対リンクを解決
    const html = await resp.text();
    const cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    for (const m of cleaned.matchAll(/\s(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)) {
      const u = m[1].trim();
      if (!u || /^(https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(u) || u.includes('${')) continue;
      const abs = new URL(u, `http://x${basePath}`).pathname;
      if (abs.startsWith('/api/')) continue;
      if (!targets.has(abs)) targets.set(abs, pg.path);
    }
  }
  const brokenLinks = [];
  for (const [p, from] of targets) {
    const r = await request.get(p, { maxRedirects: 5 });
    if (r.status() >= 400) brokenLinks.push(`${p} (${r.status()}) ← ${from}`);
  }
  expect(brokenLinks, `リンク切れ（全 ${targets.size} 件中）`).toEqual([]);
});
