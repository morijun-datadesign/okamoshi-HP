// QG_BASE_URL 未指定時はローカル静的サーバー（Cloudflare Pages の _redirects / クリーンURL を簡易再現）を起動
import { startServer } from '../../scripts/quality-gate/server.mjs';

export default async function globalSetup() {
  if (process.env.QG_BASE_URL) return undefined;
  const server = await startServer(process.cwd(), 4173);
  return async () => new Promise((resolve) => server.close(resolve));
}
