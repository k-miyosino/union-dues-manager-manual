/**
 * リクエストの確かめ（Worker から使う。ほかのファイルに依存しないので、Node のテストからそのまま読める）
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// 送ってよい会話の長さ（費用と悪用を抑える）
export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_ASSISTANT_LENGTH = 4000;

/** リクエストの会話を確かめる。不正なら null */
export function parseMessages(body: unknown): ChatMessage[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return null;
  }

  const parsed: ChatMessage[] = [];
  for (const message of messages) {
    if (typeof message !== 'object' || message === null) return null;
    const { role, content } = message as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') return null;
    if (typeof content !== 'string') return null;
    const trimmed = content.trim();
    if (trimmed.length === 0) return null;
    if (role === 'user') {
      if (trimmed.length > MAX_MESSAGE_LENGTH) return null;
      parsed.push({ role, content: trimmed });
    } else {
      // 以前の答えは長いことがあるので、拒否せずに切り詰める
      parsed.push({ role, content: trimmed.slice(0, MAX_ASSISTANT_LENGTH) });
    }
  }

  // 最初と最後は利用者の質問でなければならない
  if (parsed[0].role !== 'user' || parsed[parsed.length - 1].role !== 'user') {
    return null;
  }
  return parsed;
}

/**
 * PC ごとの番号（アプリが最初に作るランダムな文字列）。回数を PC ごとに数えるためだけに使う。
 * だれの PC かはわからない。形が合わなければ null
 */
export function parseClientId(value: string | null): string | null {
  if (value === null) return null;
  return /^[A-Za-z0-9-]{16,64}$/.test(value) ? value : null;
}

/** Authorization ヘッダーから Bearer トークンを取り出す。なければ null */
export function parseBearerToken(header: string | null): string | null {
  if (header === null || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

/** 2つの文字列が同じかを、かかる時間から中身を推測されにくい方法で比べる */
export function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  // 長さが違っても最後まで比べる（長い方に合わせる）
  const length = Math.max(bytesA.length, bytesB.length);
  let diff = bytesA.length ^ bytesB.length;
  for (let i = 0; i < length; i++) {
    diff |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }
  return diff === 0;
}

/** 0 以上の整数として読めなければ既定値にする */
export function parseLimit(value: string | undefined, fallback: number): number {
  if (value === undefined || !/^\d+$/.test(value.trim())) return fallback;
  return Number.parseInt(value, 10);
}

/** 日本時間の日付（YYYY-MM-DD） */
export function todayJst(now: number = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
