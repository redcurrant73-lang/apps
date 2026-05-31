# apps — ミニアプリプラットフォーム 仕様書

このドキュメントは初期指示書(仕様の正本)です。実装はこの仕様に沿っています。
細かな実装上の判断は末尾「実装メモ(仕様との差分)」を参照。

---

## 0. プロジェクト概要

**何を作るか**: 小西祐子(以下「祐子」)が日常使いするミニアプリのプラットフォーム。

**主な特徴**:
- トップページ = ミニアプリのランチャー(ユーザーごとに表示が変わる)
- 認証必須 (Google ログイン)
- スマホPWA + Web Push通知対応
- 新規ミニアプリは Claude Code との会話で追加していく
- 祐子はコードを書かない、Claude Code が全部書く
- 夫(ゆうき)が時々コードを直接修正する可能性あり

**想定ミニアプリ例**:
- 家計簿(祐子個人用)
- 学習アプリ(Duolingo風、祐子個人用)
- ナース向け社内教育(複数の病院、複数ユーザー使用)

---

## 1. 技術スタック

| 領域 | 採用技術 |
|---|---|
| フロントエンド | Nuxt 3 (Vue 3) |
| サーバー | Nuxt 3 server/api (Nitro) |
| デプロイ先 | Google Cloud Run (asia-northeast1) |
| 認証 | Firebase Authentication (Google ログインのみ) |
| データベース | Firestore (Native mode) |
| ファイル保存 | Cloud Storage |
| AI | Gemini API (`@google/generative-ai`) |
| シークレット | Secret Manager |
| スケジューラ | Cloud Scheduler (定期通知などに使用) |
| PWA | `@vite-pwa/nuxt` |
| 通知 | Web Push (VAPID) + Firestore に購読保存 |
| CI/CD | GitHub Actions → Cloud Run (Workload Identity Federation) |
| Markdown管理 | `@nuxt/content` (アプリのREADMEを集約) |
| スタイル | Tailwind CSS |

**RDBは将来必要になったら Neon (PostgreSQL) を併用予定。初期は不要。**

---

## 2. 設計の核心: 権限とデータの3軸モデル

→ `docs/PERMISSIONS.md` 参照。

### audience (公開範囲)
`private`(個人専用) / `shared`(組織内共有) / `public`(ログイン不要)

### dataScope (データ保存単位)
`per-user`(`apps/{appId}/users/{uid}/...`) / `per-org`(`apps/{appId}/orgs/{orgId}/...`) / `global`(`apps/{appId}/data/...`)

### visibility (ランチャー表示制御)
`always_visible`(全員) / `assignable`(個別許可) / `superuser_only`(祐子のみ)

---

## 3. ユーザーロール

| ロール | 権限 |
|---|---|
| `owner` | システム全体管理(夫=ゆうき) |
| `superuser` | 全アプリアクセス可、ユーザー管理可、アクセス権設定可(祐子) |
| `user` | 自分に許可されたアプリのみ使用可 |

---

## 4. ディレクトリ構造

```
apps/
├── README.md
├── CLAUDE.md                         ← Claude Code向け運用ルール(超重要)
├── PROJECT_SPEC.md                   ← この仕様書
├── docs/                             ← ARCHITECTURE / DEPLOYMENT / PERMISSIONS / DATA_MODEL
├── content/apps/                     ← 全ミニアプリのREADMEを集約(frontmatter付)
├── pages/                            ← index(ランチャー) / login / apps/{slug}/
├── server/api/                       ← auth / admin / apps / my / push
├── server/utils/                     ← firestore / gemini / permissions / readmes / billing
├── composables/                      ← useAuth / useApps / usePush
├── plugins/                          ← firebase.client / api(ID Token自動付与)
├── service-worker/sw.ts              ← PWA + Web Push
├── firestore.rules                   ← 全て deny (サーバー経由のみ)
├── firestore.indexes.json
├── Dockerfile / nuxt.config.ts / package.json / tsconfig.json / tailwind.config.js
├── .github/workflows/deploy.yml
├── setup.sh                          ← 初期セットアップ(GCP)
└── .gitignore
```

---

## 5. Firestoreデータモデル

→ `docs/DATA_MODEL.md` 参照(users / apps / appAccess / orgs / memberships / pushSubs / apiUsage)。

---

## 6. Firestore セキュリティルール

**方針: 全てdeny。クライアント直アクセス禁止、サーバー(Admin SDK)経由のみ。**
権限制御は `server/utils/permissions.ts` で行う。→ `firestore.rules`

---

## 7. 権限チェック関数 (server/utils/permissions.ts)

- `requireAuth(event)` — ログイン必須。ID Token検証して decoded を返す
- `requireSuperuser(event)` — superuser/owner のみ通す
- `requireAppAccess(event, appId)` — アクセス権確認
- `appDataPath(appId, dataScope, { uid?, orgId? })` — データパス組み立て
- 補助: `getUserRole` / `hasAppAccess` / `ensureUserDoc`

---

## 8. ミニアプリREADME (frontmatter駆動)

`content/apps/{slug}.md` に frontmatter 付きで書く。これが**アプリ定義そのもの**。

```markdown
---
id: kakeibo
title: 家計簿
icon: 💰
category: personal
audience: private
dataScope: per-user
visibility: assignable
requiredApis: [gemini, storage]
order: 10
---
# 家計簿アプリ
(ユーザー向けの説明。Helperがこれを読んでGeminiに渡す)
```

---

## 9. ミニアプリ開発者向け仕様 (claude.md)

各 `pages/apps/{slug}/claude.md` に、公開モード・決定理由・データ構造・エンドポイント・編集時の注意を書く。

---

## 10. 初期搭載ミニアプリ (2つ)

### 10-1. Helper (AI Assistant)
全ミニアプリのREADMEをGeminiに読ませ、ユーザーの質問に答える。
`always_visible` / `private` / `per-user` / requiredApis: [gemini]。
新規アプリ相談時は要件をヒアリングして「Claude Codeへの指示書」を生成。

### 10-2. Settings (管理コンソール)
ユーザー管理・アクセス権管理・料金確認。
`superuser_only` / `private` / `global` / requiredApis: [billing]。

---

## 11. 認証フロー (Firebase Auth + Google)

- クライアント: `signInWithPopup(GoogleAuthProvider)` → ID Token を取得し API に付与
- サーバー: `getAuth().verifyIdToken(token)` で検証
- 初回ログインで `users/{uid}` 作成(既定 role: user、メール一致で superuser/owner)

---

## 12. PWA + Web Push 通知

- `@vite-pwa/nuxt`(injectManifest)でカスタム Service Worker
- VAPID 鍵 → Secret Manager、クライアントで `pushManager.subscribe()`
- 購読を `/api/push/subscribe` で Firestore 保存、送信は `/api/push/send`
- iOS は 16.4 以降かつ「ホーム画面に追加」した PWA のみ通知可

---

## 13. CI/CD (GitHub Actions)

`main` への push で Workload Identity Federation 認証 → `gcloud run deploy --source .`
(asia-northeast1)。シークレットは `--set-secrets` で注入。→ `docs/DEPLOYMENT.md`

---

## 14. GCP API 有効化リスト

`setup.sh` / `docs/DEPLOYMENT.md` の「1コマンド」で一括有効化。
(run, cloudbuild, artifactregistry, firestore, firebase, identitytoolkit, secretmanager,
storage, iamcredentials, iam, generativelanguage, aiplatform, cloudscheduler, pubsub,
cloudtasks, logging, monitoring, cloudtrace, cloudbilling, bigquery, translate, speech,
texttospeech, vision, documentai, youtube, calendar-json, gmail)

---

## 15. CLAUDE.md

リポジトリルートの `CLAUDE.md` を参照(運用ルールの正本)。

---

## 16. 実装ヒント

`server/utils/` の各実装(firestore.ts / gemini.ts / permissions.ts / readmes.ts / billing.ts)
および `server/api/apps/helper/chat.post.ts` を参照。

---

## 17. 初回作業手順

完了済み: 全構造作成、依存追加、CLAUDE.md 配置、初期2アプリ実装、deny-all ルール、
deploy.yml 配置、ローカル起動確認。

**前提**: ゆうきが GCP セットアップ(Secret Manager 値、WIF 設定)を完了させる。
必要値: `GCP_PROJECT_ID` / `WIF_PROVIDER` / `GCP_SA_EMAIL` / `FIREBASE_CONFIG` /
祐子・ゆうきのメールアドレス。→ `docs/DEPLOYMENT.md` に登録手順。

---

## 18. 完了の定義

- [x] 全ディレクトリ・ファイル配置
- [x] CLAUDE.md がルートにある
- [x] 初期2アプリ(Helper / Settings)
- [ ] Googleログイン(Firebase設定の投入後に有効化)
- [ ] 祐子アカウントで全アプリ表示(superuser)
- [ ] main push で自動デプロイ(GCP/GitHub の Secrets 登録後)
- [ ] PWA としてホーム画面追加
- [ ] Helper が質問に回答

---

## 実装メモ(仕様との差分)

- **`appDataPath` の引数**: `audience` は保存パスに影響しないため、`appDataPath(appId, dataScope, { uid, orgId })` の形にした。
- **README ローダ**: `@nuxt/content` も導入しているが、サーバーで README 生テキストを Gemini に渡す都合上、`server/utils/readmes.ts` は `nitro.serverAssets` 経由で `content/apps/*.md` を直接読み、`gray-matter` で frontmatter を解析する(Cloud Run でも実体が読める)。
- **料金表示**: 実コスト(Cloud Run/Firestore等)は Cloud Billing の BigQuery エクスポート前提。初期は `apiUsage`(Gemini 呼び出し回数等)の集計のみ表示。
- **シークレットの環境変数名**: `runtimeConfig` と対応させるため、デプロイ時に Secret を `NUXT_*` 形式の環境変数へマッピングしている(例: `FIREBASE_CONFIG` → `NUXT_PUBLIC_FIREBASE_CONFIG`)。詳細は `.github/workflows/deploy.yml`。
