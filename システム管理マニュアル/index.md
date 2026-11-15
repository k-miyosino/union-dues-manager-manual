# システム管理マニュアル

システム管理者が担うセットアップ・設定・保守作業のマニュアルです。

---

## 目次

| 章 | タイトル | 内容 |
|----|---------|------|
| [第1章](01_overview.md) | システム概要 | 管理者の責務、重要ファイルの場所 |
| [第2章](02_initial_setup.md) | インストール・初期セットアップ | 動作要件、インストール、初回起動時の処理 |
| [第3章](03_kintone_config.md) | Kintone接続設定 | アプリID・APIトークン・質問機能の設定 |
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
| 初回・Kintone変更時 | APIトークンの取り込み・アプリID設定 | 第3章 |
| 初回 | 質問機能の設定の取り込み | 第3章 |
| 事務局から依頼時 | Kintoneユーザー追加 | 第5章 |
| 定期（月次推奨） | バックアップ取得 | 第7章 |
| PC載せ替え時 | バックアップ → 新PCセットアップ → リストア | 第2・7章 |
| 障害発生時 | トラブルシューティング | 第8章 |
| 新バージョンリリース時 | git tag → GitHub Actions → 自動ビルド・配布 | 第9章 |

---

## 重要ファイルの場所

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
