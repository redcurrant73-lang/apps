# exam-prep(学習ドリル)開発仕様

AI 出題の一問一答ドリル。**複数の業種(クイズ)を1つのアプリで扱う**。
どのユーザーがどの業種かは superuser が割り当てる。Nuxt + Cloud Run + サーバーAPI 経由 Firestore。

## 新しいクイズ(学習アプリ)の作り方 ★重要

`server/utils/exam-prep/config.ts` の `QUIZZES` 配列に `Quiz` を1つ足すだけ。必要なのは4つ:

1. `title` … タイトル(表示名)
2. `occupation` … 出題する業種(誰向けか。AIプロンプトにも入る)
3. `categories` … カテゴリ(`{id,title,topics?}`。topics は任意で出題の幅が広がる)
4. `prompt` … 個別のプロンプト(`{persona, rules[], version}`)

`examDate`(任意)があればカウントダウン表示。`icon` は Material Symbols 名。
→ ハードコードで1種類に固定していない。レジストリに追加するだけで増える。

## 出題プロンプトの調整

- 共通の土台(`ai.ts` の generateQuestionsBatch)に、各クイズの `prompt.persona` / `prompt.rules` を差し込む。
- 質を調整したいときは該当クイズの `prompt.rules` を編集 → **`prompt.version` を +1**。
  生成問題は `promptVersion` でタグされ、現行版と違うものは出題に使われない(古い問題が自動で引退・作り直し)。
- 専用の「問題編集画面」は持たない。superouser はプレイして粒度を確認し、調整は Claude Code に依頼してプロンプトを直す運用。

## 出題の網羅性(カバレッジ)★ 重要

国家試験など「出題範囲を全部カバーできるか」が重要な試験では、次の段構えで網羅する:

1. **クイズ定義が網羅の前提** — `categories` と各カテゴリの `topics` を、その試験の出題基準に沿って漏れなく定義する。
   ここに無いトピックは絶対に出題されない。**新しい試験クイズを作るときの最重要ポイント**(網羅の責任はクイズ定義側)。
2. **未出題トピックを最優先で埋めるサンプリング** — `session/start` はトピック単位の正解数で重み付けし、
   未出題(0問正解)のトピックを最も重くする(`topicWeight`)。続けるほど全トピックがまんべんなく出題される。
   集中セッション(カテゴリ指定)でも同じ重みで、そのカテゴリ内の未出題トピックから埋まる。
3. AI プロンプトの共通ルールに「そのトピックで実際に問われやすい代表的論点を選ぶ。試験範囲を網羅する土台に」を入れている。

注意:`topics` を細かくするほど網羅は丁寧になるが、1トピックあたりの出題機会は減る。試験範囲に対して適切な粒度で。
将来:カバレッジ率(出題済みトピック / 全トピック)をユーザーに可視化する余地あり。

## 公開モード / 割り当て

| 項目 | 値 |
|---|---|
| audience | shared |
| dataScope | per-user(問題プールのみ全員共通)|
| visibility | assignable(招待制。superuser は自動表示。owner は permissions.ts の OWNER_VISIBLE_APPS で例外的に表示)|
| requiredApis | gemini |

- アクセス権(アプリを開けるか)= 設定→アクセス権(`appAccess`)。
- **学習内容(role)の割り当て**:各クイズ id が role。superuser がアプリ内 `/apps/exam-prep/admin` で各ユーザーに **複数** 付与(`apps/exam-prep/users/{uid}.roles: string[]`)。
  superuser は全 role を持つ扱い。未割り当て(roles 空・非superuser)は noContent(出題不可、案内表示)。
- `currentQuizId` = いま学習中のクイズ(roles のいずれか)。本人/superuser が `/switch` で切替(進行中セッションはクリア・レベルは保持)。getMe が roles から解決して永続化。

## データ配置(Firestore)

- `apps/exam-prep/users/{uid}` … `roles[] / currentQuizId / level / totalCorrect / totalAnswers / visibleToPeers / displayName / currentSession`
- `apps/exam-prep/users/{uid}/progress/{auto}` … `{ questionId, isCorrect, userAnswer, attempts, categoryId, topic, answeredAt }`(append-only)
- `apps/exam-prep/questions/{auto}` … 問題プール。`{ ..., quizId, categoryId, topic, promptVersion, source, createdAt }`

`totalCorrect/totalAnswers` は runTransaction + increment(`applyAnswerTxn`)。`level` はセッションだけが書く。

## エンドポイント(requireAppAccess。admin/* は requireSuperuser)

| メソッド | パス | 役割 |
|---|---|---|
| GET | `/me` | 割り当てクイズ+カテゴリ別達成率+streak+7日+カウントダウン+進行中セッション |
| POST | `/profile` | 表示名・ランキング表示のみ |
| POST | `/switch` | 学習中の内容を切替(自分の role 内 or superuser)。`{quizId}`。セッションはクリア |
| POST | `/session/start` | 最初の数問(FIRST_BATCH=4)だけ用意して即開始、残りは pending。`{categoryId}` で集中。トピック未出題優先 |
| POST | `/session/topup` | pending を生成してセッションに追加(クライアントが開始直後に背景で呼ぶ)|
| POST | `/session/answer` | choice 完全一致 / free は AI 採点。progress + カウンタ |
| POST | `/session/end` | 総回答数でレベル ±1。セッションクリア |
| GET | `/peers` | ランキング(visibleToPeers=true)|
| GET | `/admin/users` | (superuser)全ユーザーの roles 割り当て + クイズ一覧 |
| POST | `/admin/assign` | (superuser)`{uid, roles[]}` 学習内容(role)を複数割り当て |
| POST | `/admin/delete-question` | (superuser)出題中の1問を削除+セッションから除外 |
| POST | `/admin/reset-questions` | (superuser)その学習内容の問題を全削除(作り直し)|

## AI(`ai.ts` / コスト注意)

- `generateQuestionsBatch({quiz, targets, freeCount})`:必ずバッチ。末尾 freeCount 問は記述式。
  options4つ・answer 含有を検証。生成問題は pool に保存して再利用。1セッション ≒ $0.001。
- `gradeAnswerByAI`:free の採点(quiz.title を aiSubject に)。表記ゆれ・言い換えを正解扱い。失敗時は正規化一致。

## UI

- `index.vue`:ホーム/セッション/サマリ。未割り当ては案内表示。**複数 role があれば学習内容ピッカー(select)**。カウントダウン/レベル・習得率・連続学習/7日/10問チャレンジ/カテゴリ別レーダー+バー(集中)/ランキング/**管理者メニュー(amber枠・superuser のみ:割り当て・問題リセット)**。出題中の「管理者:削除」も superuser のみ。
- `admin.vue`:(superuser)ユーザー→学習内容(role)を **チェックボックスで複数割り当て**。
- 左上に `v.{short_sha}`(deploy で `NUXT_PUBLIC_GIT_SHA`)。

## 実装状況

Phase1〜3 相当(10問/不正解リトライ/解説/サマリ/再開/レーダー・集中/streak/レベル演出/記述AI採点/弱点優先)を、
**複数業種(クイズ)対応 + superuser 割り当て + 業種別プロンプト** に再構成済み。

## 将来メモ

- 集計は progress を都度読む。増えたら groupStats 事前集計へ。
- プール検索は quizId 単一等価 + JS で promptVersion 絞り(複合インデックス回避)。
- 旧 promptVersion の問題は使われないだけで残る。気になればクリーンアップ用 batch delete を足す。
