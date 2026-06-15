# exam-prep(学習対策ドリル)開発仕様

別プロジェクトの「学習対策ミニアプリ(Firestore + Firebase Functions 版)」の要件を、
このポータル(Nuxt + Cloud Run + サーバーAPI 経由 Firestore)の流儀に移植したもの。
**ドメイン(試験・研修)は差し替え可能**。現在の中身は「施工管理2級(2級建築施工管理技士・第一次検定)」。

## 公開モード

| 項目 | 値 | 意味 |
|---|---|---|
| audience | shared | 複数ユーザーで使う(仲間ランキングあり) |
| dataScope | per-user | 進捗・成績は個人別。問題プールのみ全員共通 |
| visibility | assignable | 招待制。設定→アクセス権(superuser のみ操作可)で付与。superuser は自動で見える |
| requiredApis | gemini | AI 出題に Vertex AI Gemini を使う |

変更時の注意:`assignable` のまま `audience` を `public` にすると未ログインに開く設計になるが、
本アプリは per-user データを持つので **public にしてはいけない**(必ずログイン必須のまま)。

## データ配置(Firestore)

- `apps/exam-prep/users/{uid}` … 個人プロフィール doc
  - `segment` / `examTarget` / `level` / `totalCorrect` / `totalAnswers` / `visibleToPeers` / `displayName`
  - `currentSession` … 進行中セッション(離脱しても続きから)。`{ queue, correct[], attempts{}, totalAttempts, questions[] }`
- `apps/exam-prep/users/{uid}/progress/{auto}` … 回答履歴(append-only)。`{ questionId, isCorrect, userAnswer, attempts, groupId, genre, answeredAt }`
- `apps/exam-prep/questions/{auto}` … 問題プール(全員共通)。`{ category, difficulty, type, question, options[4], answer, keywords, explanation, genre, groupId, examLevel, segment, source, createdAt }`

`totalCorrect` / `totalAnswers` は **runTransaction + FieldValue.increment** で更新(`store.applyAnswerTxn`)。
クライアントの read-modify-write は禁止。`level` はセッション処理だけが書く。`progress` / `questions` はクライアント直書きしない。

## ドメイン定義

`server/utils/exam-prep/config.ts` に集約:
- `DOMAIN_CONFIG` … appTitle / examLabel / examDate(ISO)/ aiSubject / segments / examTargetOptions
- `GENRE_GROUPS` … group → genres の2階層。各 group に `segmentRelevance`(空=全種別共通)と `examLevel`
- フィルタ関数 `relevantGroups` / `genreTargets`:examLevel 一致 かつ(segmentRelevance 空 or ユーザー segment を含む)group だけを残す
  → **種別違いの問題が混ざらないこと**をここで厳密に担保(例:躯体ユーザーに仕上工事は出ない)

別の試験に差し替えるときは原則このファイルと `content/apps/exam-prep.md` の title だけ直す。

## エンドポイント(すべて requireAppAccess('exam-prep') でアクセス制御)

| メソッド | パス | 役割 |
|---|---|---|
| GET | `/api/apps/exam-prep/me` | getMe。プロフィール+集計+streak+カウントダウン+進行中セッション。初回は profile を自動作成し、受験パターンが1種類なら examTarget を自動セット |
| POST | `/api/apps/exam-prep/profile` | setProfile。segment / examTarget / displayName / visibleToPeers のみ更新(安全フィールド) |
| POST | `/api/apps/exam-prep/session/start` | startSession。10問選定(プール優先→不足分を AI バッチ生成)。進行中なら再開。answer/explanation は返さない(カンニング防止) |
| POST | `/api/apps/exam-prep/session/answer` | submitAnswer。判定+progress 追記+カウンタ increment。`{isCorrect, answer, explanation, next, done}` を返す |
| POST | `/api/apps/exam-prep/session/end` | endSession。10問正解までの総回答数でレベル ±1。セッションをクリア |
| GET | `/api/apps/exam-prep/peers` | listPeers。visibleToPeers=true の上位を totalCorrect 降順で |

## AI 出題(コスト注意)

`server/utils/exam-prep/ai.ts` の `generateQuestionsBatch`:
- **必ずバッチ**。不足分を1回の Gemini 呼び出しでまとめて生成(1問ずつ呼ぶと10問で時間切れ→開始できない事故)
- 出力は JSON 配列のみ。`options` 4つ・`answer` が options に含まれることをサーバーで検証し、通ったものだけ採用
- 生成した問題は `questions` プールに保存して以後再利用(コスト削減)。`segment` は共通 group なら `'共通'`
- 1セッションのコスト目安 ≒ $0.001。`recordGeminiUsage` で使用量を記録

## セッションの進行

- `queue`:提示順。正解で除去、不正解で末尾に戻す。空になったら完了(=10 unique 正解)
- `submitAnswer` の戻り `next` を表示、`done` で `endSession` → サマリ
- 再ログイン時は `getMe.activeSession` が残り、ホームの「続きを解く」から `startSession`(resumed)で復帰

## UI(`index.vue` 1ファイル)

ホーム / セッション / サマリ + 初回オンボーディング(全画面モーダル)。
- アイコンは Material Symbols(`<Icon name=.. />`)。絵文字は使わない
- 左上に `v.{short_sha}`(8px / opacity .22)を常時表示(スクショ問い合わせ時のデプロイ確認用)。
  値は `runtimeConfig.public.gitSha`。本番で実 sha を出すには deploy で `NUXT_PUBLIC_GIT_SHA` を流す
- 選択肢はタップで即判定 → 正誤色 + 解説 + 「次へ」

## Phase 進捗

- **Phase 1(実装済み)**:Google ログイン / オンボーディング(種別)/ カウントダウン / 10問セッション(不正解リトライ・10 unique 正解で終了)/ 解説 / サマリ / 進捗の Firestore 保存と再開 / 種別外を出さない / AI バッチ出題 / 仲間ランキング(簡易)/ 分野別正解数
- **Phase 2(未)**:レーダーチャート・群バー・レベル上昇演出の作り込み・集中セッション(ジャンルタップ)・streak の作り込み
- **Phase 3(未)**:記述式(free)の AI 採点(`gradeAnswerByAI`)・用語穴埋め・過去問の手動 seed・弱点ジャンル優先サンプリング
  - free 採点は今は暫定で正規化一致。Phase3 で別 callable に差し替える

## 将来の最適化メモ

- `getMe` は今 progress を毎回読んで JS 集計している。件数が増えたら `apps/exam-prep/users/{uid}/groupStats/{groupId}` の事前集計 doc に切り替える
- プール検索は `examLevel` 単一等価のみ(複合インデックス回避)。増えたら genre 別インデックス + chunk 並列に
