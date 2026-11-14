// リクエストの確かめ（src/request.ts）のテスト
// 実行: chatbot/ で npm test（Node が TypeScript をそのまま読む。Node 24 以上）

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_ASSISTANT_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGES,
  parseBearerToken,
  parseClientId,
  parseLimit,
  parseMessages,
  safeEqual,
  todayJst,
} from '../src/request.ts';

test('parseMessages: 質問1つの会話を受け取り、前後の空白を除く', () => {
  assert.deepEqual(parseMessages({ messages: [{ role: 'user', content: '  締め処理のやり方は？ ' }] }), [
    { role: 'user', content: '締め処理のやり方は？' },
  ]);
});

test('parseMessages: 質問・答え・質問の順の会話を受け取る', () => {
  const messages = [
    { role: 'user', content: '質問1' },
    { role: 'assistant', content: '答え1' },
    { role: 'user', content: '質問2' },
  ];
  assert.deepEqual(parseMessages({ messages }), messages);
});

test('parseMessages: 形が違うものは受け取らない', () => {
  assert.equal(parseMessages(null), null);
  assert.equal(parseMessages('text'), null);
  assert.equal(parseMessages({}), null);
  assert.equal(parseMessages({ messages: [] }), null);
  assert.equal(parseMessages({ messages: [null] }), null);
  assert.equal(parseMessages({ messages: [{ role: 'system', content: 'x' }] }), null);
  assert.equal(parseMessages({ messages: [{ role: 'user', content: 1 }] }), null);
  assert.equal(parseMessages({ messages: [{ role: 'user', content: '   ' }] }), null);
});

test('parseMessages: 最初と最後が質問でない会話は受け取らない', () => {
  assert.equal(parseMessages({ messages: [{ role: 'assistant', content: '答え' }] }), null);
  assert.equal(
    parseMessages({
      messages: [
        { role: 'user', content: '質問' },
        { role: 'assistant', content: '答え' },
      ],
    }),
    null
  );
});

test('parseMessages: 長すぎる質問と、多すぎる会話は受け取らない', () => {
  assert.equal(parseMessages({ messages: [{ role: 'user', content: 'あ'.repeat(MAX_MESSAGE_LENGTH + 1) }] }), null);
  assert.notEqual(parseMessages({ messages: [{ role: 'user', content: 'あ'.repeat(MAX_MESSAGE_LENGTH) }] }), null);
  const many = Array.from({ length: MAX_MESSAGES + 1 }, () => ({ role: 'user', content: '質問' }));
  assert.equal(parseMessages({ messages: many }), null);
});

test('parseMessages: 長い答えは拒否せずに切り詰める', () => {
  const parsed = parseMessages({
    messages: [
      { role: 'user', content: '質問1' },
      { role: 'assistant', content: 'あ'.repeat(MAX_ASSISTANT_LENGTH + 100) },
      { role: 'user', content: '質問2' },
    ],
  });
  assert.equal(parsed?.[1].content.length, MAX_ASSISTANT_LENGTH);
});

test('parseClientId: 英数字とハイフンの16〜64文字だけを受け取る', () => {
  assert.equal(parseClientId('3f2b8c1e-9a4d-4e7b-8c2f-1a2b3c4d5e6f'), '3f2b8c1e-9a4d-4e7b-8c2f-1a2b3c4d5e6f');
  assert.equal(parseClientId(null), null);
  assert.equal(parseClientId('short'), null);
  assert.equal(parseClientId('a'.repeat(65)), null);
  assert.equal(parseClientId("0123456789abcdef'; DROP TABLE"), null);
});

test('parseBearerToken: Bearer のトークンだけを取り出す', () => {
  assert.equal(parseBearerToken('Bearer abc123'), 'abc123');
  assert.equal(parseBearerToken(null), null);
  assert.equal(parseBearerToken('Basic abc123'), null);
  assert.equal(parseBearerToken('Bearer '), null);
});

test('safeEqual: 同じ文字列だけ true', () => {
  assert.equal(safeEqual('token-123', 'token-123'), true);
  assert.equal(safeEqual('token-123', 'token-124'), false);
  assert.equal(safeEqual('token-123', 'token-1234'), false);
  assert.equal(safeEqual('', 'token'), false);
  assert.equal(safeEqual('合言葉', '合言葉'), true);
});

test('parseLimit: 0 以上の整数として読めなければ既定値', () => {
  assert.equal(parseLimit('30', 5), 30);
  assert.equal(parseLimit('0', 5), 0);
  assert.equal(parseLimit(undefined, 5), 5);
  assert.equal(parseLimit('-1', 5), 5);
  assert.equal(parseLimit('abc', 5), 5);
});

test('todayJst: 日本時間の日付で区切る', () => {
  // UTC 14:59 は日本時間 23:59、UTC 15:00 は日本時間の翌日 0:00
  assert.equal(todayJst(Date.UTC(2026, 10, 14, 14, 59)), '2026-11-14');
  assert.equal(todayJst(Date.UTC(2026, 10, 14, 15, 0)), '2026-11-15');
});
