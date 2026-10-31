/**
 * 品質ゲート: 静的検査（ブラウザ不要・数秒で完了）
 *  [1] セキュリティ: シークレット混入 / 禁止ファイル / 非公開ファイルの公開露出
 *  [2] ゴミ検査: 未解決プレースホルダー・undefined/null/[object Object]/TODO の表示テキスト露出
 *  [4] デザイン一貫性: 許可外カラー（Tailwind標準 blue-500 等・未登録の任意HEX）の混入
 *
 * 失敗が1件でもあれば exit code 1。
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const results = [];
const fail = (check, file, msg) => results.push({ check, file, msg });

// ---------------------------------------------------------------- 対象ファイル
const allFiles = execSync('git ls-files -co --exclude-standard', { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => fs.existsSync(f));
const BINARY = /\.(png|jpe?g|webp|avif|gif|ico|pdf|woff2?|ttf|otf|zip|gz|mp4|webm|mov)$/i;
const textFiles = allFiles.filter((f) => !BINARY.test(f) && f !== 'package-lock.json' && !f.startsWith('scripts/quality-gate/'));
const read = (f) => fs.readFileSync(f, 'utf8');

// ======================================================= [1] セキュリティ検査
const SECRET_PATTERNS = [
  { name: 'Stripe secret key', re: /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{16,}/ },
  { name: 'Stripe webhook secret', re: /\bwhsec_[0-9a-zA-Z]{16,}/ },
  { name: 'Resend API key', re: /\bre_[0-9a-zA-Z]{8,}_[0-9a-zA-Z_]{8,}/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[0-9A-Za-z]{30,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}/ },
  // microCMS 等の API キー直書き（apiKey: '...', 'X-MICROCMS-API-KEY': '...', API_KEY = "..."）
  // 文字列分割で検出を回避した直書き（例: ["re", "xxxx", "yyyy"].join("_")）
  { name: 'Obfuscated (split) secret', re: /\[\s*["'](?:re|sk|rk|whsec|ghp|xoxb)["']\s*,\s*["'][A-Za-z0-9]{4,}["']/ },
  { name: 'Hardcoded API key literal', re: /(?:api[_-]?key|X-MICROCMS-API-KEY|secret|token)["']?\s*[:=,]\s*["'][A-Za-z0-9_\-]{24,}["']/i },
];
// 公開前提の値（Turnstile サイトキー・GTM/Clarity ID 等）は対象外
const SECRET_ALLOW = [/sitekey/i, /data-sitekey/i, /TURNSTILE_SITE_KEY/i];

for (const f of textFiles) {
  const lines = read(f).split('\n');
  lines.forEach((line, i) => {
    if (SECRET_ALLOW.some((a) => a.test(line))) return;
    for (const p of SECRET_PATTERNS) {
      if (p.re.test(line)) fail('security/secret', `${f}:${i + 1}`, `${p.name} の疑い: ${line.trim().slice(0, 120)}`);
    }
  });
}

// 禁止ファイル（.env / .dev.vars / 鍵ファイル）が Git 管理下・公開ディレクトリにないこと
for (const f of allFiles) {
  const b = path.basename(f);
  if (/^\.env(\..*)?$/.test(b) && !b.endsWith('.example')) fail('security/forbidden-file', f, '.env ファイルが含まれています');
  if (b === '.dev.vars') fail('security/forbidden-file', f, '.dev.vars が含まれています');
  if (/\.(pem|key|p12)$/.test(b) || /^id_(rsa|ed25519)/.test(b)) fail('security/forbidden-file', f, '鍵ファイルが含まれています');
}

// Cloudflare Pages は "." 全体を公開するため、公開不要なファイルは _redirects で 404 遮断されている必要がある
const PUBLIC = [
  /\.html$/, /^css\/style\.min\.css$/, /^js\/.+\.js$/, /^images\//, /^robots\.txt$/, /^sitemap\.xml$/,
  /^og-image\.jpg$/, /^hero-banner\.jpg$/, /^_redirects$/, /^_headers$/, /^favicon\./,
];
const redirectRules = fs.readFileSync('_redirects', 'utf8').split('\n')
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split(/\s+/)).filter(([, to, st]) => to && to.includes('404') && st === '200').map(([from]) => from);
const isBlocked = (f) => redirectRules.some((r) => (r.endsWith('*') ? `/${f}`.startsWith(r.slice(0, -1)) : r === `/${f}`));
for (const f of allFiles) {
  if (PUBLIC.some((re) => re.test(f))) continue;
  if (f.startsWith('functions/')) continue; // Pages Functions はビルド時にWorkerへ変換（下記で別途遮断確認）
  if (!isBlocked(f)) fail('security/exposed-file', f, '公開ディレクトリに露出します。_redirects に 404 遮断ルールを追加してください');
}
if (!isBlocked('functions/api/x.ts')) fail('security/exposed-file', '_redirects', '/functions/* の遮断ルールがありません');

// ======================================================= [2] ゴミ・プレースホルダー検査（静的HTML）
const htmlFiles = allFiles.filter((f) => f.endsWith('.html') && !f.startsWith('tests/'));
const visibleText = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ');
const GARBAGE = [
  { re: /【★画像挿入/, msg: '未置換の画像プレースホルダー「【★画像挿入」' },
  { re: /\[object Object\]/, msg: '[object Object] の露出' },
  { re: /(^|[\s>「（(])(undefined|null|NaN)(?=[\s<」）)]|$)/, msg: 'undefined / null / NaN の露出' },
  { re: /\b(TODO|FIXME|XXX)\b/, msg: 'TODO / FIXME の露出' },
  { re: /YOUR_(API_KEY|SERVICE_DOMAIN)|lorem ipsum/i, msg: 'ダミー文字列の露出' },
];
for (const f of htmlFiles) {
  const raw = read(f);
  if (/【★画像挿入/.test(raw)) fail('garbage/placeholder', f, '未置換の画像プレースホルダー（HTMLソース内）');
  const text = visibleText(raw);
  for (const g of GARBAGE) {
    const m = text.match(g.re);
    if (m) fail('garbage/visible-text', f, `${g.msg}: "…${text.slice(Math.max(0, m.index - 20), m.index + 30).replace(/\s+/g, ' ').trim()}…"`);
  }
}

// ======================================================= [4] デザイン一貫性: カラーパレット
// 許可外の Tailwind 標準カラー系統（AIが勝手に持ち込みがちな色）
const FORBIDDEN_FAMILIES = ['blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'cyan', 'lime', 'yellow', 'stone', 'neutral', 'green'];
const COLOR_PREFIX = '(?:bg|text|border|ring|from|via|to|fill|stroke|outline|divide|shadow|accent|caret|decoration|placeholder)';
const familyRe = new RegExp(`(?<![\\w-])(?:[a-z0-9]+:)*${COLOR_PREFIX}-(${FORBIDDEN_FAMILIES.join('|')})-(?:50|[1-9]00|950)\\b`, 'g');
// 既存デザインで使用中の任意HEXのみ許可（新しいHEXを足す場合は GEMINI.md のパレットへの追記とユーザー承認が必須）
const ALLOWED_HEX = new Set([
  '#f1f5f9', '#134230', '#e8f5ee', '#fef3c7', '#fde68a', '#92400e', '#1e3a2f', '#8b3a18', '#c85a32', '#a1d1b8',
  '#fbf2e7', '#ebf6f0', '#ead6c0', '#c7e6d7', '#9e3a14', '#7a5b18', '#5c3d1e', '#475569', '#1f6b51', '#ecfdf5',
  '#c84b31', '#a7f3d0', '#374151', '#111827', '#065f46', '#ffdbcf', '#dcfce7', '#c3e6d2', '#86efac', '#166534',
  '#0c2b20', '#06c755', '#05b34c', '#ebf4f0', '#0a261b', '#2d5a46', '#4a4031', '#0f5b47',
]);
const hexRe = new RegExp(`${COLOR_PREFIX}-\\[(#[0-9a-fA-F]{3,8})\\]`, 'g');
const designFiles = allFiles.filter((f) => (f.endsWith('.html') || /^js\/.+\.js$/.test(f) || f === 'scripts/build_ssg.py' || f === 'scripts/generate_preview_page.py') && !f.startsWith('tests/'));
for (const f of designFiles) {
  const src = read(f);
  for (const m of src.matchAll(familyRe)) fail('design/forbidden-color', f, `許可外カラー "${m[0]}"（パレットは GEMINI.md 参照）`);
  for (const m of src.matchAll(hexRe)) {
    if (!ALLOWED_HEX.has(m[1].toLowerCase())) fail('design/unregistered-hex', f, `未登録の任意カラー "${m[0]}"`);
  }
}

// ---------------------------------------------------------------- レポート
const byCheck = {};
for (const r of results) (byCheck[r.check] ||= []).push(r);
const CHECKS = ['security/secret', 'security/forbidden-file', 'security/exposed-file', 'garbage/placeholder', 'garbage/visible-text', 'design/forbidden-color', 'design/unregistered-hex'];
console.log(`\n[静的検査] 対象ファイル ${allFiles.length} 件（テキスト ${textFiles.length} / HTML ${htmlFiles.length}）`);
for (const c of CHECKS) {
  const list = byCheck[c] || [];
  console.log(`  ${list.length ? '✗ FAIL' : '✓ PASS'}  ${c}${list.length ? ` (${list.length})` : ''}`);
  list.slice(0, 15).forEach((r) => console.log(`        - ${r.file}: ${r.msg}`));
  if (list.length > 15) console.log(`        … 他 ${list.length - 15} 件`);
}
process.exit(results.length ? 1 : 0);
