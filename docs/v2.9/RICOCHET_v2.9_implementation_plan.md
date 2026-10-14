# RICOCHET v2.9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user selects delegation. Steps use checkbox syntax for tracking.

**Goal:** v2.8.2の既存機能を保護し、指定された楕円・軌道・カーブ・ステージと合言葉オンライン1v1をテスト済みZIPとして納品する。

**Architecture:** 既存クライアントに共有の幾何・射撃・判定を追加する。描画から独立したサーバー用試合状態が共通物理を利用し、クライアントは入力送信と状態補間を行う。Cloudflare PagesとRenderをGitHubの同一リポジトリから公開できる構成にする。

**Tech Stack:** JavaScript、既存Three.js、esbuild、Node.js、ws、Playwright、Cloudflare Pages、Render。

**Spec:** [RICOCHET_v2.9_design.md](RICOCHET_v2.9_design.md)

## Global Constraints

- 元ZIP SHA256：6AD28FBDDA6AD174F8D1C5B8D44AC16A352AEA0322C2BCEEAF8AB59D8DD9FAA3。元ZIPと以前の作業フォルダーは変更しない。
- 開口4.0m×2.5m、中心高2.0m、横幅28m、天井10m、固定パネル80%。
- カーブ基準14m/s、積算角度25°、直線基準16m/s。既存強化倍率を保持。
- 得点1/2/3点、3分、キーパー左右往復のみ、重力シフトOFF、CPU戦とオフライン起動を保持。
- サーバー120Hz、状態送信20Hz、再接続猶予30秒、単一インスタンス。
- 実装・検証・成果物作成はこのチャットで進める。公開実行は成果物完成後の別工程。

## Review Focus

1. 楕円の斜め境界に入る高速ディスク：枠反射と得点を同時発生させない（Task 1）。
2. 反射中のカーブと空中強化：予測線の速度・回転・反射条件が実飛行と一致する（Task 2）。
3. ピンク側の視点：左右カーブ・移動・射撃が本人の視点で正しく対応する（Task 4）。
4. 切断直前の入力と再接続：古い入力を復帰後に実行せず、第三者へ席を渡さない（Task 3/4）。
5. HTTPS画面からの接続・不正Origin・Render再起動：WSS接続と明確な接続失敗/中断表示を提供する（Task 3/5）。

## 実行と保存

作業先：`work/v29/`。配布先：`outputs/RICOCHET_v2.9/`と統合ZIP。
基点は`work/baseline/RICOCHET_v2.8.2/`。基点の今回再実行テスト65/65成功を比較基準にする。
元プロジェクトにGit管理がなければ作業コピーを新規ローカルGit管理し、タスク単位で保存する。外部リポジトリへはまだ送信しない。
仕様を変えるテストだけ期待値を更新し、キャッチ・チャージ・壁キック等の回帰条件を弱めない。

### Task 1: 楕円ゴールとステージ

**Files:** 新規`src/goal-geometry.js`、`tests/geometry.cjs`。変更`src/config.js`、`src/goals.js`、`src/physics.js`、`src/arena.js`、`src/athlete.js`、`src/cpu.js`、`index.html`、`src/game.js`。

**Interfaces:**
- `goalCoordinates(point, mouth) -> {u, v}`：面内座標。
- `insideGoal(point, mouth) -> boolean`：u²/4+v²/1.5625<=1。
- `goalRimContact(point, radius, mouth) -> null | {normal, point}`：表示に使う外周と同じ形の枠接触。
- 描画・物理・壁キック・CPUが上記とCONFIGの共通寸法を使用。

- [ ] 得点境界テストを先に追加。中心、u=±2/v=0、u=0/v=±1.25は内側、u=2.01とv=1.26は外側。斜め境界の内外、法線方向の距離を変えても同じ面内判定、実飛行で左右端・枠接触・高速通過を検証。
- [ ] `node tests/geometry.cjs`を実行し、旧円形仕様で指定境界が失敗することを記録。
- [ ] 共有幾何を実装。横幅28m、中心高2m、往復±1.45m。開口と外周リングを共通寸法から描画し、旧サイズ切替を固定楕円案内へ変更。
- [ ] `node tests/geometry.cjs`とブラウザの1/2/3点実飛行テストを通す。ゴール、天井、パネル、左右端を画面で確認。
- [ ] ソース、テスト、変更ログを保存。

### Task 2: 14m/s・25°カーブと軌道

**Files:** 新規`src/shot.js`、`src/prediction.js`、`tests/shot.cjs`。変更`src/config.js`、`src/game.js`、`src/fx.js`、`src/ui.js`、`index.html`、`style.css`、`tests/run_v29.cjs`。

**Interfaces:**
- `shotParameters(athlete, simTime) -> {speed, rate, duration}`：基準速度と強化を一か所で決定。
- `predictShot({origin, direction, parameters, goals, gravity, panels}, duration) -> {points, bounces}`：DiscPhysicsの同じ積分・反射を使用、キーパーなし。

- [ ] 基準14、左右速度一致、角度25°、1秒後に回転停止、チャージ/反撃/壁キック倍率、直線16をテストに追加。旧57°仕様と速度16のカーブで失敗を確認。
- [ ] 共有射撃値を使用し、120Hzと分割ステップで角度が一致するカーブを実装。
- [ ] 壁と固定パネルを含む予測を追加。通常/カーブの色、反射区間の色、点線、太い実軌跡、凡例を追加。空中ばらつき・相手・キーパーを含まない目安と表示。
- [ ] 予測の終点と同じ初期条件の実飛行の位置を誤差0.02m以内で比較。反射あり、左右カーブ、チャージと空中強化を含める。
- [ ] `node tests/shot.cjs`と`node tests/run_v29.cjs`を実行。既存回帰65項目のうち変更した仕様の期待値だけ更新。PC・タッチの開始/射撃/球種/キャッチ、ボタン非重複、file://起動を確認。
- [ ] ビルド・テスト結果と変更ログを保存。

### Task 3: サーバー共通試合判定と部屋

**Files:** 新規`src/keeper-physics.js`、`src/match-simulation.js`、`server/index.mjs`、`server/rooms.mjs`、`server/protocol.mjs`、`tests/match.cjs`、`tests/online.cjs`。変更`src/keeper.js`、`package.json`とロックファイル。

**Interfaces:**
- `KeeperPhysics(team, hitbox)`、`update(dt, matchTime)`、`setHome(mouth)`、`hitTest(position, radius)`：描画を必要としない共通判定。
- `MatchSimulation({seed})`、`applyInput(team, input)`、`step(dt)`、`snapshot()`：試合・所持・時間・得点・プレイヤー・ディスク・キーパー状態を保持。
- 入力 `{seq, yaw, pitch, moveX, moveY, jump, dash, catch, shoot, charge, curve}`。イベントは一度だけ消費し、seqは単調増加。
- WSメッセージ `join/ready/input/leave` と `joined/state/status/error`。再接続はjoinのroomとtokenを使用。

- [ ] 共通試合で双方の移動・射撃・キャッチ・1/2/3点、3分終了、キーパー位置一致を先にテスト。描画依存の分離前にはサーバー試合が成立しないことを確認。
- [ ] 既存キーパーの測定済み体形を保持して判定を分離。移動・キャッチ・強化条件を共通化し、CPU戦の判定も共有する。
- [ ] join二人成功、三人目拒否、別部屋分離、ready後開始、切断停止、同token30秒以内復帰、期限切れ拒否、古い入力/非有限値/過大メッセージ/過剰頻度拒否のテストを追加して失敗確認。
- [ ] wsによる部屋管理を実装。Origin許可リスト、最大メッセージサイズ、ping/pong、入力頻度制限、期限切れ部屋の掃除。サーバーは0.0.0.0とPORT、HTTP /healthを提供。
- [ ] `node tests/match.cjs`と`node tests/online.cjs`を通す。クライアント申告の得点・位置を採用しないことを確認。
- [ ] 結果・プロトコル・変更ログを保存。

### Task 4: オンライン画面と操作

**Files:** 新規`src/online.js`。変更`src/game.js`、`src/input.js`、`src/ui.js`、`index.html`、`style.css`。新規`tests/online-browser.cjs`。

**Interfaces:**
- `OnlineSession({url, room, onState, onStatus})`、`connect()`、`sendInput(input)`、`ready()`、`leave()`。
- Gameはオンライン時にローカルCPU・得点判定を止め、受信した自己/相手/ディスクを既存表示へ反映する。
- リモート状態は受信時間から補間し、入力seqを状態のackと対応させる。

- [ ] 独立ブラウザ2ページで同室・双方開始・cyan/pink視点・左右カーブ・移動・射撃・キャッチ・得点一致・試合終了を先に検証するテストを追加。オンラインUI未実装で失敗確認。
- [ ] タイトルへCPU戦/オンライン選択、サーバーURL、合言葉、入室/準備/退出を追加。待機・満員・接続失敗・再接続待ち・中断・終了を日本語で表示。
- [ ] 双方で既存キーとスマホ操作を送信。切断/ポーズ/フォーカス喪失時は移動とチャージを解除し、復帰後に古い一回入力を再送しない。
- [ ] ping表示と補間を追加。ピンク側はローカルのplayerとして表示し、画面内スコアと相手モデルを正しいチームへ対応させる。
- [ ] `node tests/online-browser.cjs`を通す。PCとタッチ相当の2人対戦、別URLのOrigin許可、切断復帰、異常入力を検証。
- [ ] 画面確認、結果・変更ログを保存。

### Task 5: 公開設定・配布・最終確認

**Files:** 新規`render.yaml`、`.env.example`、`.github/workflows/test.yml`、`tools/build-site.cjs`、`DEPLOY.md`、`START_SERVER.cmd`、`CHANGELOG_v2.9.md`。更新`README.md`、`package.json`、配布用`ricochet.js`。

**Interfaces:** `npm run build`、`npm test`、`npm start`、`npm run build:site`。Cloudflareはbuild:siteのdistを配信。Renderはnpm startを実行。

- [ ] 静的出力にindex.html/ricochet.js/style.css/assetsが揃い、server/src/testsや秘密値を含まないことを検証する配布テストを追加。
- [ ] Cloudflare用出力、Render設定、Nodeバージョン指定、OriginとWS URLの設定例、GitHubテストを実装。
- [ ] DEPLOY.mdにGitHub登録→Renderサーバー作成→Cloudflare Pages配信→WSS/Origin設定→実機2人接続の手順を記載。サーバー再起動で部屋消失する初版制限を明記。
- [ ] 全テスト・ビルドを実行し、独立コードレビューで幾何・サーバー判定・切断・ピンク視点・公開設定を確認。指摘は修正後に該当テストを再実行。
- [ ] ZIPを作成し、新規展開先でCPU戦とサーバーを起動して検証。元ZIPハッシュが変わっていないことを確認。
- [ ] ソース・起動手順・変更ファイル・完成/未完成・全テスト結果を同梱。人間のバランス評価、スマホ実機、実サービスへの公開検証が未実施なら明記。

## 自己レビュー

設計書の全5章をTask 1〜5へ対応させた。幾何と射撃の共通API、サーバー共通試合、部屋、オンライン表示、公開出力の依存順を確認した。Review Focusの5項目は該当タスクの検証に含めた。

## 実行方式の提案

このチャットで主担当が順番に実装する方式を推奨する。既存Gameの共通判定を段階的に切り出すため、ゴール・射撃・オンラインで同じファイルを扱う。別担当へ分けるより変更の整合を保ちやすい。
ユーザーが別担当方式を選択した場合は、承認された計画のタスク単位で委任・レビューする。
