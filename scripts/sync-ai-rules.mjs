#!/usr/bin/env node
/**
 * GEMINI.md（正本）から各AIツール用の常駐ルールファイルを生成する。
 *   node scripts/sync-ai-rules.mjs          … 生成
 *   node scripts/sync-ai-rules.mjs --check  … 同期ずれ検査（品質ゲートから呼び出し）
 *
 * 生成先:
 *   .agents/rules/okamoshi-core.md … Antigravity ワークスペースルール（always_on）
 *   .antigravity/rules.md          … 互換用コピー
 *   .idx/airules.md                … Firebase Studio / IDX の AI ルール
 *   .cursorrules                   … Cursor
 */
import fs from 'node:fs';
import path from 'node:path';

const SOURCE = 'GEMINI.md';
const HEADER = '<!-- このファイルは GEMINI.md から自動生成されています。直接編集せず GEMINI.md を編集して `node scripts/sync-ai-rules.mjs` を実行してください。 -->\n\n';
const TARGETS = [
  { file: '.agents/rules/okamoshi-core.md', frontmatter: '---\ntrigger: always_on\ndescription: おかもし公式サイトの2大絶対ルール（デザインシステム厳守・品質ゲート必須）\n---\n\n' },
  { file: '.antigravity/rules.md', frontmatter: '' },
  { file: '.idx/airules.md', frontmatter: '' },
  { file: '.cursorrules', frontmatter: '' },
];

const body = fs.readFileSync(SOURCE, 'utf8');
const expected = (t) => `${t.frontmatter}${HEADER}${body}`;
const check = process.argv.includes('--check');
const drift = [];

for (const t of TARGETS) {
  const want = expected(t);
  if (check) {
    const have = fs.existsSync(t.file) ? fs.readFileSync(t.file, 'utf8') : null;
    if (have !== want) drift.push(t.file);
  } else {
    fs.mkdirSync(path.dirname(t.file), { recursive: true });
    fs.writeFileSync(t.file, want);
    console.log(`generated: ${t.file}`);
  }
}

if (check) {
  if (drift.length) {
    console.log(`  ✗ FAIL  ai-rules/sync (${drift.length})`);
    drift.forEach((f) => console.log(`        - ${f}: GEMINI.md と同期されていません（node scripts/sync-ai-rules.mjs を実行）`));
    process.exit(1);
  }
  console.log('  ✓ PASS  ai-rules/sync');
}
