# Motion Log

ブラウザだけで使える、運動記録用のシンプルなWebアプリです。

## できること

- 運動内容を日付・種目・時間・カロリー・強度・メモ付きで保存
- 記録一覧の表示、並び替え、種目フィルター
- 合計回数、総運動時間、総消費カロリー、最多種目の自動集計
- `localStorage` によるローカル保存

## 使い方

1. このフォルダで `powershell -ExecutionPolicy Bypass -File .\start-localhost.ps1` を実行します。
2. ブラウザで `http://localhost:8000` を開きます。
3. フォームから運動記録を入力します。
4. 保存すると一覧とサマリーが更新されます。

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
