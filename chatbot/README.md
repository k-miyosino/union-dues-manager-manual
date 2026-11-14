# 操作案内チャットボット 運用手順書

管理組合収納管理システム（PC アプリ）の「質問する」から使う、操作案内チャットボットの運用手順です。
このマニュアルに書いてあることを、Claude API（Anthropic）で答えます。

このフォルダー（`chatbot/`）は公開サイトには載りません（`docfx.json` で除外しています）。

## 目次

1. [仕組み](#1-仕組み)
2. [日常の操作（オン・オフ、回数の上限）](#2-日常の操作オンオフ回数の上限)
3. [答えを直す（マニュアル・案内文・モデル）](#3-答えを直すマニュアル案内文モデル)
4. [想定質問で試す](#4-想定質問で試す)
5. [初回セットアップ](#5-初回セットアップ)
6. [ローカルで試す](#6-ローカルで試す)
7. [困ったとき](#7-困ったとき)

---

## 1. 仕組み

| 部品 | 場所 | 役割 |
|---|---|---|
| マニュアルの本文 | このリポジトリの `toc.yml` と各章の Markdown | 答えの元。`scripts/build-manual.mjs` が1つのファイルにまとめ、Worker に同梱する |
| チャット Worker（`union-dues-manual-chat`） | `src/worker.ts` | アプリ用トークンを確かめ、回数を数え、Claude API に質問を送って答えを返す |
| Claude とのやりとり | `src/chat-core.ts` | 案内文と道具（`get_chapter`）を渡して質問し、Claude が選んだ章の本文を渡して、答えが出るまで繰り返す（道具は3回まで） |
| 案内文 | `src/guide.ts` | 答え方の決まり。章の一覧は、マニュアルの `toc.yml` と見出しから自動で作る |
| D1（`union-dues-manual-chat`） | Cloudflare | 日ごとの利用回数と、設定（オン・オフ、回数の上限）を置く |
| Claude API | Anthropic | 答えを作る。モデルは `claude-haiku-5-5` |

- **答える範囲**: このマニュアル（共通・運用マニュアル・システム管理マニュアル）の本文だけです。画面の写真は読めません
- **アプリのデータは見えません**: 組合員、口座、請求、入金などのデータは、Worker にも Anthropic にも送りません。送るのは利用者が入力した質問の文章だけです
- **使える人**: アプリ用トークン（全 PC 共通）を取り込んだアプリだけです
- **回数の上限**: PC ごとの1日の上限と、全体の1日の上限があります。日本時間の 0 時に戻ります。答えられなかった分は数えません
- **保存するもの**: 回数と設定だけです。質問と答えは保存しません。回数は、アプリが作るランダムな番号ごとに数え、7日で消します（だれの PC かはわかりません）
- **入力した内容の行き先**: 質問は、答えを作るために Anthropic（米国）のサーバーに送られます。アプリの入力欄には「個人情報を入力しないでください」と出します

---

## 2. 日常の操作（オン・オフ、回数の上限）

コマンドはどれも **`chatbot` フォルダーで** 実行します。Windows の PowerShell でも動きます。
事前に `npx wrangler login` で Cloudflare にログインしておいてください。

```bash
cd chatbot
npm run chat:status               # 今の設定を見る
npm run chat:off                  # チャットを止める
npm run chat:on                   # チャットを再開する
npm run chat:limits -- 30 200     # 上限を PC ごとに1日30回、全体で1日200回にする
```

`chat:status` は次のように表示されます。

```
key              │ value
enabled          │ 1      ← 1 ならオン、0 ならオフ
limit_per_client │ 30     ← PC ごとの1日の上限
limit_total      │ 200    ← 全体の1日の上限
```

- 変更はすぐに反映され、デプロイし直しても戻りません
- 上限を 0 にすると、誰も使えなくなります。止めたいときは `chat:off` を使ってください

### 費用（Anthropic）

- Anthropic コンソール（https://console.anthropic.com）の「Usage」で、使った量と金額を見られます
- 残高は「Billing」で見られます。残高がなくなると、アプリには「答えを受け取れませんでした」と出ます
- 費用は全体の1日の上限で抑えています。実際の金額は、使い始めてから「Usage」で確かめてください

---

## 3. 答えを直す（マニュアル・案内文・モデル）

### マニュアルを直す

**答えの中身を直したいときは、マニュアルを直します。** `main` に入れると、公開サイトと Worker が同時に変わります（Worker のデプロイは `.github/workflows/deploy.yml` の `deploy-chatbot` が流します）。

- 章を足す・消す・名前を変えるときは、`toc.yml` を直すだけです。案内文の章の一覧と、答えの下に出るリンクも変わります
- チャットボットは画面の写真を読めません。写真でしか伝えていない手順は、文章でも書いてください
- プルリクエストでは `.github/workflows/chatbot-test.yml` が、マニュアルをまとめられることを確かめます

### 案内文（答え方の決まり）

答えの長さ、手順の書き方、答えられないときの決まりは `src/guide.ts` を直します。

- 日付など毎回変わる値は入れません（プロンプトキャッシュが効かなくなります）
- 直したら、[4章](#4-想定質問で試す)の想定質問で確かめます

### モデル

`wrangler.toml` の `[vars]` の `CHAT_MODEL` を変えて、`main` に入れます。費用が大きく変わるので注意してください（100万トークンあたりの入力の単価は、`claude-haiku-5-5` が 0.10 ドル、`claude-sonnet-5-5` が 2 ドル、`claude-opus-5-5` が 4 ドル）。

---

## 4. 想定質問で試す

`eval/questions.md` の想定質問を1問ずつ送り、答えを比べられるように保存します。利用回数には数えません。

```bash
cd chatbot
# .dev.vars に ANTHROPIC_API_KEY=... を書いておく（コミットしない）
npm run chat:eval                                   # 全問を送る（Anthropic の費用がかかる）
npm run chat:eval -- --model claude-sonnet-5-5      # モデルを変えて比べる
npm run chat:eval -- --dry-run                      # API を呼ばずに、読み込んだ質問だけ表示する
```

結果は `eval/results/<日時>.md` に保存されます（コミットされません）。

- 表の「読んだ章」に、道具で読んだ章が出ます。操作の質問で何も読んでいない、関係のない質問で章を読んでいる、といったときは案内文を見直します
- 表の「注意」に、書き方の決まりから外れた答えが出ます（文が多い、手順の前後の文が4つ以上、手順が7つより多い、長い文、記号・絵文字、挨拶・締め）
- 「注意」は目安です。中身が正しいかは、質問の下の「期待:」を見ながら読んで確かめます
- 想定質問は、実際によく来る質問がわかったら入れ替えます

---

## 5. 初回セットアップ

1. **D1 を作る**
   ```bash
   cd chatbot
   npm install
   npx wrangler login
   npx wrangler d1 create union-dues-manual-chat
   ```
   表示された `database_id` を `wrangler.toml` に書いてコミットします（GitHub Actions のデプロイがファイルを読むため）。
2. **テーブルを作る**
   ```bash
   npx wrangler d1 migrations apply union-dues-manual-chat --remote
   ```
   最初はオン、上限は PC ごとに30回・全体で200回です。
3. **Anthropic の API キーを作る**
   - コンソールの「Settings」→「Workspaces」で、このチャットボット用のワークスペースを作ります（ホームページのチャットボットと費用を分けるため）
   - 「API Keys」→「Create Key」で、そのワークスペースを選んでキーを作ります。組織全体のキー（ワークスペースに属さないキー）では動きません
   - 支払いは前払いのクレジットです。自動チャージはオフにし、ワークスペースに月の利用額の上限も設定しておきます
4. **アプリ用トークンを決める**（長いランダムな文字列）
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
   この値は、アプリに取り込むファイルにも書きます。チャットやメール、リポジトリには貼らないでください。
5. **Worker にシークレットを登録する**
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put APP_TOKEN
   ```
   まだ Worker がないときは、wrangler が「先に作るか」を聞いてくるので、作ります。
6. **GitHub に登録する**（このリポジトリの Settings → Secrets and variables → Actions）
   - Secrets: `CLOUDFLARE_API_TOKEN`（Workers と D1 を編集できるトークン）、`CLOUDFLARE_ACCOUNT_ID`
   - Variables: `CHATBOT_DEPLOY` を `true` にする（これがないと、デプロイのジョブは動きません）
7. **デプロイする**: `main` に入れるか、手元で `npm run deploy` を実行します
8. **確かめる**
   ```bash
   curl -H "Authorization: Bearer <アプリ用トークン>" https://union-dues-manual-chat.<アカウントのサブドメイン>.workers.dev/chat/status
   ```
   `{"enabled":true}` が返れば動いています。

### アプリ用トークンを入れ替える

トークンが漏れたかもしれないときは、新しい値を作り、`npx wrangler secret put APP_TOKEN` で登録し直します（すぐに反映されます）。そのあと、各 PC のアプリに新しいトークンを取り込みます。

---

## 6. ローカルで試す

```bash
cd chatbot
# .dev.vars.example を .dev.vars という名前でコピーして、ANTHROPIC_API_KEY と APP_TOKEN を書く
npx wrangler d1 migrations apply union-dues-manual-chat --local   # ローカルの D1 にテーブルを作る（初回だけ）
npm run dev                                                       # http://localhost:8787 で起動
```

ブラウザーで http://localhost:8787/ を開くと、テスト画面が出ます。質問を入力すると、答えと「読んだ章」のリンクが出ます。
テスト画面は、`npm run dev` で起動したローカルの Worker にだけ出ます（本番の Worker には出ません）。

`.dev.vars` は必ず `chatbot` フォルダーの中に置いてください。API キーが入るので、コミットしません。

`curl` で質問を送ることもできます。

```bash
curl -X POST http://localhost:8787/chat \
  -H "Authorization: Bearer <.dev.vars の APP_TOKEN>" \
  -H "X-Client-Id: local-test-client-0001" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"締め処理のやり方を教えてください"}]}'
```

答えは次の形で返ります。

```json
{
  "reply": "…答えの文章…",
  "sources": [{ "title": "運用マニュアル 第3章 月次締め処理", "url": "https://…/03_monthly_billing.html" }],
  "usage": { "used": 1, "limit": 30, "remaining": 29 }
}
```

型チェックとテストは `npm run typecheck` と `npm test` です（Node 24 以上）。

---

## 7. 困ったとき

### まずログを見る

```bash
cd chatbot
npx wrangler tail
```

ログが流れる状態でアプリから質問すると、`[Chat]` で始まる行が出ます。ログに質問の文章は出しません。

### 返ってくるエラー

| 返り値 | 意味と対処 |
|---|---|
| 401 `unauthorized` | アプリ用トークンが違う。アプリに取り込んだ値と、Worker の `APP_TOKEN` を合わせる |
| 400 `invalid_request` | リクエストの形が違う（質問が空・1000字より長い、会話が20件より多い、`X-Client-Id` がない） |
| 429 `client_limit` | その PC の1日の上限。必要なら `npm run chat:limits` で上げる |
| 429 `total_limit` | 全体の1日の上限。必要なら `npm run chat:limits` で上げる |
| 502 `chat_failed` | Claude API から答えを受け取れなかった。ログの `Claude API error: <番号>` を見る。401 はキーの誤り、400 で `credit balance` は残高不足 |
| 503 `disabled` | チャットがオフ（`npm run chat:status`） |
| 500 `server_configuration` | Worker に `ANTHROPIC_API_KEY`・`APP_TOKEN`・D1 のどれかがない |

### コマンドのエラー

| エラー | 対処 |
|---|---|
| `Could not find wrangler.toml` など | `chatbot` フォルダーで実行していない。`cd chatbot` してから実行する |
| `Invalid property: databaseId` | `wrangler.toml` の `database_id` が仮の値のまま。[5章](#5-初回セットアップ)の手順1を済ませる |
| `toc.yml を読めません` `章のファイルを読めません` | `toc.yml` に書いたフォルダーやファイルがない。`toc.yml` とファイル名を合わせる |
