# テスト結果（v2.6）

- 実行日：2026-10-14
- 環境：Playwright 1.56 と Chromium（ヘッドレス、SwiftShaderによるソフトウェアWebGL）。PC表示（960×540）と、スマホ横画面のエミュレーション（844×390・タッチあり）
- 方法：`python3 tests/run_tests.py`。`?test=1` で開くと、テストからシミュレーションを1/120秒ずつ進められます。そのため、マシンの速度に左右されない決定的なテストです。キー・マウス・タッチ・ボタンは、実際のDOMイベントで操作しています。
- テストはv2.6の仕様に合わせて作り直しました（v2.5.2の39項目とは対応していません。[TODO](TODO.md)を参照）。

## 結果：**31 / 31 合格**

| # | テスト | 結果 |
|---|---|---|
| 01 | 起動時にエラーがない・Three.jsを同梱（外部への通信0） | ✅ 合格 |
| 02 | 開始ボタン → カウントダウン → MATCH_STARTED → チームバナー | ✅ 合格 |
| 03 | ポーズ／再開。ポーズ中は試合時計と重力の時計が止まる | ✅ 合格 |
| 04 | WASD移動・マウス視点 | ✅ 合格 |
| 05 | ディスクの速度16 m/s | ✅ 合格 |
| 06 | キャッチのルール：3.0 m・70°・近づくディスクのみ・受付0.8秒・猶予0.25秒・クールダウン0.5秒 | ✅ 合格 |
| 07 | 実キーでの地上キャッチ（DISC_CAUGHT・吸い込み・CATCH!） | ✅ 合格 |
| 08 | スイープ判定（両端が範囲外でも、線分が2 mの距離を通れば取れる） | ✅ 合格 |
| 09 | 早押し：0.2秒前 → 取れる／0.35秒前 → 取れない | ✅ 合格 |
| 10 | 遅押し：0.15秒後 → 取れる（LATE SAVE）／0.4秒後 → 取れない | ✅ 合格 |
| 11 | 受付0.8秒・空振り後のクールダウン0.5秒・クールダウン中は押しても受付が開かない | ✅ 合格 |
| 12 | パネル越しは取れない。CPUは別のパラメータ | ✅ 合格 |
| 13 | 空中キャッチも同じルール | ✅ 合格 |
| 14 | デバッグ表示に失敗の理由が出る | ✅ 合格 |
| 15 | 二段ジャンプ・ウォールキック・1回の滞空で空中アクション1回・回転後の重力でもキック | ✅ 合格 |
| 16 | 30秒ごと：予告2秒・6秒で90°・安定1秒・重力の強さが一定・角度は単調 | ✅ 合格 |
| 17 | 回転後、右の壁が床になる（プレイヤー・ディスク）。ジャンプは新しい「上」へ | ✅ 合格 |
| 18 | 回転中も操作できる。カメラが急に飛ばない・値が壊れない・部屋の外に出ない | ✅ 合格 |
| 19 | パネルの見た目＝当たり判定（位置・角度・大きさ・反射する位置） | ✅ 合格 |
| 20 | 4つの向きすべてで：CYANは左・PINKは右・床から2.0 m・有効でない口は得点にならない・キーパーも移動 | ✅ 合格 |
| 21 | 回転中は前のゴールが有効、回転が終わると新しいゴールへ | ✅ 合格 |
| 22 | キーパー：左右だけ動く・ディスクを追わない・関節が当たり判定の中に入る・上半分を約3割カバー | ✅ 合格 |
| 23 | 1点・2点・3点 | ✅ 合格 |
| 24 | ハーフラインで止まる。回転後は自陣へワープ | ✅ 合格 |
| 25 | モーションUI（全種類）・1スロットに1つ・Enterで飛ばせる・モーション軽減 | ✅ 合格 |
| 26 | クロスヘアの緑表示＝実際のキャッチ判定 | ✅ 合格 |
| 27 | 3分間のCPU戦（シフト5回・両者がシュート・キャッチ・得点・結果画面・体が壁に食い込まない） | ✅ 合格 |
| 28 | 描画負荷（最後のパスの描画呼び出し数） | ✅ 合格 |
| 29 | デスクトップのセッション全体でJavaScriptエラーなし | ✅ 合格 |
| 30 | スマホ横画面：タッチ操作一式・キャッチ可能時に光る・タップで演出を飛ばす・ポーズ | ✅ 合格 |
| 31 | file:// で起動できる（サーバーなし） | ✅ 合格 |

## 主な計測値

- **#05** `{"state": "FLYING", "speed": 16, "cfg": 16}`
- **#11** `{"window0": 0.79, "windowSteps": 96, "cooldown": 0.5, "pressDuringCd": "cooldown", "windowDuringCd": -0.008333333333332948, "cooldownSteps": 59}`
- **#16** `{"evs": [{"t": 28.01, "type": "GRAVITY_SHIFT_WARNING", "in": 1.9916666666676157}, {"t": 30.01, "type": "GRAVITY_SHIFT_STARTED", "k": 0}, {"t": 36.01, "type": "GRAVITY_SHIFT_COMPLETED", "k": 1}, {"t": 58.01, "type": "GRAVITY_SHIFT_WARNING", "in": 1.9916666666693175}, {"t": 60.01, "type": "GRAVITY_SHIFT_STARTED", "k": 1}, {"t": 66.01, "type": "GRAVITY_SHIFT_COMPLETED", "k": 2}, {"t": 88, "type": "GRAVITY_SHIFT_WARNING", "in": 1.999999999983899}, {"t": 90, "type": "GRAVITY_SHIFT_STARTED", "k": 2}], "counts": [{"t": 28.01, "type": "GRAVITY_SHIFT_COUNT", "sec": 2}, {"t": 29.01, "type": "GRAVITY_SHI`
- **#17** `{"k": 1, "phase": "stable", "up": [-1, 0, 0], "grounded": true, "face": "px", "feetHeight": 0, "discState": "LOOSE", "discHeight": 0.38, "jumpAlongUp": 10.87, "jumpSide": 0, "landedFace": "px"}`
- **#18** `{"moved": 8.16, "dz": 8.16, "camMaxDegPerStep": 0, "nan": false, "camOutside": 0, "groundedFramesDuringTurn": 598}`
- **#22** `{"lateralOnlyMaxOffAxis": 0, "zRange": [-0.9, 0.9], "notTracking": true, "joints": {"handL": {"hit": "armL", "outside": false}, "handR": {"hit": "armR", "outside": false}, "head": {"hit": "head", "outside": false}, "footL": {"hit": "legL", "outside": false}, "footR": {"hit": "legR", "outside": false}, "spine": {"hit": "body", "outside": false}}, "coverUpper": 0.32, "coverLower": 0.41, "keeperZ": 0.9, "reachTop": 2.37, "scale": 1.25}`
- **#23** `{"direct": {"value": 1, "bounces": [], "score": 1}, "one": {"value": 2, "bounces": ["pz"], "score": 2}, "two": {"value": 3, "bounces": ["pz", "nz"], "score": 3}}`
- **#27** `{"state": "ended", "seconds": 202.94, "score": {"cyan": 5, "pink": 9}, "shifts": 5, "k": 5, "playerShots": 34, "catches": 15, "cpuShots": 32, "cpuGoals": 6, "goals": 5, "wallKicks": 0, "warps": 5, "nan": 0, "outside": 0, "capsuleMaxPenetration": 0, "worst": null, "discOutside": 0, "cpuHalfGap": 0.49, "events": {"DISC_THROWN": 66, "DISC_BOUNCED": 35, "GOAL_SCORED": 11, "GOAL_SAVED": 19, "DISC_CAUGHT": 34, "GRAVITY_SHIFT_WARNING": 5, "GRAVITY_SHIFT_COUNT": 10, "GRAVITY_SHIFT_STARTED": 5, "GRAVITY_SHIFT_COMPLETED": 5, "PLAYER_WARPED": 5, "MATCH_FINISHED": 1}, "result": "shown"}`
- **#28** `{"calls": 71, "triangles": 8302}`

## 実機・人による確認がまだのもの
- 実機（GPU）でのフレームレート、回転中の酔い、タッチ操作の感触、音の聞こえ方は**未確認**です（[TODO](TODO.md)）。

## 全テストの詳細

`tests/results.json` を参照してください。
