# Motion Log

SQLite をバックエンドに使った、運動記録用のシンプルなWebアプリです。

## できること

- SQLite データベースでのアカウント管理
- ユーザー名とパスワードでの新規登録・ログイン
- 運動内容を日付・種目・時間・強度・自動計算カロリー・メモ付きで保存
- 1週間の目標、サマリー、フレンド欄の表示
- フレンド申請、承認、解除

## 使い方

1. このフォルダで `powershell -ExecutionPolicy Bypass -File .\start-localhost.ps1` を実行します。
2. ブラウザで `http://localhost:8000` を開きます。
3. フォームから運動記録を入力します。
4. 保存すると一覧とサマリーが更新されます。

## バックエンド

- `server.py`: 静的ファイル配信と API をまとめて提供します
- `motion_log.db`: SQLite データベースです。起動時に自動生成されます

## GitHub Pages 公開

このプロジェクトには `.github/workflows/pages.yml` を追加済みです。

1. GitHub に新しいリポジトリを作成します。
2. このフォルダをそのリポジトリの `main` ブランチに push します。
3. GitHub の `Settings > Pages > Source` で `GitHub Actions` を選びます。
4. `main` への push 後に Actions が走り、公開URLが発行されます。

## ローカル確認用ファイル

- `server.py`: Python の標準ライブラリだけで動くローカルサーバー
- `start-localhost.ps1`: Windows PowerShell から起動するためのスクリプト

## 次に拡張しやすい項目

- グラフ表示
- 目標設定と達成率表示
- ユーザー認証
- バックエンド連携
