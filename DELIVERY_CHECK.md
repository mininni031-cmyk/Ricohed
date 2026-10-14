# 納品物の展開確認

2026-10-14。統合ZIPを`work/delivery-check`へ新規展開して確認しました。

- ZIP全エントリーのCRC検証：成功。`.github/workflows/test.yml`と`.env.example`の同梱も確認。
- 新規展開先でサーバー実行用の依存（three、ws）だけを導入：成功。
- 実サーバー入口`node server/index.mjs`の起動：成功。`/health`はHTTP 200、`ok: true`、`version: 2.9.0`。
- 実WebSocketの部屋・準備・入力検証・切断・復帰・期限切れ・Origin検証：成功。
- 新規展開先の独立2ブラウザー対戦：11項目成功、JavaScriptページエラー0件。
- 新規展開先のタッチ操作とfile://オフラインCPU戦：5項目成功、JavaScriptページエラー0件。
- 配布元と展開先の実行コードのハッシュ一致：成功。

確認後、この記録だけをZIPへ追加しています。ゲーム・サーバーのコードは再変更していません。
ZIPにはnode_modulesを含めません。CPU戦はビルド済みのため直接起動でき、オンラインサーバーはNode.jsと依存導入が必要です。詳しくはREADME.md・DEPLOY.mdを参照してください。

元v2.8.2 ZIPのSHA256は作業前後で一致：
6AD28FBDDA6AD174F8D1C5B8D44AC16A352AEA0322C2BCEEAF8AB59D8DD9FAA3
