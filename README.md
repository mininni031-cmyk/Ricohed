# RICOCHET v2.9.0

ZIPを完全に展開し、START_GAME.cmd または index.html を開くとCPU戦を遊べます。オフラインで動作します。

ゴール開口4.0m×2.5m・中心高2.0m、コート幅28m、天井10m、固定反射パネル80%、重力シフトなし。得点は直接1点・1反射2点・2反射以上3点、3分の試合です。

PC：WASD移動、マウス視点、左クリック射撃、F/右クリックキャッチ、E球種切替、Z左/X右/C直線、Q長押し→離してチャージ、Spaceジャンプ/壁キック、Shiftダッシュ。スマホは横画面のスティック・右画面ドラッグ・画面ボタンで操作します。

カーブの基準速度14m/s、最初の1秒で合計25°。直線は16m/s。既存チャージ最大1.4倍、ジャスト反撃1.15倍、壁キック後空中ショット1.10倍を維持します。キーパーは左右往復だけで追尾しません。

点線は壁と固定パネル反射を含む予測、光の帯は実軌跡。緑は通常予測、黄はカーブ、紫は1反射、橙は2反射以上。予測はキーパー・相手のキャッチ・ランダムな空中ばらつきを含みません。

オンライン：Render向けのWebSocketサーバーを同梱。2人が同じ合言葉で入室して「準備完了」を押します。サーバーが移動・ディスク・キャッチ・得点を判定します。切断時は停止し、同じページから30秒以内に復帰します。ページを再読み込みした場合の席復帰は初版では対応しません。

ローカル起動：Node.js 24を導入し、npm install → npm start。別ターミナルでnpm run serve、画面は http://localhost:8003、接続先は ws://localhost:3001/ws。WindowsのSTART_SERVER.cmdとSTART_LOCAL_WEB.cmdでも起動できます。

Cloudflare Pages・GitHub・Renderでの公開はDEPLOY.mdを参照。外部への公開はまだ行っていません。

開発：npm run build / npm test / npm run build:site。検証用ブラウザーは npx playwright install chromium。既存Edgeを使う場合はBROWSER_PATHを指定します。

変更と検証結果：CHANGELOG_v2.9.md、TEST_REPORT.md。過去版のログとテストは履歴です。現在の正式テストはpackage.jsonのtestです。
