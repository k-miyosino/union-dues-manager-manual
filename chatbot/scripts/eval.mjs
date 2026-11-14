// チャットボットの評価スクリプト
//
// 使い方（chatbot/ で）:
//   npm run chat:eval                                 # eval/questions.md の全問を送る
//   npm run chat:eval -- --model claude-sonnet-5-5    # モデルを変えて試す
//   npm run chat:eval -- --dry-run                    # API を呼ばず、読み込んだ質問と案内文の長さだけ表示する
//
// Worker（src/worker.ts）と同じ部品（src/chat-core.ts）を esbuild でまとめて読み込み、
// 同じ案内文・道具・マニュアルで質問を1問ずつ送る。
// 答えと文字数などを eval/results/<日時>.md に保存する。D1 は使わず、利用回数にも数えない。
// API キーは環境変数 ANTHROPIC_API_KEY か、.dev.vars の ANTHROPIC_API_KEY を使う（表示はしない）。
// Windows でも動くよう Node で書いている。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const chatbotDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { model: undefined, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--model') args.model = argv[++i];
    else fail(`知らない引数です: ${argv[i]}`);
  }
  return args;
}

// Worker と同じ部品を esbuild でまとめて読み込む（esbuild は wrangler に含まれている）
async function loadCore() {
  const esbuild = createRequire(import.meta.url)('esbuild');
  const outfile = path.join(chatbotDir, 'eval', '.cache', 'chat-core.mjs');
  await esbuild.build({
    stdin: {
      contents: [
        "export { runChat, DEFAULT_MODEL } from './src/chat-core.ts';",
        "export { CHAT_SYSTEM_PROMPT } from './src/guide.ts';",
      ].join('\n'),
      resolveDir: chatbotDir,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    outfile,
    logLevel: 'error',
  });
  return import(pathToFileURL(outfile).href);
}

// wrangler.toml の [vars] の値（CHAT_MODEL）
function loadVar(name) {
  const toml = readFileSync(path.join(chatbotDir, 'wrangler.toml'), 'utf8');
  for (const line of toml.split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq === -1 || line.slice(0, eq).trim() !== name) continue;
    return line.slice(eq + 1).trim().replace(/^"|"$/g, '');
  }
  return undefined;
}

function loadApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const devVars = path.join(chatbotDir, '.dev.vars');
  if (existsSync(devVars)) {
    for (const line of readFileSync(devVars, 'utf8').split(/\r?\n/)) {
      const eq = line.indexOf('=');
      if (eq === -1 || line.slice(0, eq).trim() !== 'ANTHROPIC_API_KEY') continue;
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (value) return value;
    }
  }
  fail('API キーがありません。.dev.vars に ANTHROPIC_API_KEY=... を書いてください（コミットしないこと）');
}

// eval/questions.md の「## 分類」と「- 質問」（「期待:」の行は、人が答えを読むときの手がかり）
function loadQuestions() {
  const text = readFileSync(path.join(chatbotDir, 'eval', 'questions.md'), 'utf8');
  const questions = [];
  let category = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      category = line.slice(3).trim();
      continue;
    }
    const question = line.startsWith('- ') ? line.slice(2).trim() : '';
    if (category && question) {
      questions.push({ category, question, expected: '' });
      continue;
    }
    const expected = /^\s+期待:\s*(.+)$/.exec(line);
    if (expected && questions.length > 0) questions[questions.length - 1].expected = expected[1].trim();
  }
  if (questions.length === 0) fail('eval/questions.md に質問がありません');
  return questions;
}

// 答えの形を数える（案内文の「書き方」の決まりに沿っているかの目安）
function measure(answer, question) {
  const lines = answer.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const steps = lines.filter((l) => /^\d+[.．]/.test(l));
  const prose = lines.filter((l) => !/^\d+[.．]/.test(l)).join('');
  const sentences = prose.split(/(?<=[。！？])/).map((s) => s.trim()).filter(Boolean);
  const longest = Math.max(0, ...[...sentences, ...steps].map((s) => s.length));
  const notes = [];
  if (steps.length === 0 && sentences.length > 3) notes.push('文が3つより多い');
  // 手順の前に1文、あとに注意を2文まで
  if (steps.length > 0 && sentences.length > 3) notes.push('手順の前後の文が多い');
  if (steps.length > 7) notes.push('手順が7つより多い');
  if (longest > 60) notes.push('長い文がある');
  if (/[*#—|`]|\p{Extended_Pictographic}/u.test(answer)) notes.push('記号・絵文字');
  if (/ありがとうございます|幸いです|お気軽に/.test(answer)) notes.push('挨拶・締め');
  // 質問に「○○さん」と名前が書かれていたら、答えでくり返していないか
  const name = /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]{2,})さん/u.exec(question);
  if (name && answer.includes(name[1])) notes.push('名前をくり返した');
  return { chars: answer.replace(/\s/g, '').length, sentences: sentences.length, steps: steps.length, longest, notes };
}

function timestamp() {
  const iso = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString(); // 日本時間
  return {
    file: iso.slice(0, 16).replace(/[-:]/g, '').replace('T', '-'),
    label: `${iso.slice(0, 16).replace('T', ' ')}（日本時間）`,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const core = await loadCore();
  const systemPrompt = core.CHAT_SYSTEM_PROMPT;
  const model = args.model ?? loadVar('CHAT_MODEL') ?? core.DEFAULT_MODEL;
  const questions = loadQuestions();

  console.log(`モデル: ${model} / 案内文: ${systemPrompt.length} 文字 / 質問: ${questions.length} 問`);
  if (args.dryRun) {
    for (const [i, q] of questions.entries()) console.log(`${i + 1}. [${q.category}] ${q.question}`);
    return;
  }

  const apiKey = loadApiKey();
  const results = [];
  for (const [i, q] of questions.entries()) {
    process.stdout.write(`(${i + 1}/${questions.length}) ${q.question} ... `);
    try {
      // 1問ずつ順番に送る（同時に送るとレート制限に当たりやすく、進み具合の表示と結果の順もそろわない）
      const r = await core.runChat({ apiKey, model, messages: [{ role: 'user', content: q.question }] });
      const answer = r.outcome === 'refused' ? '（安全上の理由で断られた）' : r.reply;
      const m = measure(answer, q.question);
      results.push({ ...q, ...r, answer, ...m });
      console.log(m.notes.length ? `⚠️  ${m.notes.join('、')}` : 'OK');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ ...q, error: message });
      console.log(`❌ ${message}`);
    }
  }

  const ok = results.filter((r) => !r.error);
  const avg = (key) => (ok.length ? Math.round(ok.reduce((s, r) => s + r[key], 0) / ok.length) : 0);
  const sum = (key) => ok.reduce((s, r) => s + r[key], 0);
  const { file, label } = timestamp();
  const lines = [
    `# チャットボットの評価結果 ${label}`,
    '',
    `- モデル: ${model}`,
    `- 案内文: ${systemPrompt.length} 文字`,
    `- 質問: ${questions.length} 問（失敗 ${results.length - ok.length} 問）`,
    `- 平均: ${avg('chars')} 文字、最長の文 ${avg('longest')} 字`,
    `- トークン: 入力 ${sum('inputTokens')}、出力 ${sum('outputTokens')}`,
    `- 注意の付いた答え: ${ok.filter((r) => r.notes.length).length} 問`,
    '',
    '| # | 分類 | 質問 | 文字数 | 文 | 手順 | 最長の文 | 読んだ章 | 注意 |',
    '|---|---|---|---|---|---|---|---|---|',
    ...results.map((r, i) =>
      r.error
        ? `| ${i + 1} | ${r.category} | ${r.question} | - | - | - | - | - | 失敗 |`
        : `| ${i + 1} | ${r.category} | ${r.question} | ${r.chars} | ${r.sentences} | ${r.steps} | ${r.longest} | ${r.chaptersRead.join(' ') || '-'} | ${r.notes.join('、')} |`
    ),
    '',
    '## 答え',
    '',
    ...results.flatMap((r, i) => [
      `### ${i + 1}. ${r.question}`,
      '',
      `分類: ${r.category}`,
      ...(r.expected ? ['', `期待: ${r.expected}`] : []),
      '',
      r.error ? `失敗: ${r.error}` : r.answer,
      '',
    ]),
  ];

  const outDir = path.join(chatbotDir, 'eval', 'results');
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${file}.md`);
  writeFileSync(outFile, lines.join('\n'), 'utf8');
  console.log(`\n✅ 保存しました: ${path.relative(chatbotDir, outFile)}`);
}

try {
  await main();
} catch (error) {
  fail(String(error));
}
