/**
 * Cloudflare Workers - 管理組合収納管理システムの操作案内チャットボット API
 *
 * アプリ（PC）のチャット欄から質問を受け取り、マニュアルの内容をもとに Claude API で答えを返す。
 *
 * エンドポイント:
 * - GET /chat/status - チャットがオンかを返す（アプリはオフなら入力欄を出さない）
 * - POST /chat - 会話の履歴を受け取り、答えと、読んだ章へのリンクを返す
 * - 定期実行（wrangler.toml の [triggers]）: 古い回数の記録を消す
 *
 * 利用者の確認:
 * - Authorization: Bearer <アプリ用トークン>（シークレット APP_TOKEN と同じ値。全 PC 共通）
 * - X-Client-Id: PC ごとのランダムな番号（回数を PC ごとに数えるためだけに使う。だれの PC かはわからない）
 *
 * 設定: D1 の chat_settings に置く（デプロイなしで変えられ、デプロイし直しても戻らない）
 * - enabled: '1' でオン。npm run chat:on / chat:off で切り替える
 * - limit_per_client / limit_total: PC ごとの1日の上限と、全体の1日の上限（日本時間で区切る）。npm run chat:limits
 *
 * 質問と答えは保存しない（D1 に置くのは回数と設定だけ）。
 */

import Anthropic from '@anthropic-ai/sdk';
import { ClaudeReply, runChat } from './chat-core';
import { devPageHtml, isDevPageRequest } from './dev-page';
import { chapterUrl, findChapter } from './manual';
import { parseBearerToken, parseClientId, parseLimit, parseMessages, safeEqual, todayJst } from './request';

interface Env {
  ANTHROPIC_API_KEY: string;
  APP_TOKEN: string;
  DB: D1Database;
  CHAT_MODEL?: string;
  // マニュアルの公開サイト（答えの下に出すリンクの元）
  MANUAL_URL?: string;
  // '1' のとき、ローカルの開発サーバーでテスト画面を出す（npm run dev が渡す。本番には設定しない）
  DEV_PAGE?: string;
}

interface ChatSettings {
  enabled: boolean;
  limits: { perClient: number; total: number };
}

interface ChatUsage {
  used: number;
  limit: number;
  remaining: number;
}

// D1 に上限の設定がないとき・読めないときの値
const DEFAULT_LIMIT_PER_CLIENT = 30;
const DEFAULT_LIMIT_TOTAL = 200;
// 回数の記録を残す日数
const USAGE_RETENTION_DAYS = 7;
const DEFAULT_MANUAL_URL = 'https://k-miyosino.github.io/union-dues-manager-manual';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * 回数を1つ増やす。上限に達していれば増やさずに false を返す。
 * 上限の確認と加算を1つのSQLで行うので、同時に送られても上限を超えない。
 */
async function reserveClientCount(db: D1Database, clientId: string, date: string, limit: number): Promise<boolean> {
  if (limit <= 0) return false;
  const row = await db
    .prepare(
      `INSERT INTO chat_usage (client_id, date_jst, count) VALUES (?1, ?2, 1)
       ON CONFLICT (client_id, date_jst) DO UPDATE SET count = count + 1 WHERE count < ?3
       RETURNING count`
    )
    .bind(clientId, date, limit)
    .first<{ count: number }>();
  return row !== null;
}

async function reserveTotalCount(db: D1Database, date: string, limit: number): Promise<boolean> {
  if (limit <= 0) return false;
  const row = await db
    .prepare(
      `INSERT INTO chat_usage_total (date_jst, count) VALUES (?1, 1)
       ON CONFLICT (date_jst) DO UPDATE SET count = count + 1 WHERE count < ?2
       RETURNING count`
    )
    .bind(date, limit)
    .first<{ count: number }>();
  return row !== null;
}

// 答えられなかったときに回数を戻す
async function releaseClientCount(db: D1Database, clientId: string, date: string): Promise<void> {
  await db
    .prepare('UPDATE chat_usage SET count = count - 1 WHERE client_id = ?1 AND date_jst = ?2 AND count > 0')
    .bind(clientId, date)
    .run();
}

async function releaseTotalCount(db: D1Database, date: string): Promise<void> {
  await db
    .prepare('UPDATE chat_usage_total SET count = count - 1 WHERE date_jst = ?1 AND count > 0')
    .bind(date)
    .run();
}

// 設定をまとめて読む。enabled の行がなければオンとみなす
async function getChatSettings(db: D1Database): Promise<ChatSettings> {
  const { results } = await db.prepare('SELECT key, value FROM chat_settings').all<{ key: string; value: string }>();
  const values = new Map(results.map((row) => [row.key, row.value]));
  const enabled = values.get('enabled');
  return {
    enabled: enabled === undefined || enabled === '1',
    limits: {
      perClient: parseLimit(values.get('limit_per_client'), DEFAULT_LIMIT_PER_CLIENT),
      total: parseLimit(values.get('limit_total'), DEFAULT_LIMIT_TOTAL),
    },
  };
}

async function getClientUsage(db: D1Database, clientId: string, date: string, limit: number): Promise<ChatUsage> {
  const row = await db
    .prepare('SELECT count FROM chat_usage WHERE client_id = ?1 AND date_jst = ?2')
    .bind(clientId, date)
    .first<{ count: number }>();
  const used = row?.count ?? 0;
  return { used, limit, remaining: Math.max(limit - used, 0) };
}

// 読んだ章を、答えの下に出すリンクにする
function toSources(result: ClaudeReply, manualUrl: string): { title: string; url: string }[] {
  return result.chaptersRead.flatMap((id) => {
    const chapter = findChapter(id);
    return chapter ? [{ title: `${chapter.section} ${chapter.title}`, url: chapterUrl(chapter, manualUrl) }] : [];
  });
}

async function handleChat(request: Request, env: Env, clientId: string, settings: ChatSettings): Promise<Response> {
  const { limits } = settings;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_request' }, 400);
  }
  const messages = parseMessages(body);
  if (!messages) {
    return jsonResponse({ error: 'invalid_request' }, 400);
  }

  const date = todayJst();
  if (!(await reserveClientCount(env.DB, clientId, date, limits.perClient))) {
    const usage = await getClientUsage(env.DB, clientId, date, limits.perClient);
    return jsonResponse({ error: 'client_limit', usage }, 429);
  }
  if (!(await reserveTotalCount(env.DB, date, limits.total))) {
    await releaseClientCount(env.DB, clientId, date);
    const usage = await getClientUsage(env.DB, clientId, date, limits.perClient);
    return jsonResponse({ error: 'total_limit', usage }, 429);
  }

  let result: ClaudeReply;
  try {
    result = await runChat({ apiKey: env.ANTHROPIC_API_KEY, model: env.CHAT_MODEL, messages });
  } catch (error) {
    // 答えられなかった分は数えない
    await releaseClientCount(env.DB, clientId, date);
    await releaseTotalCount(env.DB, date);
    // ログには質問の文章を出さない（名前などが書かれていることがある）
    if (error instanceof Anthropic.APIError) {
      console.error('[Chat] Claude API error:', error.status, error.message);
    } else {
      console.error('[Chat] Failed to get reply:', error);
    }
    return jsonResponse({ error: 'chat_failed' }, 502);
  }

  const usage = await getClientUsage(env.DB, clientId, date, limits.perClient);
  const sources = toSources(result, env.MANUAL_URL || DEFAULT_MANUAL_URL);
  return jsonResponse({ reply: result.reply, sources, usage }, 200);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');

    if (!env.ANTHROPIC_API_KEY || !env.APP_TOKEN || !env.DB) {
      console.error('[Chat] Required environment variables are not set');
      return jsonResponse({ error: 'server_configuration' }, 500);
    }

    // ローカルの開発サーバーだけ: ブラウザーで試すためのテスト画面（dev-page.ts）
    if (path === '' && request.method === 'GET' && isDevPageRequest(url, env.DEV_PAGE)) {
      return new Response(devPageHtml(env.APP_TOKEN), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    // アプリ用トークンを確かめる
    const token = parseBearerToken(request.headers.get('Authorization'));
    if (token === null || !safeEqual(token, env.APP_TOKEN)) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    try {
      const settings = await getChatSettings(env.DB);
      if (path === '/chat/status' && request.method === 'GET') {
        return jsonResponse({ enabled: settings.enabled }, 200);
      }
      if (!settings.enabled) {
        return jsonResponse({ error: 'disabled' }, 503);
      }
      if (path === '/chat' && request.method === 'POST') {
        const clientId = parseClientId(request.headers.get('X-Client-Id'));
        if (clientId === null) {
          return jsonResponse({ error: 'invalid_request' }, 400);
        }
        return await handleChat(request, env, clientId, settings);
      }
      return jsonResponse({ error: 'not_found' }, 404);
    } catch (error) {
      console.error('[Chat] Error:', error);
      return jsonResponse({ error: 'internal_error' }, 500);
    }
  },

  // 定期実行: 古い回数の記録を消す（wrangler.toml の [triggers]）
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    if (!env.DB) return;
    const cutoff = todayJst(Date.now() - USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM chat_usage WHERE date_jst < ?1').bind(cutoff),
      env.DB.prepare('DELETE FROM chat_usage_total WHERE date_jst < ?1').bind(cutoff),
    ]);
    console.log(`[Chat] Cleaned up usage older than ${cutoff}`);
  },
};
