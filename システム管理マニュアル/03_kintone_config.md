# 第3章 Kintone接続設定

Kintoneとの接続に必要なアプリID・APIトークンの設定手順です。

---

## 3-1. 設定ファイルの場所

| ファイル | 場所 | 内容 |
|---------|------|------|
| `kintone_app_ids.json` | `%LOCALAPPDATA%\AccountReconciler\` | 7つのKintoneアプリのID |
| `kintone_api_tokens.json` | `%LOCALAPPDATA%\AccountReconciler\` | 7つのKintoneアプリのAPIトークン |

ファイルが存在しない場合は、アプリインストールフォルダ内の `Config\` にある雛形が使用されます。

---

## 3-2. KintoneアプリIDの確認と設定

### アプリIDの確認方法

KintoneでアプリIDを確認するには、対象アプリをブラウザで開き、URLを確認します。

```
https://（ドメイン）.cybozu.com/k/（アプリID）/
                                    ↑ここがアプリID
例：https://yourcompany.cybozu.com/k/46/  → アプリID は 46
```

### 設定ファイルの編集

`%LOCALAPPDATA%\AccountReconciler\kintone_app_ids.json` をテキストエディタで開き、各アプリのIDを設定します。

```json
{
  "buildingAppId": 34,
  "buildingTypeAppId": 35,
  "propertyAppId": 40,
  "memberPropertyOwnershipAppId": 44,
  "memberParkingContractAppId": 43,
  "memberAppId": 96,
  "billingAppId": 46
}
```

| キー | 対応するKintoneアプリ |
|------|---------------------|
| `buildingAppId` | M_棟 |
| `buildingTypeAppId` | M_棟タイプ |
| `propertyAppId` | M_物件 |
| `memberPropertyOwnershipAppId` | M_組合員物件所有状況 |
| `memberParkingContractAppId` | M_組合員駐車場契約 |
| `memberAppId` | M_組合員 |
| `billingAppId` | M_請求レコード |

---

## 3-3. APIトークンの発行と設定

### APIトークンの発行手順（Kintone側）

各アプリに対して個別にトークンを発行します。以下の手順を7アプリ分繰り返します。

1. Kintoneで対象アプリを開きます
2. 右上の **「アプリの設定」** （歯車アイコン）をクリックします
3. **「APIトークン」** をクリックします
4. **「生成する」** をクリックして新しいトークンを発行します
5. 必要なアクセス権限を設定します（下表参照）
6. **「保存」** をクリックし、**「アプリを更新」** をクリックして確定します

### 各アプリに必要なアクセス権限

| アプリ | 必要な権限 |
|--------|----------|
| M_棟 | レコード閲覧 |
| M_棟タイプ | レコード閲覧 |
| M_物件 | レコード閲覧 |
| M_組合員物件所有状況 | レコード閲覧 |
| M_組合員駐車場契約 | レコード閲覧 |
| M_組合員 | レコード閲覧 |
| M_請求レコード | レコード閲覧・追加・編集 |

### 設定ファイルの編集

`%LOCALAPPDATA%\AccountReconciler\kintone_api_tokens.json` をテキストエディタで開き、発行したトークンを設定します。

```json
{
  "buildingApiToken": "（M_棟のトークン）",
  "buildingTypeApiToken": "（M_棟タイプのトークン）",
  "propertyApiToken": "（M_物件のトークン）",
  "memberPropertyOwnershipApiToken": "（M_組合員物件所有状況のトークン）",
  "memberParkingContractApiToken": "（M_組合員駐車場契約のトークン）",
  "memberApiToken": "（M_組合員のトークン）",
  "billingApiToken": "（M_請求レコードのトークン）"
}
```

> **セキュリティ上の注意**
> - このファイルは第三者に見せないでください
> - git リポジトリにコミットしないでください（`.gitignore` に登録済み）
> - PC廃棄時はファイルを確実に削除してください

---

## 3-4. 設定後の動作確認

1. アプリを起動してKintoneドメイン・ログインIDでログインします
2. ダッシュボードが正常に表示されることを確認します
3. 左側メニューから **「締め処理」** を開き、**「請求データ生成」** をクリックします
4. データが取得されれば接続設定は正常です

エラーが表示される場合は [第8章 トラブルシューティング](08_troubleshooting.md) を参照してください。

---

[← 前章：インストール・初期セットアップ](02_initial_setup.md) ｜ [次章：Kintoneアプリ定義 →](04_kintone_app_definitions.md)
