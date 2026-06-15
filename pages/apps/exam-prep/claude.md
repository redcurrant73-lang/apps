# exam-prep(学習対策ドリル)開発仕様

別プロジェクトの「学習対策ミニアプリ(Firestore + Firebase Functions 版)」の要件を、
このポータル(Nuxt + Cloud Run + サーバーAPI 経由 Firestore)の流儀に移植したもの。
**ドメイン(試験・研修)は差し替え可能**。現在の中身は「看護師国家試験」。

## 公開モード

| 項目 | 値 | 意味 |
|---|---|---|
| audience | shared | 複数ユーザーで使う(仲間ランキングあり) |
| dataScope | per-user | 進捗・成績は個人別。問題プールのみ全員共通 |
| visibility | assignable | 招待制。設定→アクセス権(superuser のみ操作可)で付与。superuser は自動で見える |
| requiredApis | gemini | AI 出題・AI 採点に Vertex AI Gemini を使う |

`assignable` のまま `audience` を `public` にすると未ログインに開く設計になるが、
本アプリは per-user データを持つので **public にしてはいけない**(必ずログイン必須のまま)。

## データ配置(Firestore)

- `apps/exam-prep/users/{uid}` … 個人プロフィール doc
  - `segment` / `examTarget` / `level` / `totalCorrect` / `totalAnswers` / `visibleToPeers` / `displayName`
  - `currentSession` … 進行中セッション(離脱しても続きから)。`{ queue, correct[], attempts{}, totalAttempts, questions[] }`
- `apps/exam-prep/users/{uid}/progress/{auto}` … 回答履歴(append-only)。`{ questionId, isCorrect, userAnswer, attempts, groupId, genre, answeredAt }`
- `apps/exam-prep/questions/{auto}` … 問題プール(全員共通)。`{ category, difficulty, type, question, options, answer, keywords, explanation, genre, groupId, examLevel, segment, source, seedKey?, createdAt }`

`totalCorrect` / `totalAnswers` は **runTransaction + FieldValue.increment**(`store.applyAnswerTxn`)。
クライアントの read-modify-write は禁止。`level` はセッション処理だけが書く。`progress` / `questions` はクライアント直書きしない。

## ドメイン定義

`server/utils/exam-prep/config.ts` に集約。別の試験へ差し替えるときは原則このファイルと `content/apps/exam-prep.md` の title/icon だけ直す。
- `DOMAIN_CONFIG` … appTitle / examLabel / examDate(ISO)/ aiSubject / segments / examTargetOptions
- `GENRE_GROUPS` … group → genres の2階層。各 group に `segmentRelevance`(空=全種別共通)と `examLevel`
- フィルタ `relevantGroups` / `genreTargets`:examLevel 一致 かつ(segmentRelevance 空 or ユーザー segment を含む)group のみ
  → **種別違いの問題が混ざらないこと**を担保(外来ユーザーに ICU クリティカルケアを出さない、等)
- `groupGoal` … レーダー/バー達成率の分母。`computeStreak` / `last7Days` … 連続学習日数と7日表示

## エンドポイント(すべて requireAppAccess('exam-prep')。admin/* は requireSuperuser)

| メソッド | パス | 役割 |
|---|---|---|
| GET | `/api/apps/exam-prep/me` | getMe。プロフィール+分野別達成率(全関連group)+streak+7日+カウントダウン+進行中セッション。初回 profile 自動作成・examTarget 自動セット |
| POST | `/api/apps/exam-prep/profile` | setProfile。segment / examTarget / displayName / visibleToPeers のみ |
| POST | `/api/apps/exam-prep/session/start` | startSession。10問選定。`{groupId}` 指定で集中セッション。弱点(達成率の低い group)を重み付けサンプリング。プール優先→不足分 AI バッチ生成(末尾は記述式)。answer/explanation は返さない |
| POST | `/api/apps/exam-prep/session/answer` | submitAnswer。choice は完全一致、free は AI 採点。progress 追記+カウンタ increment。`{isCorrect, answer, explanation, aiReason, next, done}` |
| POST | `/api/apps/exam-prep/session/end` | endSession。10問正解までの総回答数でレベル ±1。セッションをクリア |
| GET | `/api/apps/exam-prep/peers` | listPeers。visibleToPeers=true の上位を totalCorrect 降順 |
| POST | `/api/apps/exam-prep/admin/seed` | (superuser)確認済みスターター問題を投入。seedKey で重複防止 |
| POST | `/api/apps/exam-prep/admin/wipe` | (superuser)問題プール削除。`{source:'generated'|'seed'}` 限定可 |

## AI(コスト注意 / `server/utils/exam-prep/ai.ts`)

- `generateQuestionsBatch`:**必ずバッチ**(1問ずつ呼ぶと時間切れ事故)。出力 JSON 配列のみ。
  options4つ・answer が options に含まれることを検証。末尾 `freeCount` 問は記述式(用語短答、options空)。
  生成問題は pool に保存し以後再利用。`segment` は共通 group なら `'共通'`。
- `gradeAnswerByAI`:free の採点。表記ゆれ・言い換え・同義語を正解扱い。JSON `{correct, reason}`。失敗時は正規化一致でフォールバック。
- `recordGeminiUsage` で使用量記録。1セッション目安 ≒ $0.001。

## セッションの進行

- `queue`:提示順。正解で除去、不正解で末尾へ。空 = 完了(10 unique 正解)
- `submitAnswer` の戻り `next` を表示、`done` で `endSession` → サマリ
- 再ログイン時は `getMe.activeSession` が残り、ホーム「続きを解く」から `startSession`(resumed)で復帰

## UI(`index.vue` 1ファイル)

ホーム / セッション / サマリ + 初回オンボーディング。アイコンは Material Symbols。左上に `v.{short_sha}`(deploy で `NUXT_PUBLIC_GIT_SHA` 注入)。
- ホーム:カウントダウン / レベル・習得率・連続学習 / 7日ドット / 10問チャレンジ / **分野別レーダー(SVG)+バー(タップで集中セッション)** / ランキング / メンテナンス(superuser)
- セッション:choice はタップで即判定、free は記述+AI採点。正誤色+解説+「次へ」
- サマリ:正答率・やり直し回数・レベル増減(レベルアップは pop アニメ)

## Phase 進捗

- **Phase 1(実装済み)**:ログイン / オンボーディング / カウントダウン / 10問セッション / 解説 / サマリ / 進捗保存と再開 / 種別外を出さない / AI バッチ出題 / 仲間ランキング
- **Phase 2(実装済み)**:分野別レーダー + 群バー / 集中セッション(分野タップ)/ streak と7日表示 / レベルアップ演出
- **Phase 3(実装済み)**:記述式(free)の AI 採点 / 弱点ジャンル優先サンプリング / 確認済み問題の seed 投入 + wipe(superuser)/ 用語短答(穴埋め的)を free として出題
  - 過去問の大量 seed は未(著作権・正確性のため、確実なオリジナル問題を少数のみ同梱。`seed.ts` に追記して増やせる)

## 将来の最適化メモ

- `getMe` は progress を毎回読んで JS 集計。件数増で `apps/exam-prep/users/{uid}/groupStats/{groupId}` 事前集計 doc に切替
- プール検索は `examLevel` 単一等価のみ(複合インデックス回避)。増えたら genre 別インデックス + chunk 並列に
- free 出題は AI バッチの末尾少数 + seed 由来。割合は `start.post.ts` の freeCount で調整
