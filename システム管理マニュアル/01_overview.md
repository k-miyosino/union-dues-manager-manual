# 第1章 管理者の責務と環境概要

> - Kintoneとは・.NETとは → **[前提知識](../共通/00_prerequisites.md)**
> - システムの構成・データフロー → **[システム概要](../共通/01_system_overview.md)**

---

## 1-1. システム管理者の責務

| 作業カテゴリ | 具体的な作業 |
|------------|------------|
| **環境構築** | インストール、初期設定、Kintone接続設定 |
| **ユーザー管理** | 事務局からの依頼を受けてKintoneユーザーを追加・無効化 |
| **セキュリティ** | 暗号化キーの保護、APIトークン・質問機能のトークンの管理・更新 |
| **バックアップ** | 定期バックアップの取得・保管 |
| **PC移行** | PC載せ替え時のバックアップ→新環境セットアップ→リストア |
| **障害対応** | ログ解析、DB修復、事務局からの問い合わせ対応 |

事務局が行う日常的なデータ入力（Kintoneへの組合員登録・口座登録など）はシステム管理者の担当外です。

---

## 1-2. 重要ファイルの場所と説明

### ローカルデータ（PC上）

| ファイル | 場所 | 説明 |
|---------|------|------|
| データベース（`SecureBank.db`） | アプリ専用フォルダ（メンテナンス画面「DBファイル情報」に表示） | 口座情報・処理履歴などを格納。バックアップ対象。直接コピーによるPC移行は不可 |
| ログ（`logs\`） | データベースと同じフォルダ | 日付別テキストファイル。障害調査時に参照 |
| 暗号化キー（`secret.key`） | `%APPDATA%\AccountReconciler\` | 口座情報の復号に必要。**絶対に削除しない**。バックアップ機能で自動管理 |
| APIトークン（`kintone_api_tokens.dat`） | `%LOCALAPPDATA%\AccountReconciler\` | メンテナンス画面で取り込んだKintone APIトークン。このPC・このWindowsユーザー専用に暗号化して保存される |
| 質問機能の設定（`manual_chat.dat`） | `%LOCALAPPDATA%\AccountReconciler\` | メンテナンス画面で取り込んだ質問機能の接続先とトークン（暗号化） |
| 自動更新用PAT（`update_pat.dat`） | `%LOCALAPPDATA%\AccountReconciler\` | メンテナンス画面で設定した GitHub PAT（暗号化） |
| Kintone設定（`kintone_config.json`） | `%LOCALAPPDATA%\AccountReconciler\` | ドメインの設定（メンテナンス画面で変更する） |
| アプリID設定（`kintone_app_ids.json`） | インストールフォルダの `Config\`（またはローカル） | KintoneアプリIDの設定（→ 第3章） |
| 自動バックアップ | ドキュメントフォルダの `UnionDuesCollectionManager\AutoBackup\` | 28日ごとに自動作成。作成したPC・ユーザーでのみ復元可能 |

> `%LOCALAPPDATA%` = `C:\Users\（ユーザー名）\AppData\Local`
> `%APPDATA%` = `C:\Users\（ユーザー名）\AppData\Roaming`
>
> アプリは MSIX パッケージでインストールされるため、上記のフォルダへの書き込みは Windows によってアプリ専用の領域（`%LOCALAPPDATA%\Packages\` の下）に振り替えられることがあります。エクスプローラーで上記のパスを開いてもファイルが見つからない場合があります。
> **アプリをアンインストールすると、データベース・暗号化キー・取り込んだ設定は削除されます。** アンインストールの前には必ず手動バックアップを作成してください（→ 第7章）。
> 設定ファイルをテキストエディタで直接編集する必要はありません。設定はメンテナンス画面から行います。

### アプリケーション本体

インストール先フォルダ内の `Config\` に、アプリID設定 `kintone_app_ids.json` が含まれます。
APIトークンのファイルはリリース版には含まれません。メンテナンス画面から取り込みます（→ [第3章](03_kintone_config.md)）。

---

## 1-3. 設定の読み込み順

### KintoneアプリID

```
優先度（高）  アプリインストールフォルダ\Config\kintone_app_ids.json
              ↓（ない場合）
優先度（低）  %LOCALAPPDATA%\AccountReconciler\kintone_app_ids.json
```

### APIトークン

```
1. メンテナンス画面で取り込んだ暗号化ファイル（kintone_api_tokens.dat）
   ↓（ない場合）
2. 旧形式の平文ファイル %LOCALAPPDATA%\AccountReconciler\kintone_api_tokens.json
   （見つかった場合は読み込んで暗号化ファイルに移し、平文ファイルを削除する）
   ↓（ない場合）
3. アプリインストールフォルダ\Config\kintone_api_tokens.json（開発環境用。リリース版には含まれない）
```

---

[← 目次へ](index.md) ｜ [次章：インストール・初期セットアップ →](02_initial_setup.md)
