/**
 * Cloudflare Pages の挙動を最小限エミュレートするローカル静的サーバー（品質ゲート専用）
 *  - クリーンURL: /foo → foo.html / foo/index.html
 *  - _redirects: 301/302 リダイレクト、200 リライト、末尾 * スプラット
 *  - /api/* は Playwright 側でモックするため、ここでは 404 を返す
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.pdf': 'application/pdf',
};

function loadRedirects(root) {
  const file = path.join(root, '_redirects');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const [from, to, status = '302'] = l.split(/\s+/); return { from, to, status: Number(status) }; });
}

function matchRule(rules, pathname) {
  for (const r of rules) {
    if (r.from.endsWith('*')) {
      const prefix = r.from.slice(0, -1);
      if (pathname.startsWith(prefix)) return { ...r, to: r.to.replace(':splat', pathname.slice(prefix.length)) };
    } else if (r.from === pathname) {
      return r;
    }
  }
  return null;
}

function resolveFile(root, pathname) {
  const clean = decodeURIComponent(pathname).replace(/\.\.+/g, '');
  const base = path.join(root, clean);
  const candidates = clean.endsWith('/')
    ? [path.join(base, 'index.html')]
    : [base, `${base}.html`, path.join(base, 'index.html')];
  return candidates.find((c) => c.startsWith(root) && fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}

export function startServer(root, port = 0) {
  const rules = loadRedirects(root);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = url.pathname;

    if (pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end('{"success":false,"error":"not mocked"}');
    }

    const rule = matchRule(rules, pathname);
    if (rule && (rule.status === 301 || rule.status === 302)) {
      res.writeHead(rule.status, { Location: rule.to });
      return res.end();
    }
    if (rule && rule.status === 200) pathname = rule.to;

    // Cloudflare Pages 同様: /foo → foo.html が無く foo/index.html がある場合は /foo/ へ 308 リダイレクト
    if (!pathname.endsWith('/') && !path.extname(pathname)) {
      const asHtml = path.join(root, `${decodeURIComponent(pathname)}.html`);
      const asDir = path.join(root, decodeURIComponent(pathname), 'index.html');
      if (!fs.existsSync(asHtml) && fs.existsSync(asDir)) {
        res.writeHead(308, { Location: `${pathname}/${url.search}` });
        return res.end();
      }
    }

    const file = resolveFile(root, pathname);
    if (!file) {
      const notFound = path.join(root, '404.html');
      res.writeHead(404, { 'Content-Type': MIME['.html'] });
      return res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not Found');
    }
    // ブロック対象（_redirects で 404.html へリライト）の場合はステータスも 404 として扱う
    const status = rule && rule.status === 200 && rule.to.includes('404') ? 404 : 200;
    res.writeHead(status, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

// 単体起動: node scripts/quality-gate/server.mjs [port]
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] || 4173);
  startServer(process.cwd(), port).then(() => console.log(`QG static server: http://127.0.0.1:${port}`));
}
