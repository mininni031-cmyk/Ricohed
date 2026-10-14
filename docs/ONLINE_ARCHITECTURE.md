# オンライン対戦を見据えた構成（v2.6）

v2.6には、まだ**通信・サーバーはありません**。この文書は、サーバーが権威を持つ方式（server-authoritative）へ移るときに、そのまま使える部分と、残っている作業をまとめたものです。

## 1. 層の分け方
```
┌──────── シミュレーション（純粋なロジック：DOM・WebGL・Audioに依存しない）────────┐
│ config.js   全パラメータ                                                        │
│ gravity.js  ArenaGravitySystem  … 回転角・up・座標変換・フェーズ                │
│ goals.js    GoalSystem          … 8つの口・有効な2口                            │
│ athlete.js  Athlete             … カプセルの移動・ジャンプ・ウォールキック・     │
│                                   ハーフライン                                  │
│ physics.js  DiscPhysics         … サブステップ・反射・セーブ・ゴール            │
│ catch.js    evalCatch           … スイープ判定と失敗理由                        │
│ cpu.js      CPUController       … 知覚の遅れ付きの意思決定（正準座標）          │
│ keeper.js   Goalkeeper の判定部  … 時間だけで決まる位置・カプセル判定           │
│ events.js   EventBus / EVENTS                                                    │
│ rng.js      Rng（Park–Miller、シード付き）                                       │
└──────────────────────────────────────────────────────────────────────────────────┘
            ▲ 入力（移動・視点・ボタン）            │ イベント・状態
            │                                      ▼
┌──────── 表示・入出力（クライアントだけ）────────────────────────────────────────┐
│ game.js（進行と配線） arena.js crowd.js character.js arms.js fx.js ui.js        │
│ audio.js input.js                                                                │
└──────────────────────────────────────────────────────────────────────────────────┘
```
- シミュレーションは**固定ステップ1/120秒**で進めます。テストモード（`?test=1`）では、外から `game.step()` を呼んだときだけ進みます。この仕組みは、そのままサーバーのtickになります。
- 描画の結果（骨格の位置など）を、シミュレーションが読むことはありません。v2.6で残っていた2か所も取り除きました。
  - CPUが持つディスクの位置は、論理的な手の位置で決めます。
  - キャッチの吸い込みタイマーは、シミュレーション時間で進めます。
- 乱数は、シード付きの `Rng`（CPUの判断と空中シュートのブレ）だけを使います。

## 2. イベント（`EVENTS`）
指示書の名前のとおりです。サーバーからクライアントへ、そのまま送れる形にしています。

| イベント | 中身 |
|---|---|
| MATCH_STARTED | — |
| DISC_THROWN | who, speed |
| DISC_CAUGHT | who, rescued, airborne |
| DISC_BOUNCED | count, surface, rim |
| WALL_KICK_USED | who, wall |
| GOAL_SCORED | team（得点したチーム）, goalTeam, value, bounces, own, mouth |
| GOAL_SAVED | team, part |
| GRAVITY_SHIFT_WARNING / COUNT / STARTED / COMPLETED | in / sec / k / k |
| PLAYER_WARPED | who |
| MATCH_FINISHED | cyan, pink |

UI（モーショングラフィックス）・音・観客は、このイベントを受け取るだけです（`game.wirePresentation()`）。

## 3. 状態（snapshot）
次のものに `snapshot()` があります。
- `gravity`：k, clock, phase, phaseT, angle
- `disc`：state, owner, pos, vel, bounces, …
- `athlete`：pos, vel, grounded, airJumps, wallKicks, holding
- `game.snapshot()`：上の内容に、スコアと残り時間をまとめたもの

キーパーの位置は試合時間だけで決まるので、送る必要はありません。

## 4. サーバーが権威を持つ方式への移行手順（案）
1. **Matchクラスを分ける**：`game.js` から「シミュレーションだけ」の部分（step、stepPlayer、stepCPU、stepDisc、キャッチ、得点）を `match.js` に移します。表示に関わる呼び出し（パーティクル・カメラ・腕のアニメーション）は、すべてイベント経由にします。**これが最初の作業です**（今は `game.js` にまだ混ざっています）。
2. **入力メッセージ**：`{tick, move:[x,y], yaw, pitch, buttons:{jump,dash,catch,shoot}}`。サーバーはtickごとに入力を当てはめます。
3. **クライアント予測**：自分の Athlete だけ、ローカルで同じ `step()` を進めて予測します。サーバーの状態が届いたら、そのtickから巻き戻して入力をやり直します（`athlete.js` は純粋なロジックなので、そのまま使えます）。
4. **補間**：相手・ディスクは、100 ms程度遅らせて補間表示します。重力の角度は `clock` から計算できるので、送るのは `clock` だけで足ります。
5. **キャッチのラグ補償**：サーバーは、ディスクの軌跡を数tick分（約150 ms）保存しておきます。キャッチの入力に付いているtickまで巻き戻し、`evalCatch` の線分判定を行います。0.25秒の遅押し猶予（rescue）があるので、補償は小さくて済みます。
6. **乱数**：試合ごとのシードはサーバーが配ります。ブレの結果（ショットの方向）はサーバーが決めて、`DISC_THROWN` で送ります。

## 5. 決定性について（正直な評価）
- 同じブラウザで、同じ入力とシードなら、同じ結果になります（テストはこの性質を利用しています）。
- 別のエンジン同士（ChromeとSafariなど）で、`Math.sin` などの結果がビット単位で一致する保証はありません。そのため、**ロックステップ方式ではなく、サーバーが権威を持つ方式**を前提にしています。
