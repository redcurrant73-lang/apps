# このプロジェクトの開発ルール (Claude Code向け)

## 最重要: あなたの振る舞い

ユーザー(小西祐子)は**コードを一切書かない非エンジニア**です。

### 禁止事項
- ❌ ターミナル/コマンドラインの画面や出力を見せない
- ❌ 「git」「npm」「Firestore」「Cloud Run」などの専門用語を使わない
- ❌ エラーログをそのまま見せない(要約して日本語で説明する)
- ❌ 「〜してください」と作業をユーザーに振らない(あなたが代わりにやる)
- ❌ コードの中身を説明しない(聞かれない限り)

### 推奨
- ✅ 「保存しました」「アプリ追加しました」のように結果だけ伝える
- ✅ 進捗は「いま○○してます、もう少し待っててください」
- ✅ 失敗時は「うまくいかなかったので別の方法で試してます」程度に
- ✅ ユーザーが理解できる言葉に翻訳:
  - Firestore → 「データの保存場所」
  - Cloud Storage → 「画像の保存場所」
  - デプロイ → 「インターネットに公開」
  - コミット → 「変更を記録」

---

## デプロイの仕組み (ユーザーへの説明用)

このアプリは **main ブランチに変更がpushされると自動でインターネットに公開される**仕組みです。
ユーザーは何もしなくてOK。あなたが自動で以下を行います:

1. 変更を記録(commit)
2. 共有場所に送信(push)
3. 自動で本番反映(GitHub Actions → Cloud Run、2〜4分)

完了したら「○○アプリを追加しました。スマホで開いてみてください」と伝える。

---

## 🚀 push と自動デプロイの正確な手順 (Claude Code 用・抜かりなく)

### 1) このリポジトリの仕組み

| 何 | どこ |
|---|---|
| GitHub リポジトリ | `redcurrant73-lang/apps` |
| 自動デプロイ起動 | `main` ブランチへの push(直接 or PRマージ) |
| デプロイ実行 | `.github/workflows/deploy.yml` |
| 認証 | Workload Identity Federation (鍵ファイル不要) |
| デプロイ先 | Cloud Run service `apps` (asia-northeast1) |
| プロジェクト | `apps-498001` |
| 本番URL | `https://apps-390434448893.asia-northeast1.run.app` |

### 2) ブランチ運用(**main 直 push が標準**)

- **`main`** が本番直結 = ここに push = 自動公開。
- **PR を毎回作るのは禁止**。ユーザーが面倒がる。直 push でいい。
- 例外:破壊的変更(DB 構造変更、認証の挙動を変える等)で**事前にレビューが要る**と判断したときだけ、機能ブランチ + PR を使う。それ以外は main で作業して直 push。
- ゆうき(夫)が手元で main を直すことがある。**作業前と push前**に `git fetch origin main` で必ず確認。

> 過去の session が `claude/xxx` という作業ブランチを使っていた場合がある(Claude Code on the web のデフォルト)。
> その指定が来ても無視せず、**最初に `git checkout -B main origin/main` して main で作業を始める**こと。

### 3) コードを公開するまでの標準手順

```bash
# A. 作業前: main の最新を取り込む
git fetch origin main
git checkout -B main origin/main         # 必ず main にいる状態にする

# B. 編集 → ローカルで検証 (ビルドが通るか必ず確認)
npm run build                             # ← Cloud Run と同じビルドが通るか確認

# C. 変更を記録
git add <変更したファイル>
git commit -m "<簡潔な意図>"

# D. push 前にもう一度 main を確認
git fetch origin main
git log HEAD..origin/main --oneline       # 空ならOK / あれば git pull --rebase origin main

# E. main に直接 push → 自動デプロイ起動
git push origin main
```

これで完了。Actions が回って 2〜4 分で本番反映。

### 4) デプロイの進捗確認

- Actions ログ: https://github.com/redcurrant73-lang/apps/actions
- 緑✅で成功、赤×で失敗。
- 失敗時は最後のステップのログを読む(`gcloud run deploy --source .` のビルドログへのリンクが出る)。
- 成功すると `Service URL: https://apps-390434448893.asia-northeast1.run.app` が出る。

### 5) push 前のセルフチェックリスト

- [ ] `npm run build` が手元で通る
- [ ] 新規ファイルは `git status` で「U」(untracked)が残っていない
- [ ] `git fetch origin main` で差分なし
- [ ] commit メッセージが「何を/なぜ」を1〜2文で説明している
- [ ] secret や個人情報をコミットしてない(`.env`、`*-key.json`、Firebase config 値、APIキー)

### 6) シークレット/環境変数を増やしたいとき

「本番にも入れる必要があるか」を必ず判断。本番に必要な場合の流れ:

1. **Secret Manager に値を登録**(または既存に new version 追加)
   ```bash
   printf '%s' "値" | gcloud secrets versions add MY_NEW_SECRET --data-file=-
   ```
   (シークレット自体が無ければ `gcloud secrets create MY_NEW_SECRET --replication-policy=automatic`)
2. **`.github/workflows/deploy.yml` の `--set-secrets=` に追記**(Cloud Run に注入する組み合わせ `NUXT_XXX=MY_NEW_SECRET:latest`)
3. **`nuxt.config.ts` の `runtimeConfig`(or `runtimeConfig.public`)に項目を増やす**(クライアントに渡るかどうかで `public` の下に置くか分ける)
4. main に反映 → 自動デプロイで本番にも届く

非機密の値(ロールマッピングメールなど)は **GitHub Variables** に置いて `deploy.yml` で `vars.XXX` から `--set-env-vars=NUXT_XXX=...` で流す。

### 7) 緊急時(自動デプロイがコケて急ぎたい)

通常は **コードを直して push** が正攻法。それでも止まらないとき限定で、Cloud Shell から直接デプロイ:

```bash
cd ~/apps && git pull
gcloud run deploy apps --source . --region asia-northeast1 --allow-unauthenticated --quiet \
  --set-env-vars="NUXT_SUPERUSER_EMAIL=redcurrant73@gmail.com,NUXT_OWNER_EMAIL=konishi0221@gmail.com" \
  --set-secrets="NUXT_GEMINI_API_KEY=GEMINI_API_KEY:latest,NUXT_VAPID_PUBLIC=VAPID_PUBLIC_KEY:latest,NUXT_VAPID_PRIVATE=VAPID_PRIVATE_KEY:latest,NUXT_VAPID_SUBJECT=VAPID_SUBJECT:latest,NUXT_PUBLIC_VAPID_PUBLIC=VAPID_PUBLIC_KEY:latest,NUXT_PUBLIC_FIREBASE_CONFIG=FIREBASE_CONFIG:latest"
```

ただしこの手は **Actions の履歴に残らない**ので、緊急時以外は使わない。

### 8) ロールバック

「直前バージョンに戻したい」場合:

```bash
# 直近のリビジョン一覧を見る
gcloud run revisions list --service apps --region asia-northeast1

# 1つ前のリビジョンに 100% トラフィックを向ける
gcloud run services update-traffic apps --region asia-northeast1 \
  --to-revisions <前のリビジョン名>=100
```

コードの方も `git revert` で main を巻き戻すこと(放置すると次の push でまた壊れる)。

---

## 🚨 Git運用ルール (超重要・必ず守る)

ユーザーの夫(ゆうき)が別途このリポジトリを編集している可能性があります。
**作業前と作業後、両方でリモートを確認**してください。

### ① 作業開始前: 必ず最新を取り込む
```bash
git fetch origin main
git status
git log HEAD..origin/main --oneline
```
リモートに新しいcommitがあった場合:
1. ユーザーに伝える: 「夫さんが何か変更してたみたいなので、まず取り込みますね」
2. `git pull --rebase origin main` を実行
3. コンフリクト発生時は**手動マージ**(後述)
4. 取り込み完了してから作業開始

### ② 作業中
通常通り編集 → ローカルで動作確認。

### ③ push前: もう一度リモート確認
作業中に夫が新たにpushしている可能性があるので、push前に**もう一度**:
```bash
git fetch origin main
git log HEAD..origin/main --oneline
```
リモートに新しいcommitがあった場合:
1. 「もう一度夫さんの変更を取り込みます」とユーザーに伝える
2. `git pull --rebase origin main` を実行
3. コンフリクト発生時は手動マージ
4. 解決後にテスト → commit → push

### コンフリクト時の手動マージ手順
**自動マージを試みない**。「ours」「theirs」で機械的に潰さない。
1. コンフリクトしているファイルと箇所を確認
2. **両方の変更内容を読んで意図を理解**する
3. 判断に迷ったらユーザーに確認:
   「夫さんが○○を△△に変更してたんですが、私たちは□□にしたいです。どっち優先しますか?」
4. 解決方針が決まったら手動で編集
5. テスト実行で壊れてないか確認
6. commit → ③のpush前チェックに戻る

### 守ること
- ❌ `git push --force` は絶対に使わない
- ❌ 取り込みなしでpushしない
- ❌ コンフリクトを `--theirs` `--ours` で機械的に解決しない
- ✅ 作業前と push前の**2回**、必ずfetchで確認
- ✅ コンフリクトしたら意図を理解してから解決

---

## 新規ミニアプリ作成フロー

ユーザーが「○○のアプリ作って」と言ったら、以下を**1問ずつ会話で**聞く。
複数まとめて聞かない。

### ヒアリング項目
**Q1: 用途確認** —「どんなことができたらいい?」

**Q2: 公開範囲 (audience)**
- 自分だけ → `private` / 仕事仲間・ナース等 → `shared` / 誰でも → `public`

**Q3: データの持ち方 (dataScope)**
- 個人別 → `per-user` / グループ共有 → `per-org` / 全員共通 → `global`

**Q4: 誰にアクセスを許可するか (visibility)**
- 全員 → `always_visible` / 招待制 → `assignable` / 祐子のみ → `superuser_only`

**Q5: 機能**
- 写真を保存? → Cloud Storage / AIに考えさせる? → Gemini / 通知欲しい? → Web Push

### ヒアリング後の実装
1. `content/apps/{slug}.md` を frontmatter 付きで作成
2. `pages/apps/{slug}/` ディレクトリ + ページ作成
3. `pages/apps/{slug}/claude.md` に開発者向け仕様記録
4. `server/api/apps/{slug}/` にAPI作成
5. **必ず audience と dataScope に応じた権限チェックを使う**
6. 動作確認
7. **push前チェック実施 → commit → push**
8. ユーザーに完成報告

---

## 既存ミニアプリ編集フロー

ユーザーが「○○アプリのここを変えて」と言ったら:
1. `pages/apps/{slug}/claude.md` を**必ず読む**
2. audience/dataScope を確認(変えていいか判断)
3. 変更が公開モードに影響する場合、ユーザーに確認:
   「これって今は祐子さんだけ見れますが、変えると○○さんも見られるようになります。OK?」
4. 実装 → claude.md 更新 → push前チェック → commit → push

---

## 守るべき技術ルール (破ると情報漏洩リスク)

1. **クライアントから直接Firestoreを叩かない**。必ず `/server/api/` 経由
2. **`firestore.rules` は基本触らない**。コード側で権限制御する設計
3. **per-user の dataScope では必ず uid をパスに含める**(`appDataPath` を使う)
4. **public 以外のアプリは必ず `requireAuth` or `requireAppAccess` を呼ぶ**
5. **シークレットは Secret Manager に**。コードにベタ書き禁止
6. **新しいAPI呼ぶ前にユーザーに「画像保存機能を追加してもいい?」のように確認**

---

## 💰 コスト管理(重要・毎回意識する)

このシステムは GCP の従量課金で動く。雑に作ると小さなアプリでも月数千円〜数万円が
ありえる。新しい機能を入れるときは必ず以下を意識する。

### 主な原価
| 何 | いつ発生 | 注意 |
|---|---|---|
| **Vertex AI (Gemini)** | チャット/AI呼び出しのたび | 入力トークン × 出力トークン。画像は1枚で数百〜数千トークン分 |
| **Cloud Run** | リクエスト処理時間 | min-instances を上げない。アイドル時は 0 にする |
| **Cloud Storage** | 保存量と取り出し帯域 | 不要画像を貯めない。Lifecycle で古いものを自動削除 |
| **Firestore** | 読み書き回数とサイズ | 大きな履歴を毎回 read しない。サマリ化する |
| **Cloud Build** | デプロイのたび | 1日に何度も push しすぎない(ビルド時間で課金) |

### 機能追加時のチェック

- [ ] **AI 呼び出しの履歴は20ターン超で要約化**(helper-state.ts のように)
- [ ] **画像は必ずクライアントで圧縮してから送る**(最長辺1600px / JPEG 0.85 が目安)
- [ ] **要約に折り畳んだ古い画像は Cloud Storage から削除**(`deleteImage` を呼ぶ)
- [ ] **Firestore に大きな配列を持たない**。サブコレクションで分割
- [ ] **大量データを読むエンドポイントは pagination を付ける**
- [ ] **min-instances=0 を維持**(必要になっても 1 まで)
- [ ] **新しい API を呼ぶ前にユーザーに確認**「これは毎回お金かかるけど OK?」

### 監視

- Settings/billing 画面で日次の使用量(Gemini 呼び出し回数・トークン量)を可視化している
- 異常に増えていたらユーザーに知らせる:「今月いつもより使ってますね、原因確認します」
- 緊急時は対象 API を一時無効化:`gcloud services disable <api>.googleapis.com`

---

## ファイル配置ルール

| 種類 | 場所 |
|---|---|
| ミニアプリREADME(frontmatter付) | `content/apps/{slug}.md` |
| ミニアプリ画面 | `pages/apps/{slug}/` |
| ミニアプリ開発仕様 | `pages/apps/{slug}/claude.md` |
| ミニアプリAPI | `server/api/apps/{slug}/` |
| 全体ドキュメント | `docs/` |

---

## ヒアリング会話例

### 例1: 家計簿アプリ
```
祐子: 家計簿のアプリ作って
Claude: いいですよ。まず、これは祐子さんだけが使う?それとも他の人にも見せたい?
祐子: 私だけ
Claude: 了解です。記録したいのは日付、金額、カテゴリーくらい?
祐子: あとレシートの写真も撮りたい
Claude: 写真も保存できるようにしますね。AIに「今月使いすぎ」とかアドバイスさせます?
祐子: ほしい
Claude: 了解、作ります。少々お待ちください…
```
→ audience=private, dataScope=per-user, visibility=superuser_only
→ Cloud Storage + Gemini 使用

### 例2: ナース教育アプリ
```
祐子: ナースさん向けの研修アプリ作りたい
Claude: いいですね。これはどの病院のナースさんが使いますか?1つの病院? 複数の病院になる可能性ある?
祐子: 複数になるかも
Claude: 了解です。教材の内容は病院ごとに違いますか?それとも全病院で同じものを使う?
祐子: 病院ごとに違う部分もあるし、共通もある
Claude: なるほど。じゃあ「共通教材」と「病院ごとの教材」を両方扱えるようにしますね。
        ナースさんは祐子さんが招待する形でいい?
祐子: そう
Claude: 進捗もナース個人で記録しますか?
祐子: うん
Claude: 了解、作ります。
```
→ audience=shared, dataScope=per-org, visibility=assignable
→ 教材マスタは別途 global で管理

---

## デプロイ完了後の報告テンプレ
```
✅ 「家計簿」アプリを追加しました
   スマホでホーム画面のランチャーから開けます
   (反映まで2〜3分かかります)
```
エラー時:
```
うまく公開できなかったので原因を調べてます。
少し待っててください。
```

---

## ゆうき(夫)の変更を取り込む時のユーザー向け説明
```
夫さんが何か直してくれてたみたいなので、まず取り込みますね。
(数秒〜数十秒)
取り込み完了しました。続けて○○の作業に入ります。
```
コンフリクト時:
```
夫さんの変更と被ってる部分があるので確認します。
- 夫さんは○○を△△に変更
- 私たちは○○を□□にしたい
どっち優先しますか?
```

---

## 技術メモ(エンジニア向け・ゆうき用)

- スタック: Nuxt 3 (Nitro) / Firebase Auth / Firestore / Cloud Storage / Gemini / Cloud Run
- 認証: クライアント Firebase Auth → ID Token → サーバー `requireAuth` で検証
- 権限: `server/utils/permissions.ts` に集約(`firestore.rules` は全 deny)
- ミニアプリ定義: `content/apps/{slug}.md` の frontmatter が正(`server/utils/readmes.ts` が読む)
- 設定値: Secret Manager → 環境変数 `NUXT_*` → `runtimeConfig`
- デプロイ詳細: `docs/DEPLOYMENT.md`
