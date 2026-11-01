#!/usr/bin/env node
/**
 * 塾一覧（取扱塾・教室マスタ）公式サイトURL 全件チェックスクリプト
 * (scripts/check-juku-urls.mjs)
 *
 * 【検査項目】
 * ① リンク切れ検知：404 / 500系エラー、接続タイムアウト、ドメイン失効（DNSエラー）、不正URL
 * ② 別ページへの強制転送・ソフト404検知：個別教室URLからトップページへの強制リダイレクト、ページ内の404文言検知
 * ③ ページ内容の照合（違うサイトへの変化検知）：<title> / <h1> / OGP / 本文と登録塾・教室名の照合、ドメイン転売・無関係サイトの検知
 * ④ http:// の検出：http:// 登録URLに対して https:// で正常アクセス可能か検証し、HTTPS化可能な教室を一覧表示
 *
 * 使い方:
 *   npm run check:juku-urls
 *   node scripts/check-juku-urls.mjs              # 通常実行（NGが1件でもあれば exit 1）
 *   node scripts/check-juku-urls.mjs --report-only # レポート出力のみ（exit 0）
 *   node scripts/check-juku-urls.mjs --json        # JSONレポートも test-results/juku-url-check.json に保存
 */

import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

const args = process.argv.slice(2);
const reportOnly = args.includes('--report-only');
const useLocalOnly = args.includes('--local');
const saveJson = args.includes('--json') || true; // 常に test-results/juku-url-check.json にも保存

const CSV_PATH = path.join(process.cwd(), 'cram_schools.csv');
const SQL_SEED_PATH = path.join(process.cwd(), 'db/seed/cram_schools.sql');
const D1_API_ENDPOINTS = [
  'https://feature-idea-b.okamoshi-hp.pages.dev/api/cram-schools',
  'https://okamoshi-hp.pages.dev/api/cram-schools',
  'https://okayama-moshi.com/api/cram-schools',
];
const CONCURRENCY = 12;
const TIMEOUT_MS = 12000;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * CSVパーサー（ダブルクォート・カンマ対応）
 */
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

/**
 * D1 API（スプレッドシート同期済みの最新データ）から全教室データを取得し、
 * ローカルの cram_schools.csv とも同期する。オフライン時はローカル CSV / SQL シードにフォールバック。
 */
async function loadCramSchools() {
  if (!useLocalOnly) {
    for (const apiUrl of D1_API_ENDPOINTS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(`${apiUrl}?t=${Date.now()}`, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Cache-Control': 'no-cache' },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        const data = await res.json();
        if (data && data.success && Array.isArray(data.schools) && data.schools.length > 0) {
          const schools = data.schools.map((row, idx) => ({
            order: Number(row.display_order) || idx + 1,
            areaId: String(row.area_id || '').trim(),
            areaName: String(row.area_name || '').trim(),
            name: String(row.name || '').trim(),
            url: String(row.website_url || '').trim(),
            tel: String(row.phone_number || '').trim(),
            source: `Cloudflare D1 最新同期データ (${apiUrl})`,
          }));
          // ローカルの cram_schools.csv を最新のD1データと同期
          syncLocalCsvWithD1(schools);
          return schools;
        }
      } catch {
        /* 次のエンドポイントまたはローカルCSVへフォールバック */
      }
    }
  }

  if (fs.existsSync(CSV_PATH)) {
    const raw = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const schools = [];
    // 1行目はヘッダー: 学区ID,学区名,塾・教室名,公式サイトURL,電話番号,表示順
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 3) continue;
      const areaId = (cols[0] || '').trim();
      const areaName = (cols[1] || '').trim();
      const name = (cols[2] || '').trim();
      const url = (cols[3] || '').trim();
      const tel = (cols[4] || '').trim();
      const order = Number(cols[5]) || i;
      if (!name) continue;
      schools.push({
        order,
        areaId,
        areaName,
        name,
        url,
        tel,
        source: 'cram_schools.csv',
      });
    }
    return schools;
  }

  if (fs.existsSync(SQL_SEED_PATH)) {
    const raw = fs.readFileSync(SQL_SEED_PATH, 'utf8');
    const schools = [];
    const re = /\(\s*(\d+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(NULL|'[^']*')\s*,\s*(NULL|'[^']*')\s*\)/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const order = Number(m[1]);
      const areaId = m[2];
      const areaName = m[3];
      const name = m[4].replace(/''/g, "'");
      const urlRaw = m[5];
      const telRaw = m[6];
      const url = urlRaw === 'NULL' ? '' : urlRaw.slice(1, -1).replace(/''/g, "'").trim();
      const tel = telRaw === 'NULL' ? '' : telRaw.slice(1, -1).replace(/''/g, "'").trim();
      schools.push({
        order,
        areaId,
        areaName,
        name,
        url,
        tel,
        source: 'db/seed/cram_schools.sql',
      });
    }
    return schools;
  }

  throw new Error('塾一覧データ (cram_schools.csv または db/seed/cram_schools.sql) が見つかりません。');
}

/**
 * 文字列正規化（全角英数→半角、カタカナ→ひらがな、小文字化、空白・記号除去）
 */
function normalizeForMatch(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0x60))
    .replace(/[\s　\-_・/／.．,、()（）「」『』【】［］\[\]〜~！!？?:：;；'"’”`]/g, '');
}

/**
 * レスポンスバッファから適切な文字コード（UTF-8 / Shift_JIS / EUC-JP）でデコードする
 */
function decodeHtmlBuffer(buffer, contentTypeHeader = '') {
  const ct = String(contentTypeHeader).toLowerCase();
  let charset = 'utf-8';

  if (ct.includes('shift_jis') || ct.includes('shift-jis') || ct.includes('sjis') || ct.includes('windows-31j')) {
    charset = 'shift_jis';
  } else if (ct.includes('euc-jp')) {
    charset = 'euc-jp';
  } else if (ct.includes('iso-2022-jp')) {
    charset = 'iso-2022-jp';
  } else {
    // 先頭 4KB を ASCII/Latin1 として覗き見して meta charset を確認
    const headAscii = Buffer.from(buffer.slice(0, 4096)).toString('latin1').toLowerCase();
    if (/charset\s*=\s*["']?\s*(shift_jis|shift-jis|x-sjis|windows-31j)/i.test(headAscii)) {
      charset = 'shift_jis';
    } else if (/charset\s*=\s*["']?\s*euc-jp/i.test(headAscii)) {
      charset = 'euc-jp';
    }
  }

  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

/**
 * HTML文字列から <title>, <h1>, <h2>, OGP, description, meta refresh, visible text を抽出
 */
function extractPageMeta(html) {
  if (!html) {
    return {
      title: '',
      h1: '',
      h2: '',
      ogTitle: '',
      ogSiteName: '',
      description: '',
      metaRefreshUrl: null,
      bodyText: '',
    };
  }

  const cleanTagText = (s) =>
    String(s || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? cleanTagText(titleMatch[1]) : '';

  const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  const h1 = h1Matches.map((m) => cleanTagText(m[1])).filter(Boolean).join(' / ');

  const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  const h2 = h2Matches.slice(0, 5).map((m) => cleanTagText(m[1])).filter(Boolean).join(' / ');

  const getMetaContent = (attrName, attrVal) => {
    const re1 = new RegExp(`<meta[^>]+${attrName}=["']${attrVal}["'][^>]+content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attrName}=["']${attrVal}["']`, 'i');
    const m = html.match(re1) || html.match(re2);
    return m ? cleanTagText(m[1]) : '';
  };

  const ogTitle = getMetaContent('property', 'og:title');
  const ogSiteName = getMetaContent('property', 'og:site_name');
  const description = getMetaContent('name', 'description') || getMetaContent('property', 'og:description');

  // meta http-equiv="refresh"
  let metaRefreshUrl = null;
  const refreshMatch =
    html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+http-equiv=["']?refresh["']?/i);
  if (refreshMatch) {
    const urlPart = refreshMatch[1].match(/url\s*=\s*['"]?([^'";\s>]+)/i);
    if (urlPart && urlPart[1]) {
      metaRefreshUrl = urlPart[1].trim();
    }
  }

  const bodyText = cleanTagText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
  );

  return {
    title,
    h1,
    h2,
    ogTitle,
    ogSiteName,
    description,
    metaRefreshUrl,
    bodyText,
  };
}

/**
 * 塾・教室名から照合用キーワード群と代替英語・ブランド別名を抽出する
 */
function buildKeywordsForSchool(schoolName, originalUrl) {
  const normFull = normalizeForMatch(schoolName);

  // 汎用接頭辞・接尾辞を除去してコア名を抽出
  const genericWords = [
    '個別指導学院',
    '個別指導学習塾',
    '個別サポート学習塾',
    '個別指導塾',
    '個別指導',
    '進学個別塾',
    '個人別指導塾',
    '自立学習塾',
    '笠岡子別指導塾',
    '学習教室',
    '学習塾',
    '進学塾',
    '進学ゼミ',
    '学育塾',
    '理数塾',
    '公営塾',
    '英語教室',
    'そろばん教室',
  ];

  let core = schoolName.normalize('NFKC');
  for (const gw of genericWords) {
    core = core.replace(gw, ' ');
  }

  // 教室名（〜校、〜教室）の分離
  let branchName = '';
  const branchMatch = core.match(/([^\s　]{1,10}?)(校|教室)$/);
  if (branchMatch) {
    branchName = branchMatch[1];
  }

  // 既知のブランド表記ゆれ辞書（ローマ字・略称・運営会社名等）
  const brandAliases = [
    { match: /r\.?studyroom/i, tokens: ['rstudyroom', 'アールスタディルーム', 'studyroom'] },
    { match: /itto/i, tokens: ['itto', 'イットー', '個別指導学院'] },
    { match: /auアカデミー/i, tokens: ['auアカデミー', '英友', 'eiyuu'] },
    { match: /岡山進研/i, tokens: ['進研学院', '岡山進研', 'shinken'] },
    { match: /e・r・i/i, tokens: ['eri', 'イーアールアイ', '学習塾eri'] },
    { match: /stand\s*up/i, tokens: ['standup', 'スタンドアップ'] },
    { match: /学研/i, tokens: ['学研', 'gakken', '889100'] },
    { match: /klc/i, tokens: ['klc', 'ケーエルシー'] },
    { match: /京進|スクール・ワン/i, tokens: ['京進', 'スクールワン', 'kyoshin'] },
    { match: /高学舎/i, tokens: ['高学舎', 'kogakusha'] },
    { match: /axis/i, tokens: ['axis', 'アクシス'] },
    { match: /ヒーローズ/i, tokens: ['ヒーローズ', 'heros', 'e-gakkou'] },
    { match: /スタディサポート/i, tokens: ['スタディサポート', 'studysupport'] },
    { match: /松陰塾/i, tokens: ['松陰塾', 'ショウイン', 'showin'] },
    { match: /all-up/i, tokens: ['allup', 'オールアップ'] },
    { match: /サンライズ/i, tokens: ['サンライズ', 'sunrise'] },
    { match: /タイズ/i, tokens: ['タイズ', 'ties'] },
    { match: /スタッド/i, tokens: ['スタッド', 'stad'] },
    { match: /田中学習会/i, tokens: ['田中学習会', 'tanaka'] },
    { match: /特進ゼミ/i, tokens: ['特進ゼミ', 'tokukura'] },
    { match: /ふたば塾/i, tokens: ['ふたば塾', 'futaba'] },
    { match: /トライプラス/i, tokens: ['トライプラス', 'tryplus'] },
    { match: /能開センター/i, tokens: ['能開', 'nokai', 'ワオ'] },
    { match: /fit/i, tokens: ['fit', 'フィット', 'kimini'] },
    { match: /ポケット/i, tokens: ['ポケット', 'pocket'] },
    { match: /明光義塾/i, tokens: ['明光義塾', 'meiko'] },
    { match: /めぶき/i, tokens: ['めぶき', '芽吹き'] },
    { match: /ユアサイド/i, tokens: ['ユアサイド', 'yourside'] },
    { match: /若竹塾/i, tokens: ['若竹塾', 'aei', 'wakatake'] },
    { match: /仁/i, tokens: ['個別指導塾仁', '仁', 'jin'] },
    { match: /ピーチ/i, tokens: ['ピーチ', 'peach'] },
    { match: /誠泉塾/i, tokens: ['誠泉塾', 'seisen'] },
    { match: /とと塾/i, tokens: ['とと塾', 'toto'] },
    { match: /hau[’']?oli/i, tokens: ['hauoli', 'ハウオリ', 'instagram'] },
    { match: /浜崎/i, tokens: ['浜崎', 'hamasaki'] },
    { match: /ポピー|まる英語/i, tokens: ['ポピー', 'まる英語', 'popy', 'instagram'] },
    { match: /柚木/i, tokens: ['柚木', 'yunoki'] },
    { match: /江越塾/i, tokens: ['江越', 'egoshi'] },
    { match: /大手町/i, tokens: ['大手町', 'otemachi'] },
    { match: /てらこや/i, tokens: ['てらこや', '寺子屋', 'terakoya'] },
    { match: /川崎学習塾/i, tokens: ['川崎学習塾', '川崎', 'かわさき'] },
    { match: /red/i, tokens: ['red', 'レッド', '自立学習'] },
    { match: /津山高校津山中学ゼミ/i, tokens: ['津山高校', '津山中学', 'ゼミ', 'tsuyama'] },
    { match: /中島塾/i, tokens: ['中島塾', '中島', 'nakashima'] },
    { match: /いけだ理数塾/i, tokens: ['いけだ', '池田', '理数', 'risu'] },
    { match: /中塚/i, tokens: ['中塚', 'nakatsuka', '金次郎', 'instagram'] },
    { match: /とりゼミ/i, tokens: ['とりゼミ', 'とり', '笠岡'] },
  ];

  const tokens = new Set();
  tokens.add(normFull);

  // スペース区切りやコア部分を追加
  const parts = core
    .split(/[\s　・]+/)
    .map((p) => p.replace(/(校|教室)$/, '').trim())
    .filter((p) => p.length >= 2);

  for (const p of parts) {
    tokens.add(normalizeForMatch(p));
  }
  if (branchName && branchName.length >= 2) {
    tokens.add(normalizeForMatch(branchName));
  }

  for (const entry of brandAliases) {
    if (entry.match.test(schoolName.normalize('NFKC'))) {
      for (const t of entry.tokens) {
        tokens.add(normalizeForMatch(t));
      }
    }
  }

  return {
    tokens: [...tokens].filter((t) => t.length >= 2),
    branchToken: branchName ? normalizeForMatch(branchName) : '',
  };
}

/**
 * SSL証明書エラー時などに rejectUnauthorized: false でページ内容を覗き見し、
 * ドメイン失効（ParkLogic等）かどうかを診断する補助フェッチ
 */
function fetchInsecureHtml(targetUrl) {
  return new Promise((resolve) => {
    try {
      const u = new URL(targetUrl);
      const client = u.protocol === 'https:' ? https : http;
      const req = client.request(
        u,
        {
          method: 'GET',
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,*/*;q=0.8',
          },
          rejectUnauthorized: false,
          timeout: 6000,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            const html = decodeHtmlBuffer(buf, res.headers['content-type'] || '');
            resolve({ status: res.statusCode || 0, meta: extractPageMeta(html) });
          });
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.on('error', () => resolve(null));
      req.end();
    } catch {
      resolve(null);
    }
  });
}

/**
 * URLに対するHTTPフェッチ（リダイレクト追跡・メタ情報抽出・SPA補完）
 */
async function fetchUrlDetails(targetUrl, options = { inspectTlsFailure: true }) {
  const redirectChain = [];
  let currentUrl = targetUrl;
  const maxRedirects = 8;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
        },
      });
      clearTimeout(timer);

      const status = res.status;
      const location = res.headers.get('location');

      if ([301, 302, 303, 307, 308].includes(status) && location) {
        const nextUrl = new URL(location, currentUrl).toString();
        redirectChain.push({ from: currentUrl, to: nextUrl, status });
        currentUrl = nextUrl;
        continue;
      }

      const arrayBuf = await res.arrayBuffer();
      const html = decodeHtmlBuffer(Buffer.from(arrayBuf), res.headers.get('content-type') || '');
      const meta = extractPageMeta(html);

      // meta refresh があれば1回追跡（同一ページリフレッシュでない場合）
      if (meta.metaRefreshUrl && hop < maxRedirects) {
        try {
          const nextUrl = new URL(meta.metaRefreshUrl, currentUrl).toString();
          if (nextUrl !== currentUrl) {
            redirectChain.push({ from: currentUrl, to: nextUrl, status: 'META_REFRESH' });
            currentUrl = nextUrl;
            continue;
          }
        } catch {
          /* ignore invalid meta refresh url */
        }
      }

      // 学研教室 (www.889100.com/classrooms/<id>) はSPAのため REST API で実在＆教室名を補完検証
      try {
        const u = new URL(currentUrl);
        const gakkenMatch = u.hostname === 'www.889100.com' && u.pathname.match(/^\/classrooms\/(\d+)/);
        if (gakkenMatch) {
          const classroomId = gakkenMatch[1];
          const apiRes = await fetch(`https://www.889100.com/restapi/classrooms/${classroomId}`, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          });
          if (apiRes.status === 404 || !apiRes.ok) {
            return {
              ok: false,
              status: apiRes.status || 404,
              finalUrl: currentUrl,
              redirectChain,
              meta,
              error: `学研教室APIで該当教室ID (${classroomId}) が見つかりません (HTTP ${apiRes.status})`,
              errorCode: 'GAKKEN_CLASSROOM_NOT_FOUND',
            };
          }
          const data = await apiRes.json();
          const roomName = data?.classroom?.name || data?.name || data?.classroom_name || '';
          const prefName = data?.classroom?.prefecture_name || '';
          if (roomName) {
            meta.title = `${roomName}${prefName ? `（${prefName}）` : ''}｜${meta.title || '学研教室'}`;
            meta.h1 = roomName;
          }
        }
      } catch {
        /* ignore SPA API supplement error */
      }

      return {
        ok: status >= 200 && status < 400,
        status,
        finalUrl: currentUrl,
        redirectChain,
        meta,
        error: null,
      };
    } catch (err) {
      clearTimeout(timer);
      const causeCode = err?.cause?.code || err?.code || '';
      const errMsg = err?.name === 'AbortError'
        ? `接続タイムアウト (${TIMEOUT_MS / 1000}秒)`
        : `${err.message || String(err)}${causeCode ? ` [${causeCode}]` : ''}`;

      // SSL証明書エラー等の場合、ドメイン失効（パーキングサイト化）かどうか追加調査
      let insecureMeta = extractPageMeta('');
      let expiredDomainNote = '';
      if (options.inspectTlsFailure && /CERT|TLS|SSL/i.test(causeCode + ' ' + errMsg)) {
        const probe = await fetchInsecureHtml(currentUrl);
        if (probe && probe.meta) {
          insecureMeta = probe.meta;
          const probeText = `${probe.meta.title} ${probe.meta.h1} ${probe.meta.bodyText}`;
          if (
            /domain\s+name\s+has\s+expired|parklogic|sedo\.com|hugedomains|for\s+sale|お名前\.com/i.test(probeText) ||
            /^redirecting\.{0,3}$/i.test(probe.meta.title.trim())
          ) {
            expiredDomainNote = ' 【⚠️ドメイン失効・パーキングサイトへ変化しています】';
          }
        }
      }

      return {
        ok: false,
        status: 0,
        finalUrl: currentUrl,
        redirectChain,
        meta: insecureMeta,
        error: `${errMsg}${expiredDomainNote}`,
        errorCode: causeCode || (err?.name === 'AbortError' ? 'ETIMEDOUT' : 'FETCH_ERROR'),
        isExpiredDomain: Boolean(expiredDomainNote),
      };
    }
  }

  return {
    ok: false,
    status: 0,
    finalUrl: currentUrl,
    redirectChain,
    meta: extractPageMeta(''),
    error: 'リダイレクト回数超過 (Too many redirects)',
    errorCode: 'ERR_TOO_MANY_REDIRECTS',
  };
}

/**
 * 個別教室URLがトップページや一覧ページへ強制転送されていないか判定
 */
function detectForcedRedirectToTop(originalUrlStr, finalUrlStr, redirectChain) {
  try {
    const orig = new URL(originalUrlStr);
    const fin = new URL(finalUrlStr);

    // InstagramのログインリダイレクトはSNS特有の仕様として別扱い
    if (orig.hostname.includes('instagram.com') && fin.pathname.includes('/accounts/login')) {
      return { forced: false, instagramLoginRedirect: true };
    }

    // 元URLに深いパス（個別校舎ページ等）があるのに、最終URLがトップページ (`/`) や一覧ページに変わっている場合
    const origPathSegments = orig.pathname.split('/').filter(Boolean);
    const finPathSegments = fin.pathname.split('/').filter(Boolean);

    if (origPathSegments.length >= 2 && finPathSegments.length === 0) {
      return {
        forced: true,
        reason: `個別ページ (${orig.pathname}) からトップページ (/) へ強制リダイレクトされています`,
      };
    }

    // 例: /schools/xxx -> /schools/ のように親階層へ戻された場合
    if (
      origPathSegments.length >= 2 &&
      finPathSegments.length < origPathSegments.length &&
      orig.pathname.startsWith(fin.pathname) &&
      finPathSegments.length <= 1
    ) {
      return {
        forced: true,
        reason: `個別ページ (${orig.pathname}) から上位ページ (${fin.pathname}) へ強制転送されています`,
      };
    }

    return { forced: false };
  } catch {
    return { forced: false };
  }
}

/**
 * ソフト404（ステータス200だが中身が404・閉鎖ページ）および無関係サイト（ドメイン転売等）の検知
 */
function evaluatePageContent(school, fetchResult) {
  const { meta, finalUrl } = fetchResult;
  const combinedTitle = [meta.title, meta.ogTitle, meta.h1, meta.ogSiteName].filter(Boolean).join(' | ');
  const combinedAll = [combinedTitle, meta.h2, meta.description, meta.bodyText.slice(0, 4000)].join(' ');
  const normTitleAndHeadings = normalizeForMatch(combinedTitle + ' ' + meta.h2 + ' ' + meta.description);
  const normBody = normalizeForMatch(combinedAll);

  // 1. 自サイト (okayama-moshi.com) の 404 や誤URL混入検知
  try {
    const u = new URL(school.url);
    if (u.hostname.includes('okayama-moshi.com')) {
      return {
        status: 'NG_BROKEN_OR_INVALID_URL',
        reason: `公式サイトURLにおかもし自身のURL（${school.url}）が誤って設定されています`,
      };
    }
  } catch {
    return {
      status: 'NG_BROKEN_OR_INVALID_URL',
      reason: `URLの形式が不正です: ${school.url}`,
    };
  }

  // 2. ソフト404検知（タイトルや見出しに404・ページが見つかりません等が含まれる）
  const soft404Patterns = [
    /404\s*(not\s*found|error|エラー)?/i,
    /not\s*found/i,
    /ページが見つかりません/,
    /お探しのページは(見つかりません|ございません|削除された|移動した)/,
    /指定されたページ(またはファイル)?は存在しません/,
    /このページは現在利用できません/,
  ];
  for (const pat of soft404Patterns) {
    if (pat.test(meta.title) || pat.test(meta.h1)) {
      return {
        status: 'NG_SOFT_404',
        reason: `遷移先ページのタイトルまたは見出しがエラー表示（ソフト404）です: "${meta.title || meta.h1}"`,
      };
    }
  }

  // 3. ドメイン失効・パーキング・転売・サーバー未設定ページの検知
  const parkedOrUnrelatedPatterns = [
    { re: /this\s+domain\s+name\s+has\s+expired|parklogic\.com|domain\s*(is\s*)?for\s*sale|buy\s*this\s*domain|hugedomains|sedo\.com|dan\.com|afternic|parkingcrew/i, label: 'ドメイン失効・転売・パーキングサイト' },
    { re: /このドメインは.*お名前\.com|ムームードメイン|スタードメイン|エックスサーバー.*初期ページ|準備中.*ロリポップ/i, label: 'ドメイン未設定・サーバー初期ページ' },
    { re: /カジノ|オンカジ|オンラインカジノ|アダルト|出会い系|消費者金融|カードローン|暗号資産投資/i, label: '無関係なスパム・アフィリエイトサイトへの変化' },
  ];
  for (const p of parkedOrUnrelatedPatterns) {
    if (p.re.test(combinedAll)) {
      return {
        status: 'NG_UNRELATED_SITE',
        reason: `ドメイン失効または別サイト変化の疑い（${p.label}）: "${meta.title || meta.h1}"`,
      };
    }
  }

  // 4. Instagram等のSNSアカウントページの場合
  if (finalUrl.includes('instagram.com')) {
    if (/ページをご利用いただけません|Sorry,\s*this\s*page\s*isn't\s*available/i.test(combinedAll)) {
      return {
        status: 'NG_SOFT_404',
        reason: 'Instagramアカウントまたは投稿が削除・非公開になっています',
      };
    }
    return {
      status: 'OK',
      matchedKeyword: 'Instagram公式アカウント',
    };
  }

  // 5. 塾・教室名キーワードとの照合
  const { tokens } = buildKeywordsForSchool(school.name, school.url);
  const matchedInTitle = tokens.find((t) => normTitleAndHeadings.includes(t));
  const matchedInBody = tokens.find((t) => normBody.includes(t));

  // 学習塾・教育関連の一般語が含まれているか
  const eduKeywords = ['塾', '教室', '個別', '指導', '学習', '進学', '受験', '合格', 'ゼミ', 'スクール', 'school', 'study', 'academy', '高校', '中学', '小学', '教育'];
  const hasEduContext = eduKeywords.some((k) => combinedAll.toLowerCase().includes(k));

  if (matchedInTitle) {
    return {
      status: 'OK',
      matchedKeyword: matchedInTitle,
    };
  }

  if (matchedInBody && hasEduContext) {
    return {
      status: 'OK',
      matchedKeyword: `${matchedInBody} (本文一致)`,
    };
  }

  // タイトルも本文も空（JS SPA や WAF ブロック等）の場合
  if (!meta.title && !meta.h1 && meta.bodyText.length < 30) {
    return {
      status: 'WARN_EMPTY_CONTENT',
      reason: 'ページタイトル・本文テキストが空です（動的描画またはクローラー制限の可能性）',
    };
  }

  if (!hasEduContext) {
    return {
      status: 'NG_UNRELATED_SITE',
      reason: `登録塾名「${school.name}」および学習塾関連の語彙が遷移先ページに見つかりません（別サイト変化の疑い）`,
    };
  }

  return {
    status: 'WARN_NAME_MISMATCH',
    reason: `塾名キーワードが <title>/<h1> に直接含まれていません（遷移先タイトル: "${meta.title || '(なし)'}"）`,
  };
}

/**
 * 並列ワーカープール実行ヘルパー
 */
async function runPool(items, concurrency, workerFn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const current = idx++;
      if (current >= items.length) break;
      results[current] = await workerFn(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * D1から取得した最新データでローカルの cram_schools.csv と db/seed/cram_schools.sql を自動最新化する
 */
function syncLocalCsvWithD1(schools) {
  try {
    const escapeCsvField = (val) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const header = '学区ID,学区名,塾・教室名,公式サイトURL,電話番号,表示順';
    const rows = schools.map((s) =>
      [s.areaId, s.areaName, s.name, s.url, s.tel, s.order].map(escapeCsvField).join(',')
    );
    const newCsv = '\uFEFF' + [header, ...rows].join('\r\n') + '\r\n';
    if (fs.existsSync(CSV_PATH)) {
      const currentCsv = fs.readFileSync(CSV_PATH, 'utf8');
      if (currentCsv.replace(/\r?\n/g, '\n').trim() !== newCsv.replace(/\r?\n/g, '\n').trim()) {
        fs.writeFileSync(CSV_PATH, newCsv, 'utf8');
      }
    }

    // db/seed/cram_schools.sql も同時に最新化
    if (fs.existsSync(SQL_SEED_PATH)) {
      const sqlHeader = [
        '-- ============================================================',
        `-- 実施塾マスターデータ初期投入シード (cram_schools: ${schools.length}件)`,
        '--   実行: npx wrangler d1 execute okamoshi-master --remote --file=db/seed/cram_schools.sql',
        '-- ============================================================',
        'DELETE FROM cram_schools;',
        'INSERT INTO cram_schools (display_order, area_id, area_name, name, website_url, phone_number) VALUES',
      ];
      const escSql = (v) => String(v ?? '').replace(/'/g, "''");
      const valLines = schools.map((s) => {
        const urlVal = s.url ? `'${escSql(s.url)}'` : 'NULL';
        const telVal = s.tel ? `'${escSql(s.tel)}'` : 'NULL';
        return `(${s.order}, '${escSql(s.areaId)}', '${escSql(s.areaName)}', '${escSql(s.name)}', ${urlVal}, ${telVal})`;
      });
      const newSql = [...sqlHeader, valLines.join(',\n') + ';'].join('\n') + '\n';
      const currentSql = fs.readFileSync(SQL_SEED_PATH, 'utf8');
      if (currentSql.replace(/\r?\n/g, '\n').trim() !== newSql.replace(/\r?\n/g, '\n').trim()) {
        fs.writeFileSync(SQL_SEED_PATH, newSql, 'utf8');
      }
    }
  } catch {
    /* ignore write error */
  }
}

async function main() {
  const startedAt = Date.now();
  const schools = await loadCramSchools();
  const withUrl = schools.filter((s) => s.url && s.url.length > 0);
  const withoutUrl = schools.filter((s) => !s.url || s.url.length === 0);

  // ユニークURL一覧を作成して並列フェッチ（同一URLへの重複アクセスを防止して高速化）
  const uniqueUrls = [...new Set(withUrl.map((s) => s.url))];
  const httpOnlyUrls = uniqueUrls.filter((u) => u.startsWith('http://'));

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║ 🔍 実施塾一覧（取扱塾・教室マスタ）公式サイトURL 全件チェック   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  データソース: ${schools[0]?.source || 'cram_schools.csv'}`);
  console.log(`  全登録教室数: ${schools.length} 校（URL登録あり: ${withUrl.length} 校 / URL未登録: ${withoutUrl.length} 校）`);
  console.log(`  ユニークURL : ${uniqueUrls.length} 件（うち http:// 登録: ${httpOnlyUrls.length} 件）\n`);

  const urlFetchCache = new Map();
  await runPool(uniqueUrls, CONCURRENCY, async (url) => {
    let res = await fetchUrlDetails(url);
    // 一時的な通信エラー・タイムアウト時は1回だけリトライ
    if (!res.ok && (res.status === 0 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 600));
      res = await fetchUrlDetails(url);
    }
    urlFetchCache.set(url, res);
  });

  // ④ http:// のURLに対して https:// で正常アクセスできるか検証
  const httpsProbeCache = new Map();
  if (httpOnlyUrls.length > 0) {
    await runPool(httpOnlyUrls, CONCURRENCY, async (httpUrl) => {
      const httpsUrl = httpUrl.replace(/^http:\/\//i, 'https://');
      const probe = await fetchUrlDetails(httpsUrl, { inspectTlsFailure: false });
      httpsProbeCache.set(httpUrl, {
        httpsUrl,
        ok: probe.ok && probe.status >= 200 && probe.status < 400,
        status: probe.status,
        finalUrl: probe.finalUrl,
        title: probe.meta.title,
        error: probe.error,
      });
    });
  }

  // 全教室ごとに診断結果を組み立てる
  const checkedResults = [];
  for (const school of withUrl) {
    const fetchRes = urlFetchCache.get(school.url);
    const isHttp = school.url.startsWith('http://');
    const httpsCheck = isHttp ? httpsProbeCache.get(school.url) : null;

    let category = 'OK'; // OK | NG_BROKEN | NG_REDIRECT | NG_UNRELATED | WARN
    const issues = [];

    // ① リンク切れ検知（HTTP 404/500、タイムアウト、DNSエラー等）
    if (!fetchRes.ok) {
      category = 'NG_BROKEN';
      if (fetchRes.status > 0) {
        issues.push(`HTTPエラー (${fetchRes.status})`);
      } else {
        issues.push(`接続エラー (${fetchRes.error})`);
      }
      if (school.url.includes('okayama-moshi.com')) {
        issues.push(`公式サイトURLにおかもし自身のURL（${school.url}）が誤って設定されています`);
      }
    } else {
      // ② 別ページへの強制転送検知
      const redirectCheck = detectForcedRedirectToTop(school.url, fetchRes.finalUrl, fetchRes.redirectChain);
      if (redirectCheck.forced) {
        category = 'NG_REDIRECT';
        issues.push(redirectCheck.reason);
      }

      // ② ソフト404 ＆ ③ ページ内容の照合（違うサイトへの変化検知）
      const contentEval = evaluatePageContent(school, fetchRes);
      if (contentEval.status === 'NG_BROKEN_OR_INVALID_URL') {
        category = 'NG_BROKEN';
        issues.push(contentEval.reason);
      } else if (contentEval.status === 'NG_SOFT_404') {
        category = 'NG_REDIRECT';
        issues.push(contentEval.reason);
      } else if (contentEval.status === 'NG_UNRELATED_SITE') {
        category = 'NG_UNRELATED';
        issues.push(contentEval.reason);
      } else if (contentEval.status.startsWith('WARN_') && category === 'OK') {
        category = 'WARN';
        issues.push(contentEval.reason);
      }
    }

    checkedResults.push({
      ...school,
      category,
      httpStatus: fetchRes.status,
      finalUrl: fetchRes.finalUrl,
      redirectChain: fetchRes.redirectChain,
      title: fetchRes.meta.title || fetchRes.meta.ogTitle || '',
      h1: fetchRes.meta.h1 || '',
      error: fetchRes.error,
      isExpiredDomain: Boolean(fetchRes.isExpiredDomain),
      issues,
      isHttp,
      httpsCheck,
    });
  }

  const okList = checkedResults.filter((r) => r.category === 'OK');
  const warnList = checkedResults.filter((r) => r.category === 'WARN');
  const ngList = checkedResults.filter((r) => r.category.startsWith('NG_'));
  const httpSchools = checkedResults.filter((r) => r.isHttp);
  const httpsUpgradable = httpSchools.filter((r) => r.httpsCheck?.ok);
  const httpsNotSupported = httpSchools.filter((r) => !r.httpsCheck?.ok);

  // レポート表示
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 【診断サマリー】');
  console.log(`  ✅ 正常アクセス確認      : ${okList.length} 校`);
  console.log(`  ⚠️  要目視確認（警告）    : ${warnList.length} 校`);
  console.log(`  ❌ NG（リンク切れ/転送等）: ${ngList.length} 校`);
  console.log(`  🔒 http:// 登録教室      : ${httpSchools.length} 校（うち https:// 化可能: ${httpsUpgradable.length} 校 / https非対応: ${httpsNotSupported.length} 校）`);
  console.log(`  ➖ URL未登録（対象外）   : ${withoutUrl.length} 校`);
  console.log(`  ⏱️  検査所要時間          : ${((Date.now() - startedAt) / 1000).toFixed(1)} 秒`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (ngList.length > 0) {
    console.log('❌ 【要修正：リンク切れ・強制転送・無関係サイト検知一覧】');
    for (const item of ngList) {
      console.log(`  ■ [${item.areaName}] #${item.order} ${item.name}`);
      console.log(`    ・設定URL      : ${item.url}`);
      console.log(`    ・最終到達URL  : ${item.finalUrl} (HTTP ${item.httpStatus || 'ERR'})`);
      console.log(`    ・ページTitle  : ${item.title || (item.isExpiredDomain ? 'This domain name has expired (ParkLogic.com)' : '(取得不可)')}`);
      if (item.h1) console.log(`    ・ページH1     : ${item.h1}`);
      console.log(`    ・検知理由     : ${item.issues.join(' / ')}\n`);
    }
  }

  if (warnList.length > 0) {
    console.log('⚠️  【要確認：リダイレクト・タイトル表記ゆれ等の注意一覧】');
    for (const item of warnList) {
      console.log(`  ▲ [${item.areaName}] #${item.order} ${item.name}`);
      console.log(`    ・設定URL      : ${item.url}`);
      console.log(`    ・最終到達URL  : ${item.finalUrl} (HTTP ${item.httpStatus})`);
      console.log(`    ・ページTitle  : ${item.title || '(なし)'}`);
      console.log(`    ・確認事項     : ${item.issues.join(' / ')}\n`);
    }
  }

  if (httpSchools.length > 0) {
    console.log('🔒 【http:// 登録URLの https:// 対応診断一覧】');
    if (httpsUpgradable.length > 0) {
      console.log('  ▼ すぐに https:// へ変更可能な教室（https:// で正常アクセス確認済み）:');
      for (const item of httpsUpgradable) {
        console.log(`    🟢 [${item.areaName}] #${item.order} ${item.name}`);
        console.log(`       現在: ${item.url}`);
        console.log(`       推奨: ${item.httpsCheck.httpsUrl} (到達URL: ${item.httpsCheck.finalUrl} / Title: "${item.httpsCheck.title}")`);
      }
      console.log('');
    }
    if (httpsNotSupported.length > 0) {
      console.log('  ▼ https:// 非対応（SSL証明書エラーまたは未対応のため変更不可・要注意）:');
      for (const item of httpsNotSupported) {
        console.log(`    🟠 [${item.areaName}] #${item.order} ${item.name}`);
        console.log(`       現在: ${item.url} (http status: ${item.httpStatus || 'ERR'})`);
        console.log(`       https検証結果: ${item.httpsCheck?.error || `HTTP ${item.httpsCheck?.status}`}`);
      }
      console.log('');
    }
  }

  if (saveJson) {
    try {
      fs.mkdirSync(path.join(process.cwd(), 'test-results'), { recursive: true });
      fs.writeFileSync(
        path.join(process.cwd(), 'test-results/juku-url-check.json'),
        JSON.stringify(
          {
            checkedAt: new Date().toISOString(),
            totalSchools: schools.length,
            withUrlCount: withUrl.length,
            withoutUrlCount: withoutUrl.length,
            okCount: okList.length,
            warnCount: warnList.length,
            ngCount: ngList.length,
            httpCount: httpSchools.length,
            httpsUpgradableCount: httpsUpgradable.length,
            ngList,
            warnList,
            httpsUpgradable,
            httpsNotSupported,
            allResults: checkedResults,
          },
          null,
          2
        ),
        'utf8'
      );
    } catch {
      /* noop */
    }
  }

  if (ngList.length > 0 && !reportOnly) {
    console.error(`❌ 塾URLチェック FAIL: ${ngList.length} 件のURLに問題が見つかりました。修正してから再度実行してください。\n`);
    process.exit(1);
  } else {
    console.log('✅ 塾URLチェック完了\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('塾URLチェック実行エラー:', err);
  process.exit(1);
});
