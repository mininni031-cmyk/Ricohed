# RICOCHET v2.9.0 検証結果

2026-10-14 / Windows / Node.js 24.19.0 / Playwright・Edge / ソフトウェアWebGL。
基点v2.8.2は別コピーで65/65成功、JavaScriptページエラー0件。

## 現行テスト

| テスト | 結果と対象 |
|---|---|
| core.cjs | 15項目成功。28m/10m、中心高、楕円の内外、枠高速接触、1/2/3点、左右25°と速度保持 |
| shot.cjs | 10項目成功。14m/s、既存倍率、通常/左右カーブの反射予測と実飛行の一致 |
| match.cjs | 成功。両側の移動、ハーフライン、古い入力番号の拒否、射撃、得点、終了、キャッチ入力、ジャスト反撃、同ステップのキャッチ＋射撃 |
| online.cjs | 成功。実WebSocketで部屋分離、2人/満員、準備、移動、サーバー判定、不正入力/Origin、切断、復帰、期限切れ |
| run_v29.cjs | 63/63成功、ページエラー0件。v2.8.2の操作回帰を新仕様の期待値へ更新。撤去した円形サイズ切替2項目は対象外 |
| online-browser.cjs | 11項目成功、ページエラー0件。独立2ブラウザー、cyan/pink、双方移動・カーブ射撃、同じ得点、復帰、試合終了 |
| mobile.cjs | 5項目成功、ページエラー0件。タッチ開始、全ボタン非重複、球種切替、実タッチ長押しの19.6m/sチャージカーブ、file://起動 |
| review-regressions.cjs | 成功。予測点不足・軌跡色・新試合時刻・切断表示の4不具合をRED→GREENで確認。サーバー再起動後の中断画面も確認 |
| long-match.cjs | 成功。最新仕様の3分CPU戦を終了まで22,431ステップ、CPU14投・2ゴール、有限座標、重力シフトOFF、残り0秒 |
| package.cjs | 成功。Cloudflare静的出力、接続先設定の反映、サーバー・秘密設定・作成用ソースを公開出力から除外 |

正式な実行コマンドは`npm test`（tools/test.cjs）。ビルドは`npm run build`、公開出力は`npm run build:site`、静的パッケージ確認は`npm run test:package`です。

独立レビューではCritical指摘なし。予測バッファと切断案内のImportant2件、軌跡色と新試合時刻のMinor2件を発見し、すべて修正して現行テストを通しています。レビュー担当は別のエージェントで、ソースを変更していません。追加の高速斜め境界9ケースもレビュー時に正常でした。

## 実行記録

tests/full-suite.log、v29-results.json、online-browser-actual.json、mobile-actual.json、long-match-actual.json、review-red.log、review-green.logと画面PNGを同梱します。過去版のログは現行の合格結果ではありません。

## 検証の限界

この検証は公開前のローカル環境です。実際のCloudflare/RenderでのWSS接続・GitHub Actionsの実行、物理スマホ、人間のプレイ感、広域ネットワークの遅延・実機のフレームレートは未検証です。公開後の確認手順はDEPLOY.mdにあります。

新規ZIP展開後の起動確認結果は、同梱DELIVERY_CHECK.mdに記録します。
