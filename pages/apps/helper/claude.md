# ヘルパー - 開発者向け仕様

## 公開モード
- audience: private
- dataScope: per-user
- visibility: always_visible(全ログインユーザーに表示)
- 認証必須: yes

## 決定理由
全ユーザーが最初に頼れる入口として、常に表示する(always_visible)。
ただし扱う会話・データは各自のものなので per-user / private。

## データ構造
現状サーバーに会話履歴は保存していない(画面内のみ)。
将来保存する場合のパス例:
```
apps/helper/users/{uid}/threads/{threadId}/messages/{messageId}
  - role: "user" | "assistant"
  - text: string
  - createdAt: Timestamp
```

## エンドポイント
- POST /api/apps/helper/chat
  - body: { question: string, history?: {role,text}[] }
  - res:  { answer: string }
  - 内部で loadReadmesForUser(uid) を呼び、ユーザーがアクセスできるアプリの
    README だけを Gemini のコンテキストに含める。

## 編集時の注意
- アクセス権の無いアプリの README をコンテキストに混ぜないこと(情報漏洩防止)。
  → 必ず loadReadmesForUser / listAccessibleApps を経由する。
- requireAuth を必ず最初に呼ぶ。
- Gemini 呼び出し後は recordGeminiUsage で使用量を記録する。
- モデルは runtimeConfig.geminiModel(既定 gemini-1.5-flash)。
