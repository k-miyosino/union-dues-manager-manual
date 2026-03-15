# システム管理マニュアル

システム管理者が担うセットアップ・設定・保守作業のマニュアルです。

---

## 目次

| 章 | タイトル | 内容 |
|----|---------|------|
| [第1章](01_overview.md) | システム概要 | 管理者の責務、重要ファイルの場所 |
| [第2章](02_initial_setup.md) | インストール・初期セットアップ | 動作要件、インストール、初回起動時の処理 |
| [第3章](03_kintone_config.md) | Kintone接続設定 | アプリID・APIトークンの設定 |
| [第4章](04_kintone_app_definitions.md) | Kintoneアプリ定義（参考） | 必要な7アプリのフィールド定義一覧 |
| [第5章](05_kintone_user_management.md) | Kintoneユーザー管理 | ユーザーの追加・無効化手順 |
| [第6章](06_security_management.md) | セキュリティ管理 | 暗号化キーの管理、APIトークン更新 |
| [第7章](07_backup_migration.md) | バックアップ・PC移行 | バックアップ運用、PC載せ替え手順 |
| [第8章](08_troubleshooting.md) | トラブルシューティング | ログ解析、DB修復、よくある技術的問題 |
| [第9章](09_release_process.md) | リリース・配布プロセス | 証明書作成、GitHub Secrets 設定、リリース手順（開発者向け） |

---

## 管理者の主な作業一覧

| タイミング | 作業 | 参照章 |
|-----------|------|--------|
| 初回・PC交換時 | インストール・初期セットアップ | 第2章 |
| 初回・Kintone変更時 | APIトークン・アプリID設定 | 第3章 |
| 事務局から依頼時 | Kintoneユーザー追加 | 第5章 |
| 定期（月次推奨） | バックアップ取得 | 第7章 |
| PC載せ替え時 | バックアップ → 新PCセットアップ → リストア | 第2・7章 |
| 障害発生時 | トラブルシューティング | 第8章 |
| 新バージョンリリース時 | git tag → GitHub Actions → 自動ビルド・配布 | 第9章 |

---

## 重要ファイルの場所

| ファイル | パス | 説明 |
|---------|------|------|
| データベース | `%LOCALAPPDATA%\UnionDuesCollectionManager\SecureBank.db` | 口座情報・処理履歴などを格納 |
| 暗号化キー | `%APPDATA%\AccountReconciler\secret.key` | 口座情報の復号に必要。**絶対に削除しない** |
| APIトークン | `%LOCALAPPDATA%\AccountReconciler\kintone_api_tokens.json` | Kintone接続トークン。**gitにコミットしない** |
| アプリID設定 | `%LOCALAPPDATA%\AccountReconciler\kintone_app_ids.json` | KintoneアプリIDの設定 |
| Kintone設定 | `%LOCALAPPDATA%\AccountReconciler\kintone_config.json` | ドメイン等の接続設定 |
| 自動更新設定 | `%LOCALAPPDATA%\AccountReconciler\update_config.json` | 自動更新用 GitHub PAT（アプリ起動後に配置） |

> `%LOCALAPPDATA%` = `C:\Users\（ユーザー名）\AppData\Local`
> `%APPDATA%` = `C:\Users\（ユーザー名）\AppData\Roaming`
