# ヘルパー - 開発者向け仕様

## 公開モード
- audience: private
- dataScope: per-user
- visibility: always_visible(全ログインユーザーに表示)
- 認証必須: yes

## 決定理由
全ユーザーが最初に頼れる入口として、常に表示する(always_visible)。
扱う会話・画像は各自のものなので per-user / private。
コンテキストは listAccessibleApps によりそのユーザーの権限内に絞っているため、
他人のアプリ情報は漏れない設計。

## データ構造

**会話状態(Firestore)** — 1ユーザー1ドキュメント:
```
apps/helper/users/{uid}
  - messages: Array<{ role: 'user'|'assistant', text: string, imageId?: string, createdAt: number }>
                直近 20 ターン分のみ保持
  - summary: string         直近20ターンより前は要約に折り畳む
  - updatedAt: Timestamp
```

**画像(Cloud Storage)** — 1画像1ファイル:
```
gs://<project>.firebasestorage.app/apps/helper/users/{uid}/{imageId}
  - クライアントで圧縮済み(最長辺 1600px / JPEG quality 0.85)
  - 5MB を超えるものはサーバーで弾く
  - 要約に折り畳まれた古い画像は自動削除(コスト節約)
```

## エンドポイント
- `POST /api/apps/helper/chat`
  - body: `{ question: string, image?: { base64, mimeType } }`
  - res:  `{ answer: string, imageId?: string }`
  - 内部:
    1. `loadState(uid)` で会話状態取得
    2. 画像があれば `saveImage` で Cloud Storage 保存
    3. Vertex AI に systemInstruction(persona+summary) + contents(履歴+新ターン) を送信
    4. `compressIfNeeded` で 20 ターン超過分を要約に折り畳み + 古い画像削除
    5. `saveState` で保存、`recordGeminiUsage` で使用量記録
- `GET /api/apps/helper/state` — 履歴ロード(初回マウント時)
- `GET /api/apps/helper/image/:id` — 本人の画像をストリーム(uidパスで認可)

## 編集時の注意
- アクセス権の無いアプリの README をコンテキストに混ぜないこと(情報漏洩防止)。
  → 必ず `loadReadmesForUser` / `listAccessibleApps` を経由する。
- `requireAuth` を必ず最初に呼ぶ。
- Gemini 呼び出し後は `recordGeminiUsage` で使用量を記録する(Settings/billing で可視化)。
- モデルは `runtimeConfig.geminiModel`(既定 `gemini-2.5-flash`)、Vertex AI 経由・location=global。
  ※ asia-northeast1 や gemini-2.0-flash はこのプロジェクトでは 404。利用可否は
    `…/locations/global/publishers/google/models/<model>:generateContent` を叩いて確認できる。

## コスト管理(重要)
このアプリは**毎ターン Gemini API を呼ぶ**。1日数百回使うと無視できない額になる。

- **画像は必ず圧縮してから送る**(クライアント側で最長辺1600px化済み)
  - 圧縮なしで端末写真を送ると入力トークンが10倍以上になる
- **履歴は最大20ターン**で打ち切り、それ以上は要約に折り畳む
  - 毎ターンで送られるコンテキストが肥大化しない設計
- **要約に折り畳まれた古い画像は自動削除**して Cloud Storage の蓄積を防ぐ
- 推奨: Settings/billing で日次の `geminiCalls` / `geminiTokensIn` / `geminiTokensOut` を時々確認する
