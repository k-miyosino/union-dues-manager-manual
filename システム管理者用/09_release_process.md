# 第9章 リリース・配布プロセス（開発者向け）

このドキュメントは、アプリの新バージョンをビルド・配布するための手順を記載します。
初回セットアップ（GitHub Secrets の登録など）は一度だけ行えば以後は不要です。

---

## 9-1. 全体の仕組み

```
開発者
  └─ git tag v1.2.3 && git push --tags
          ↓
GitHub Actions (windows-latest) が自動実行
  ├─ Package.appxmanifest と AssemblyVersion をタグのバージョンに書き換え
  ├─ MSIX をビルド・自己署名証明書で署名
  └─ GitHub Release を作成（MSIX + .cer を添付）
          ↓
エンドユーザーのアプリが起動時に自動検知
  └─ GitHub Releases API を PAT で呼び出してバージョン比較
      → 新バージョンがあれば通知ダイアログ → ワンクリックでダウンロード・インストール
```

---

## 9-2. 初回セットアップ（一度だけ）

### ステップ1：自己署名証明書の作成

開発者 PC の PowerShell（管理者権限不要）で実行します。

```powershell
# 証明書を作成（有効期間 10 年）
# Subject は Package.appxmanifest の Publisher="CN=anori" に完全一致させること
$cert = New-SelfSignedCertificate `
    -Type Custom `
    -Subject "CN=anori" `
    -KeyUsage DigitalSignature `
    -FriendlyName "UnionDuesCollectionManager Signing" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}") `
    -NotAfter (Get-Date).AddYears(10)

# PFX でエクスポート（このパスワードを後で GitHub Secrets に登録する）
$pw = ConvertTo-SecureString "任意のパスワード" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "$HOME\Desktop\signing.pfx" -Password $pw

# GitHub Secrets に登録する Base64 文字列をクリップボードにコピー
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Desktop\signing.pfx")) | Set-Clipboard
Write-Host "クリップボードにコピーしました → SIGNING_CERT_PFX に貼り付けてください"

# CER（エンドユーザー配布用）をエクスポート
$desktop = [Environment]::GetFolderPath("Desktop")
Export-Certificate -Cert $cert -FilePath "$desktop\UnionDuesCollectionManager_signing.cer"
Write-Host "CER を出力しました: $desktop\UnionDuesCollectionManager_signing.cer"
```

> **注意:** `signing.pfx` は GitHub Secrets 登録後に削除してください（漏洩防止）。
> `UnionDuesCollectionManager_signing.cer` は各 PC への初回インストール時に必要なので保管しておきます。

既に証明書を作成済みの場合（CER だけ再出力したい場合）：

```powershell
$cert = Get-ChildItem "Cert:\CurrentUser\My" | Where-Object { $_.Subject -eq "CN=anori" } | Select-Object -First 1
$desktop = [Environment]::GetFolderPath("Desktop")
Export-Certificate -Cert $cert -FilePath "$desktop\UnionDuesCollectionManager_signing.cer"
```

---

### ステップ2：GitHub Secrets の登録

リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で登録します。

| Secret 名 | 値 |
|---|---|
| `SIGNING_CERT_PFX` | PowerShell でクリップボードにコピーした Base64 文字列 |
| `SIGNING_CERT_PASSWORD` | PFX 作成時に設定したパスワード |

---

### ステップ3：UpdateCheckService の URL を設定

[AccountReconciler.Presentation/Services/UpdateCheckService.cs](../../../AccountReconciler.Presentation/Services/UpdateCheckService.cs) の定数を設定します：

```csharp
private const string ReleasesApiUrl =
    "https://api.github.com/repos/k-miyosino/union-dues-manager/releases/latest";
```

リポジトリ名を変更した場合はここも合わせて変更し、コミット・プッシュします。

---

## 9-3. リリース手順（毎回）

### バージョン番号の決め方

セマンティックバージョニング（`MAJOR.MINOR.PATCH`）に従います：

| 変更の種類 | バージョン例 |
|---|---|
| バグ修正・軽微な改善 | `1.0.0` → `1.0.1` |
| 機能追加（後方互換あり） | `1.0.1` → `1.1.0` |
| 大きな変更・再設計 | `1.1.0` → `2.0.0` |

### リリースコマンド

```bash
git tag v1.2.3
git push --tags
```

これだけで GitHub Actions が自動的に以下を実行します：
1. `Package.appxmanifest` のバージョンを `1.2.3.0` に書き換え
2. `AssemblyVersion` を `1.2.3.0` に書き換え
3. MSIX をビルド・署名
4. GitHub Release を作成（MSIX + `.cer` を添付）

### 結果の確認

GitHub リポジトリの **Actions** タブでワークフローの実行状況を確認します。
成功すれば **Releases** ページに新バージョンが表示されます。

### タグを間違えた場合

```bash
# ローカルのタグを削除
git tag -d v1.2.3

# リモートのタグを削除
git push --delete origin v1.2.3

# 正しいバージョンで再作成
git tag v1.2.4
git push --tags
```

---

## 9-4. 証明書の有効期限が切れた場合

証明書の有効期限（10 年）が切れたら作り直す必要があります。

1. 新しい証明書を作成（ステップ1 と同じ手順）
2. GitHub Secrets を更新（`SIGNING_CERT_PFX`・`SIGNING_CERT_PASSWORD`）
3. 各 PC で旧証明書を削除し、新しい `.cer` をインストールし直す

現在の証明書の期限を確認するには：

```powershell
Get-ChildItem "Cert:\CurrentUser\My" |
  Where-Object { $_.Subject -eq "CN=anori" } |
  Select-Object Subject, NotAfter, Thumbprint
```

---

## 9-5. エンドユーザー側の初回セットアップ

エンドユーザー（事務局スタッフ）が新しい PC でアプリを使い始める際の手順です。

### 1. 署名証明書のインストール（初回のみ）

`UnionDuesCollectionManager_signing.cer` を渡してインストールしてもらいます：

1. `.cer` ファイルをダブルクリック →「証明書のインストール」
2. 「ローカルコンピューター」→「次へ」
3. 「証明書をすべて次のストアに配置する」→「参照」
4. **「信頼されたルート証明機関」** → 「OK」→「次へ」→「完了」

### 2. MSIX のインストール

GitHub Releases ページから最新の `.msix` をダウンロードしてダブルクリック → 「インストール」。

### 3. アプリを一度起動

`%LOCALAPPDATA%\AccountReconciler\` フォルダが自動作成されます。

### 4. update_config.json の配置（自動更新を有効にする場合）

`%LOCALAPPDATA%\AccountReconciler\update_config.json` を作成します：

```json
{
  "githubPat": "github_pat_xxxxxxxxxxxxxxxx"
}
```

PAT の作成方法：GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
→ 対象リポジトリのみ・**Contents: Read-only** 権限で発行したトークンを貼り付けます。

> PAT を設定しない場合は自動更新チェックがスキップされます。
> その場合は GitHub Releases ページから手動でダウンロードして更新してください。

---

## 9-6. ファイル・フォルダの対応表

| ファイル | 場所 | 役割 |
|---|---|---|
| `signing.pfx` | 開発者 PC のみ（作成後は削除） | MSIX 署名用証明書（秘密鍵含む） |
| `UnionDuesCollectionManager_signing.cer` | 開発者が保管・配布 | エンドユーザーへの証明書配布用 |
| `SIGNING_CERT_PFX` | GitHub Secrets | CI が PFX を復元するための Base64 |
| `SIGNING_CERT_PASSWORD` | GitHub Secrets | PFX のパスワード |
| `update_config.json` | `%LOCALAPPDATA%\AccountReconciler\` | エンドユーザー PC ごとに配置する PAT |

---

[← 前章：トラブルシューティング](08_troubleshooting.md)
