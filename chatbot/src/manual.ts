/**
 * チャットボットが読むマニュアル
 *
 * 中身は scripts/build-manual.mjs が、マニュアルの toc.yml と各章の Markdown から
 * manual.generated.json にまとめる（デプロイのたびに作り直すので、マニュアルを直して main に入れれば、答えも変わる）。
 * 画像（画面の写真）は入っていない。
 */

import manual from './manual.generated.json';

export interface Chapter {
  /** 道具（get_chapter）で章を選ぶときの ID（例: 運用マニュアル/03_monthly_billing） */
  id: string;
  /** マニュアルの種類（例: 運用マニュアル） */
  section: string;
  /** 章名（例: 第3章 月次締め処理） */
  title: string;
  /** 公開サイトでのパス（例: 運用マニュアル/03_monthly_billing.html） */
  path: string;
  /** 章の中の見出し */
  headings: string[];
  /** 本文（Markdown） */
  content: string;
}

export const CHAPTERS: Chapter[] = manual.chapters;

export const CHAPTER_IDS: string[] = CHAPTERS.map((chapter) => chapter.id);

export function findChapter(id: string): Chapter | undefined {
  return CHAPTERS.find((chapter) => chapter.id === id);
}

/** 公開サイトでの章の URL（日本語のフォルダー名をエンコードする） */
export function chapterUrl(chapter: Chapter, manualUrl: string): string {
  return `${manualUrl.replace(/\/+$/, '')}/${encodeURI(chapter.path)}`;
}
