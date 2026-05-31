# アーキテクチャ

## 全体像

```
ブラウザ / PWA (スマホのホーム画面)
   │  Firebase Auth (Google ログイン) で ID Token を取得
   │  すべての API 呼び出しに Authorization: Bearer <token>
   ▼
Nuxt 3 (Cloud Run / asia-northeast1)
   ├─ クライアント (Vue 3) : pages / composables / plugins
   └─ サーバー (Nitro)     : server/api, server/utils
         │ firebase-admin で ID Token 検証 & 権限チェック
         ▼
   Firestore (Native) / Cloud Storage / Gemini API / Web Push
```

## 方針

- **認証必須**。公開(audience=public)以外はすべてログインが要る。
- **Firestore へはクライアントから直接アクセスしない**。必ず `server/api` 経由。
  `firestore.rules` は全 deny で、権限制御は `server/utils/permissions.ts` に集約。
- **ミニアプリの定義は `content/apps/{slug}.md` の frontmatter が「正」**。
  別レジストリは持たない。サーバーは `server/utils/readmes.ts` でこれを読む。
- **シークレットは Secret Manager**。コードに鍵を書かない。実行時に環境変数 `NUXT_*` で注入。

## ディレクトリ役割

| 場所 | 役割 |
|---|---|
| `pages/` | 画面(ランチャー / login / 各ミニアプリ) |
| `pages/apps/{slug}/claude.md` | そのアプリの開発者向け仕様(Claude Code が読む) |
| `content/apps/{slug}.md` | ミニアプリ定義(frontmatter)+ ユーザー向け説明 |
| `composables/` | クライアント共通ロジック(認証・アプリ一覧・通知) |
| `plugins/` | Firebase 初期化 / ID Token 自動付与 ($api) |
| `server/api/` | API エンドポイント |
| `server/utils/` | Admin SDK・権限・Gemini・README ローダ・課金 |
| `docs/` | 全体ドキュメント |

## 認証フロー

1. クライアントで `signInWithPopup(Google)`(`composables/useAuth.ts`)。
2. `plugins/firebase.client.ts` がログイン状態を監視し、`/api/auth/login` を呼ぶ。
3. サーバーが ID Token を検証し `users/{uid}` を用意(初回作成・ロール判定)。
4. 以後 `$api`(`plugins/api.ts`)が全リクエストに ID Token を自動付与。

## レンダリング

Nuxt SSR を有効にしているが、認証依存の画面はクライアントで状態確定後に描画する。
ミニアプリのデータはすべて `server/api` 経由で取得するため、クライアントが Firestore や
`@nuxt/content` を直接叩くことはない。
