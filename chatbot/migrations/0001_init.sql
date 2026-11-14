-- 操作案内チャットボットの利用回数と設定
-- 適用: chatbot/ で npx wrangler d1 migrations apply union-dues-manual-chat --remote
-- 質問と答えは保存しない。

-- PC ごとの回数（日本時間の日付ごと）。client_id はアプリが作るランダムな番号で、だれの PC かはわからない
CREATE TABLE IF NOT EXISTS chat_usage (
  client_id TEXT NOT NULL,
  date_jst TEXT NOT NULL, -- YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, date_jst)
);

-- 全体の合計回数（費用の安全装置）
CREATE TABLE IF NOT EXISTS chat_usage_total (
  date_jst TEXT PRIMARY KEY, -- YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0
);

-- 設定（オン・オフ、回数の上限）
CREATE TABLE IF NOT EXISTS chat_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- すでに値があれば変えない（変更した設定を流し直しで戻さないため）
-- enabled: '1' でオン、それ以外はオフ
INSERT OR IGNORE INTO chat_settings (key, value) VALUES ('enabled', '1');
INSERT OR IGNORE INTO chat_settings (key, value) VALUES ('limit_per_client', '30');
INSERT OR IGNORE INTO chat_settings (key, value) VALUES ('limit_total', '200');
