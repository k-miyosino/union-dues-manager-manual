/**
 * ローカルで試すためのテスト画面（npm run dev で起動したときだけ、http://localhost:8787/ で開ける）
 *
 * アプリのチャット画面の代わりに、ブラウザーから質問を送って、答えと「読んだ章」を確かめる。
 * 本番の Worker では出さない（worker.ts が、DEV_PAGE が '1' で、かつ localhost のときだけ返す）。
 */

/** テスト画面を出してよいリクエストか（ローカルの開発サーバーだけ） */
export function isDevPageRequest(url: URL, devPage: string | undefined): boolean {
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  return devPage === '1' && local;
}

/** テスト画面の HTML。トークンは、画面が API を呼ぶために埋め込む（ローカルの値） */
export function devPageHtml(appToken: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>操作案内チャット（テスト画面）</title>
<style>
  body { font-family: "Yu Gothic UI", "Meiryo", sans-serif; margin: 0; background: #f4f5f7; color: #1f2328; }
  main { max-width: 760px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 18px; margin: 8px 0 4px; }
  .note { font-size: 13px; color: #57606a; margin: 0 0 12px; }
  #log { display: flex; flex-direction: column; gap: 10px; min-height: 200px; }
  .msg { padding: 10px 12px; border-radius: 8px; white-space: pre-wrap; line-height: 1.7; max-width: 90%; }
  .user { background: #dbeafe; align-self: flex-end; }
  .assistant { background: #fff; border: 1px solid #d0d7de; align-self: flex-start; }
  .error { background: #ffe4e6; border: 1px solid #fda4af; align-self: flex-start; }
  .sources { margin: 8px 0 0; padding: 8px 0 0; border-top: 1px solid #d0d7de; font-size: 13px; }
  .sources a { display: block; color: #0969da; }
  form { display: flex; gap: 8px; margin-top: 16px; }
  textarea { flex: 1; font: inherit; padding: 8px; border: 1px solid #8c959f; border-radius: 6px; resize: vertical; }
  button { font: inherit; padding: 8px 16px; border: 1px solid #1f6feb; background: #1f6feb; color: #fff; border-radius: 6px; cursor: pointer; }
  button.sub { background: #fff; color: #1f2328; border-color: #8c959f; }
  button:disabled { opacity: 0.5; cursor: default; }
  #usage { font-size: 13px; color: #57606a; margin-top: 8px; }
</style>
</head>
<body>
<main>
  <h1>操作案内チャット（テスト画面）</h1>
  <p class="note">ローカルで試すための画面です。質問は Anthropic に送られます。個人情報を入力しないでください。</p>
  <div id="log"></div>
  <form id="form">
    <textarea id="input" rows="2" maxlength="1000" placeholder="例: 月次の締め処理はどうやりますか"></textarea>
    <button id="send" type="submit">送信</button>
    <button id="reset" type="button" class="sub">会話を消す</button>
  </form>
  <div id="usage"></div>
</main>
<script>
  const TOKEN = ${JSON.stringify(appToken)};
  const CLIENT_ID = 'dev-page-client-0001';
  const ERRORS = {
    client_limit: 'この PC の今日の利用回数の上限に達しました。',
    total_limit: '今日は全体の利用回数の上限に達しました。',
    chat_failed: '答えを受け取れませんでした。（ターミナルのログの Claude API error を見てください）',
    disabled: 'チャットはオフになっています。',
    invalid_request: '質問の形が正しくありません。',
    unauthorized: 'トークンが違います。',
  };
  const log = document.getElementById('log');
  const input = document.getElementById('input');
  const send = document.getElementById('send');
  const usage = document.getElementById('usage');
  let messages = [];

  function add(kind, text, sources) {
    const div = document.createElement('div');
    div.className = 'msg ' + kind;
    div.textContent = text;
    if (sources && sources.length) {
      const box = document.createElement('div');
      box.className = 'sources';
      box.append('読んだ章:');
      for (const s of sources) {
        const a = document.createElement('a');
        a.href = s.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = s.title;
        box.append(a);
      }
      div.append(box);
    }
    log.append(div);
    div.scrollIntoView({ block: 'end' });
  }

  document.getElementById('reset').addEventListener('click', () => {
    messages = [];
    log.replaceChildren();
    input.focus();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) document.getElementById('form').requestSubmit();
  });

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || send.disabled) return;
    input.value = '';
    send.disabled = true;
    add('user', text);
    const next = [...messages, { role: 'user', content: text }];
    try {
      const started = Date.now();
      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN, 'X-Client-Id': CLIENT_ID },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        add('error', ERRORS[data.error] || 'エラー: ' + (data.error || res.status));
      } else {
        add('assistant', data.reply, data.sources);
        messages = [...next, { role: 'assistant', content: data.reply }];
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        usage.textContent = '今日の回数: ' + data.usage.used + ' / ' + data.usage.limit + '（この答えは ' + seconds + ' 秒）';
      }
    } catch (err) {
      add('error', '送れませんでした: ' + err);
    } finally {
      send.disabled = false;
      input.focus();
    }
  });
  input.focus();
</script>
</body>
</html>`;
}
