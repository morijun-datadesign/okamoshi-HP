#!/usr/bin/env node
/**
 * npm run quality-gate
 *   [1] セキュリティ・シークレット検査      (static-checks.mjs)
 *   [2] ゴミ・プレースホルダー・リンク切れ検査 (static-checks.mjs + Playwright)
 *   [3] 実ブラウザ描画・コンソールエラーゼロ検査 PC 1280px / iPhone 375px (Playwright)
 *   [4] SEO・アクセシビリティ・デザイン一貫性検査 (static-checks.mjs + Playwright)
 *   + TypeScript 型チェック（Pages Functions）
 * いずれか1つでも失敗したら exit code 1（git pre-push フックがプッシュをブロック）
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const steps = [
  { name: '静的検査（シークレット/露出ファイル/プレースホルダー/カラーパレット）', cmd: 'node', args: ['scripts/quality-gate/static-checks.mjs'] },
  { name: 'AI常駐ルールファイルの同期（GEMINI.md → .cursorrules 等）', cmd: 'node', args: ['scripts/sync-ai-rules.mjs', '--check'] },
  { name: 'TypeScript 型チェック（Pages Functions）', cmd: 'npx', args: ['--no-install', 'tsc', '--noEmit'] },
  { name: 'Playwright 実ブラウザ検査（PC 1280px / SP 375px）', cmd: 'npx', args: ['--no-install', 'playwright', 'test', '-c', 'playwright.config.mjs'] },
];

const started = Date.now();
const summary = [];
for (const s of steps) {
  console.log(`\n━━━ ${s.name} ━━━`);
  const t = Date.now();
  const r = spawnSync(s.cmd, s.args, { stdio: 'inherit', shell: process.platform === 'win32' });
  summary.push({ name: s.name, ok: r.status === 0, sec: ((Date.now() - t) / 1000).toFixed(1) });
}

// Playwright の警告（既知の課題）を抽出
const warnings = [];
try {
  const json = JSON.parse(fs.readFileSync('test-results/qg-results.json', 'utf8'));
  const walk = (suite) => {
    (suite.specs || []).forEach((sp) => sp.tests.forEach((t) => (t.annotations || []).forEach((a) => {
      if (a.type === 'warning') warnings.push(a.description);
    })));
    (suite.suites || []).forEach(walk);
  };
  json.suites.forEach(walk);
} catch { /* noop */ }

console.log('\n══════════════ 品質ゲート レポート ══════════════');
for (const s of summary) console.log(`  ${s.ok ? '✅ PASS' : '❌ FAIL'}  ${s.name}  (${s.sec}s)`);
[...new Set(warnings)].forEach((w) => console.log(`  ⚠️  WARN  ${w}`));
const ok = summary.every((s) => s.ok);
console.log(`\n  結果: ${ok ? '✅ ALL PASS — プッシュ/完了報告可' : '❌ FAILED — 修正するまでプッシュ/完了報告禁止'}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
console.log('══════════════════════════════════════════════════\n');
process.exit(ok ? 0 : 1);
