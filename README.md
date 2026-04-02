# Motion Log

Supabase をバックエンドに使った運動記録アプリです。GitHub Pages のような静的ホスティングでも、ユーザー登録、ログイン、記録保存、フレンド機能まで動かせます。

## 主な機能

- ユーザー名、メールアドレス、パスワードで新規登録 / ログイン
- 運動の種類、時間、強度から消費カロリーを自動計算
- 1週間の目標設定と達成率の円グラフ表示
- 過去の記録の月別表示と運動種類フィルター
- フレンド申請、承認、フレンドの記録確認

## Supabase の初期設定

1. Supabase でプロジェクトを作成します。
2. `Authentication > Providers > Email` を開き、`Confirm email` を OFF にします。
3. `SQL Editor` を開いて、[supabase/schema.sql](C:\Users\ootaka kouta\Documents\GitHub\active\supabase\schema.sql) の内容をそのまま実行します。
4. [supabase-config.js](C:\Users\ootaka kouta\Documents\GitHub\active\supabase-config.js) に `Project URL` と `anon public key` を設定します。

## ローカルで確認する

1. このフォルダで PowerShell を開きます。
2. 次を実行します。

```powershell
powershell -ExecutionPolicy Bypass -File .\start-localhost.ps1
```

3. ブラウザで [http://localhost:8000](http://localhost:8000) を開きます。

## GitHub Pages で公開する

1. 変更を `main` に push します。
2. GitHub の `Settings > Pages` で `Build and deployment` を `GitHub Actions` にします。
3. Actions のデプロイ完了後、公開 URL を開きます。

## 補足

- `supabase-config.js` の `anon public key` は公開前提のキーです。
- `service_role key` は絶対にフロントエンドへ置かないでください。
- 以前の `server.py` と SQLite はローカル用に残っていますが、GitHub Pages 公開時のログイン処理では使いません。
