# v2.9 検証

`npm test`が現在の正式なテストです。
core.cjs（楕円・ステージ・得点・角度）、shot.cjs（強化と予測一致）、match.cjs（共通試合）、online.cjs（実WebSocket）、run_v29.cjs（既存操作回帰）、online-browser.cjs（2画面対戦）、mobile.cjs（実タッチとオフライン）を実行します。

run_v27*、run_v28*、旧results.json、balance、compare_goalsは過去版の検証履歴です。v2.9の固定楕円・速度・コート値への対応を保証していないため、現在の全件合格判定には用いません。

review-regressions.cjsはレビュー指摘4点とサーバー再起動時の中断表示、long-match.cjsは最新仕様の3分CPU戦を終了まで確認します。test:packageはCloudflare用公開出力を確認します。
