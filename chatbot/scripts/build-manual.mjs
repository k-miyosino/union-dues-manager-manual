// マニュアルの原稿（toc.yml と各章の Markdown）を、チャットボットが読む1つのファイルにまとめるスクリプト
//
// 使い方（chatbot/ で）:
//   npm run build:manual
//
// リポジトリ直下の toc.yml → 各フォルダーの toc.yml の順にたどり、章ごとに
// ID・章名・見出し・本文を src/manual.generated.json に書き出す（このファイルはコミットしない）。
// デプロイ・ローカル実行・型チェック・評価の前に、npm のスクリプトが自動で流す。
// 章を足す・消す・名前を変えるときは、マニュアルの toc.yml を直すだけでよい。

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const chatbotDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manualDir = path.resolve(chatbotDir, '..');
const outFile = path.join(chatbotDir, 'src', 'manual.generated.json');

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

// toc.yml の「- name: ...」と「href: ...」の組を読む（このマニュアルの toc.yml はこの形だけ）
function readToc(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    fail(`toc.yml を読めません: ${path.relative(manualDir, file)}`);
  }
  const entries = [];
  const pattern = /^-\s*name:\s*(.+?)\s*\r?\n\s+href:\s*(.+?)\s*$/gm;
  for (const match of text.matchAll(pattern)) {
    entries.push({ name: match[1], href: match[2] });
  }
  if (entries.length === 0) fail(`toc.yml に章がありません: ${path.relative(manualDir, file)}`);
  return entries;
}

// 本文から、チャットボットが読めないもの（画像）を除く。コードブロックの中は変えない
function cleanContent(markdown) {
  const lines = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && /^\s*(>\s*)?!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) continue;
    lines.push(line.trimEnd());
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// 章の中の見出し（## と ###）。案内文の章の一覧に載せて、どの章を読むかの手がかりにする
function readHeadings(markdown) {
  const headings = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const match = /^#{2,3}\s+(.+?)\s*$/.exec(line);
    if (match) headings.push(match[1]);
  }
  return headings;
}

const chapters = [];
for (const section of readToc(path.join(manualDir, 'toc.yml'))) {
  const dir = section.href.replace(/\/+$/, '');
  for (const entry of readToc(path.join(manualDir, dir, 'toc.yml'))) {
    if (!entry.href.endsWith('.md')) fail(`章のファイルが .md ではありません: ${dir}/${entry.href}`);
    const file = path.join(manualDir, dir, entry.href);
    let markdown;
    try {
      markdown = readFileSync(file, 'utf8');
    } catch {
      fail(`章のファイルを読めません: ${dir}/${entry.href}`);
    }
    const base = entry.href.slice(0, -'.md'.length);
    chapters.push({
      // 道具（get_chapter）で章を選ぶときの ID。フォルダー名とファイル名から作る
      id: `${dir}/${base}`,
      section: section.name,
      title: entry.name,
      // 公開サイトでのパス（DocFX は .md を .html にする）
      path: `${dir}/${base}.html`,
      headings: readHeadings(markdown),
      content: cleanContent(markdown),
    });
  }
}

const ids = new Set();
for (const chapter of chapters) {
  if (ids.has(chapter.id)) fail(`章の ID が重なっています: ${chapter.id}`);
  ids.add(chapter.id);
}

writeFileSync(outFile, `${JSON.stringify({ chapters }, null, 2)}\n`, 'utf8');
const total = chapters.reduce((sum, chapter) => sum + chapter.content.length, 0);
console.log(`✅ マニュアルをまとめました: ${chapters.length} 章、本文 ${total} 文字`);
