# GitHub・Cloudflare Pages・Renderで公開する

本番のゲーム画面はCloudflareのricohed Worker（https://ricohed.mininni-games.com/）、対戦判定はRender（https://ricochet-ws.onrender.com）、ソースはGitHub mininni031-cmyk/Ricohedです。ゲームだけのdistをricohedへ公開し、mininni-gamesサイト本体やDANGO・LUMENへアップロードしないでください。以下のPages手順は別の公開先を使う場合の参考です。

## 1. ローカルで確認

CPU戦：ZIPを完全に展開して`START_GAME.cmd`または`index.html`を開きます。ネット接続・Node.jsは不要です。

オンライン開発：Node.js 24を導入して、展開したフォルダーで実行します。

```sh
npm install
npm run build
npm start
```

別のターミナルで`npm run serve`を実行し、`http://localhost:8003`を2つのブラウザーで開きます。対戦サーバーに`ws://localhost:3001/ws`、同じ合言葉（4〜48文字）を入れ、双方で「入室」「準備完了」を押します。

Windowsでは`START_SERVER.cmd`と`START_LOCAL_WEB.cmd`でも起動できます。サーバーを終了すると部屋は消えます。

テストは`npm test`。初回は`npx playwright install chromium`で検証用ブラウザーを導入してください。WindowsのEdgeを使う場合はBROWSER_PATHにEdgeの実行ファイルを指定できます。

## 2. GitHubへソースを登録

展開したプロジェクトの内容を、利用するGitHubリポジトリへ登録します。`node_modules`、`.env`、`.git`、`dist`を追加する必要はありません。リポジトリ直下に`package.json`、`src`、`server`、`render.yaml`が置かれる構成です。

`.github/workflows/test.yml`でビルドと回帰・オンライン・ブラウザーテストを実行します。過去版のテストは履歴として同梱していますが、現在の正式テストはpackage.jsonの`test`です。

## 3. Renderで対戦サーバーを作成

RenderでGitHubリポジトリからWeb Serviceを作ります。Blueprintを利用する場合は同梱`render.yaml`を指定します。

| 設定 | 値 |
|---|---|
| Runtime | Node |
| Node version | 24 |
| Build command | `npm install --omit=dev` |
| Start command | `npm start` |
| Health check | `/health` |
| NODE_ENV | `production` |
| ALLOWED_ORIGINS | 実際のCloudflare公開URL、例 `https://your-game.pages.dev` |

`ALLOWED_ORIGINS`はパスと末尾の`/`を含めません。複数ならカンマで区切ります。利用する独自ドメインも追加してください。CloudflareのプレビューURLを使う場合も、その実際のOriginを明示的に追加します。

PORTはRenderが提供する値を使い、サーバーは0.0.0.0で待受します。公開後、`https://実際のサービス名.onrender.com/health`で`{"ok":true,"version":"2.9.5"}`が返ることを確認します。

ゲーム画面からの接続先は`wss://実際のサービス名.onrender.com/ws`です。サービス名はRenderで発行されたURLを使い、例の名前をそのまま使わないでください。

## 4. Cloudflare Pagesでゲーム画面を公開

同じGitHubリポジトリをCloudflare Pagesへ接続します。

| 設定 | 値 |
|---|---|
| Framework preset | None |
| Build command | `npm run build:site` |
| Build output directory | `dist` |
| PUBLIC_WS_URL | 実際のRender接続先 `wss://…onrender.com/ws` |

Node.js 24を使います。依存導入が自動で実行されない環境ではBuild commandを`npm install && npm run build:site`にします。

ビルド時に`PUBLIC_WS_URL`が静的なonline-config.jsへ反映されます。これは公開される接続先であり、秘密情報を入れません。ゲーム画面からもURLを変更できます。

発行されたPages URLをRenderのALLOWED_ORIGINSに設定して再デプロイします。その後、Pages URLをPCとスマホで開き、同じ合言葉で双方が準備完了にします。

## 5. 公開後の確認

1. タイトル、CPU戦、スマホ操作が正常か。
2. オンラインの入室、相手待ち、双方の準備、cyan/pink視点が正常か。
3. 両端末から射撃・キャッチ・得点が一致するか。
4. 通信を切って試合が停止し、30秒以内の再接続で復帰するか。
5. 新しい合言葉で次の試合を始められるか。

接続できない場合：ゲーム画面はHTTPSなので接続先はWSSを使用します。Renderの/health、サーバーログ、ALLOWED_ORIGINSと公開URLの一致を確認します。初回起動が遅い場合はサービスが起動してから再入室してください。

## 初版の範囲

- 単一Renderインスタンス、部屋はメモリ内です。複数インスタンスへ増やすと同じ部屋を共有できないため、1台で運用してください。
- Renderの再起動・再デプロイで進行中の部屋は失われます。試合中断として再入室します。
- 30秒の再接続トークンは同じページ内で保持します。ページの再読み込みや端末を替えての復帰は対応しません。
- 合言葉は部屋の識別用で、ログイン認証や秘密性の保証ではありません。
- 通信遅延・実機の操作感・実際の公開環境は、公開後に上記手順で確認してください。
- 課金プランはこのZIPで指定していません。Render側で利用するプランを選んでください。

## 公式資料

- https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
- https://developers.cloudflare.com/pages/configuration/git-integration/
- https://render.com/docs/websocket
- https://render.com/docs/web-services

## このサイトの接続先

現在のゲーム： https://mininni-games.com/games/ricochet/
Render： https://ricochet-ws.onrender.com/
公開ゲームのOrigin許可は `https://mininni-games.com` です（/games/ricochet/ は含めません）。Cloudflareサイトに複数ゲームがあるため、更新は games/ricochet/ のファイルのみ置き換えてください。
