#!/usr/bin/env node
/**
 * スマート品質ゲート (scripts/smart-quality-gate.mjs)
 *
 * 【2段階ギア制御（pre-push 連動）】
 * - 【プレビュー超高速モード (PREVIEW MODE)】`main` 以外のブランチ（`feature/idea-b` 等）へのプッシュ時（または `--preview` 指定時）:
 *     Playwright E2Eテストをスキップし、数秒で完了する以下の3検査のみを実行して即座に通過させる:
 *     1. 静的検査（シークレット・禁止カラー・未登録HEX・露出ファイル）
 *     2. AI常駐ルール同期チェック（GEMINI.md → CLAUDE.md / .cursorrules 等）
 *     3. TypeScript 型チェック（Pages Functions）
 *
 * - 【本番厳格・フルモード (FULL MODE)】`main` ブランチへのプッシュ時（または `--full` 指定・共通ファイル変更時）:
 *     上記 1〜3 ＋ 全ページのフルデザイン検査 ＋ @critical-forms を含む Playwright 全テストを厳格実行。
 *     ※ `main` ブランチでは `SKIP_QUALITY_GATE=1` が指定されてもバイパスを絶対禁止。
 *
 * - 【高速モード (FAST MODE)】ローカル開発で特定ページの軽微な文言・記事修正のみの場合:
 *     上記 1〜3 ＋ Playwright「修正した該当ページ検査 ＋ @critical-forms」を実行。
 *
 * 使い方:
 *   node scripts/smart-quality-gate.mjs                        # git diff から自動判定
 *   node scripts/smart-quality-gate.mjs --full                 # フルモード強制実行（本番 main 相当）
 *   node scripts/smart-quality-gate.mjs --preview              # 超高速モード（Playwright E2Eスキップ）
 *   node scripts/smart-quality-gate.mjs --files privacy.html   # 指定ファイル変更として判定（検証用）
 */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const forceFull = args.includes('--full') || args.includes('--main');
const forcePreview = args.includes('--preview') || args.includes('--static-only');
const pushBranch = (process.env.QG_PUSH_BRANCH || '').trim();
const isMainPush = pushBranch === 'main' || pushBranch.split(',').map((s) => s.trim()).includes('main');

let currentBranch = '';
try {
  currentBranch = execSync('git symbolic-ref --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  /* noop */
}

// main ブランチ（本番）では SKIP_QUALITY_GATE=1 によるバイパスを絶対禁止
if (process.env.SKIP_QUALITY_GATE === '1') {
  if (forceFull || isMainPush || (!forcePreview && !pushBranch && currentBranch === 'main')) {
    console.warn('\n⚠️  [本番保護] main ブランチ（本番）では SKIP_QUALITY_GATE=1 による品質ゲートのバイパスは禁止されています。');
    console.warn('   全項目（Playwright 実ブラウザテスト含む）を厳格に実行します。');
  }
}

const filesArgIdx = args.indexOf('--files');
const explicitFiles = filesArgIdx !== -1 && args[filesArgIdx + 1]
  ? args[filesArgIdx + 1].split(',').map((s) => s.trim()).filter(Boolean)
  : null;

/**
 * git diff から変更されたファイル一覧を取得
 */
function detectChangedFiles() {
  if (explicitFiles) return explicitFiles;
  const files = new Set();
  if (process.env.QG_PUSH_FILES) {
    process.env.QG_PUSH_FILES.split('\n').map((s) => s.trim()).filter(Boolean).forEach((f) => files.add(f));
  }
  const runGit = (cmd) => {
    try {
      const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      out.split('\n').map((s) => s.trim()).filter(Boolean).forEach((f) => files.add(f));
    } catch {
      /* noop */
    }
  };

  // 1. ワーキングツリー（未ステージ）＆ステージング済み差分
  runGit('git diff --name-only HEAD');
  runGit('git diff --cached --name-only');
  // 2. 追跡外の新規ファイル
  runGit('git ls-files --others --exclude-standard');

  // 3. ワーキングツリーがクリーン（コミット済みで pre-push から呼ばれた場合等）は
  //    リモート追跡ブランチまたは origin/main・直前コミットとの差分を検査
  if (files.size === 0) {
    runGit('git diff --name-only @{u}...HEAD');
  }
  if (files.size === 0) {
    runGit('git diff --name-only origin/main...HEAD');
  }
  if (files.size === 0) {
    runGit('git diff --name-only HEAD~1...HEAD');
  }

  return [...files];
}

/**
 * 変更ファイル一覧・ブランチ情報から実行モード（PREVIEW / FULL / FAST）と対象ページパスを判定
 */
function resolveGatePlan(changedFiles) {
  if (forceFull || isMainPush) {
    return {
      mode: 'FULL',
      reason: isMainPush ? 'main（本番）ブランチへのプッシュ — 全テスト厳格実行' : '--full オプション指定',
      targetPaths: null,
    };
  }
  if (forcePreview || (pushBranch && !isMainPush)) {
    return {
      mode: 'PREVIEW',
      reason: `プレビューブランチ (${pushBranch || currentBranch || 'non-main'}) — 超高速モード（Playwright E2Eスキップ）`,
      targetPaths: [],
    };
  }
  if (changedFiles.length === 0) {
    return { mode: 'FULL', reason: '変更ファイル指定なし（全体検査）', targetPaths: null };
  }

  // 1行でも変更されたらフルモードを強制するクリティカル領域パターン
  const FULL_TRIGGER_PATTERNS = [
    { re: /^css\//, label: '共通CSS (css/)' },
    { re: /^js\//, label: '共通JS (js/)' },
    { re: /^functions\//, label: 'Cloudflare Pages Functions (functions/)' },
    { re: /^apply(\/|$)/, label: 'お申し込みフォーム関連 (apply/)' },
    { re: /^contact(\/|$)/, label: 'お問い合わせフォーム関連 (contact/)' },
    { re: /^tests\//, label: 'テストスイート (tests/)' },
    { re: /^scripts\//, label: 'ビルド・品質ゲートスクリプト (scripts/)' },
    { re: /^\.githooks\//, label: 'Gitフック (.githooks/)' },
    { re: /^(playwright\.config\.mjs|package\.json|package-lock\.json|tsconfig\.json|wrangler\.toml|_redirects)$/, label: 'プロジェクト設定ファイル' },
    { re: /^(GEMINI\.md|CLAUDE\.md|\.cursorrules|\.idx\/|\.antigravity\/|\.agents\/)/, label: 'AI常駐ルールファイル' },
    { re: /^(images|assets)\//, label: '共通画像・アセット' },
  ];

  for (const file of changedFiles) {
    for (const pat of FULL_TRIGGER_PATTERNS) {
      if (pat.re.test(file)) {
        return {
          mode: 'FULL',
          reason: `共通/重要ファイル変更検知: ${file} (${pat.label})`,
          targetPaths: null,
        };
      }
    }
  }

  // 単一/特定ページへのマッピング
  const targetPaths = new Set();
  for (const file of changedFiles) {
    if (file === 'index.html') {
      targetPaths.add('/');
    } else if (file === 'lp/index.html') {
      targetPaths.add('/lp');
    } else if (file === 'news.html' || file === 'news/index.html' || file === 'data/fallback_articles.json') {
      targetPaths.add('/news');
    } else if (file === 'blog.html') {
      targetPaths.add('/blog.html');
    } else if (file === 'schools.html' || file === 'schools/index.html') {
      targetPaths.add('/schools');
    } else if (file === 'tokushoho.html' || file === 'tokushoho/index.html') {
      targetPaths.add('/tokushoho');
    } else if (file === 'privacy.html' || file === 'privacy/index.html') {
      targetPaths.add('/privacy');
    } else if (/^news\/([^/]+)\/index\.html$/.test(file)) {
      const id = file.match(/^news\/([^/]+)\/index\.html$/)[1];
      if (id === 'preview') {
        return { mode: 'FULL', reason: `プレビューテンプレート変更 (${file})`, targetPaths: null };
      }
      targetPaths.add(`/news/${id}/`);
    } else if (/^(sitemap\.xml|robots\.txt|README\.md|docs\/|gas\/)/.test(file)) {
      // ドキュメントやサイトマップのみの変更時はページ個別走査なし＋@critical-forms 100%実行
    } else {
      // 未分類ファイルが含まれる場合は安全のためフルモード
      return {
        mode: 'FULL',
        reason: `未分類ファイルの変更検知 (${file})`,
        targetPaths: null,
      };
    }
  }

  return {
    mode: 'FAST',
    reason: `特定ページ/軽微修正のみ (${changedFiles.join(', ')})`,
    targetPaths: [...targetPaths],
  };
}

const changedFiles = detectChangedFiles();
const plan = resolveGatePlan(changedFiles);

const modeBannerLabel =
  plan.mode === 'PREVIEW'
    ? '超高速モード (Playwright E2Eスキップ / 静的検査・型チェックのみ)'
    : plan.mode === 'FULL'
      ? 'フルモード (全件検査: 静的検査 + Playwright全テスト)'
      : '高速モード (対象ページ + @critical-forms)';

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log(`║ 🛡️  おかもし スマート品質ゲート [${modeBannerLabel}]`);
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log(`  判定理由: ${plan.reason}`);
if (changedFiles.length > 0) {
  console.log(`  変更検知: ${changedFiles.slice(0, 8).join(', ')}${changedFiles.length > 8 ? ` 他${changedFiles.length - 8}件` : ''}`);
}
if (plan.mode === 'FAST') {
  console.log(`  検査対象ページ: ${plan.targetPaths.length > 0 ? plan.targetPaths.join(', ') : '(なし)'}`);
  console.log('  必須フォーム監視: @critical-forms（/contact/ 個人・団体 ＆ /apply/ 会場×カード・自宅×コンビニ）を100%強制実行');
} else if (plan.mode === 'PREVIEW') {
  console.log('  実行内容: 静的検査・AIルール同期・TypeScript型チェックのみ（Playwright E2Eテストは main プッシュ時に厳格実行）');
}

const steps = [
  {
    name: '静的検査（シークレット/露出ファイル/プレースホルダー/カラーパレット）',
    cmd: 'node',
    args: ['scripts/quality-gate/static-checks.mjs'],
    env: process.env,
  },
  {
    name: 'AI常駐ルールファイルの同期（GEMINI.md → CLAUDE.md / .cursorrules 等）',
    cmd: 'node',
    args: ['scripts/sync-ai-rules.mjs', '--check'],
    env: process.env,
  },
  {
    name: 'TypeScript 型チェック（Pages Functions）',
    cmd: 'npx',
    args: ['--no-install', 'tsc', '--noEmit'],
    env: process.env,
  },
];

if (plan.mode !== 'PREVIEW') {
  steps.push({
    name: plan.mode === 'FULL'
      ? 'Playwright 実ブラウザ検査 [FULL: 全ページ + @critical-forms]（PC 1280px / SP 375px）'
      : `Playwright 実ブラウザ検査 [FAST: 対象${plan.targetPaths.length}ページ + @critical-forms]（PC 1280px / SP 375px）`,
    cmd: 'npx',
    args: ['--no-install', 'playwright', 'test', '-c', 'playwright.config.mjs'],
    env: plan.mode === 'FAST'
      ? { ...process.env, QG_TARGET_PATHS: plan.targetPaths.join(',') }
      : process.env,
  });
}

const started = Date.now();
const summary = [];
for (const s of steps) {
  console.log(`\n━━━ ${s.name} ━━━`);
  const t = Date.now();
  const r = spawnSync(s.cmd, s.args, {
    stdio: 'inherit',
    env: s.env,
    shell: process.platform === 'win32',
  });
  summary.push({ name: s.name, ok: r.status === 0, sec: ((Date.now() - t) / 1000).toFixed(1) });
}

// Playwright の警告（既知の課題）を抽出
const warnings = [];
if (plan.mode !== 'PREVIEW') {
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
}

const modeSummaryLabel =
  plan.mode === 'PREVIEW'
    ? 'PREVIEW MODE（超高速モード：静的検査＋AIルール同期＋TS型チェックのみ）'
    : plan.mode === 'FULL'
      ? 'FULL MODE（全ページ＋@critical-forms）'
      : `FAST MODE（対象ページ [${plan.targetPaths.join(', ') || 'なし'}] ＋ @critical-forms）`;

console.log('\n══════════════ 品質ゲート レポート ══════════════');
console.log(`  実行モード: ${modeSummaryLabel}`);
for (const s of summary) console.log(`  ${s.ok ? '✅ PASS' : '❌ FAIL'}  ${s.name}  (${s.sec}s)`);
[...new Set(warnings)].forEach((w) => console.log(`  ⚠️  WARN  ${w}`));
const ok = summary.every((s) => s.ok);
console.log(`\n  結果: ${ok ? '✅ ALL PASS — プッシュ/完了報告可' : '❌ FAILED — 修正するまでプッシュ/完了報告禁止'}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
console.log('══════════════════════════════════════════════════\n');
process.exit(ok ? 0 : 1);
