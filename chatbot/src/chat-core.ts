/**
 * チャットボットの Claude とのやりとり（Worker と評価スクリプトの両方から使う）
 *
 * - 案内文（guide.ts）と道具 get_chapter を渡して質問する
 * - Claude が道具を使いたいと言ったら、マニュアルの章の本文（manual.ts）を渡し、答えが出るまで繰り返す
 *
 * miyosino-web の workers/api/_chat-core.ts を元にしている（道具がページから章に変わっただけ）。
 */

import Anthropic from '@anthropic-ai/sdk';
import { CHAT_SYSTEM_PROMPT } from './guide';
import { CHAPTER_IDS, findChapter } from './manual';

type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type BetaTool = Anthropic.Beta.Messages.BetaTool;
type BetaToolResultBlockParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;

export const DEFAULT_MODEL = 'claude-haiku-5-5';
// 1回の答えの上限。考える分のトークンも含む
const MAX_TOKENS = 8000;
// 道具を使ってよい回数（これを超えたら道具を使わせずに答えを出させる）
const MAX_TOOL_ROUNDS = 3;
// サーバー側の自動フォールバック（fallbacks: "default"）に対応しているモデル
const MODELS_WITH_SERVER_FALLBACK = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

export const REFUSAL_REPLY =
  'すみません、この質問にはお答えできません。マニュアルを確かめるか、システム管理者に聞いてください。';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeReply {
  reply: string;
  outcome: 'answered' | 'refused';
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** 道具で読んだ章の ID（読んだ順。同じ章は1回だけ） */
  chaptersRead: string[];
}

export const CHAPTER_TOOL_NAME = 'get_chapter';

const CHAPTER_TOOL: BetaTool = {
  name: CHAPTER_TOOL_NAME,
  description:
    'マニュアルの章を1つ選び、その本文を取り出す。' +
    'アプリの操作の手順、決まり、困ったときの対処を聞かれたら、答える前にこれで調べる。' +
    'アプリの中のデータ（組合員、口座、請求、入金）は取り出せない。',
  input_schema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        enum: [...CHAPTER_IDS],
        description: '読む章の ID（例: 運用マニュアル/03_monthly_billing）',
      },
    },
    required: ['id'],
    additionalProperties: false,
  },
};

function runTool(
  block: { id: string; name: string; input: unknown },
  chaptersRead: string[]
): BetaToolResultBlockParam {
  const id = (block.input as { id?: unknown } | null)?.id;
  if (block.name !== CHAPTER_TOOL_NAME || typeof id !== 'string') {
    return { type: 'tool_result', tool_use_id: block.id, content: '使えない道具か、章の ID がありません', is_error: true };
  }
  const chapter = findChapter(id);
  if (!chapter) {
    return { type: 'tool_result', tool_use_id: block.id, content: `章が見つかりません: ${id}`, is_error: true };
  }
  if (!chaptersRead.includes(chapter.id)) chaptersRead.push(chapter.id);
  return {
    type: 'tool_result',
    tool_use_id: block.id,
    content: `# ${chapter.section}「${chapter.title}」\n\n${chapter.content}`,
  };
}

/** 会話を送り、必要ならマニュアルの章を調べて、答えを返す */
export async function runChat(options: {
  apiKey: string;
  model?: string;
  messages: ChatTurn[];
}): Promise<ClaudeReply> {
  const model = options.model || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey: options.apiKey, maxRetries: 1 });
  const useFallback = MODELS_WITH_SERVER_FALLBACK.has(model);
  const conversation: BetaMessageParam[] = options.messages.map((m) => ({ role: m.role, content: m.content }));
  const chaptersRead: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let round = 0; ; round++) {
    const toolsAllowed = round < MAX_TOOL_ROUNDS;
    const response = await client.beta.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      // 操作の案内は難しくないので、考える量を抑えて速さと費用を優先する
      output_config: { effort: 'low' },
      // 安全上の理由で断られたとき、サーバー側で別のモデルに答えさせる（対応しているモデルだけ）
      ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      tools: [CHAPTER_TOOL],
      tool_choice: toolsAllowed ? { type: 'auto' } : { type: 'none' },
      system: [{ type: 'text', text: CHAT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: conversation,
    });
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
    const usage = { model, inputTokens, outputTokens, chaptersRead };

    if (response.stop_reason === 'refusal') {
      return { reply: REFUSAL_REPLY, outcome: 'refused', ...usage };
    }
    if (response.stop_reason === 'tool_use' && toolsAllowed) {
      // 答えの途中の内容（考えた跡を含む）はそのまま返し、道具の結果を足して続ける
      conversation.push({ role: 'assistant', content: response.content });
      const results = response.content.flatMap((b) => (b.type === 'tool_use' ? [runTool(b, chaptersRead)] : []));
      conversation.push({ role: 'user', content: results });
      continue;
    }

    const reply = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim();
    if (!reply) {
      throw new Error(`Empty reply (stop_reason: ${response.stop_reason})`);
    }
    return { reply, outcome: 'answered', ...usage };
  }
}
